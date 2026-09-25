import type { FieldEntry, Performance } from "./repo";
import type { SeasonType } from "./params";
import { mean, percentileOf, round, slope, stddev } from "./stats";
import { gap, mark, type Units } from "./units";

export function seasonName(p: Pick<Performance, "season_type" | "season_year">): string {
  return `${p.season_type}-${p.season_year}`;
}

export function formatPerformance(p: Performance, units: Units) {
  return {
    id: p.id,
    mark: mark(p.mark_cm, units),
    wind: p.wind,
    legal: p.legal,
    meet_name: p.meet_name,
    meet_date: p.meet_date,
    season: seasonName(p),
  };
}

export interface FieldSummary {
  size: number;
  mean_cm: number;
  stddev_cm: number;
  values: number[];
}

export function summarizeField(entries: FieldEntry[]): FieldSummary {
  const values = entries.map((e) => e.best_cm);
  return {
    size: values.length,
    mean_cm: values.length ? mean(values) : 0,
    stddev_cm: values.length ? stddev(values) : 0,
    values,
  };
}

export function zScore(markCm: number, field: FieldSummary): number | null {
  return field.stddev_cm === 0 ? null : round((markCm - field.mean_cm) / field.stddev_cm, 2);
}

// Entries arrive sorted best-first. Ties share a rank (1, 2, 2, 4).
export function rankField(entries: FieldEntry[], units: Units) {
  const field = summarizeField(entries);
  let rank = 0;
  return entries.map((e, i) => {
    if (i === 0 || entries[i - 1]!.best_cm !== e.best_cm) rank = i + 1;
    return {
      rank,
      athlete_id: e.athlete_id,
      name: e.name,
      mark: mark(e.best_cm, units),
      percentile: round(percentileOf(e.best_cm, field.values), 1),
      z: zScore(e.best_cm, field),
    };
  });
}

function best(marks: Performance[]): Performance | null {
  let top: Performance | null = null;
  for (const m of marks) if (!top || m.mark_cm > top.mark_cm) top = m;
  return top;
}

// Legal PR, plus the best wind-aided mark only when it beats the legal PR —
// that's the only case where a "w" mark is worth showing.
export function prOf(marks: Performance[], units: Units) {
  const legal = best(marks.filter((m) => m.legal));
  const aided = best(marks.filter((m) => !m.legal));
  return {
    legal: legal ? formatPerformance(legal, units) : null,
    wind_aided:
      aided && (!legal || aided.mark_cm > legal.mark_cm) ? formatPerformance(aided, units) : null,
  };
}

export function prSummary(marks: Performance[], units: Units) {
  return {
    overall: prOf(marks, units),
    indoor: prOf(marks.filter((m) => m.season_type === "indoor"), units),
    outdoor: prOf(marks.filter((m) => m.season_type === "outdoor"), units),
  };
}

const DAY_MS = 86_400_000;
const MONTH_DAYS = 365.25 / 12;

// Marks arrive oldest first.
export function progression(marks: Performance[], units: Units) {
  const prSoFar: Record<SeasonType, number> = { indoor: 0, outdoor: 0 };
  const timeline: Record<SeasonType, ReturnType<typeof formatPerformance>[]> = {
    indoor: [],
    outdoor: [],
  };

  const history = marks.map((m) => {
    const isPr = m.legal && m.mark_cm > prSoFar[m.season_type];
    if (isPr) {
      prSoFar[m.season_type] = m.mark_cm;
      timeline[m.season_type].push(formatPerformance(m, units));
    }
    return { ...formatPerformance(m, units), pr: isPr };
  });

  const seasons = new Map<string, Performance[]>();
  for (const m of marks) {
    const key = seasonName(m);
    seasons.set(key, [...(seasons.get(key) ?? []), m]);
  }
  const seasonBests = [...seasons].map(([season, ms]) => {
    const legal = best(ms.filter((m) => m.legal));
    const all = best(ms)!;
    return {
      season,
      best_legal: legal ? mark(legal.mark_cm, units) : null,
      best_all_conditions: mark(all.mark_cm, units),
      marks: ms.length,
    };
  });

  const legalPoints = marks
    .filter((m) => m.legal)
    .map((m) => ({ x: Date.parse(m.meet_date) / DAY_MS / MONTH_DAYS, y: m.mark_cm }));
  const perMonth = slope(legalPoints);

  return {
    history,
    season_bests: seasonBests,
    pr_timeline: timeline,
    improvement: {
      per_month: perMonth === null ? null : gap(round(perMonth, 1), units),
      based_on_marks: legalPoints.length,
    },
  };
}
