import { memo } from "react";
import {
  isArea,
  isPath,
  type AreaElement,
  type DrillElement,
  type MarkerElement,
  type PathElement,
} from "../../../shared/drill";
import { pathGeometry, toPathD } from "./geometry";

export const INK = "#111827";
// Our own palette (indigo / rose / slate), distinct from the red nets and rink lines.
export const PLAYER_COLORS = {
  forward: "#4f46e5",
  defense: "#be123c",
  coach: "#334155",
} as const;
export const CONE_COLOR = "#f97316";
export const NET_COLOR = "#c8102e";
export const SELECT_COLOR = "#2563eb";

/** Hatch pattern for areas; render once per SVG. */
export function ElementDefs({ id }: { id: string }) {
  return (
    <defs>
      <pattern
        id={id}
        width={1.6}
        height={1.6}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={1.6}
          stroke="#334155"
          strokeWidth={0.28}
        />
      </pattern>
    </defs>
  );
}

function PathView({ el, hit }: { el: PathElement; hit: boolean }) {
  const g = pathGeometry(el);
  return (
    <g>
      {g.strokes.map((s, i) => (
        <path
          key={i}
          d={toPathD(s.points)}
          fill="none"
          stroke={INK}
          strokeWidth={s.width}
          strokeDasharray={s.dash}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {g.arrow && (
        <polygon
          points={g.arrow.map((p) => p.join(",")).join(" ")}
          fill={INK}
        />
      )}
      {hit && (
        <path
          d={toPathD(g.base)}
          fill="none"
          stroke="transparent"
          strokeWidth={3}
          strokeLinecap="round"
          pointerEvents="stroke"
        />
      )}
    </g>
  );
}

function AreaView({ el, patternId }: { el: AreaElement; patternId: string }) {
  return (
    <path
      d={toPathD(el.points, true)}
      fill={`url(#${patternId})`}
      fillOpacity={0.9}
      stroke="#334155"
      strokeWidth={0.25}
      strokeDasharray="1 0.6"
    />
  );
}

/** Netting drawn opening toward +x; rotate to face other directions. */
const NET_PATH = "M0 -3L-2.4 -3Q-3.6 -3 -3.6 -1.8L-3.6 1.8Q-3.6 3 -2.4 3L0 3";

function MarkerView({
  el,
  viewRotate,
}: {
  el: MarkerElement;
  viewRotate: number;
}) {
  // Keep labels and symbols upright on screen regardless of the view's rotation.
  const upright = `translate(${el.x} ${el.y}) rotate(${-viewRotate})`;
  switch (el.type) {
    case "puck":
      return <circle cx={el.x} cy={el.y} r={0.8} fill={INK} />;
    case "cone":
      return (
        <g transform={`${upright} scale(1.4)`}>
          <path d="M0 -1.6L1.15 1.1L-1.15 1.1Z" fill={CONE_COLOR} />
          <path d="M-1.6 1.1L1.6 1.1L1.6 1.5L-1.6 1.5Z" fill={CONE_COLOR} />
          <path d="M-0.55 -0.3L0.55 -0.3L0.75 0.2L-0.75 0.2Z" fill="#fff" />
        </g>
      );
    case "net":
      return (
        <g transform={`translate(${el.x} ${el.y}) rotate(${el.rotation})`}>
          <path
            d={NET_PATH}
            fill="#fde8eb"
            stroke={NET_COLOR}
            strokeWidth={0.45}
          />
          <line
            x1={0}
            y1={-3}
            x2={0}
            y2={3}
            stroke={NET_COLOR}
            strokeWidth={0.6}
          />
        </g>
      );
    case "player": {
      const fill = PLAYER_COLORS[el.variant ?? "forward"];
      const size = el.label.length > 2 ? 1.5 : el.label.length > 1 ? 1.9 : 2.3;
      return (
        <g transform={upright}>
          <circle r={2.6} fill={fill} stroke="#fff" strokeWidth={0.3} />
          <text
            y={size * 0.36}
            textAnchor="middle"
            fontFamily="Inter, Arial, sans-serif"
            fontWeight={700}
            fontSize={size}
            fill="#fff"
          >
            {el.label}
          </text>
        </g>
      );
    }
    case "number":
    case "text":
      return (
        <g transform={`${upright} rotate(${el.rotation})`}>
          <text
            y={el.type === "number" ? 1.1 : 0.9}
            textAnchor="middle"
            fontFamily="Inter, Arial, sans-serif"
            fontWeight={el.type === "number" ? 800 : 600}
            fontSize={el.type === "number" ? 3.2 : 2.6}
            fill={INK}
            stroke="#fff"
            strokeWidth={0.5}
            paintOrder="stroke"
          >
            {el.label}
          </text>
        </g>
      );
  }
}

export interface ElementViewProps {
  el: DrillElement;
  viewRotate: number;
  patternId: string;
  /** Whether the element can be picked (select tool active). */
  selectable: boolean;
}

export const ElementView = memo(function ElementView({
  el,
  viewRotate,
  patternId,
  selectable,
}: ElementViewProps) {
  let body;
  if (isPath(el)) body = <PathView el={el} hit={selectable} />;
  else if (isArea(el)) body = <AreaView el={el} patternId={patternId} />;
  else
    body = (
      <>
        <MarkerView el={el} viewRotate={viewRotate} />
        {/* Generous touch target for small markers like the puck. */}
        {selectable && (
          <circle cx={el.x} cy={el.y} r={3.4} fill="transparent" />
        )}
      </>
    );
  return (
    <g
      data-el-id={el.id}
      style={{ cursor: selectable ? "move" : undefined }}
      pointerEvents={selectable ? undefined : "none"}
    >
      {body}
    </g>
  );
});

/** Highlight drawn under the selected element. Not exported. */
export function SelectionOutline({
  el,
  viewRotate,
}: {
  el: DrillElement;
  viewRotate: number;
}) {
  void viewRotate;
  const common = {
    fill: "none",
    stroke: SELECT_COLOR,
    strokeOpacity: 0.35,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    pointerEvents: "none" as const,
    "data-export": "skip",
  };
  if (isPath(el)) {
    return (
      <path d={toPathD(pathGeometry(el).base)} strokeWidth={2.2} {...common} />
    );
  }
  if (isArea(el)) {
    return <path d={toPathD(el.points, true)} strokeWidth={1.4} {...common} />;
  }
  const r = el.type === "net" ? 4.4 : el.type === "text" ? 3.5 : 3.6;
  return (
    <circle
      cx={el.x}
      cy={el.y}
      r={r}
      strokeWidth={0.5}
      strokeDasharray="1 0.6"
      {...common}
      strokeOpacity={0.9}
    />
  );
}
