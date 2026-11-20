import type { Sport } from "../../shared/drill.js";

export interface DrillMeta {
  id: string;
  sport: Sport;
  createdAt: string;
  updatedAt: string;
  /** Last time anyone opened or edited the drill; drives expiry. */
  lastVisitedAt: string;
}

export interface VersionMeta {
  versionId: string;
  createdAt: string;
}

export const MAX_VERSIONS = 50;

/** Persistence for drills. `state` is an encoded Yjs update (Y.encodeStateAsUpdate). */
export interface DrillStore {
  create(id: string, sport: Sport, state: Uint8Array): Promise<DrillMeta>;
  getMeta(id: string): Promise<DrillMeta | null>;
  getState(id: string): Promise<Uint8Array | null>;
  saveState(id: string, state: Uint8Array): Promise<void>;
  addVersion(id: string, state: Uint8Array): Promise<VersionMeta>;
  listVersions(id: string): Promise<VersionMeta[]>;
  getVersion(id: string, versionId: string): Promise<Uint8Array | null>;
  /** Record a visit (saveState also counts as one). */
  touch(id: string, at?: Date): Promise<void>;
  /** Ids of drills last visited before `before`. */
  listStale(before: Date): Promise<string[]>;
  /** Delete a drill and all its versions. Missing drills are ignored. */
  delete(id: string): Promise<void>;
}

/**
 * Version ids sort newest-first lexically (Azure Tables lists rows in ascending RowKey order).
 * A per-process counter breaks ties for versions created within the same millisecond.
 */
let versionSeq = 0;
export function newVersionId(now = Date.now()): string {
  const inverted = String(9_999_999_999_999 - now).padStart(13, "0");
  versionSeq = (versionSeq + 1) % 1000;
  return `${inverted}-${String(999 - versionSeq).padStart(3, "0")}`;
}

export class MemoryDrillStore implements DrillStore {
  private drills = new Map<string, { meta: DrillMeta; state: Uint8Array }>();
  private versions = new Map<
    string,
    { meta: VersionMeta; state: Uint8Array }[]
  >();

  async create(
    id: string,
    sport: Sport,
    state: Uint8Array,
  ): Promise<DrillMeta> {
    if (this.drills.has(id)) throw new Error(`drill ${id} already exists`);
    const now = new Date().toISOString();
    const meta = {
      id,
      sport,
      createdAt: now,
      updatedAt: now,
      lastVisitedAt: now,
    };
    this.drills.set(id, { meta, state });
    return meta;
  }

  async getMeta(id: string) {
    return this.drills.get(id)?.meta ?? null;
  }

  async getState(id: string) {
    return this.drills.get(id)?.state ?? null;
  }

  async saveState(id: string, state: Uint8Array) {
    const drill = this.drills.get(id);
    if (!drill) throw new Error(`drill ${id} not found`);
    drill.state = state;
    const now = new Date().toISOString();
    drill.meta = { ...drill.meta, updatedAt: now, lastVisitedAt: now };
  }

  async addVersion(id: string, state: Uint8Array) {
    const meta = {
      versionId: newVersionId(),
      createdAt: new Date().toISOString(),
    };
    const list = this.versions.get(id) ?? [];
    list.unshift({ meta, state });
    list.length = Math.min(list.length, MAX_VERSIONS);
    this.versions.set(id, list);
    return meta;
  }

  async listVersions(id: string) {
    return (this.versions.get(id) ?? []).map((v) => v.meta);
  }

  async getVersion(id: string, versionId: string) {
    return (
      this.versions.get(id)?.find((v) => v.meta.versionId === versionId)
        ?.state ?? null
    );
  }

  async touch(id: string, at = new Date()) {
    const drill = this.drills.get(id);
    if (drill) drill.meta = { ...drill.meta, lastVisitedAt: at.toISOString() };
  }

  async listStale(before: Date) {
    return [...this.drills.values()]
      .filter((d) => Date.parse(d.meta.lastVisitedAt) < before.getTime())
      .map((d) => d.meta.id);
  }

  async delete(id: string) {
    this.drills.delete(id);
    this.versions.delete(id);
  }
}
