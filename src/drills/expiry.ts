import { retentionCutoff } from "../../shared/drill.js";
import type { RoomManager } from "../realtime/rooms.js";
import type { DrillStore } from "./store.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Delete drills nobody has visited within the retention window (shared/drill.ts). */
export async function expireDrills(
  store: DrillStore,
  rooms: RoomManager,
  now = new Date(),
): Promise<string[]> {
  const deleted: string[] = [];
  for (const id of await store.listStale(retentionCutoff(now))) {
    // Someone has it open right now, so it isn't stale; their next save refreshes it.
    if (rooms.isOpen(id)) continue;
    await store.delete(id);
    deleted.push(id);
  }
  return deleted;
}

/** Run expiry shortly after startup and then daily. Returns a stop function. */
export function scheduleExpiry(
  store: DrillStore,
  rooms: RoomManager,
  { firstRunMs = 60_000, intervalMs = DAY_MS } = {},
): () => void {
  const run = async () => {
    try {
      const deleted = await expireDrills(store, rooms);
      if (deleted.length)
        console.log(`expiry: deleted ${deleted.length} drill(s)`);
    } catch (err) {
      console.error("expiry failed", err);
    }
  };
  const first = setTimeout(run, firstRunMs);
  const every = setInterval(run, intervalMs);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
