import type { Request } from "express";
import type { Units } from "./units";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Event = "LJ" | "TJ" | "HJ";
export type Gender = "M" | "F";
export type SeasonType = "indoor" | "outdoor";

export interface SeasonFilter {
  type: SeasonType;
  year: number | null;
}

const EVENTS: readonly string[] = ["LJ", "TJ", "HJ"];

function str(req: Request, name: string): string | undefined {
  const v = req.query[name];
  return typeof v === "string" && v !== "" ? v : undefined;
}

function required(req: Request, name: string): string {
  const v = str(req, name);
  if (v === undefined) throw new HttpError(400, `missing query parameter: ${name}`);
  return v;
}

export function parseEvent(v: unknown): Event {
  const e = typeof v === "string" ? v.toUpperCase() : "";
  if (!EVENTS.includes(e)) throw new HttpError(400, "event must be one of LJ, TJ, HJ");
  return e as Event;
}

export function parseGender(v: unknown): Gender {
  const g = typeof v === "string" ? v.toUpperCase() : "";
  if (g !== "M" && g !== "F") throw new HttpError(400, "gender must be M or F");
  return g;
}

export function parseSeasonType(v: unknown): SeasonType {
  if (v !== "indoor" && v !== "outdoor") {
    throw new HttpError(400, "season_type must be indoor or outdoor");
  }
  return v;
}

export function event(req: Request): Event {
  return parseEvent(required(req, "event"));
}

export function gender(req: Request): Gender {
  return parseGender(required(req, "gender"));
}

export function units(req: Request): Units {
  const u = str(req, "units") ?? "metric";
  if (u !== "metric" && u !== "imperial") {
    throw new HttpError(400, "units must be metric or imperial");
  }
  return u;
}

// ?season=indoor | outdoor | indoor-2026 | outdoor-2026. Absent = all seasons.
export function season(req: Request): SeasonFilter | null {
  const s = str(req, "season");
  if (s === undefined) return null;
  const m = s.toLowerCase().match(/^(indoor|outdoor)(?:-(\d{4}))?$/);
  if (!m) throw new HttpError(400, "season must look like indoor, outdoor, or indoor-2026");
  return { type: m[1] as SeasonType, year: m[2] ? Number(m[2]) : null };
}

export function seasonLabel(s: SeasonFilter | null): string {
  if (!s) return "all";
  return s.year === null ? s.type : `${s.type}-${s.year}`;
}

export function id(v: unknown, name = "id"): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${name} must be a positive integer`);
  return n;
}

export function percentile(req: Request): number {
  const p = Number(required(req, "percentile"));
  if (!(p > 0 && p <= 100)) throw new HttpError(400, "percentile must be in (0, 100]");
  return p;
}

export function optional(req: Request, name: string): string | undefined {
  return str(req, name);
}

export { required };
