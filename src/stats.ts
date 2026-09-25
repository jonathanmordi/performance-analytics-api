export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// Population stddev: the seeded field is the whole population we rank against,
// not a sample of a bigger one.
export function stddev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

// Mid-rank percentile: share of the field below the mark, counting ties as
// half. The best mark in a field of 200 is 99.75, not 100; a mark above
// everyone is 100.
export function percentileOf(markCm: number, field: number[]): number {
  let below = 0;
  let equal = 0;
  for (const x of field) {
    if (x < markCm) below++;
    else if (x === markCm) equal++;
  }
  return (100 * (below + equal / 2)) / field.length;
}

// Inverse of percentileOf: the smallest whole-cm mark whose percentile is at
// least `pct`. percentileOf is non-decreasing in the mark, so binary search.
export function markForPercentile(pct: number, field: number[]): number {
  let lo = 1;
  let hi = Math.max(...field) + 1; // beats everyone → 100
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (percentileOf(mid, field) >= pct) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// Rank a mark would hold in the field: 1 + number of strictly better marks.
export function wouldRank(markCm: number, field: number[]): number {
  return 1 + field.filter((x) => x > markCm).length;
}

// Ordinary least-squares slope of y on x. Null when x has no spread.
export function slope(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

export function round(x: number, places: number): number {
  const f = 10 ** places;
  return Math.round(x * f) / f;
}
