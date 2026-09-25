import fs from "node:fs";
import path from "node:path";
import { HttpError, type Event, type Gender } from "./params";

// World Athletics points. The official numbers are NOT in this repo: they come
// from the WA Scoring Tables and are supplied as a JSON file (see README).
// Nothing here falls back to made-up values — no table, no score.

export interface Coefficients {
  a: number;
  b: number;
  c: number;
}

// Rows copied from the official tables: [points, mark] — the mark needed for
// that many points. Any order.
export interface Lookup {
  table: [number, number][];
}

export interface ScoringTable {
  // Unit marks are expressed in, for the formula or the lookup rows.
  unit: "m" | "cm";
  events: Partial<Record<Event, Partial<Record<Gender, Coefficients | Lookup>>>>;
}

const DEFAULT_PATH = path.join(__dirname, "..", "data", "wa-scoring.json");

let cached: ScoringTable | null = null;

export function loadTable(file = process.env.WA_SCORING_TABLE ?? DEFAULT_PATH): ScoringTable {
  if (cached) return cached;
  if (!fs.existsSync(file)) {
    throw new HttpError(503, "World Athletics scoring table not installed (see README: Scoring)");
  }
  const table = JSON.parse(fs.readFileSync(file, "utf8")) as ScoringTable;
  if (table.unit !== "m" && table.unit !== "cm") {
    throw new HttpError(500, 'scoring table "unit" must be "m" or "cm"');
  }
  cached = table;
  return table;
}

export function resetTableCache() {
  cached = null;
}

// Coefficients: the field-event form points = floor(a · (x + b)² + c), floored
// at zero. Lookup: the highest points value whose mark this one reaches, as you
// would read the printed table.
export function points(table: ScoringTable, event: Event, gender: Gender, markCm: number): number {
  const k = table.events[event]?.[gender];
  if (!k) throw new HttpError(503, `no scoring data for ${event} ${gender}`);
  const x = table.unit === "m" ? markCm / 100 : markCm;
  if ("table" in k) {
    let best = 0;
    // Tiny tolerance so 7.00 m in cm (700) meets a row written as 7.00.
    for (const [pts, mark] of k.table) if (x + 1e-9 >= mark && pts > best) best = pts;
    return best;
  }
  return Math.max(0, Math.floor(k.a * (x + k.b) ** 2 + k.c));
}
