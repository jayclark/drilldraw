import { forwardRef, useId, type ReactNode, type SVGProps } from "react";
import type { RinkView } from "../../../shared/drill";
import { RINK, VIEWS } from "./views";

// Colours use presentation attributes (not CSS) so exported SVG/PNG/PDF look identical.
export const RINK_COLORS = {
  boards: "#1e293b",
  red: "#cf8f99",
  blue: "#9fb0bd",
  crease: "#d6eef6",
  ice: "#ffffff",
  logo: "#94a3b8",
};

const R = RINK;
const LINE = 0.3;

function FaceoffCircle({ cx, cy }: { cx: number; cy: number }) {
  const r = R.circleRadius;
  const hashX = 2.9;
  const marks: string[] = [];
  // Hash marks outside the circle (top and bottom).
  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const x = cx + sx * hashX;
      const y0 = cy + sy * Math.sqrt(r * r - hashX * hashX);
      marks.push(`M${x} ${y0}L${x} ${y0 + sy * 2}`);
    }
  }
  // L-shaped marks around the dot.
  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const x = cx + sx * 2;
      const y = cy + sy * 0.75;
      marks.push(`M${x + sx * 4} ${y}L${x} ${y}L${x} ${y + sy * 3}`);
    }
  }
  return (
    <g stroke={RINK_COLORS.red} strokeWidth={LINE} fill="none">
      <circle cx={cx} cy={cy} r={r} />
      <path d={marks.join("")} />
      <circle cx={cx} cy={cy} r={1} fill={RINK_COLORS.red} stroke="none" />
    </g>
  );
}

function Crease({ side }: { side: -1 | 1 }) {
  const x = side * R.goalLineX;
  const r = R.creaseRadius;
  // Semicircle on the centre-ice side of the goal line.
  const sweep = side === 1 ? 0 : 1;
  return (
    <path
      d={`M${x} ${-r}A${r} ${r} 0 0 ${sweep} ${x} ${r}Z`}
      fill={RINK_COLORS.crease}
      stroke={RINK_COLORS.red}
      strokeWidth={LINE}
    />
  );
}

/** The ice surface, in rink coordinates (no viewBox or rotation). */
export function RinkSurface({ clipId }: { clipId: string }) {
  const halfL = R.length / 2;
  const halfW = R.width / 2;
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect
            x={-halfL}
            y={-halfW}
            width={R.length}
            height={R.width}
            rx={R.cornerRadius}
          />
        </clipPath>
      </defs>
      <rect
        x={-halfL}
        y={-halfW}
        width={R.length}
        height={R.width}
        rx={R.cornerRadius}
        fill={RINK_COLORS.ice}
      />
      <g clipPath={`url(#${clipId})`}>
        {[-1, 1].map((s) => (
          <line
            key={`goal${s}`}
            x1={s * R.goalLineX}
            x2={s * R.goalLineX}
            y1={-halfW}
            y2={halfW}
            stroke={RINK_COLORS.red}
            strokeWidth={LINE}
          />
        ))}
        {[-1, 1].map((s) => (
          <rect
            key={`blue${s}`}
            x={s * R.blueLineX - 0.5}
            y={-halfW}
            width={1}
            height={R.width}
            fill={RINK_COLORS.blue}
          />
        ))}
        <rect
          x={-0.5}
          y={-halfW}
          width={1}
          height={R.width}
          fill={RINK_COLORS.red}
        />
        {[-1, 1].map((s) => (
          <Crease key={`crease${s}`} side={s as -1 | 1} />
        ))}
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sy) => (
            <FaceoffCircle
              key={`fo${sx}${sy}`}
              cx={sx * R.faceoffX}
              cy={sy * R.faceoffY}
            />
          )),
        )}
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sy) => (
            <circle
              key={`nz${sx}${sy}`}
              cx={sx * R.neutralDotX}
              cy={sy * R.faceoffY}
              r={1}
              fill={RINK_COLORS.red}
            />
          )),
        )}
        <circle
          cx={0}
          cy={0}
          r={R.circleRadius}
          fill={RINK_COLORS.ice}
          stroke={RINK_COLORS.red}
          strokeWidth={LINE}
        />
      </g>
      <rect
        x={-halfL}
        y={-halfW}
        width={R.length}
        height={R.width}
        rx={R.cornerRadius}
        fill="none"
        stroke={RINK_COLORS.boards}
        strokeWidth={1}
      />
    </g>
  );
}

/** Centre-ice wordmark; kept upright regardless of view rotation. */
function CenterMark({ rotate }: { rotate: number }) {
  return (
    <text
      x={0}
      y={1.4}
      transform={`rotate(${-rotate})`}
      textAnchor="middle"
      fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif"
      fontWeight={800}
      fontStyle="italic"
      fontSize={4.2}
      letterSpacing={0.1}
      fill={RINK_COLORS.logo}
    >
      DRILLDRAW
    </text>
  );
}

export interface RinkProps extends Omit<
  SVGProps<SVGSVGElement>,
  "ref" | "viewBox"
> {
  view: RinkView;
  /** Content drawn in rink coordinates on top of the ice. */
  children?: ReactNode;
  /** Ref to the rotated content group, for converting pointer positions to rink coordinates. */
  contentRef?: React.Ref<SVGGElement>;
}

/** A rink SVG cropped/rotated to one of the standard views. */
export const Rink = forwardRef<SVGSVGElement, RinkProps>(function Rink(
  { view, children, contentRef, ...rest },
  ref,
) {
  const v = VIEWS[view];
  const clipId = useId().replace(/:/g, "") + "rink";
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={v.viewBox.join(" ")}
      preserveAspectRatio="xMidYMid meet"
      {...rest}
    >
      <g
        ref={contentRef}
        transform={v.rotate ? `rotate(${v.rotate})` : undefined}
      >
        <RinkSurface clipId={clipId} />
        <CenterMark rotate={v.rotate} />
        {children}
      </g>
    </svg>
  );
});
