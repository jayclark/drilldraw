import type { ReactNode } from "react";
import type { MarkerElement, PathType } from "../../../shared/drill";
import { CONE_COLOR, NET_COLOR, PLAYER_COLORS } from "./ElementView";

export type ToolId =
  | PathType
  | "puck"
  | "cone"
  | "net"
  | "forwardN"
  | "defenseN"
  | "forward"
  | "coach"
  | "number"
  | "text"
  | "area"
  | "select";

export interface ToolDef {
  id: ToolId;
  label: string;
  shortcut?: string;
  icon: ReactNode;
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    {children}
  </svg>
);

const Badge = ({ fill, text }: { fill: string; text: string }) => (
  <Icon>
    <circle cx={12} cy={12} r={10} fill={fill} />
    <text
      x={12}
      y={text.length > 1 ? 15.5 : 16.5}
      textAnchor="middle"
      fontSize={text.length > 1 ? 9.5 : 12}
      fontWeight={700}
      fontFamily="Inter, Arial, sans-serif"
      fill="#fff"
    >
      {text}
    </text>
  </Icon>
);

/** Toolbar order follows the reference design. */
export const TOOLS: ToolDef[] = [
  {
    id: "skate",
    label: "Skate",
    shortcut: "1",
    icon: (
      <Icon>
        <path d="M5 20C5 11 10 6 19 5" {...stroke} />
        <path d="M14 3l5 2-3 4.5" {...stroke} />
      </Icon>
    ),
  },
  {
    id: "skateWithPuck",
    label: "Skate with puck",
    shortcut: "2",
    icon: (
      <Icon>
        <path d="M3 18c2-3 3 1 5-2s3 1 5-2 3 1 5-3" {...stroke} />
        <path d="M15 5h4.5v4.5" {...stroke} />
      </Icon>
    ),
  },
  {
    id: "backward",
    label: "Skate backward",
    shortcut: "3",
    icon: (
      <Icon>
        <path
          d="M3 19c3-1 1-4 3-4s0 3 3 2 1-4 3-4 0 3 3 2 1-4 3-5"
          {...stroke}
        />
        <path d="M15 5h4.5v4.5" {...stroke} />
      </Icon>
    ),
  },
  {
    id: "pass",
    label: "Pass",
    shortcut: "4",
    icon: (
      <Icon>
        <path d="M4 20L18.5 5.5" {...stroke} strokeDasharray="3 2.6" />
        <path d="M13 5h6v6" {...stroke} />
      </Icon>
    ),
  },
  {
    id: "shot",
    label: "Shot",
    shortcut: "5",
    icon: (
      <Icon>
        <path d="M3 18.5L15.5 6M5.5 21L18 8.5" {...stroke} />
        <path d="M14 3.5h6.5V10" {...stroke} />
      </Icon>
    ),
  },
  {
    id: "puck",
    label: "Puck",
    icon: (
      <Icon>
        <circle cx={12} cy={12} r={3} fill="currentColor" />
      </Icon>
    ),
  },
  {
    id: "cone",
    label: "Cone",
    icon: (
      <Icon>
        <path d="M12 3l5 15H7z" fill={CONE_COLOR} />
        <path d="M5 18h14v2.5H5z" fill={CONE_COLOR} />
      </Icon>
    ),
  },
  {
    id: "net",
    label: "Net",
    icon: (
      <Icon>
        <path
          d="M8 4h4.5q3 0 3 3v10q0 3-3 3H8"
          fill="#fde8eb"
          stroke={NET_COLOR}
          strokeWidth={1.8}
        />
        <path d="M8 4v16" stroke={NET_COLOR} strokeWidth={2.4} />
      </Icon>
    ),
  },
  {
    id: "forwardN",
    label: "Forward (F1, F2…)",
    icon: <Badge fill={PLAYER_COLORS.forward} text="F1" />,
  },
  {
    id: "defenseN",
    label: "Defense (D1, D2…)",
    icon: <Badge fill={PLAYER_COLORS.defense} text="D1" />,
  },
  {
    id: "forward",
    label: "Forward",
    icon: <Badge fill={PLAYER_COLORS.forward} text="F" />,
  },
  {
    id: "coach",
    label: "Coach",
    icon: <Badge fill={PLAYER_COLORS.coach} text="C" />,
  },
  {
    id: "number",
    label: "Number",
    icon: (
      <Icon>
        <text
          x={12}
          y={18}
          textAnchor="middle"
          fontSize={17}
          fontWeight={800}
          fill="currentColor"
          fontFamily="Inter, Arial, sans-serif"
        >
          1
        </text>
      </Icon>
    ),
  },
  {
    id: "text",
    label: "Text",
    shortcut: "T",
    icon: (
      <Icon>
        <text
          x={12}
          y={17}
          textAnchor="middle"
          fontSize={14}
          fontWeight={700}
          fill="currentColor"
          fontFamily="Inter, Arial, sans-serif"
        >
          Aa
        </text>
      </Icon>
    ),
  },
  {
    id: "area",
    label: "Area",
    icon: (
      <Icon>
        <rect
          x={3.5}
          y={3.5}
          width={17}
          height={17}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
        />
        <path
          d="M3.5 9.5l6-6M3.5 15.5l12-12M3.5 20.5l17-17M9.5 20.5l11-11M15.5 20.5l5-5"
          stroke="currentColor"
          strokeWidth={1.3}
        />
      </Icon>
    ),
  },
  {
    id: "freehand",
    label: "Freehand",
    shortcut: "B",
    icon: (
      <Icon>
        <path d="M20.5 3.5L10 14" {...stroke} strokeWidth={2.4} />
        <path
          d="M9.5 14.5c-2 0-3.5 1.5-3.5 3.5 0 1.5-1 2.5-3 2.5 2 1 7 1 8-2 .7-2-.2-4-1.5-4z"
          fill="currentColor"
        />
      </Icon>
    ),
  },
  {
    id: "select",
    label: "Select / move",
    shortcut: "V",
    icon: (
      <Icon>
        <path
          d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"
          {...stroke}
          strokeWidth={1.6}
        />
      </Icon>
    ),
  },
];

export const ACTION_ICONS = {
  undo: (
    <Icon>
      <path d="M19 12H5M10 7l-5 5 5 5" {...stroke} />
    </Icon>
  ),
  redo: (
    <Icon>
      <path d="M5 12h14M14 7l5 5-5 5" {...stroke} />
    </Icon>
  ),
  duplicate: (
    <Icon>
      <rect x={6} y={4} width={12} height={17} rx={2} {...stroke} />
      <path d="M9.5 4V3h5v1" {...stroke} />
    </Icon>
  ),
  trash: (
    <Icon>
      <path
        d="M4 6h16M9 6V4h6v2M6.5 6l1 15h9l1-15M10 10v7M14 10v7"
        {...stroke}
      />
    </Icon>
  ),
  rotate: (
    <Icon>
      <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5" {...stroke} />
    </Icon>
  ),
};

export const MARKER_TOOLS: Partial<
  Record<ToolId, Pick<MarkerElement, "type" | "variant">>
> = {
  puck: { type: "puck" },
  cone: { type: "cone" },
  net: { type: "net" },
  forwardN: { type: "player", variant: "forward" },
  defenseN: { type: "player", variant: "defense" },
  forward: { type: "player", variant: "forward" },
  coach: { type: "player", variant: "coach" },
  number: { type: "number" },
  text: { type: "text" },
};
