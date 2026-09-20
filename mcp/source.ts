import { seed, workspaceSchema, type Workspace } from "../shared/domain.js";
export interface Source {
  read(): Promise<Workspace>;
  help(): Promise<unknown[]>;
}
// A live bridge uses one private, server-issued workspace. Tool arguments never select identity.
export function sourceFromEnv(env: NodeJS.ProcessEnv): Source {
  if (!env.MCP_MODE || env.MCP_MODE === "sample") {
    const workspace = seed();
    return {
      read: async () => structuredClone(workspace),
      help: async () => [],
    };
  }
  if (env.MCP_MODE !== "live") throw Error("MCP_MODE must be sample or live.");
  const base =
    env.MCP_API_URL || "https://ledgerly-production-afee.up.railway.app";
  // Fixed origins prevent accidental credential forwarding to arbitrary destinations.
  if (
    base !== "https://ledgerly-production-afee.up.railway.app" &&
    base !== "http://127.0.0.1:8081"
  )
    throw Error("MCP_API_URL must be the documented demo origin.");
  if (!env.MCP_DEMO_ACCESS_KEY || env.MCP_DEMO_ACCESS_KEY.length < 24)
    throw Error("Live mode requires MCP_DEMO_ACCESS_KEY.");
  let cookie = "";
  let opening: Promise<void> | undefined;
  async function request(path: string, post = false) {
    const r = await fetch(base + path, {
      method: post ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: "Bearer " + env.MCP_DEMO_ACCESS_KEY,
        ...(cookie ? { Cookie: cookie } : {}),
        "Content-Type": "application/json",
      },
      ...(post ? { body: "{}" } : {}),
    });
    if (!r.ok) throw Error("Demo API denied or could not complete this read.");
    if (post) {
      const token = /(?:^|;\s*)ledgerly=([a-f0-9]{64})(?:;|$)/.exec(
        r.headers.get("set-cookie") || "",
      )?.[1];
      if (!token) throw Error("Demo API did not issue a private session.");
      cookie = "ledgerly=" + token;
    }
    return r.json();
  }
  async function ready() {
    opening ??= request("/api/session", true).then(() => {});
    await opening;
  }
  return {
    read: async () => {
      await ready();
      return workspaceSchema.parse(await request("/api/workspace"));
    },
    help: async () => {
      await ready();
      const h = await request("/api/help-requests");
      if (!Array.isArray(h)) throw Error("Invalid assistance response.");
      return h;
    },
  };
}
