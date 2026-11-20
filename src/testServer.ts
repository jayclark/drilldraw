// Test helper: start the full app (HTTP + realtime) on an ephemeral port.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { MemoryDrillStore, type DrillStore } from "./drills/store.js";
import { RoomManager, type RoomOptions } from "./realtime/rooms.js";
import { attachRealtime } from "./realtime/wsServer.js";

export async function startTestServer(
  opts: {
    store?: DrillStore;
    rooms?: RoomOptions;
    createLimitPerHour?: number;
  } = {},
) {
  const store = opts.store ?? new MemoryDrillStore();
  const rooms = new RoomManager(store, {
    saveDebounceMs: 20,
    versionIntervalMs: 0,
    ...opts.rooms,
  });
  const server = createServer(
    createApp({
      store,
      rooms,
      clientDir: "/nonexistent",
      routeOptions: { createLimitPerHour: opts.createLimitPerHour },
    }),
  );
  const closeRealtime = attachRealtime(server, rooms);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    store,
    rooms,
    http: `http://localhost:${port}`,
    ws: `ws://localhost:${port}/ws/drills`,
    async close() {
      await closeRealtime();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export async function createDrill(http: string): Promise<string> {
  const res = await fetch(`${http}/api/drills`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sport: "hockey" }),
  });
  if (res.status !== 201) throw new Error(`create failed: ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

/** Poll until `check` returns true (or time out). */
export async function waitFor(
  check: () => boolean | Promise<boolean>,
  ms = 3000,
) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("waitFor timed out");
}
