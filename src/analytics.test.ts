import { prSummary, progression, rankField } from "./analytics";
import type { Performance } from "./repo";

let nextId = 1;
function perf(p: Partial<Performance> & Pick<Performance, "mark_cm" | "meet_date" | "season_type">): Performance {
  return {
    id: nextId++,
    wind: null,
    legal: true,
    meet_name: "Meet",
    season_year: Number(p.meet_date.slice(0, 4)),
    ...p,
  };
}

describe("rankField", () => {
  it("gives ties the same rank and skips the next", () => {
    const ranked = rankField(
      [
        { athlete_id: 1, name: "a", best_cm: 700 },
        { athlete_id: 2, name: "b", best_cm: 690 },
        { athlete_id: 3, name: "c", best_cm: 690 },
        { athlete_id: 4, name: "d", best_cm: 650 },
      ],
      "metric",
    );
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(ranked[0]!.z).toBeGreaterThan(0);
    expect(ranked[3]!.z).toBeLessThan(0);
  });
});

describe("prSummary", () => {
  const marks = [
    perf({ mark_cm: 640, meet_date: "2026-02-01", season_type: "indoor" }),
    perf({ mark_cm: 660, meet_date: "2026-04-01", season_type: "outdoor", wind: 1.5 }),
    perf({ mark_cm: 675, meet_date: "2026-04-08", season_type: "outdoor", wind: 3.0, legal: false }),
    perf({ mark_cm: 650, meet_date: "2026-04-15", season_type: "outdoor", wind: 4.0, legal: false }),
  ];
  const s = prSummary(marks, "metric");

  it("keeps indoor and outdoor PRs separate", () => {
    expect(s.indoor.legal!.mark.cm).toBe(640);
    expect(s.outdoor.legal!.mark.cm).toBe(660);
  });

  it("shows a wind-aided mark only when it beats the legal PR", () => {
    expect(s.outdoor.wind_aided!.mark.cm).toBe(675);
    expect(s.indoor.wind_aided).toBeNull();
    const noBetterAided = prSummary(marks.filter((m) => m.mark_cm !== 675), "metric");
    expect(noBetterAided.outdoor.wind_aided).toBeNull();
  });
});

describe("progression", () => {
  const marks = [
    perf({ mark_cm: 600, meet_date: "2025-12-06", season_type: "indoor", season_year: 2026 }),
    perf({ mark_cm: 620, meet_date: "2026-01-10", season_type: "indoor", season_year: 2026 }),
    perf({ mark_cm: 610, meet_date: "2026-01-24", season_type: "indoor", season_year: 2026 }),
    // Lower than the indoor PR, but it's the first outdoor mark: an outdoor PR.
    perf({ mark_cm: 605, meet_date: "2026-03-28", season_type: "outdoor", wind: 0.5 }),
    perf({ mark_cm: 640, meet_date: "2026-04-04", season_type: "outdoor", wind: 2.5, legal: false }),
  ];
  const p = progression(marks, "metric");

  it("tracks PRs per season type, ignoring illegal marks", () => {
    expect(p.history.map((h) => h.pr)).toEqual([true, true, false, true, false]);
    expect(p.pr_timeline.indoor.map((m) => m.mark.cm)).toEqual([600, 620]);
    expect(p.pr_timeline.outdoor.map((m) => m.mark.cm)).toEqual([605]);
  });

  it("groups a December indoor meet into the next year's season", () => {
    expect(p.season_bests.map((s) => s.season)).toEqual(["indoor-2026", "outdoor-2026"]);
    expect(p.season_bests[1]!.best_legal!.cm).toBe(605);
    expect(p.season_bests[1]!.best_all_conditions.cm).toBe(640);
  });

  it("fits the slope to legal marks only", () => {
    expect(p.improvement.based_on_marks).toBe(4);
  });
});
