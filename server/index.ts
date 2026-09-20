import "dotenv/config";
import { Pool } from "pg";
import express from "express";
import { resolve } from "node:path";
import { z } from "zod";
import { PostgresStore } from "./store.js";
import { OpenAIExtractor } from "./provider.js";
import { createApp } from "./app.js";
import { IntakeService } from "./intake.js";
const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    DATABASE_SCHEMA: z
      .string()
      .regex(/^[a-z_][a-z0-9_]*$/)
      .default("public"),
    MIGRATE_ON_START: z.enum(["true", "false"]).default("true"),
    DEMO_ACCESS_KEY: z.string().min(24),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().optional(),
    MAX_AI_DAILY: z.coerce.number().int().min(0).default(20),
    MAX_AI_MONTHLY: z.coerce.number().int().min(0).default(200),
    PORT: z.coerce.number().int().default(8081),
  })
  .parse(process.env);
if (env.OPENAI_API_KEY && !env.OPENAI_MODEL)
  throw new Error("OPENAI_MODEL is required when AI is enabled.");
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  options: `-c search_path=${env.DATABASE_SCHEMA}`,
  max: 5,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
});
const store = new PostgresStore(pool);
if (env.MIGRATE_ON_START === "true") await store.migrate();
const extractor = env.OPENAI_API_KEY
  ? new OpenAIExtractor(env.OPENAI_API_KEY, env.OPENAI_MODEL!)
  : undefined;
const intake = new IntakeService(
  store,
  extractor,
  env.MAX_AI_DAILY,
  env.MAX_AI_MONTHLY,
);
if (env.MIGRATE_ON_START === "true") await intake.setup();
else await pool.query("select 1 from ledgerly_sessions limit 0");
const app = createApp(store, {
  key: env.DEMO_ACCESS_KEY,
  secure: process.env.NODE_ENV === "production",
  daily: env.MAX_AI_DAILY,
  monthly: env.MAX_AI_MONTHLY,
  extractor,
  intake,
});
app.use(express.static(resolve("dist")));
const server = app.listen(env.PORT, "0.0.0.0", () =>
  console.log(`Ledgerly ready on port ${env.PORT}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
