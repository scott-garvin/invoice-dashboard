// Test-only server: actual Postgres and LangGraph, deterministic provider, no paid API calls.
import express from "express";
import { Pool } from "pg";
import { PostgresStore } from "../server/store.js";
import { IntakeService } from "../server/intake.js";
import { createApp } from "../server/app.js";
import { exampleExtraction } from "../shared/extraction.js";
if (!process.env.TEST_DATABASE_URL)
  throw new Error("A disposable TEST_DATABASE_URL is required.");
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const store = new PostgresStore(pool);
await store.migrate();
const extractor = {
  async extract() {
    const result = exampleExtraction();
    result.terms = { value: null, quote: null };
    return {
      result,
      model: "deterministic-test-provider",
      inputTokens: 0,
      outputTokens: 0,
    };
  },
};
const intake = new IntakeService(store, extractor, 1000, 1000);
await intake.setup();
const app = createApp(store, {
  key: "public-local-e2e-test-key-only",
  extractor,
  intake,
});
app.use(express.static("dist"));
const server = app.listen(8082, "127.0.0.1");
process.on("SIGTERM", () => server.close(() => void pool.end()));
