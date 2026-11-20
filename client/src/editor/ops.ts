import { nanoid } from "nanoid";
import {
  isArea,
  isPath,
  MAX_ELEMENTS,
  type DrillElement,
  type NewElement,
  type DrillParts,
  type MarkerElement,
  type RinkView,
} from "../../../shared/drill";
import { LABEL_ORIGIN, LOCAL_ORIGIN } from "../drill/yhooks";
import { translatePoints } from "./geometry";
import type { ToolId } from "./tools";

export class LimitError extends Error {}

function transact(
  parts: DrillParts,
  fn: () => void,
  origin: string = LOCAL_ORIGIN,
) {
  parts.elements.doc!.transact(fn, origin);
}

function nextZ(parts: DrillParts) {
  let z = 0;
  for (const el of parts.elements.values()) z = Math.max(z, el.z);
  return z + 1;
}

export function addElement(parts: DrillParts, el: NewElement): DrillElement {
  if (parts.elements.size >= MAX_ELEMENTS) {
    throw new LimitError(`A drill can have at most ${MAX_ELEMENTS} items.`);
  }
  const full = { ...el, id: nanoid(10), z: nextZ(parts) } as DrillElement;
  transact(parts, () => parts.elements.set(full.id, full));
  return full;
}

export function updateElement(
  parts: DrillParts,
  id: string,
  patch: Partial<DrillElement>,
) {
  const el = parts.elements.get(id);
  if (!el) return;
  transact(parts, () =>
    parts.elements.set(id, { ...el, ...patch } as DrillElement),
  );
}

/** Edit a marker's label; consecutive keystrokes undo as one step. */
export function updateLabel(parts: DrillParts, id: string, label: string) {
  const el = parts.elements.get(id);
  if (!el || !("label" in el)) return;
  transact(parts, () => parts.elements.set(id, { ...el, label }), LABEL_ORIGIN);
}

export function moveElement(
  el: DrillElement,
  dx: number,
  dy: number,
): DrillElement {
  if (isPath(el) || isArea(el))
    return { ...el, points: translatePoints(el.points, dx, dy) };
  return { ...el, x: el.x + dx, y: el.y + dy };
}

export function commitMove(
  parts: DrillParts,
  id: string,
  dx: number,
  dy: number,
) {
  const el = parts.elements.get(id);
  if (!el || (dx === 0 && dy === 0)) return;
  transact(parts, () => parts.elements.set(id, moveElement(el, dx, dy)));
}

export function deleteElement(parts: DrillParts, id: string) {
  transact(parts, () => parts.elements.delete(id));
}

export function clearAll(parts: DrillParts) {
  transact(parts, () => {
    for (const id of [...parts.elements.keys()]) parts.elements.delete(id);
  });
}

export function duplicateElement(
  parts: DrillParts,
  id: string,
): DrillElement | null {
  const el = parts.elements.get(id);
  if (!el) return null;
  const { id: _id, z: _z, ...rest } = moveElement(el, 3, 3);
  void _id;
  void _z;
  return addElement(parts, rest);
}

export function setRinkView(parts: DrillParts, view: RinkView) {
  transact(parts, () => parts.meta.set("rinkView", view));
}

/** Next auto label for counted markers: F1, F2…, D1…, 1, 2… */
export function nextLabel(parts: DrillParts, prefix: string): string {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const el of parts.elements.values()) {
    if ("label" in el) {
      const m = re.exec(el.label);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return `${prefix}${max + 1}`;
}

/** Build the marker a click with `tool` should place at (x, y). */
export function markerFor(
  parts: DrillParts,
  tool: ToolId,
  x: number,
  y: number,
): Omit<MarkerElement, "id" | "z"> | null {
  const base = { x, y, rotation: 0, label: "" };
  switch (tool) {
    case "puck":
      return { ...base, type: "puck" };
    case "cone":
      return { ...base, type: "cone" };
    case "net":
      // Open toward centre ice by default.
      return { ...base, type: "net", rotation: x > 0 ? 180 : 0 };
    case "forwardN":
      return {
        ...base,
        type: "player",
        variant: "forward",
        label: nextLabel(parts, "F"),
      };
    case "defenseN":
      return {
        ...base,
        type: "player",
        variant: "defense",
        label: nextLabel(parts, "D"),
      };
    case "forward":
      return { ...base, type: "player", variant: "forward", label: "F" };
    case "coach":
      return { ...base, type: "player", variant: "coach", label: "C" };
    case "number":
      return { ...base, type: "number", label: nextLabel(parts, "") };
    case "text":
      return { ...base, type: "text", label: "Text" };
    default:
      return null;
  }
}
