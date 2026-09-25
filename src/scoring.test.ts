import { points, type ScoringTable } from "./scoring";

// Fake coefficients — this only tests the arithmetic, not the real WA tables.
const table: ScoringTable = { unit: "m", events: { LJ: { M: { a: 10, b: -1, c: 5 } } } };

it("applies floor(a·(x+b)²+c) with the mark in the table's unit", () => {
  expect(points(table, "LJ", "M", 700)).toBe(365); // 10·36 + 5
  expect(points({ ...table, unit: "cm" }, "LJ", "M", 3)).toBe(45); // 10·4 + 5
});

it("floors at zero", () => {
  expect(points({ unit: "m", events: { LJ: { M: { a: 1, b: 0, c: -1000 } } } }, "LJ", "M", 100)).toBe(0);
});

it("refuses events missing from the table", () => {
  expect(() => points(table, "TJ", "M", 1400)).toThrow(/no scoring data/);
});

describe("lookup tables", () => {
  // Fake rows — mechanics only.
  const lookup: ScoringTable = {
    unit: "m",
    events: { HJ: { F: { table: [[1000, 1.9], [900, 1.8], [1100, 2.0]] } } },
  };

  it("returns the highest points value the mark reaches", () => {
    expect(points(lookup, "HJ", "F", 190)).toBe(1000);
    expect(points(lookup, "HJ", "F", 199)).toBe(1000);
    expect(points(lookup, "HJ", "F", 200)).toBe(1100);
  });

  it("is zero below the table", () => {
    expect(points(lookup, "HJ", "F", 150)).toBe(0);
  });
});
