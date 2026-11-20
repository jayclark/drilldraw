import { test } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { drillParts, type DrillElement } from "../../shared/drill.js";
import { createDrill, startTestServer, waitFor } from "../testServer.js";

function connect(wsUrl: string, id: string) {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(wsUrl, id, doc, {
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    disableBc: true,
  });
  const synced = new Promise<void>((resolve) =>
    provider.once("sync", () => resolve()),
  );
  return {
    doc,
    provider,
    synced,
    parts: drillParts(doc),
    close() {
      provider.destroy();
      provider.awareness.destroy();
      doc.destroy();
    },
  };
}

const skate: DrillElement = {
  id: "e1",
  z: 1,
  type: "skate",
  points: [
    [0, 0],
    [10, 5],
  ],
  arrow: true,
};

test("two clients on the same drill converge", async () => {
  const srv = await startTestServer();
  const id = await createDrill(srv.http);
  const a = connect(srv.ws, id);
  const b = connect(srv.ws, id);
  try {
    await Promise.all([a.synced, b.synced]);
    assert.equal(a.parts.meta.get("sport"), "hockey");

    a.parts.name.insert(0, "2-on-1 rush");
    a.parts.elements.set(skate.id, skate);
    await waitFor(() => b.parts.elements.has("e1"));
    assert.equal(b.parts.name.toString(), "2-on-1 rush");

    // Presence: a sees b's awareness state.
    b.provider.awareness.setLocalStateField("user", { name: "Coach B" });
    await waitFor(() =>
      [...a.provider.awareness.getStates().values()].some(
        (s) => s.user?.name === "Coach B",
      ),
    );
  } finally {
    a.close();
    b.close();
    await srv.close();
  }
});

test("edits persist after every client leaves and the room unloads", async () => {
  const srv = await startTestServer();
  const id = await createDrill(srv.http);
  const a = connect(srv.ws, id);
  await a.synced;
  a.parts.elements.set(skate.id, skate);
  a.parts.name.insert(0, "Saved drill");
  await waitFor(async () => {
    const state = await srv.store.getState(id);
    if (!state) return false;
    const d = new Y.Doc();
    Y.applyUpdate(d, state);
    return drillParts(d).name.toString() === "Saved drill";
  });
  a.close();

  // A fresh client (new room load from the store) sees the saved content.
  await new Promise((r) => setTimeout(r, 100));
  const b = connect(srv.ws, id);
  try {
    await b.synced;
    assert.equal(b.parts.name.toString(), "Saved drill");
    assert.ok(b.parts.elements.has("e1"));
  } finally {
    b.close();
    await srv.close();
  }
});

test("websocket to an unknown drill is refused", async () => {
  const srv = await startTestServer();
  try {
    const ws = new WebSocket(`${srv.ws}/AAAAAAAAAAAA`);
    const status = await new Promise<number>((resolve) => {
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.on("open", () => resolve(101));
    });
    assert.equal(status, 404);
  } finally {
    await srv.close();
  }
});

test("restoring a version propagates to connected clients", async () => {
  const srv = await startTestServer();
  const id = await createDrill(srv.http);
  const a = connect(srv.ws, id);
  try {
    await a.synced;
    a.parts.name.insert(0, "Version one");
    a.parts.elements.set(skate.id, skate);
    // versionIntervalMs is 0 in tests, so each save snapshots a version.
    await waitFor(async () => (await srv.store.listVersions(id)).length > 0);
    const [v1] = await srv.store.listVersions(id);

    a.parts.name.delete(0, a.parts.name.length);
    a.parts.name.insert(0, "Broken");
    a.parts.elements.delete("e1");
    await waitFor(async () => (await srv.store.listVersions(id)).length > 1);

    const res = await fetch(
      `${srv.http}/api/drills/${id}/versions/${v1!.versionId}/restore`,
      { method: "POST" },
    );
    assert.equal(res.status, 200);
    await waitFor(() => a.parts.name.toString() === "Version one");
    assert.ok(a.parts.elements.has("e1"));

    const list = await fetch(`${srv.http}/api/drills/${id}/versions`);
    const { versions } = (await list.json()) as { versions: unknown[] };
    assert.ok(versions.length >= 3, "restore snapshots the pre-restore state");
  } finally {
    a.close();
    await srv.close();
  }
});
