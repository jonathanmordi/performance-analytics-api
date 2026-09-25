import { markForPercentile, mean, percentileOf, slope, stddev, wouldRank } from "./stats";

const field = [600, 610, 620, 620, 650];

it("mean / population stddev", () => {
  expect(mean([2, 4, 4, 4, 5, 5, 7, 9])).toBe(5);
  expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
});

describe("percentileOf", () => {
  it("counts ties as half", () => {
    expect(percentileOf(620, field)).toBe(60); // 2 below + 2 ties / 2 = 3 of 5
  });
  it("is 0 below everyone and 100 above everyone", () => {
    expect(percentileOf(1, field)).toBe(0);
    expect(percentileOf(651, field)).toBe(100);
  });
});

describe("markForPercentile", () => {
  it("returns the smallest mark reaching the percentile", () => {
    for (const pct of [1, 10, 25, 50, 60, 75, 90, 99, 100]) {
      const m = markForPercentile(pct, field);
      expect(percentileOf(m, field)).toBeGreaterThanOrEqual(pct);
      expect(percentileOf(m - 1, field)).toBeLessThan(pct);
    }
  });
});

it("wouldRank", () => {
  expect(wouldRank(620, field)).toBe(2);
  expect(wouldRank(700, field)).toBe(1);
  expect(wouldRank(1, field)).toBe(6);
});

it("slope", () => {
  expect(slope([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }])).toBe(2);
  expect(slope([{ x: 1, y: 1 }, { x: 1, y: 3 }])).toBeNull();
  expect(slope([{ x: 1, y: 1 }])).toBeNull();
});
