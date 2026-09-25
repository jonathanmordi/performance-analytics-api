import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { query } from "./db";
import { HttpError } from "./params";

// Keys are 32 random bytes, so a keyed hash is enough — no slow KDF needed
// the way it would be for human-chosen passwords. The salt (a server secret)
// means a leaked api_keys table alone can't be checked against guesses.
export function hashKey(key: string): string {
  const salt = process.env.API_KEY_SALT;
  if (!salt) throw new Error("API_KEY_SALT is not set");
  return crypto.createHmac("sha256", salt).update(key).digest("hex");
}

export function generateKey(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createKey(label: string): Promise<{ id: number; key: string }> {
  const key = generateKey();
  const { rows } = await query(
    "INSERT INTO api_keys (key_hash, label) VALUES ($1, $2) RETURNING id",
    [hashKey(key), label],
  );
  return { id: rows[0].id, key };
}

// Accepts `Authorization: Bearer <key>` or `X-API-Key: <key>`.
// On success, res.locals.keyId holds the api_keys.id.
export async function requireKey(req: Request, res: Response, next: NextFunction) {
  const header = req.get("authorization");
  const key = header?.startsWith("Bearer ") ? header.slice(7).trim() : req.get("x-api-key");
  if (!key) throw new HttpError(401, "API key required");

  const { rows } = await query("SELECT id FROM api_keys WHERE key_hash = $1", [hashKey(key)]);
  if (!rows[0]) throw new HttpError(401, "invalid API key");

  res.locals.keyId = rows[0].id;
  next();
}
