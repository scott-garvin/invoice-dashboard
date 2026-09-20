import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import {
  seed,
  applyCommand,
  type Workspace,
  type Command,
} from "../shared/domain.js";

export class Conflict extends Error {}
export interface Store {
  create(id: string): Promise<Workspace>;
  read(id: string): Promise<Workspace | null>;
  command(id: string, version: number, command: Command): Promise<Workspace>;
  reserve(daily: number, monthly: number): Promise<boolean>;
}
export class PostgresStore implements Store {
  constructor(readonly pool: Pool) {}
  async migrate() {
    await this.pool.query(
      await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
    );
  }
  async scoped<T>(
    id: string,
    action: (client: import("pg").PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('ledgerly.session', $1, true)", [
        id,
      ]);
      const value = await action(client);
      await client.query("commit");
      return value;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
  async create(id: string) {
    const data = seed();
    await this.scoped(id, (c) =>
      c.query("insert into ledgerly_sessions (id,data) values ($1,$2)", [
        id,
        data,
      ]),
    );
    return data;
  }
  async read(id: string): Promise<Workspace | null> {
    return this.scoped(
      id,
      async (c) =>
        (
          await c.query(
            "select data from ledgerly_sessions where id=$1 and expires_at>now()",
            [id],
          )
        ).rows[0]?.data ?? null,
    );
  }
  async command(id: string, version: number, command: Command) {
    return this.scoped(id, async (c) => {
      const row = (
        await c.query(
          "select data from ledgerly_sessions where id=$1 and expires_at>now() for update",
          [id],
        )
      ).rows[0];
      if (!row)
        throw new Conflict(
          "Session expired. Reconnect to create a fresh workspace.",
        );
      if (row.data.version !== version)
        throw new Conflict(
          "This workspace changed in another tab. Refresh before trying again.",
        );
      const next = applyCommand(row.data, command);
      if (command.type === "reset")
        await c.query(
          "update ledgerly_sessions set generation=generation+1 where id=$1",
          [id],
        );
      await c.query("update ledgerly_sessions set data=$2 where id=$1", [
        id,
        next,
      ]);
      return next;
    });
  }
  async reserve(daily: number, monthly: number) {
    return this.scoped("usage", async (c) => {
      // All app replicas share this quota lock. Failed provider calls consume an attempt.
      await c.query("select pg_advisory_xact_lock(7824102)");
      const row = (
        await c.query(
          "select coalesce(sum(attempts) filter(where day=(now() at time zone 'UTC')::date),0)::int as daily, coalesce(sum(attempts),0)::int as monthly from ledgerly_ai_usage where day>=date_trunc('month',now() at time zone 'UTC')::date",
        )
      ).rows[0];
      if (row.daily >= daily || row.monthly >= monthly) return false;
      await c.query(
        "insert into ledgerly_ai_usage(day,attempts) values ((now() at time zone 'UTC')::date,1) on conflict(day) do update set attempts=ledgerly_ai_usage.attempts+1",
      );
      return true;
    });
  }
}
