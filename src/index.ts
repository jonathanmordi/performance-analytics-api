import express from "express";
import dotenv from "dotenv";

dotenv.config();

import { query } from "./db";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;

app.get("/health", async (_req, res) => {
  const result = await query("SELECT 1 AS ok");
  res.json({ status: "ok", db: result.rows[0] });
});

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
