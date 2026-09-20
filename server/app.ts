import express, { type ErrorRequestHandler } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { commandSchema, draftSchema } from "../shared/domain.js";
import { IntakeUnavailable, type IntakeService } from "./intake.js";
import { Conflict, type Store } from "./store.js";
import type { Extractor } from "./provider.js";
export function createApp(
  store: Store,
  options: {
    key: string;
    secure?: boolean;
    extractor?: Extractor;
    daily?: number;
    monthly?: number;
    intake?: IntakeService;
  },
) {
  if (options.key.length < 24)
    throw new Error("Set a random DEMO_ACCESS_KEY of at least 24 characters.");
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", (_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({
      status: "ok",
      service: "ledgerly",
      ai: Boolean(options.extractor),
    }),
  );
  app.use("/api", (req, res, next) => {
    const provided = createHash("sha256")
      .update(req.headers.authorization || "")
      .digest();
    const expected = createHash("sha256")
      .update(`Bearer ${options.key}`)
      .digest();
    if (!timingSafeEqual(provided, expected)) {
      res
        .status(401)
        .json({ error: "Enter a valid Ledgerly demo access key." });
      return;
    }
    next();
  });
  app.use("/api", express.json({ limit: "32kb" }));
  const attempts: number[] = [];
  app.use("/api", (req, res, next) => {
    if (req.method === "GET") {
      next();
      return;
    }
    const now = Date.now();
    while (attempts.length && attempts[0] < now - 60000) attempts.shift();
    if (attempts.length >= 30) {
      res.status(429).json({ error: "Demo is busy. Try again in a minute." });
      return;
    }
    attempts.push(now);
    next();
  });
  const sessionId = (req: express.Request) => {
    const raw = /(?:^|;\s*)ledgerly=([a-f0-9]{64})(?:;|$)/.exec(
      req.headers.cookie || "",
    )?.[1];
    return raw ? createHash("sha256").update(raw).digest("hex") : "";
  };
  app.post("/api/session", async (req, res) => {
    const old = await store.read(sessionId(req));
    if (old) {
      res.json(old);
      return;
    }
    const token = randomBytes(32).toString("hex");
    const data = await store.create(
      createHash("sha256").update(token).digest("hex"),
    );
    res.setHeader(
      "Set-Cookie",
      `ledgerly=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=86400${options.secure ? "; Secure" : ""}`,
    );
    res.json(data);
  });
  app.use("/api", async (req, res, next) => {
    if (!(await store.read(sessionId(req)))) {
      res
        .status(401)
        .json({
          error: "Session expired. Reconnect to start a fresh workspace.",
        });
      return;
    }
    next();
  });
  app.get("/api/workspace", async (req, res) =>
    res.json(await store.read(sessionId(req))),
  );
  const intake = () => {
    if (!options.intake)
      throw new IntakeUnavailable("Persistent intake is not configured.");
    return options.intake;
  };
  app.get("/api/intakes", async (req, res) =>
    res.json(await intake().list(sessionId(req))),
  );
  app.post("/api/intakes", async (req, res) => {
    const { source } = z
      .object({ source: z.string().trim().min(20).max(8000) })
      .strict()
      .parse(req.body);
    res.json(await intake().start(sessionId(req), source));
  });
  app.post("/api/intakes/:id/resume", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = z
      .discriminatedUnion("action", [
        z
          .object({
            action: z.literal("retry"),
            checkpoint: z.string().max(100),
          })
          .strict(),
        z
          .object({
            action: z.enum(["clarify", "approve"]),
            checkpoint: z.string().max(100),
            draft: draftSchema,
          })
          .strict(),
      ])
      .parse(req.body);
    res.json(
      await intake().resume(
        sessionId(req),
        id,
        body.checkpoint,
        body.action,
        "draft" in body ? body.draft : undefined,
      ),
    );
  });
  app.post("/api/commands", async (req, res) => {
    const body = z
      .object({ version: z.number().int().min(0), command: commandSchema })
      .strict()
      .parse(req.body);
    res.json(await store.command(sessionId(req), body.version, body.command));
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  const errors: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof IntakeUnavailable) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof z.ZodError) {
      res
        .status(422)
        .json({ error: err.issues[0]?.message || "Invalid input." });
      return;
    }
    if (err instanceof Conflict) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err?.type === "entity.too.large") {
      res.status(413).json({ error: "Request is too large." });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "Invalid JSON." });
      return;
    }
    // Domain errors are safe; infrastructure errors must not expose SQL, credentials or source text.
    const safe =
      /^(Choose|Invoice total|Only |Issue |Payment |Paid or|Invoice not found|A client)/.test(
        err.message || "",
      );
    res
      .status(safe ? 422 : 503)
      .json({
        error: safe ? err.message : "Workspace unavailable. Please try again.",
      });
  };
  app.use(errors);
  return app;
}
