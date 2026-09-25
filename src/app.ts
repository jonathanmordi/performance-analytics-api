import express, { type NextFunction, type Request, type Response } from "express";
import { query } from "./db";
import { HttpError } from "./params";
import { reads } from "./routes/reads";
import { writes } from "./routes/writes";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", async (_req, res) => {
    const result = await query("SELECT 1 AS ok");
    res.json({ status: "ok", db: result.rows[0] });
  });

  app.use(reads);
  app.use(writes);

  app.use((_req, res) => {
    res.status(404).json({ error: "not found" });
  });

  // Express 5 forwards rejected promises from async handlers here.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    // Postgres constraint violations are bad input, not server faults.
    const code = (err as { code?: string }).code;
    if (code === "23514" || code === "23503" || code === "22P02" || code === "22003" || code === "22007" || code === "22008") {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    // express.json() parse failures carry a 4xx status.
    const status = (err as { status?: number }).status;
    if (status && status >= 400 && status < 500) {
      res.status(status).json({ error: (err as Error).message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal error" });
  });

  return app;
}
