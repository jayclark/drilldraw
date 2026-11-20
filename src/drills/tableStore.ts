import {
  TableClient,
  type TableEntity,
  type TableEntityResult,
} from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";
import type { Sport } from "../../shared/drill.js";
import {
  MAX_VERSIONS,
  newVersionId,
  type DrillMeta,
  type DrillStore,
  type VersionMeta,
} from "./store.js";

// Azure Table limits: 64 KiB per binary property, 1 MiB per entity.
const CHUNK_BYTES = 60 * 1024;
const MAX_CHUNKS = 15;
const DRILL_ROW = "drill";

type Chunked = Record<string, unknown>;

function toChunks(state: Uint8Array): Chunked {
  const count = Math.ceil(state.length / CHUNK_BYTES);
  if (count > MAX_CHUNKS)
    throw new Error(`drill state too large (${state.length} bytes)`);
  const props: Chunked = { chunkCount: count };
  for (let i = 0; i < count; i++) {
    props[`c${i}`] = state.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
  }
  return props;
}

function fromChunks(entity: Chunked): Uint8Array {
  const count = Number(entity.chunkCount ?? 0);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < count; i++) parts.push(entity[`c${i}`] as Uint8Array);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const META_FIELDS = ["sport", "createdAt", "updatedAt", "lastVisitedAt"];

function toMeta(id: string, e: Chunked): DrillMeta {
  const updatedAt = String(e.updatedAt);
  return {
    id,
    sport: e.sport as Sport,
    createdAt: String(e.createdAt),
    updatedAt,
    // Drills saved before lastVisitedAt existed fall back to their last edit.
    lastVisitedAt: String(e.lastVisitedAt ?? updatedAt),
  };
}

function isNotFound(err: unknown) {
  return (err as { statusCode?: number }).statusCode === 404;
}

export interface TableStoreConfig {
  /** e.g. "UseDevelopmentStorage=true" for Azurite. */
  connectionString?: string;
  /** e.g. "https://<account>.table.core.windows.net" — uses managed identity. */
  tableUrl?: string;
}

export class TableDrillStore implements DrillStore {
  private constructor(
    private drills: TableClient,
    private versions: TableClient,
  ) {}

  static async connect(config: TableStoreConfig): Promise<TableDrillStore> {
    const make = (table: string) => {
      if (config.connectionString) {
        return TableClient.fromConnectionString(
          config.connectionString,
          table,
          { allowInsecureConnection: true },
        );
      }
      if (config.tableUrl) {
        return new TableClient(
          config.tableUrl,
          table,
          new DefaultAzureCredential(),
        );
      }
      throw new Error("TableDrillStore needs a connectionString or tableUrl");
    };
    const store = new TableDrillStore(make("Drills"), make("DrillVersions"));
    // createTable() is a no-op when the table already exists.
    await Promise.all([
      store.drills.createTable(),
      store.versions.createTable(),
    ]);
    return store;
  }

  async create(
    id: string,
    sport: Sport,
    state: Uint8Array,
  ): Promise<DrillMeta> {
    const now = new Date().toISOString();
    await this.drills.createEntity({
      partitionKey: id,
      rowKey: DRILL_ROW,
      sport,
      createdAt: now,
      updatedAt: now,
      lastVisitedAt: now,
      ...toChunks(state),
    });
    return { id, sport, createdAt: now, updatedAt: now, lastVisitedAt: now };
  }

  async getMeta(id: string): Promise<DrillMeta | null> {
    try {
      const e = await this.drills.getEntity<Chunked>(id, DRILL_ROW, {
        queryOptions: { select: META_FIELDS },
      });
      return toMeta(id, e);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async getState(id: string): Promise<Uint8Array | null> {
    try {
      return fromChunks(await this.drills.getEntity<Chunked>(id, DRILL_ROW));
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async saveState(id: string, state: Uint8Array): Promise<void> {
    // Replace (not merge) so stale chunk properties from a larger state are dropped.
    const existing = await this.getMeta(id);
    if (!existing) throw new Error(`drill ${id} not found`);
    const now = new Date().toISOString();
    const entity: TableEntity<Chunked> = {
      partitionKey: id,
      rowKey: DRILL_ROW,
      sport: existing.sport,
      createdAt: existing.createdAt,
      updatedAt: now,
      lastVisitedAt: now,
      ...toChunks(state),
    };
    await this.drills.upsertEntity(entity, "Replace");
  }

  async addVersion(id: string, state: Uint8Array): Promise<VersionMeta> {
    const meta = {
      versionId: newVersionId(),
      createdAt: new Date().toISOString(),
    };
    await this.versions.createEntity({
      partitionKey: id,
      rowKey: meta.versionId,
      createdAt: meta.createdAt,
      ...toChunks(state),
    });
    await this.prune(id);
    return meta;
  }

  private async prune(id: string) {
    const all = await this.listVersions(id, Infinity);
    for (const v of all.slice(MAX_VERSIONS)) {
      await this.versions.deleteEntity(id, v.versionId);
    }
  }

  async listVersions(id: string, limit = MAX_VERSIONS): Promise<VersionMeta[]> {
    const out: VersionMeta[] = [];
    const iter = this.versions.listEntities<TableEntityResult<Chunked>>({
      queryOptions: {
        filter: `PartitionKey eq '${id.replace(/'/g, "''")}'`,
        select: ["RowKey", "createdAt"],
      },
    });
    for await (const e of iter) {
      out.push({ versionId: e.rowKey!, createdAt: String(e.createdAt) });
      if (out.length >= limit) break;
    }
    return out;
  }

  async getVersion(id: string, versionId: string): Promise<Uint8Array | null> {
    try {
      return fromChunks(await this.versions.getEntity<Chunked>(id, versionId));
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async touch(id: string, at = new Date()): Promise<void> {
    try {
      await this.drills.updateEntity(
        {
          partitionKey: id,
          rowKey: DRILL_ROW,
          lastVisitedAt: at.toISOString(),
        },
        "Merge",
      );
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  async listStale(before: Date): Promise<string[]> {
    // A full scan of the drill rows (metadata columns only). Fine for a daily job at our
    // scale; add a secondary index table if the drill count reaches the millions.
    const out: string[] = [];
    const iter = this.drills.listEntities<TableEntityResult<Chunked>>({
      queryOptions: {
        filter: `RowKey eq '${DRILL_ROW}'`,
        select: ["PartitionKey", ...META_FIELDS],
      },
    });
    for await (const e of iter) {
      const meta = toMeta(e.partitionKey!, e);
      if (Date.parse(meta.lastVisitedAt) < before.getTime()) out.push(meta.id);
    }
    return out;
  }

  async delete(id: string): Promise<void> {
    // Versions first, so a failure part-way leaves the drill (and a retry) in place.
    for (const v of await this.listVersions(id, Infinity)) {
      await this.ignoreMissing(this.versions.deleteEntity(id, v.versionId));
    }
    await this.ignoreMissing(this.drills.deleteEntity(id, DRILL_ROW));
  }

  private async ignoreMissing(p: Promise<unknown>) {
    try {
      await p;
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
}
