import { formatImperial, formatMetric, gap, parseMark, toQuarterInches } from "./units";

describe("formatImperial", () => {
  it.each([
    [648, "21-03.00"], // 255.118 in → rounds down
    [700, "22-11.50"], // 275.59 in
    [191, "6-03.00"], // HJ
    [1400, "45-11.00"], // TJ: 551.18 in
    [254, "8-04.00"], // exact inches
    [127, "4-02.00"], // exactly 50 in — float error would give 4-01.75
  ])("%i cm → %s", (cm, want) => {
    expect(formatImperial(cm)).toBe(want);
  });

  it("never rounds up", () => {
    for (let cm = 1; cm < 2000; cm++) {
      expect((toQuarterInches(cm) / 4) * 2.54).toBeLessThanOrEqual(cm + 1e-9);
    }
  });
});

it("formatMetric", () => {
  expect(formatMetric(648)).toBe("6.48m");
  expect(formatMetric(1405)).toBe("14.05m");
});

describe("parseMark", () => {
  it.each([
    ["6.48", 648],
    ["6.48m", 648],
    ["648cm", 648],
    ["21-03.25", 648],
    ["21-3", 648],
    [`21'3.25"`, 648],
    ["6-03", 191],
  ])("%s → %i", (s, want) => {
    expect(parseMark(s)).toBe(want);
  });

  it.each(["", "abc", "21-13", "-6.48", "6.48ft"])("rejects %j", (s) => {
    expect(parseMark(s)).toBeNull();
  });
});

it("gap rounds up to the next quarter-inch", () => {
  expect(gap(10, "imperial").display).toBe("4.00 in"); // 3.94 in
  expect(gap(-10, "imperial").display).toBe("-4.00 in");
  expect(gap(10, "metric").display).toBe("10 cm");
});
