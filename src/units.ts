export type Units = "metric" | "imperial";

export interface Mark {
  cm: number;
  display: string;
}

// US results convert metric marks by rounding DOWN to the quarter-inch.
// cm * 200 / 127 is cm → quarter-inches (1 in = 2.54 cm) kept in integer math
// so exact quarters (multiples of 127 cm) don't lose to float error.
export function toQuarterInches(cm: number): number {
  return Math.floor((cm * 200) / 127);
}

export function formatImperial(cm: number): string {
  const q = toQuarterInches(cm);
  const feet = Math.floor(q / 48);
  const inches = (q % 48) / 4;
  const [whole, frac] = inches.toFixed(2).split(".");
  return `${feet}-${whole!.padStart(2, "0")}.${frac}`;
}

export function formatMetric(cm: number): string {
  return `${(cm / 100).toFixed(2)}m`;
}

export function mark(cm: number, units: Units): Mark {
  return { cm, display: units === "imperial" ? formatImperial(cm) : formatMetric(cm) };
}

// A difference between two marks. Not floored like a mark: a gap is a distance
// to cover, so it rounds up to the next quarter-inch.
export function gap(cm: number, units: Units): Mark {
  if (units === "metric") return { cm, display: `${cm} cm` };
  const q = Math.sign(cm) * Math.ceil((Math.abs(cm) * 200) / 127);
  return { cm, display: `${(q / 4).toFixed(2)} in` };
}

// Accepts "6.48", "6.48m", "648cm", "21-03.25", "21-3", `21'3.25"`.
// Returns integer cm, or null if the string isn't a mark.
export function parseMark(input: string): number | null {
  const s = input.trim().toLowerCase();

  const imperial = s.match(/^(\d+)\s*(?:-|')\s*(\d+(?:\.\d+)?)\s*"?$/);
  if (imperial) {
    const feet = Number(imperial[1]);
    const inches = Number(imperial[2]);
    if (inches >= 12) return null;
    return Math.round((feet * 12 + inches) * 2.54);
  }

  const cm = s.match(/^(\d+)\s*cm$/);
  if (cm) return Number(cm[1]);

  const metres = s.match(/^(\d+(?:\.\d+)?)\s*m?$/);
  if (metres) return Math.round(Number(metres[1]) * 100);

  return null;
}
