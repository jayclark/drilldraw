// Minimal y-websocket–compatible server (sync + awareness), mounted on the Express HTTP server.
// Clients connect with `new WebsocketProvider(origin + "/ws/drills", drillId, doc)`.
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { DRILL_ID_PATTERN } from "../../shared/drill.js";
import type { Room, RoomManager } from "./rooms.js";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;
const PING_INTERVAL_MS = 30_000;
const MAX_MESSAGE_BYTES = 1024 * 1024;
const PATH_PREFIX = "/ws/drills/";

function send(ws: WebSocket, msg: Uint8Array) {
  if (ws.readyState === WebSocket.OPEN) ws.send(msg);
}

function broadcast(room: Room, msg: Uint8Array) {
  for (const c of room.conns) send(c as WebSocket, msg);
}

/** Wire a room's doc/awareness to broadcast to its connections (once per room). */
const wired = new WeakSet<Room>();
function wireRoom(room: Room) {
  if (wired.has(room)) return;
  wired.add(room);
  room.doc.on("update", (update: Uint8Array) => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeUpdate(enc, update);
    broadcast(room, encoding.toUint8Array(enc));
  });
  room.awareness.on(
    "update",
    ({ added, updated, removed }: Record<string, number[]>, conn: unknown) => {
      const changed = [...added, ...updated, ...removed];
      // Track which awareness client ids each connection controls, so we can clear them on close.
      const ids = controlled.get(conn as WebSocket);
      if (ids) {
        for (const id of added) ids.add(id);
        for (const id of removed) ids.delete(id);
      }
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed),
      );
      broadcast(room, encoding.toUint8Array(enc));
    },
  );
}

const controlled = new WeakMap<WebSocket, Set<number>>();

function handleMessage(ws: WebSocket, room: Room, data: Uint8Array) {
  const decoder = decoding.createDecoder(data);
  const encoder = encoding.createEncoder();
  const type = decoding.readVarUint(decoder);
  switch (type) {
    case MESSAGE_SYNC: {
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
      // Only reply if the sync step produced content (step 1 → step 2).
      if (encoding.length(encoder) > 1)
        send(ws, encoding.toUint8Array(encoder));
      break;
    }
    case MESSAGE_AWARENESS:
      awarenessProtocol.applyAwarenessUpdate(
        room.awareness,
        decoding.readVarUint8Array(decoder),
        ws,
      );
      break;
    case MESSAGE_QUERY_AWARENESS:
      sendAwareness(ws, room);
      break;
    default:
      // Unknown message types are ignored.
      break;
  }
}

function sendAwareness(ws: WebSocket, room: Room) {
  const states = room.awareness.getStates();
  if (states.size === 0) return;
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    enc,
    awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()]),
  );
  send(ws, encoding.toUint8Array(enc));
}

function setupConnection(ws: WebSocket, room: Room, rooms: RoomManager) {
  wireRoom(room);
  room.conns.add(ws);
  controlled.set(ws, new Set());

  let alive = true;
  ws.on("pong", () => (alive = true));
  const ping = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, PING_INTERVAL_MS);

  ws.on("message", (data: Buffer) => {
    try {
      handleMessage(ws, room, new Uint8Array(data));
    } catch (err) {
      console.error(`drill ${room.id}: bad message`, err);
      ws.close(1003, "bad message");
    }
  });

  ws.on("close", () => {
    clearInterval(ping);
    room.conns.delete(ws);
    const ids = controlled.get(ws);
    if (ids?.size) {
      awarenessProtocol.removeAwarenessStates(room.awareness, [...ids], null);
    }
    void rooms.release(room);
  });

  // Start the sync handshake: send our state vector (step 1) and current presence.
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(enc, room.doc);
  send(ws, encoding.toUint8Array(enc));
  sendAwareness(ws, room);
}

function reject(socket: Duplex, status: number, text: string) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

/** Attach the realtime endpoint (`/ws/drills/:id`) to an HTTP server. Returns a shutdown function. */
export function attachRealtime(server: Server, rooms: RoomManager) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
  });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (!pathname.startsWith(PATH_PREFIX))
      return reject(socket, 404, "Not Found");
    const id = pathname.slice(PATH_PREFIX.length);
    if (!DRILL_ID_PATTERN.test(id)) return reject(socket, 404, "Not Found");

    rooms.get(id).then(
      (room) => {
        if (!room) return reject(socket, 404, "Not Found");
        wss.handleUpgrade(req, socket, head, (ws) =>
          setupConnection(ws, room, rooms),
        );
      },
      (err) => {
        console.error(`drill ${id}: load failed`, err);
        reject(socket, 500, "Internal Server Error");
      },
    );
  });

  return async function close() {
    for (const ws of wss.clients) ws.close(1001, "server shutting down");
    wss.close();
    await rooms.closeAll();
  };
}
