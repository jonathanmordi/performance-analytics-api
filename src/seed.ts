// Synthetic reference population. Each athlete gets an underlying ability drawn
// from a normal distribution per event × gender, then marks scattered around
// it across four seasons of shared meets.
//
//   npm run seed            (SEED=<n> for a different but reproducible field)
//
// Re-running replaces every source='seed' row; user rows are untouched.

import dotenv from "dotenv";

dotenv.config({ quiet: true });

import { pool } from "./db";
import type { Event, Gender, SeasonType } from "./params";

// ---------- deterministic randomness ----------

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(Number(process.env.SEED ?? 42));

// Box–Muller.
function normal(mean: number, sd: number): number {
  const u = 1 - rand();
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function int(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function pick<T>(xs: readonly T[]): T {
  return xs[Math.floor(rand() * xs.length)]!;
}

function sample<T>(xs: readonly T[], n: number): T[] {
  const copy = [...xs];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

// ---------- the population ----------

// Season-best ability across a mixed D1–D3 collegiate field, in cm.
// withinSd is meet-to-meet scatter for one athlete.
const PROFILE: Record<Event, Record<Gender, { mean: number; sd: number; withinSd: number }>> = {
  LJ: { M: { mean: 665, sd: 45, withinSd: 16 }, F: { mean: 535, sd: 40, withinSd: 14 } },
  TJ: { M: { mean: 1375, sd: 85, withinSd: 30 }, F: { mean: 1125, sd: 75, withinSd: 26 } },
  HJ: { M: { mean: 192, sd: 9, withinSd: 4 }, F: { mean: 161, sd: 8, withinSd: 3.5 } },
};

// cm gained per m/s of tailwind.
const WIND_GAIN: Record<Event, number> = { LJ: 6, TJ: 10, HJ: 0 };

const ATHLETES_PER_GROUP = 250;
const NWI_RATE = 0.04; // outdoor horizontal jumps with no wind reading

const FIRST: Record<Gender, string[]> = {
  M: ["James", "Marcus", "Tyler", "Jalen", "Ethan", "Andre", "Caleb", "Devin", "Noah", "Isaiah",
      "Liam", "Jordan", "Malik", "Owen", "Xavier", "Chris", "Darius", "Elijah", "Ryan", "Kofi"],
  F: ["Maya", "Aaliyah", "Emma", "Jasmine", "Olivia", "Kayla", "Sophia", "Imani", "Grace", "Nia",
      "Chloe", "Ava", "Destiny", "Hannah", "Zoe", "Brianna", "Leah", "Amara", "Sierra", "Tessa"],
};
const LAST = ["Johnson", "Williams", "Okafor", "Martinez", "Chen", "Brown", "Davis", "Nguyen",
  "Thompson", "Garcia", "Robinson", "Walker", "Patel", "Adeyemi", "Clark", "Lewis", "Young",
  "Allen", "King", "Wright", "Scott", "Green", "Baker", "Hill", "Campbell", "Mitchell"];

// ---------- the calendar ----------

interface Meet {
  name: string;
  date: string;
  season_type: SeasonType;
}

const INDOOR_MEETS = ["Winter Opener", "Holiday Classic", "Metro Invitational", "Armory Challenge",
  "Snowflake Invite", "Conference Indoor Championships", "Last Chance Qualifier", "Indoor Nationals"];
const OUTDOOR_MEETS = ["Spring Break Classic", "Relays Invitational", "Garden State Open",
  "Coastal Invite", "Sea-Level Classic", "Conference Outdoor Championships", "Last Chance Open",
  "Outdoor Nationals"];

function saturdays(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  const end = new Date(`${to}T00:00:00Z`);
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 7)) out.push(d.toISOString().slice(0, 10));
  return out;
}

function seasonMeets(type: SeasonType, from: string, to: string): Meet[] {
  const names = type === "indoor" ? INDOOR_MEETS : OUTDOOR_MEETS;
  const dates = saturdays(from, to);
  // Spread the named meets across the season's Saturdays, in order.
  return names.map((name, i) => ({
    name,
    date: dates[Math.floor((i * (dates.length - 1)) / (names.length - 1))]!,
    season_type: type,
  }));
}

// Oldest first. Indoor starts in December of the prior calendar year.
const SEASONS: Meet[][] = [
  seasonMeets("indoor", "2024-12-01", "2025-03-10"),
  seasonMeets("outdoor", "2025-03-20", "2025-05-28"),
  seasonMeets("indoor", "2025-12-01", "2026-03-10"),
  seasonMeets("outdoor", "2026-03-20", "2026-05-28"),
];

// ---------- generation ----------

interface Row {
  athlete: number; // index into athlete list
  event: Event;
  mark_cm: number;
  wind: number | null;
  meet: Meet;
}

function hjBar(cm: number): number {
  // College bars go up in 3 cm steps; you clear a bar, not a continuous height.
  return 150 + Math.floor((cm - 150) / 3) * 3;
}

function generate() {
  const athletes: { name: string; gender: Gender }[] = [];
  const rows: Row[] = [];

  for (const event of ["LJ", "TJ", "HJ"] as const) {
    for (const gender of ["M", "F"] as const) {
      const prof = PROFILE[event][gender];
      for (let i = 0; i < ATHLETES_PER_GROUP; i++) {
        const idx = athletes.push({ name: `${pick(FIRST[gender])} ${pick(LAST)}`, gender }) - 1;
        const peak = normal(prof.mean, prof.sd); // ability in the latest season
        const yearlyGain = normal(0.02, 0.02); // fraction improved per year

        SEASONS.forEach((meets, s) => {
          if (rand() < 0.1) return; // injured, redshirted, or not yet enrolled
          const yearsBeforePeak = (SEASONS.length - 1 - s) / 2;
          let ability = peak * (1 - yearlyGain * yearsBeforePeak);
          if (meets[0]!.season_type === "indoor") ability *= 0.99; // shorter runways, tighter turns

          const attended = sample(meets, int(3, 6)).sort((a, b) => a.date.localeCompare(b.date));
          for (const meet of attended) {
            let wind: number | null = null;
            let m = normal(ability, prof.withinSd);
            if (meet.season_type === "outdoor" && event !== "HJ") {
              if (rand() >= NWI_RATE) {
                wind = Math.round(Math.max(-3.9, Math.min(5.5, normal(0.5, 1.3))) * 10) / 10;
                m += wind * WIND_GAIN[event];
              }
            }
            m = event === "HJ" ? hjBar(m) : Math.round(m);
            rows.push({ athlete: idx, event, mark_cm: Math.max(1, m), wind, meet });
          }
        });
      }
    }
  }
  return { athletes, rows };
}

async function main() {
  const { athletes, rows } = generate();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Cascades to their performances.
    await client.query("DELETE FROM athletes WHERE source = 'seed'");

    const inserted = await client.query(
      `INSERT INTO athletes (name, gender, source)
       SELECT name, gender, 'seed'
         FROM unnest($1::text[], $2::text[]) WITH ORDINALITY AS t(name, gender, ord)
        ORDER BY ord
       RETURNING id`,
      [athletes.map((a) => a.name), athletes.map((a) => a.gender)],
    );
    // Identity values are handed out in insert order, which ORDER BY ord pins
    // to array order. RETURNING's own order isn't guaranteed, so sort.
    const ids: number[] = inserted.rows.map((r) => r.id).sort((a, b) => a - b);

    await client.query(
      `INSERT INTO performances
         (athlete_id, event, mark_cm, wind, meet_name, meet_date, season_type, source)
       SELECT *, 'seed' FROM unnest(
         $1::int[], $2::text[], $3::int[], $4::numeric[], $5::text[], $6::date[], $7::text[])`,
      [
        rows.map((r) => ids[r.athlete]),
        rows.map((r) => r.event),
        rows.map((r) => r.mark_cm),
        rows.map((r) => r.wind),
        rows.map((r) => r.meet.name),
        rows.map((r) => r.meet.date),
        rows.map((r) => r.meet.season_type),
      ],
    );
    await client.query("COMMIT");
    console.log(`Seeded ${athletes.length} athletes, ${rows.length} performances.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
