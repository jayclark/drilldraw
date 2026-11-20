import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { customAlphabet } from "nanoid";
import * as Y from "yjs";
import {
  DRILL_ID_LENGTH,
  DRILL_ID_PATTERN,
  SPORTS,
  initDrillDoc,
  type Sport,
} from "../../shared/drill.js";
import type { DrillStore } from "./store.js";
import type { RoomManager } from "../realtime/rooms.js";

/** Record visits at most this often per drill, to keep GETs cheap. */
const TOUCH_INTERVAL_MS = 6 * 60 * 60 * 1000;

const newDrillId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  DRILL_ID_LENGTH,
);

export interface DrillRouteOptions {
  /** Max drills created per IP per hour. */
  createLimitPerHour?: number;
}

export function drillRoutes(
  store: DrillStore,
  rooms: RoomManager,
  opts: DrillRouteOptions = {},
) {
  const router = Router();

  const createLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: opts.createLimitPerHour ?? 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many drills created; try again later." },
  });
  const restoreLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  router.param("id", (_req, res, next, id: string) => {
    if (!DRILL_ID_PATTERN.test(id)) {
      res.status(404).json({ error: "Drill not found" });
      return;
    }
    next();
  });

  router.post("/drills", createLimiter, async (req, res) => {
    const sport = (req.body?.sport ?? "hockey") as Sport;
    if (!SPORTS.includes(sport)) {
      res.status(400).json({ error: `Unsupported sport: ${String(sport)}` });
      return;
    }
    const doc = new Y.Doc();
    initDrillDoc(doc, sport);
    const id = newDrillId();
    const meta = await store.create(id, sport, Y.encodeStateAsUpdate(doc));
    doc.destroy();
    res.status(201).json({ ...meta, url: `/${sport}/d/${id}` });
  });

  router.get("/drills/:id", async (req, res) => {
    const meta = await store.getMeta(req.params.id);
    if (!meta) {
      res.status(404).json({ error: "Drill not found" });
      return;
    }
    // The editor fetches this on every open, so it doubles as the visit record for expiry.
    if (Date.now() - Date.parse(meta.lastVisitedAt) > TOUCH_INTERVAL_MS) {
      const now = new Date();
      try {
        await store.touch(meta.id, now);
        meta.lastVisitedAt = now.toISOString();
      } catch (err) {
        console.error(`touch ${meta.id} failed`, err);
      }
    }
    res.json(meta);
  });

  router.get("/drills/:id/versions", async (req, res) => {
    const room = await rooms.get(req.params.id);
    if (!room) {
      res.status(404).json({ error: "Drill not found" });
      return;
    }
    // Include edits from the last few seconds that haven't been flushed yet.
    await room.flush();
    res.json({ versions: await store.listVersions(req.params.id) });
    void rooms.release(room);
  });

  router.post(
    "/drills/:id/versions/:versionId/restore",
    restoreLimiter,
    async (req, res) => {
      const { id, versionId } = req.params as Record<string, string>;
      const room = await rooms.get(id);
      if (!room) {
        res.status(404).json({ error: "Drill not found" });
        return;
      }
      try {
        const ok = await room.restore(versionId);
        if (!ok) {
          res.status(404).json({ error: "Version not found" });
          return;
        }
        res.json({ restored: versionId });
      } finally {
        void rooms.release(room);
      }
    },
  );

  return router;
}
