import { Router } from "express";
import * as p from "../params";
import { HttpError } from "../params";
import { athleteMarks, fieldBests, getAthlete } from "../repo";
import {
  formatPerformance,
  prOf,
  prSummary,
  progression,
  rankField,
  summarizeField,
  zScore,
} from "../analytics";
import { markForPercentile, percentileOf, round, wouldRank } from "../stats";
import { gap, mark, parseMark } from "../units";
import { loadTable, points } from "../scoring";

export const reads = Router();

reads.get("/rankings", async (req, res) => {
  const event = p.event(req);
  const gender = p.gender(req);
  const season = p.season(req);
  const units = p.units(req);
  const limit = Math.min(Number(p.optional(req, "limit") ?? 100), 1000);
  const offset = Number(p.optional(req, "offset") ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0) {
    throw new HttpError(400, "limit and offset must be non-negative integers");
  }

  const entries = await fieldBests(event, gender, season);
  const field = summarizeField(entries);
  res.json({
    event,
    gender,
    season: p.seasonLabel(season),
    field: {
      size: field.size,
      mean: field.size ? mark(Math.round(field.mean_cm), units) : null,
      stddev_cm: round(field.stddev_cm, 1),
    },
    rankings: rankField(entries, units).slice(offset, offset + limit),
  });
});

// Where an athlete's best legal mark sits in the seeded field of their gender.
// Works for user athletes too — they're not in the field, so this is
// "where would I land".
async function standing(athleteId: number, event: p.Event, season: p.SeasonFilter | null) {
  const athlete = await getAthlete(athleteId);
  const marks = await athleteMarks(athleteId, event, season);
  const best = prOf(marks, "metric").legal;
  const entries = await fieldBests(event, athlete.gender, season);
  // A seeded athlete is already in the field; don't count them as their own rival.
  const others = entries.filter((e) => e.athlete_id !== athleteId).map((e) => e.best_cm);
  const field = summarizeField(entries);
  return { athlete, best, entries, others, field };
}

reads.get("/athletes/:id/percentile", async (req, res) => {
  const athleteId = p.id(req.params.id);
  const event = p.event(req);
  const season = p.season(req);
  const units = p.units(req);
  const { athlete, best, entries, others, field } = await standing(athleteId, event, season);

  if (!best) throw new HttpError(404, `athlete ${athleteId} has no legal ${event} mark`);
  if (!entries.length) throw new HttpError(404, "no seeded field for that event/gender/season");
  const cm = best.mark.cm;
  res.json({
    athlete,
    event,
    season: p.seasonLabel(season),
    mark: mark(cm, units),
    percentile: round(percentileOf(cm, field.values), 1),
    z: zScore(cm, field),
    would_rank: wouldRank(cm, others),
    field_size: others.length + 1,
  });
});

reads.get("/target", async (req, res) => {
  const event = p.event(req);
  const gender = p.gender(req);
  const pct = p.percentile(req);
  const season = p.season(req);
  const units = p.units(req);
  const athleteParam = p.optional(req, "athlete");

  const entries = await fieldBests(event, gender, season);
  if (!entries.length) throw new HttpError(404, "no seeded field for that event/gender/season");
  const values = entries.map((e) => e.best_cm);
  const target = markForPercentile(pct, values);

  const body: Record<string, unknown> = {
    event,
    gender,
    season: p.seasonLabel(season),
    percentile: pct,
    target: mark(target, units),
    actual_percentile: round(percentileOf(target, values), 1),
    would_rank: wouldRank(target, values),
    field_size: values.length,
  };

  // "What do I need to jump" — with an athlete, also say how far off they are.
  if (athleteParam !== undefined) {
    const athleteId = p.id(athleteParam, "athlete");
    const athlete = await getAthlete(athleteId);
    if (athlete.gender !== gender) throw new HttpError(400, "athlete gender doesn't match gender");
    const best = prOf(await athleteMarks(athleteId, event, season), "metric").legal;
    body.athlete = {
      ...athlete,
      pr: best ? mark(best.mark.cm, units) : null,
      needed: best ? gap(Math.max(0, target - best.mark.cm), units) : null,
    };
  }

  res.json(body);
});

reads.get("/athletes/:id/pr", async (req, res) => {
  const athleteId = p.id(req.params.id);
  const event = p.event(req);
  const units = p.units(req);
  const athlete = await getAthlete(athleteId);
  const marks = await athleteMarks(athleteId, event);
  res.json({ athlete, event, ...prSummary(marks, units) });
});

reads.get("/athletes/:id/progression", async (req, res) => {
  const athleteId = p.id(req.params.id);
  const event = p.event(req);
  const units = p.units(req);
  const athlete = await getAthlete(athleteId);
  const marks = await athleteMarks(athleteId, event);
  res.json({ athlete, event, ...progression(marks, units) });
});

reads.get("/compare", async (req, res) => {
  const event = p.event(req);
  const season = p.season(req);
  const units = p.units(req);
  const ids = [...new Set(p.required(req, "athletes").split(",").map((s) => p.id(s.trim(), "athletes")))];
  if (ids.length < 2 || ids.length > 10) throw new HttpError(400, "athletes must list 2–10 ids");

  const athletes = await Promise.all(
    ids.map(async (athleteId) => {
      const { athlete, best, entries, others, field } = await standing(athleteId, event, season);
      const marks = await athleteMarks(athleteId, event, season);
      const cm = best?.mark.cm;
      return {
        marks,
        summary: {
          ...athlete,
          pr: prSummary(marks, units),
          percentile:
            cm !== undefined && entries.length ? round(percentileOf(cm, field.values), 1) : null,
          would_rank: cm !== undefined && entries.length ? wouldRank(cm, others) : null,
        },
        best: cm ?? null,
      };
    }),
  );

  const body: Record<string, unknown> = {
    event,
    season: p.seasonLabel(season),
    athletes: athletes.map((a) => a.summary),
  };

  // Head-to-head only makes sense for a pair: meets both jumped in, each
  // athlete's best mark at that meet.
  if (athletes.length === 2) {
    const [a, b] = athletes as [(typeof athletes)[0], (typeof athletes)[0]];
    const meetBest = (marks: typeof a.marks) => {
      const byMeet = new Map<string, (typeof marks)[0]>();
      for (const m of marks) {
        const k = `${m.meet_date}|${m.meet_name}`;
        const cur = byMeet.get(k);
        if (!cur || m.mark_cm > cur.mark_cm) byMeet.set(k, m);
      }
      return byMeet;
    };
    const aMeets = meetBest(a.marks);
    const bMeets = meetBest(b.marks);
    const meetings = [...aMeets].flatMap(([k, am]) => {
      const bm = bMeets.get(k);
      return bm ? [{ a: am, b: bm }] : [];
    });
    const wins = { [a.summary.id]: 0, [b.summary.id]: 0, ties: 0 };
    for (const m of meetings) {
      if (m.a.mark_cm > m.b.mark_cm) wins[a.summary.id]!++;
      else if (m.b.mark_cm > m.a.mark_cm) wins[b.summary.id]!++;
      else wins.ties!++;
    }
    body.head_to_head = {
      meetings: meetings.length,
      record: wins,
      meets: meetings.map((m) => ({
        meet_name: m.a.meet_name,
        meet_date: m.a.meet_date,
        [a.summary.id]: formatPerformance(m.a, units),
        [b.summary.id]: formatPerformance(m.b, units),
      })),
    };
    body.pr_gap =
      a.best !== null && b.best !== null ? gap(a.best - b.best, units) : null;
  }

  res.json(body);
});

reads.get("/score", async (req, res) => {
  const event = p.event(req);
  const gender = p.gender(req);
  const raw = p.required(req, "mark");
  const units = p.units(req);
  const cm = parseMark(raw);
  if (cm === null) throw new HttpError(400, 'mark must look like 6.48, 648cm, or 21-03.25');
  const table = loadTable();
  res.json({ event, gender, mark: mark(cm, units), points: points(table, event, gender, cm) });
});
