import { Router } from "express";
import { requireKey } from "../auth";
import { query } from "../db";
import * as p from "../params";
import { HttpError } from "../params";
import { formatPerformance } from "../analytics";
import { parseMark } from "../units";

export const writes = Router();

writes.post("/athletes", requireKey, async (req, res) => {
  const { name, gender } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) throw new HttpError(400, "name is required");
  const { rows } = await query(
    `INSERT INTO athletes (name, gender, source, owner_key)
     VALUES ($1, $2, 'user', $3)
     RETURNING id, name, gender, source`,
    [name.trim(), p.parseGender(gender), res.locals.keyId],
  );
  res.status(201).json(rows[0]);
});

writes.post("/performances", requireKey, async (req, res) => {
  const body = req.body ?? {};
  const athleteId = p.id(body.athlete_id, "athlete_id");
  const event = p.parseEvent(body.event);
  const seasonType = p.parseSeasonType(body.season_type);

  // mark_cm (integer) or mark ("6.48", "21-03.25").
  const cm =
    body.mark_cm !== undefined
      ? Number.isInteger(body.mark_cm) ? body.mark_cm : null
      : typeof body.mark === "string" ? parseMark(body.mark) : null;
  if (cm === null || cm <= 0) {
    throw new HttpError(400, "give mark_cm (positive integer) or mark (e.g. 6.48 or 21-03.25)");
  }

  const wind = body.wind ?? null;
  if (wind !== null && (typeof wind !== "number" || Math.abs(wind) >= 100)) {
    throw new HttpError(400, "wind must be a number in m/s");
  }
  if (wind !== null && (event === "HJ" || seasonType === "indoor")) {
    throw new HttpError(400, "wind only applies to outdoor LJ/TJ");
  }

  const meetName = body.meet_name;
  if (typeof meetName !== "string" || !meetName.trim()) throw new HttpError(400, "meet_name is required");
  const meetDate = body.meet_date;
  if (typeof meetDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(meetDate) || !isRealDate(meetDate)) {
    throw new HttpError(400, "meet_date must be YYYY-MM-DD");
  }

  const owner = await query("SELECT owner_key FROM athletes WHERE id = $1", [athleteId]);
  if (!owner.rows[0]) throw new HttpError(404, `athlete ${athleteId} not found`);
  if (owner.rows[0].owner_key !== res.locals.keyId) {
    throw new HttpError(403, "you can only add marks to athletes your key owns");
  }

  const { rows } = await query(
    `INSERT INTO performances
       (athlete_id, event, mark_cm, wind, meet_name, meet_date, season_type, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'user')
     RETURNING id, mark_cm, wind, legal, meet_name, meet_date, season_type, season_year`,
    [athleteId, event, cm, wind, meetName.trim(), meetDate, seasonType],
  );
  res.status(201).json({ athlete_id: athleteId, event, ...formatPerformance(rows[0], p.units(req)) });
});

// Date.parse accepts 2026-02-30 and rolls it over to March 2.
function isRealDate(ymd: string): boolean {
  const d = new Date(`${ymd}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}
