import { query } from "./db";
import { HttpError, type Event, type Gender, type SeasonFilter, type SeasonType } from "./params";

export interface Athlete {
  id: number;
  name: string;
  gender: Gender;
  source: string;
}

export interface Performance {
  id: number;
  mark_cm: number;
  wind: number | null;
  legal: boolean;
  meet_name: string;
  meet_date: string;
  season_type: SeasonType;
  season_year: number;
}

export interface FieldEntry {
  athlete_id: number;
  name: string;
  best_cm: number;
}

// Appends season conditions to `params` and returns the SQL fragment.
function seasonSql(season: SeasonFilter | null, params: unknown[]): string {
  if (!season) return "";
  params.push(season.type);
  let sql = ` AND p.season_type = $${params.length}`;
  if (season.year !== null) {
    params.push(season.year);
    sql += ` AND p.season_year = $${params.length}`;
  }
  return sql;
}

// The reference field: each seeded athlete's best legal mark. Wind-aided
// marks don't count, same as a real descending-order list.
export async function fieldBests(
  event: Event,
  gender: Gender,
  season: SeasonFilter | null,
): Promise<FieldEntry[]> {
  const params: unknown[] = [event, gender];
  const { rows } = await query(
    `SELECT a.id AS athlete_id, a.name, max(p.mark_cm) AS best_cm
       FROM performances p
       JOIN athletes a ON a.id = p.athlete_id
      WHERE p.source = 'seed' AND p.event = $1 AND a.gender = $2 AND p.legal
            ${seasonSql(season, params)}
      GROUP BY a.id, a.name
      ORDER BY best_cm DESC, a.id`,
    params,
  );
  return rows;
}

export async function getAthlete(id: number): Promise<Athlete> {
  const { rows } = await query(
    "SELECT id, name, gender, source FROM athletes WHERE id = $1",
    [id],
  );
  if (!rows[0]) throw new HttpError(404, `athlete ${id} not found`);
  return rows[0];
}

// One athlete's marks in one event, oldest first.
export async function athleteMarks(
  athleteId: number,
  event: Event,
  season: SeasonFilter | null = null,
): Promise<Performance[]> {
  const params: unknown[] = [athleteId, event];
  const { rows } = await query(
    `SELECT id, mark_cm, wind, legal, meet_name, meet_date, season_type, season_year
       FROM performances p
      WHERE p.athlete_id = $1 AND p.event = $2 ${seasonSql(season, params)}
      ORDER BY meet_date, id`,
    params,
  );
  return rows;
}
