import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import { copyDrillContent, MAX_STATE_BYTES } from "../../shared/drill.js";
import type { DrillStore } from "../drills/store.js";

export const SAVE_DEBOUNCE_MS = 2000;
export const VERSION_INTERVAL_MS = 5 * 60 * 1000;
const RESTORE_ORIGIN = "restore";

export interface RoomOptions {
  saveDebounceMs?: number;
  versionIntervalMs?: number;
}

/** One live drill: its Y.Doc, presence, and persistence bookkeeping. */
export class Room {
  readonly awareness: awarenessProtocol.Awareness;
  /** Connection objects (WebSockets) currently attached to this room. */
  readonly conns = new Set<unknown>();
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  /** Changes since the last version snapshot. */
  private unversioned = false;
  private lastVersionAt = 0;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    readonly id: string,
    readonly doc: Y.Doc,
    private store: DrillStore,
    private opts: Required<RoomOptions>,
  ) {
    this.awareness = new awarenessProtocol.Awareness(doc);
    // The server has no presence of its own.
    this.awareness.setLocalState(null);
    doc.on("update", () => {
      this.dirty = true;
      this.unversioned = true;
      this.scheduleSave();
    });
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, this.opts.saveDebounceMs);
  }

  /** Persist now (and snapshot a version if one is due). Serialised; safe to call repeatedly. */
  flush(forceVersion = false): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.saving = this.saving.then(async () => {
      try {
        if (!this.dirty && !(forceVersion && this.unversioned)) return;
        const state = Y.encodeStateAsUpdate(this.doc);
        if (state.length > MAX_STATE_BYTES) {
          console.warn(
            `drill ${this.id}: state ${state.length}B exceeds cap; not saved`,
          );
          return;
        }
        if (this.dirty) {
          this.dirty = false;
          await this.store.saveState(this.id, state);
        }
        const versionDue =
          Date.now() - this.lastVersionAt >= this.opts.versionIntervalMs;
        if (this.unversioned && (forceVersion || versionDue)) {
          this.unversioned = false;
          this.lastVersionAt = Date.now();
          await this.store.addVersion(this.id, state);
        }
      } catch (err) {
        this.dirty = true;
        console.error(`drill ${this.id}: save failed`, err);
      }
    });
    return this.saving;
  }

  /** Restore a saved version as a live edit. The current content is snapshotted first so it can be restored back. */
  async restore(versionId: string): Promise<boolean> {
    const snapshot = await this.store.getVersion(this.id, versionId);
    if (!snapshot) return false;
    await this.store.addVersion(this.id, Y.encodeStateAsUpdate(this.doc));
    const old = new Y.Doc();
    Y.applyUpdate(old, snapshot);
    copyDrillContent(old, this.doc, RESTORE_ORIGIN);
    old.destroy();
    await this.flush(true);
    return true;
  }

  destroy() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.awareness.destroy();
    this.doc.destroy();
  }
}

/** Loads drills on first use and unloads them (after saving) when the last client leaves. */
export class RoomManager {
  private rooms = new Map<string, Promise<Room | null>>();
  private opts: Required<RoomOptions>;

  constructor(
    private store: DrillStore,
    opts: RoomOptions = {},
  ) {
    this.opts = {
      saveDebounceMs: opts.saveDebounceMs ?? SAVE_DEBOUNCE_MS,
      versionIntervalMs: opts.versionIntervalMs ?? VERSION_INTERVAL_MS,
    };
  }

  /** Returns the live room, loading it from storage; null if the drill does not exist. */
  get(id: string): Promise<Room | null> {
    let room = this.rooms.get(id);
    if (!room) {
      room = this.load(id);
      this.rooms.set(id, room);
      // Don't cache misses or failures.
      room.then(
        (r) => {
          if (!r) this.rooms.delete(id);
        },
        () => this.rooms.delete(id),
      );
    }
    return room;
  }

  private async load(id: string): Promise<Room | null> {
    const state = await this.store.getState(id);
    if (!state) return null;
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    return new Room(id, doc, this.store, this.opts);
  }

  /** Whether the drill is loaded (someone has it open, or it is mid-request). */
  isOpen(id: string): boolean {
    return this.rooms.has(id);
  }

  /** Called when a connection leaves; unloads the room once it is empty. */
  async release(room: Room): Promise<void> {
    if (room.conns.size > 0) return;
    await room.flush(true);
    // Someone may have joined while we were saving.
    if (room.conns.size > 0) return;
    if ((await this.rooms.get(room.id)) === room) this.rooms.delete(room.id);
    room.destroy();
  }

  /** Save and unload every open room (used on shutdown). */
  async closeAll(): Promise<void> {
    const rooms = (await Promise.allSettled(this.rooms.values())).flatMap(
      (r) => (r.status === "fulfilled" && r.value ? [r.value] : []),
    );
    this.rooms.clear();
    await Promise.all(rooms.map((r) => r.flush(true)));
    for (const r of rooms) r.destroy();
  }
}
