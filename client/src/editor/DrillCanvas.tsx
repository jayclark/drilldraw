import {
  forwardRef,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  MAX_PATH_POINTS,
  PATH_TYPES,
  type DrillElement,
  type NewElement,
  type DrillParts,
  type PathType,
  type Point,
  type RinkView,
} from "../../../shared/drill";
import { useYMapValues } from "../drill/yhooks";
import type { PresenceState } from "../drill/useDrill";
import { Rink } from "../rink/Rink";
import { VIEWS } from "../rink/views";
import { ElementDefs, ElementView, SelectionOutline } from "./ElementView";
import { dist, simplify } from "./geometry";
import {
  addElement,
  commitMove,
  LimitError,
  markerFor,
  moveElement,
} from "./ops";
import type { ToolId } from "./tools";

type Draft =
  | { kind: "path"; type: PathType; points: Point[] }
  | { kind: "area"; start: Point; end: Point }
  | { kind: "move"; id: string; start: Point; delta: Point; moved: boolean };

export interface DrillCanvasProps {
  parts: DrillParts;
  view: RinkView;
  tool: ToolId;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Called after a text marker is placed so the UI can focus its label editor. */
  onCreated?: (el: DrillElement) => void;
  onError?: (message: string) => void;
  /** Remote collaborators' presence, keyed by awareness client id. */
  peers: [number, PresenceState][];
  onCursor?: (pos: { x: number; y: number } | null) => void;
}

/** The interactive rink: renders the drill and turns pointer input into edits. */
export const DrillCanvas = forwardRef<SVGSVGElement, DrillCanvasProps>(
  function DrillCanvas(
    {
      parts,
      view,
      tool,
      selectedId,
      onSelect,
      onCreated,
      onError,
      peers,
      onCursor,
    },
    ref,
  ) {
    const elements = useYMapValues(parts.elements);
    const sorted = useMemo(
      () => [...elements].sort((a, b) => a.z - b.z),
      [elements],
    );
    const contentRef = useRef<SVGGElement>(null);
    const [draft, setDraftState] = useState<Draft | null>(null);
    // Pointer events can arrive faster than React renders; the ref is the source of truth.
    const draftRef = useRef<Draft | null>(null);
    const setDraft = (next: Draft | null) => {
      draftRef.current = next;
      setDraftState(next);
    };
    const patternId = useId().replace(/:/g, "") + "hatch";
    const viewRotate = VIEWS[view].rotate;
    const lastCursor = useRef(0);

    const toRink = (e: PointerEvent): Point | null => {
      const g = contentRef.current;
      const ctm = g?.getScreenCTM();
      if (!g || !ctm) return null;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
        ctm.inverse(),
      );
      return [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100];
    };

    const tryAdd = (el: NewElement) => {
      try {
        return addElement(parts, el);
      } catch (err) {
        if (err instanceof LimitError) onError?.(err.message);
        else throw err;
        return null;
      }
    };

    const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      const p = toRink(e);
      if (!p) return;

      if (tool === "select") {
        const hit = (e.target as Element).closest("[data-el-id]");
        const id = hit?.getAttribute("data-el-id") ?? null;
        onSelect(id);
        if (id) {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDraft({ kind: "move", id, start: p, delta: [0, 0], moved: false });
        }
        return;
      }

      if ((PATH_TYPES as string[]).includes(tool)) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDraft({ kind: "path", type: tool as PathType, points: [p] });
        return;
      }
      if (tool === "area") {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDraft({ kind: "area", start: p, end: p });
        return;
      }
      const marker = markerFor(parts, tool, p[0], p[1]);
      if (marker) {
        const el = tryAdd(marker);
        if (el) onCreated?.(el);
      }
    };

    const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
      const p = toRink(e);
      if (!p) return;
      const now = performance.now();
      if (onCursor && now - lastCursor.current > 50) {
        lastCursor.current = now;
        onCursor({ x: p[0], y: p[1] });
      }
      const d = draftRef.current;
      if (!d) return;
      if (d.kind === "path") {
        const last = d.points[d.points.length - 1]!;
        if (dist(last, p) > 0.3) setDraft({ ...d, points: [...d.points, p] });
      } else if (d.kind === "area") {
        setDraft({ ...d, end: p });
      } else {
        const delta: Point = [p[0] - d.start[0], p[1] - d.start[1]];
        setDraft({
          ...d,
          delta,
          moved: d.moved || Math.hypot(...delta) > 0.2,
        });
      }
    };

    const finish = () => {
      const d = draftRef.current;
      setDraft(null);
      if (!d) return;
      if (d.kind === "path") {
        const straight = d.type === "pass" || d.type === "shot";
        let points = straight
          ? [d.points[0]!, d.points[d.points.length - 1]!]
          : simplify(d.points, 0.35);
        if (points.length > MAX_PATH_POINTS) points = simplify(points, 1);
        const total = points.reduce(
          (n, p, i) => (i ? n + dist(points[i - 1]!, p) : 0),
          0,
        );
        if (total < 1.5) return; // A tap, not a stroke.
        tryAdd({ type: d.type, points, arrow: d.type !== "freehand" });
      } else if (d.kind === "area") {
        const [x0, y0] = d.start;
        const [x1, y1] = d.end;
        if (Math.abs(x1 - x0) < 1 || Math.abs(y1 - y0) < 1) return;
        tryAdd({
          type: "area",
          points: [
            [x0, y0],
            [x1, y0],
            [x1, y1],
            [x0, y1],
          ],
        });
      } else if (d.moved) {
        commitMove(parts, d.id, d.delta[0], d.delta[1]);
      }
    };

    const draftEl = useMemo((): DrillElement | null => {
      if (!draft) return null;
      if (draft.kind === "path") {
        if (draft.points.length < 2) return null;
        const straight = draft.type === "pass" || draft.type === "shot";
        return {
          id: "draft",
          z: 0,
          type: draft.type,
          arrow: draft.type !== "freehand",
          points: straight
            ? [draft.points[0]!, draft.points[draft.points.length - 1]!]
            : draft.points,
        };
      }
      if (draft.kind === "area") {
        const [x0, y0] = draft.start;
        const [x1, y1] = draft.end;
        return {
          id: "draft",
          z: 0,
          type: "area",
          points: [
            [x0, y0],
            [x1, y0],
            [x1, y1],
            [x0, y1],
          ],
        };
      }
      return null;
    }, [draft]);

    const selected = sorted.find((el) => el.id === selectedId) ?? null;
    const moving = draft?.kind === "move" ? draft : null;

    return (
      <Rink
        ref={ref}
        view={view}
        contentRef={contentRef}
        className={`drill-canvas tool-${tool}`}
        role="img"
        aria-label="Drill diagram"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={() => setDraft(null)}
        onPointerLeave={() => onCursor?.(null)}
      >
        <ElementDefs id={patternId} />
        {selected && (
          <SelectionOutline
            el={
              moving?.id === selected.id
                ? moveElement(selected, ...moving.delta)
                : selected
            }
            viewRotate={viewRotate}
          />
        )}
        {sorted.map((el) => (
          <ElementView
            key={el.id}
            el={moving?.id === el.id ? moveElement(el, ...moving.delta) : el}
            viewRotate={viewRotate}
            patternId={patternId}
            selectable={tool === "select"}
          />
        ))}
        {draftEl && (
          <g opacity={0.7} data-export="skip">
            <ElementView
              el={draftEl}
              viewRotate={viewRotate}
              patternId={patternId}
              selectable={false}
            />
          </g>
        )}
        <g data-export="skip" pointerEvents="none">
          {peers.map(([clientId, s]) =>
            s.cursor && s.user ? (
              <g
                key={clientId}
                transform={`translate(${s.cursor.x} ${s.cursor.y}) rotate(${-viewRotate})`}
              >
                <path
                  d="M0 0L0 3.6L1 2.7L1.8 4.4L2.5 4.1L1.7 2.4L3 2.4Z"
                  fill={s.user.color}
                  stroke="#fff"
                  strokeWidth={0.2}
                />
                <text
                  x={3.2}
                  y={5.2}
                  fontSize={1.7}
                  fontFamily="Inter, Arial, sans-serif"
                  fontWeight={600}
                  fill={s.user.color}
                  stroke="#fff"
                  strokeWidth={0.4}
                  paintOrder="stroke"
                >
                  {s.user.name}
                </text>
              </g>
            ) : null,
          )}
        </g>
      </Rink>
    );
  },
);
