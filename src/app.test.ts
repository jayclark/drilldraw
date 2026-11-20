import { test } from "node:test";
import assert from "node:assert/strict";
import { DRILL_ID_PATTERN } from "../shared/drill.js";
import { createDrill, startTestServer } from "./testServer.js";

test("GET /health returns ok", async () => {
  const srv = await startTestServer();
  try {
    const res = await fetch(`${srv.http}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  } finally {
    await srv.close();
  }
});

test("POST /api/drills creates a drill with an unguessable id", async () => {
  const srv = await startTestServer();
  try {
    const res = await fetch(`${srv.http}/api/drills`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sport: "hockey" }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { id: string; url: string };
    assert.match(body.id, DRILL_ID_PATTERN);
    assert.equal(body.url, `/hockey/d/${body.id}`);

    const meta = await fetch(`${srv.http}/api/drills/${body.id}`);
    assert.equal(meta.status, 200);
    assert.equal(((await meta.json()) as { sport: string }).sport, "hockey");
  } finally {
    await srv.close();
  }
});

test("POST /api/drills rejects unsupported sports", async () => {
  const srv = await startTestServer();
  try {
    const res = await fetch(`${srv.http}/api/drills`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sport: "soccer" }),
    });
    assert.equal(res.status, 400);
  } finally {
    await srv.close();
  }
});

test("unknown or malformed drill ids return 404", async () => {
  const srv = await startTestServer();
  try {
    for (const id of ["AAAAAAAAAAAA", "short", "has'quote1234"]) {
      const res = await fetch(`${srv.http}/api/drills/${id}`);
      assert.equal(res.status, 404, id);
    }
    assert.equal((await fetch(`${srv.http}/api/nope`)).status, 404);
  } finally {
    await srv.close();
  }
});

test("drill creation is rate limited per client", async () => {
  const srv = await startTestServer({ createLimitPerHour: 2 });
  try {
    await createDrill(srv.http);
    await createDrill(srv.http);
    const res = await fetch(`${srv.http}/api/drills`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(res.status, 429);
  } finally {
    await srv.close();
  }
});
