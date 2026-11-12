/**
 * The guilloché rosette drawn on every seal. Its four rose-engine curves (hypotrochoids) take their radii from the
 * fingerprint's bytes, so one changed character in the account draws a different rosette. Web and Android compute
 * the same integers from the same fingerprint.
 */

export interface Curve {
  /** Fixed circle radius. */
  R: number;
  /** Rolling circle radius. */
  r: number;
  /** Pen distance from the rolling circle's centre. */
  d: number;
  /** Turns of the rolling circle needed to close the curve. */
  turns: number;
  /** Outer radius of this curve as a share of the rosette's radius. */
  extent: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function hexBytes(hex: string): number[] {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("expected a 64-digit lower-case hex fingerprint");
  return hex.match(/.{2}/g)!.map((h) => parseInt(h, 16));
}

export function rosette(hex: string): Curve[] {
  const b = hexBytes(hex);
  const curves: Curve[] = [];
  for (let k = 0; k < 4; k++) {
    const R = 60 + (b[k]! % 36);
    let r = 5 + (b[k + 4]! % 17);
    if (r === R || R % r === 0) r += 1;
    const d = r * (0.7 + (b[k + 8]! / 255) * 0.9);
    curves.push({ R, r, d: Math.round(d * 1000) / 1000, turns: r / gcd(R, r), extent: (96 - k * 13) / 110 });
  }
  return curves;
}

/** Points of one curve, centred on (cx, cy), scaled so the curve reaches `radius * extent`. */
export function curvePoints(c: Curve, cx: number, cy: number, radius: number, n = 2400): [number, number][] {
  const scale = (radius * c.extent) / (c.R - c.r + c.d);
  const pts: [number, number][] = [];
  const k = (c.R - c.r) / c.r;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2 * c.turns;
    const x = (c.R - c.r) * Math.cos(t) + c.d * Math.cos(k * t);
    const y = (c.R - c.r) * Math.sin(t) - c.d * Math.sin(k * t);
    pts.push([cx + x * scale, cy + y * scale]);
  }
  return pts;
}

/** An SVG path for one curve, with two decimals. */
export function curvePath(c: Curve, cx: number, cy: number, radius: number, n = 2400): string {
  return curvePoints(c, cx, cy, radius, n)
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join("");
}
