import { useCallback, useRef, useSyncExternalStore } from "react";
import type * as Y from "yjs";

/** Origin tag for drawing edits made by this browser (tracked by the UndoManager). */
export const LOCAL_ORIGIN = "local";
/** Origin for typing in an element's label; consecutive keystrokes undo together. */
export const LABEL_ORIGIN = "label";

/**
 * Subscribe a component to a Yjs shared type. `read` computes a snapshot; it is cached
 * until the type changes so React sees a stable value between updates.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useYSnapshot<T extends Y.AbstractType<any>, R>(
  type: T,
  read: (t: T) => R,
): R {
  const cached = useRef<{ type: T; value: R } | null>(null);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = () => {
        cached.current = null;
        onChange();
      };
      type.observe(handler);
      return () => type.unobserve(handler);
    },
    [type],
  );
  const getSnapshot = useCallback(() => {
    if (!cached.current || cached.current.type !== type) {
      cached.current = { type, value: read(type) };
    }
    return cached.current.value;
  }, [type, read]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

function readMapValues<V>(m: Y.Map<V>): V[] {
  return [...m.values()];
}
export function useYMapValues<V>(map: Y.Map<V>): V[] {
  return useYSnapshot(map, readMapValues<V>);
}

function readMapGet(m: Y.Map<unknown>) {
  return m.toJSON() as Record<string, unknown>;
}
export function useYMapJSON(map: Y.Map<unknown>): Record<string, unknown> {
  return useYSnapshot(map, readMapGet);
}

function readText(t: Y.Text) {
  return t.toString();
}
export function useYText(text: Y.Text): [string, (next: string) => void] {
  const value = useYSnapshot(text, readText);
  const set = useCallback((next: string) => applyTextDiff(text, next), [text]);
  return [value, set];
}

/** Apply the minimal single-range edit that turns the current text into `next`. */
export function applyTextDiff(text: Y.Text, next: string) {
  const prev = text.toString();
  if (prev === next) return;
  let start = 0;
  while (
    start < prev.length &&
    start < next.length &&
    prev[start] === next[start]
  )
    start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (
    endPrev > start &&
    endNext > start &&
    prev[endPrev - 1] === next[endNext - 1]
  ) {
    endPrev--;
    endNext--;
  }
  const apply = () => {
    if (endPrev > start) text.delete(start, endPrev - start);
    if (endNext > start) text.insert(start, next.slice(start, endNext));
  };
  if (text.doc) text.doc.transact(apply, "text");
  else apply();
}
