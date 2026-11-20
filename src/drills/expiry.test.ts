import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomManager } from "../realtime/rooms.js";
import { createDrill, startTestServer } from "../testServer.js";
import { expireDrills } from "./expiry.js";
import { MemoryDrillStore } from "./store.js";

const MONTH_MS = 31 * 24 * 60 * 60 * 1000;

test("drills not visited in 9 months are deleted with their versions", async () => {
  const store = new MemoryDrillStore();
  const rooms = new RoomManager(store);
  const state = new Uint8Array([0, 0]);
  const now = new Date("2027-12-01T00:00:00Z");
  await store.create("stale0000000", "hockey", state);
  await store.create("recent000000", "hockey", state);
  await store.addVersion("stale0000000", state);
  await store.touch("stale0000000", new Date(now.getTime() - 10 * MONTH_MS));
  await store.touch("recent000000", new Date(now.getTime() - 8 * MONTH_MS));

  assert.deepEqual(await expireDrills(store, rooms, now), ["stale0000000"]);
  assert.equal(await store.getMeta("stale0000000"), null);
  assert.deepEqual(await store.listVersions("stale0000000"), []);
  assert.ok(await store.getMeta("recent000000"));
});

test("open drills are never expired", async () => {
  const store = new MemoryDrillStore();
  const rooms = new RoomManager(store);
  await store.create("open00000000", "hockey", new Uint8Array([0, 0]));
  await store.touch("open00000000", new Date("2000-01-01"));
  const room = await rooms.get("open00000000");
  assert.ok(room);
  assert.deepEqual(await expireDrills(store, rooms), []);
  assert.ok(await store.getMeta("open00000000"));
  await rooms.closeAll();
});

test("opening a drill records a visit", async () => {
  const srv = await startTestServer();
  try {
    const id = await createDrill(srv.http);
    const old = new Date("2026-01-01T00:00:00Z");
    await srv.store.touch(id, old);
    const res = await fetch(`${srv.http}/api/drills/${id}`);
    const meta = (await res.json()) as { lastVisitedAt: string };
    assert.ok(Date.parse(meta.lastVisitedAt) > old.getTime());
    assert.equal(
      (await srv.store.getMeta(id))?.lastVisitedAt,
      meta.lastVisitedAt,
    );
    assert.deepEqual(await expireDrills(srv.store, srv.rooms), []);
  } finally {
    await srv.close();
  }
});
