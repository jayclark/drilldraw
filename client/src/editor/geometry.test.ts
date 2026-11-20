import { describe, expect, it } from "vitest";
import type { Point } from "../../../shared/drill";
import {
  arrowHead,
  length,
  loops,
  pathGeometry,
  pointToSegment,
  simplify,
  smooth,
  trimEnd,
  wavy,
} from "./geometry";

const line: Point[] = [
  [0, 0],
  [20, 0],
];

describe("simplify", () => {
  it("drops collinear points", () => {
    const pts: Point[] = [
      [0, 0],
      [1, 0.01],
      [2, 0],
      [3, 0.02],
      [10, 0],
    ];
    expect(simplify(pts, 0.1)).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });
  it("keeps corners", () => {
    const pts: Point[] = [
      [0, 0],
      [5, 5],
      [10, 0],
    ];
    expect(simplify(pts, 0.1)).toHaveLength(3);
  });
});

describe("smooth", () => {
  it("passes through every control point", () => {
    const pts: Point[] = [
      [0, 0],
      [5, 5],
      [10, 0],
    ];
    const out = smooth(pts);
    for (const p of pts) {
      expect(out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9)).toBe(
        true,
      );
    }
  });
});

describe("patterns", () => {
  it("wavy line stays within its amplitude and ends at the endpoint", () => {
    const w = wavy(line, 0.7);
    for (const p of w) expect(Math.abs(p[1])).toBeLessThanOrEqual(0.7 + 1e-9);
    expect(w.at(-1)).toEqual([20, 0]);
    expect(Math.max(...w.map((p) => Math.abs(p[1])))).toBeGreaterThan(0.6);
  });
  it("very short strokes don't hang and come back plain", () => {
    const short: Point[] = [
      [0, 0],
      [0.4, 0],
    ];
    expect(wavy(short)).toEqual(short);
    expect(loops(short)).toEqual(short);
    expect(
      pathGeometry({ type: "skateWithPuck", arrow: true, points: short })
        .strokes,
    ).toHaveLength(1);
  });
  it("loops actually loop backwards", () => {
    const l = loops(line, 0.8, 2.2);
    // A looping line moves backwards in x somewhere.
    expect(l.some((p, i) => i > 0 && p[0] < l[i - 1]![0])).toBe(true);
  });
});

describe("arrows and trimming", () => {
  it("arrowhead tip is the path end", () => {
    const a = arrowHead(line, 2)!;
    expect(a[0]).toEqual([20, 0]);
    expect(a[1][0]).toBeCloseTo(18);
  });
  it("trimEnd shortens a path", () => {
    expect(length(trimEnd(line, 3))).toBeCloseTo(17);
  });
  it("pass and shot draw straight between endpoints", () => {
    const g = pathGeometry({
      type: "pass",
      arrow: true,
      points: [
        [0, 0],
        [3, 9],
        [10, 0],
      ],
    });
    expect(g.base).toEqual([
      [0, 0],
      [10, 0],
    ]);
    expect(g.strokes[0]!.dash).toBeTruthy();
    expect(
      pathGeometry({ type: "shot", arrow: true, points: line }).strokes,
    ).toHaveLength(2);
  });
  it("pointToSegment measures perpendicular distance", () => {
    expect(pointToSegment([5, 3], [0, 0], [10, 0])).toBeCloseTo(3);
  });
});
