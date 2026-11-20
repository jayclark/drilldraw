// Pure geometry helpers for drawing drill elements. All units are rink feet.
import type { PathElement, Point } from "../../../shared/drill";

export const dist = (a: Point, b: Point) =>
  Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Ramer–Douglas–Peucker polyline simplification. */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.slice();
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let maxD = -1;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToSegment(points[i]!, first, last);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tolerance) return [first, last];
  const left = simplify(points.slice(0, idx + 1), tolerance);
  const right = simplify(points.slice(idx), tolerance);
  return [...left.slice(0, -1), ...right];
}

export function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2),
  );
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

/** Smooth a sparse polyline into a dense one through every point (uniform Catmull-Rom). */
export function smooth(points: Point[], step = 0.5): Point[] {
  if (points.length < 3) return points.slice();
  const out: Point[] = [points[0]!];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const n = Math.max(2, Math.ceil(dist(p1, p2) / step));
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b +
          (-a + c) * t +
          (2 * a - 5 * b + 4 * c - d) * t2 +
          (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

export function length(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += dist(points[i - 1]!, points[i]!);
  return total;
}

/** Position and unit tangent at arc-length `s` along a polyline. */
export function sampleAt(points: Point[], s: number): { p: Point; t: Point } {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = dist(a, b);
    if (d === 0) continue;
    if (acc + d >= s || i === points.length - 1) {
      const u = Math.min(1, Math.max(0, (s - acc) / d));
      return {
        p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u],
        t: [(b[0] - a[0]) / d, (b[1] - a[1]) / d],
      };
    }
    acc += d;
  }
  return { p: points[0] ?? [0, 0], t: [1, 0] };
}

/** Trim `amount` feet from the end of a polyline. */
export function trimEnd(points: Point[], amount: number): Point[] {
  const total = length(points);
  if (total <= amount) return points.slice(0, 1);
  const keep = total - amount;
  const out: Point[] = [points[0]!];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const d = dist(points[i - 1]!, points[i]!);
    if (acc + d >= keep) {
      out.push(sampleAt(points, keep).p);
      return out;
    }
    acc += d;
    out.push(points[i]!);
  }
  return out;
}

/**
 * Offset a polyline with a periodic pattern. `offset(phase)` returns [along, across]
 * displacement for phase in radians. The last `tail` feet are left straight so arrows line up.
 */
function patterned(
  base: Point[],
  wavelength: number,
  tail: number,
  offset: (phase: number) => [number, number],
): Point[] {
  const total = length(base);
  const patternLen = Math.max(0, total - tail);
  // Too short for even half a wave (e.g. the first moments of a drag): draw it plain.
  if (patternLen < wavelength / 2) return base.slice();
  // Whole number of periods so the pattern ends back on the centre line.
  const periods = Math.max(1, Math.round(patternLen / wavelength));
  const wl = patternLen / periods;
  const out: Point[] = [];
  const step = Math.min(0.2, wl / 16);
  for (let s = 0; s <= patternLen + 1e-6; s += step) {
    const { p, t } = sampleAt(base, s);
    const [along, across] = offset((2 * Math.PI * s) / wl);
    out.push([
      p[0] + t[0] * along - t[1] * across,
      p[1] + t[1] * along + t[0] * across,
    ]);
  }
  for (let s = patternLen; s <= total + 1e-6; s += 0.5)
    out.push(sampleAt(base, s).p);
  out.push(base[base.length - 1]!);
  return out;
}

/** Skating with the puck: a sine wave along the path. */
export function wavy(
  base: Point[],
  amplitude = 0.7,
  wavelength = 2.4,
  tail = 2.5,
) {
  return patterned(base, wavelength, tail, (ph) => [
    0,
    amplitude * Math.sin(ph),
  ]);
}

/** Skating backward: a looping (prolate trochoid) line along the path. */
export function loops(
  base: Point[],
  radius = 0.8,
  wavelength = 2.2,
  tail = 2.5,
) {
  return patterned(base, wavelength, tail, (ph) => [
    -radius * Math.sin(ph),
    radius * (1 - Math.cos(ph)),
  ]);
}

/** Polyline offset sideways by `d` (positive = left of travel direction). */
export function offsetLine(points: Point[], d: number): Point[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(points.length - 1, i + 1)]!;
    const len = dist(a, b) || 1;
    return [p[0] - ((b[1] - a[1]) / len) * d, p[1] + ((b[0] - a[0]) / len) * d];
  });
}

export function toPathD(points: Point[], closed = false): string {
  if (points.length === 0) return "";
  const r = (n: number) => Math.round(n * 100) / 100;
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${r(p[0])} ${r(p[1])}`)
    .join("");
  return closed ? d + "Z" : d;
}

/** Arrowhead triangle at the end of a polyline, pointing along the final direction. */
export function arrowHead(points: Point[], size = 1.8): Point[] | null {
  if (points.length < 2) return null;
  const tip = points[points.length - 1]!;
  // Look back ~size feet for a stable direction.
  const back = sampleAt(points, Math.max(0, length(points) - size)).p;
  const len = dist(back, tip);
  if (len === 0) return null;
  const ux = (tip[0] - back[0]) / len;
  const uy = (tip[1] - back[1]) / len;
  const w = size * 0.55;
  return [
    tip,
    [tip[0] - ux * size - uy * w, tip[1] - uy * size + ux * w],
    [tip[0] - ux * size + uy * w, tip[1] - uy * size - ux * w],
  ];
}

export interface PathGeometry {
  /** Centre line, used for hit testing and selection outline. */
  base: Point[];
  strokes: { points: Point[]; dash?: string; width: number }[];
  arrow: Point[] | null;
}

export const PATH_STROKE = 0.35;

/** How each path type is drawn (hockey diagram conventions). */
export function pathGeometry(
  el: Pick<PathElement, "type" | "points" | "arrow">,
): PathGeometry {
  const straight = el.type === "pass" || el.type === "shot";
  const base = straight
    ? [el.points[0]!, el.points[el.points.length - 1]!]
    : smooth(el.points);
  const arrowSize = el.type === "shot" ? 2.4 : 1.8;
  const arrow = el.arrow ? arrowHead(base, arrowSize) : null;
  // Stop the stroke under the arrowhead so the tip stays sharp.
  const body = arrow ? trimEnd(base, arrowSize * 0.6) : base;
  switch (el.type) {
    case "skateWithPuck":
      return {
        base,
        arrow,
        strokes: [{ points: wavy(body), width: PATH_STROKE }],
      };
    case "backward":
      return {
        base,
        arrow,
        strokes: [{ points: loops(body), width: PATH_STROKE }],
      };
    case "pass":
      return {
        base,
        arrow,
        strokes: [{ points: body, width: PATH_STROKE, dash: "1.4 0.9" }],
      };
    case "shot":
      return {
        base,
        arrow,
        strokes: [
          { points: offsetLine(body, 0.5), width: PATH_STROKE },
          { points: offsetLine(body, -0.5), width: PATH_STROKE },
        ],
      };
    case "freehand":
      return { base, arrow, strokes: [{ points: body, width: 0.3 }] };
    default:
      return { base, arrow, strokes: [{ points: body, width: PATH_STROKE }] };
  }
}

export function translatePoints(
  points: Point[],
  dx: number,
  dy: number,
): Point[] {
  return points.map(([x, y]) => [x + dx, y + dy]);
}
