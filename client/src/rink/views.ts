import type { Point, RinkView } from "../../../shared/drill";

// Rink coordinates are feet with the origin at centre ice: x ∈ [-100, 100], y ∈ [-42.5, 42.5].
export const RINK = {
  length: 200,
  width: 85,
  cornerRadius: 28,
  goalLineX: 89,
  blueLineX: 25,
  faceoffX: 69,
  faceoffY: 22,
  neutralDotX: 20,
  circleRadius: 15,
  creaseRadius: 6,
} as const;

export interface ViewDef {
  id: RinkView;
  label: string;
  /** viewBox in screen space (after rotation). */
  viewBox: [number, number, number, number];
  /** Rotation applied to rink content, in degrees. */
  rotate: 0 | -90;
}

export const VIEWS: Record<RinkView, ViewDef> = {
  full: {
    id: "full",
    label: "Full rink",
    viewBox: [-101.5, -44, 203, 88],
    rotate: 0,
  },
  // Offensive half, rotated so the goal is at the top (as in most practice plans).
  half: {
    id: "half",
    label: "Half rink",
    viewBox: [-44, -101.5, 88, 103.5],
    rotate: -90,
  },
  neutral: {
    id: "neutral",
    label: "Neutral zone",
    viewBox: [-37, -44, 74, 88],
    rotate: 0,
  },
  end: {
    id: "end",
    label: "End zone",
    viewBox: [22, -44, 79.5, 88],
    rotate: 0,
  },
};

/** Map a rink point into the view's screen space (used for thumbnails and overlays). */
export function toView(view: ViewDef, [x, y]: Point): Point {
  return view.rotate === -90 ? [y, -x] : [x, y];
}
