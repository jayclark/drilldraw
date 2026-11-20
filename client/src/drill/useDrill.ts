import { useEffect, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { drillParts, type DrillParts } from "../../../shared/drill";
import { LABEL_ORIGIN, LOCAL_ORIGIN } from "./yhooks";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface PresenceUser {
  name: string;
  color: string;
}
export interface PresenceState {
  user?: PresenceUser;
  /** Pointer position in rink coordinates, or null when off the rink. */
  cursor?: { x: number; y: number } | null;
}

export interface DrillSession {
  doc: Y.Doc;
  parts: DrillParts;
  provider: WebsocketProvider;
  undo: Y.UndoManager;
  me: PresenceUser;
}

const COLORS = [
  "#2563eb",
  "#db2777",
  "#16a34a",
  "#ea580c",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
];
const ADJECTIVES = [
  "Swift",
  "Sharp",
  "Steady",
  "Bold",
  "Quick",
  "Clever",
  "Calm",
  "Gritty",
];
const ANIMALS = [
  "Otter",
  "Falcon",
  "Wolf",
  "Moose",
  "Lynx",
  "Hawk",
  "Bear",
  "Fox",
];

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]!;

/** A friendly per-browser identity for presence (remembered when storage is available). */
function loadMe(): PresenceUser {
  try {
    const saved = JSON.parse(localStorage.getItem("drilldraw:me") ?? "null");
    if (saved?.name && saved?.color) return saved;
  } catch {
    /* storage unavailable */
  }
  const me = {
    name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`,
    color: pick(COLORS),
  };
  try {
    localStorage.setItem("drilldraw:me", JSON.stringify(me));
  } catch {
    /* storage unavailable */
  }
  return me;
}

function wsBase() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/drills`;
}

/** Connect to a drill's live document. Returns null until the session is created. */
export function useDrill(id: string) {
  const [session, setSession] = useState<DrillSession | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    const doc = new Y.Doc();
    const parts = drillParts(doc);
    const provider = new WebsocketProvider(wsBase(), id, doc, {
      disableBc: true,
    });
    const undo = new Y.UndoManager([parts.elements, parts.meta], {
      trackedOrigins: new Set([LOCAL_ORIGIN, LABEL_ORIGIN]),
      captureTimeout: 500,
    });
    // Every drawing edit (add, move, delete…) is its own undo step, however fast they come.
    // Label typing (LABEL_ORIGIN) is still grouped by captureTimeout.
    const endStep = (tr: Y.Transaction) => {
      if (tr.origin === LOCAL_ORIGIN) undo.stopCapturing();
    };
    doc.on("afterTransaction", endStep);
    const me = loadMe();
    provider.awareness.setLocalStateField("user", me);

    const onStatus = ({ status }: { status: ConnectionStatus }) =>
      setStatus(status);
    const onSync = (isSynced: boolean) => isSynced && setSynced(true);
    provider.on("status", onStatus);
    provider.on("sync", onSync);
    // The session owns a live WebSocket, so it must be created (and destroyed) in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession({ doc, parts, provider, undo, me });

    return () => {
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      doc.off("afterTransaction", endStep);
      undo.destroy();
      provider.destroy();
      provider.awareness.destroy();
      doc.destroy();
      setSession(null);
      setSynced(false);
      setStatus("connecting");
    };
  }, [id]);

  return { session, status, synced };
}

/** Live list of everyone's presence states (including ours), keyed by client id. */
export function usePresence(provider: WebsocketProvider | undefined) {
  const [states, setStates] = useState<Map<number, PresenceState>>(new Map());
  useEffect(() => {
    if (!provider) return;
    const update = () =>
      setStates(
        new Map(provider.awareness.getStates() as Map<number, PresenceState>),
      );
    update();
    provider.awareness.on("change", update);
    return () => provider.awareness.off("change", update);
  }, [provider]);
  return states;
}
