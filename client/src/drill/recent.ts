import { useSyncExternalStore } from "react";
import { retentionCutoff, type Sport } from "../../../shared/drill";

/** A drill this browser has opened. Kept in localStorage, never sent to the server. */
export interface RecentDrill {
  id: string;
  sport: Sport;
  name: string;
  visitedAt: string;
}

const KEY = "drilldraw.recentDrills";
const MAX_ENTRIES = 200;
const CHANGED = "drilldraw:recent-changed";

function read(): RecentDrill[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as RecentDrill[]) : [];
  } catch {
    return [];
  }
}

function write(list: RecentDrill[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    // Storage full or blocked (private mode): history is a convenience, so skip it.
  }
  cached = null;
  window.dispatchEvent(new Event(CHANGED));
}

/** Newest first, without drills the server will already have deleted. */
function load(): RecentDrill[] {
  const cutoff = retentionCutoff().getTime();
  return read()
    .filter((d) => Date.parse(d.visitedAt) >= cutoff)
    .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
}

export function recordVisit(drill: Omit<RecentDrill, "visitedAt">) {
  const rest = load().filter((d) => d.id !== drill.id);
  write([{ ...drill, visitedAt: new Date().toISOString() }, ...rest]);
}

/** Update the stored name without bumping the drill to the top. */
export function renameRecent(id: string, name: string) {
  const list = load();
  const entry = list.find((d) => d.id === id);
  if (!entry || entry.name === name) return;
  entry.name = name;
  write(list);
}

export function forgetRecent(id: string) {
  const list = load();
  if (list.some((d) => d.id === id)) write(list.filter((d) => d.id !== id));
}

let cached: RecentDrill[] | null = null;
function snapshot() {
  return (cached ??= load());
}
function subscribe(onChange: () => void) {
  const handler = (e: Event) => {
    if (e instanceof StorageEvent && e.key !== KEY) return;
    cached = null;
    onChange();
  };
  window.addEventListener(CHANGED, handler);
  // Other tabs.
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGED, handler);
    window.removeEventListener("storage", handler);
  };
}

export function useRecentDrills(): RecentDrill[] {
  return useSyncExternalStore(subscribe, snapshot);
}
