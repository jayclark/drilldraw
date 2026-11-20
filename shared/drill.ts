// Shared drill model used by both the server (Node) and the client (browser).
// The Y.Doc layout defined here is persisted — change it only with a schemaVersion bump + migration.
import * as Y from "yjs";

export const SCHEMA_VERSION = 1;

export const SPORTS = ["hockey"] as const;
export type Sport = (typeof SPORTS)[number];

/** 12 URL-safe characters (nanoid alphabet). */
export const DRILL_ID_LENGTH = 12;
export const DRILL_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;

export const MAX_ELEMENTS = 1000;
export const MAX_PATH_POINTS = 500;
/** Encoded Y.Doc state cap; keeps a drill inside one Azure Table entity (1 MB). */
export const MAX_STATE_BYTES = 800 * 1024;

/** Drills nobody has opened for this many months are deleted. */
export const DRILL_RETENTION_MONTHS = 9;

/** Drills last visited before this moment are expired. */
export function retentionCutoff(now = new Date()): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - DRILL_RETENTION_MONTHS);
  return d;
}

// ---- Y.Doc layout -----------------------------------------------------------
// Top-level shared types (top-level types never conflict between clients):
//   meta:           Y.Map   { sport, rinkView, schemaVersion }
//   name:           Y.Text
//   description:    Y.Text
//   coachingPoints: Y.Text  (one point per line)
//   elements:       Y.Map<DrillElement>  keyed by element id; values are plain JSON
//                   objects replaced wholesale on change (last writer wins per element).

export type RinkView = "full" | "half" | "neutral" | "end";
export const RINK_VIEWS: RinkView[] = ["full", "half", "neutral", "end"];

export type Point = [number, number];

export type PathType =
  "skate" | "skateWithPuck" | "backward" | "pass" | "shot" | "freehand";
export type MarkerType = "puck" | "cone" | "net" | "player" | "number" | "text";

interface BaseElement {
  id: string;
  /** Stacking order; higher draws on top. */
  z: number;
}
export interface PathElement extends BaseElement {
  type: PathType;
  points: Point[];
  arrow: boolean;
}
export interface MarkerElement extends BaseElement {
  type: MarkerType;
  x: number;
  y: number;
  rotation: number;
  label: string;
  /** Player marker color variant. */
  variant?: "forward" | "defense" | "coach";
}
export interface AreaElement extends BaseElement {
  type: "area";
  points: Point[];
}
export type DrillElement = PathElement | MarkerElement | AreaElement;
/** An element before it is given an id and stacking order. */
export type NewElement = DrillElement extends infer E
  ? E extends DrillElement
    ? Omit<E, "id" | "z">
    : never
  : never;

export const PATH_TYPES: PathType[] = [
  "skate",
  "skateWithPuck",
  "backward",
  "pass",
  "shot",
  "freehand",
];

export function isPath(el: DrillElement): el is PathElement {
  return (PATH_TYPES as string[]).includes(el.type);
}
export function isArea(el: DrillElement): el is AreaElement {
  return el.type === "area";
}
export function isMarker(el: DrillElement): el is MarkerElement {
  return !isPath(el) && !isArea(el);
}

export interface DrillParts {
  meta: Y.Map<unknown>;
  name: Y.Text;
  description: Y.Text;
  coachingPoints: Y.Text;
  elements: Y.Map<DrillElement>;
}

export function drillParts(doc: Y.Doc): DrillParts {
  return {
    meta: doc.getMap("meta"),
    name: doc.getText("name"),
    description: doc.getText("description"),
    coachingPoints: doc.getText("coachingPoints"),
    elements: doc.getMap<DrillElement>("elements"),
  };
}

/** Initialise a brand-new drill document. Only the server calls this, once, at create time. */
export function initDrillDoc(doc: Y.Doc, sport: Sport): void {
  const { meta } = drillParts(doc);
  doc.transact(() => {
    meta.set("sport", sport);
    meta.set("rinkView", "full" satisfies RinkView);
    meta.set("schemaVersion", SCHEMA_VERSION);
  });
}

/**
 * Replace the content of `target` with the content of `source` as ordinary edits,
 * so the change syncs to every connected client. Used for version restore.
 */
export function copyDrillContent(
  source: Y.Doc,
  target: Y.Doc,
  origin: unknown,
): void {
  const src = drillParts(source);
  const dst = drillParts(target);
  target.transact(() => {
    for (const key of ["name", "description", "coachingPoints"] as const) {
      dst[key].delete(0, dst[key].length);
      dst[key].insert(0, src[key].toString());
    }
    dst.meta.set("rinkView", src.meta.get("rinkView") ?? "full");
    for (const id of [...dst.elements.keys()]) {
      if (!src.elements.has(id)) dst.elements.delete(id);
    }
    for (const [id, el] of src.elements.entries()) {
      dst.elements.set(id, el);
    }
  }, origin);
}
