import { createServer } from "node:http";
import { createApp } from "./app.js";
import { scheduleExpiry } from "./drills/expiry.js";
import { MemoryDrillStore, type DrillStore } from "./drills/store.js";
import { TableDrillStore } from "./drills/tableStore.js";
import { RoomManager } from "./realtime/rooms.js";
import { attachRealtime } from "./realtime/wsServer.js";

async function createStore(): Promise<DrillStore> {
  const connectionString = process.env.DRILL_STORAGE_CONNECTION_STRING;
  const tableUrl = process.env.DRILL_STORAGE_TABLE_URL;
  if (connectionString || tableUrl) {
    console.log(`storage: Azure Tables (${tableUrl ?? "connection string"})`);
    return TableDrillStore.connect({ connectionString, tableUrl });
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DRILL_STORAGE_TABLE_URL or DRILL_STORAGE_CONNECTION_STRING must be set in production",
    );
  }
  console.warn("storage: in-memory (drills are lost on restart)");
  return new MemoryDrillStore();
}

// Azure App Service injects PORT; default for local dev.
const port = Number(process.env.PORT ?? 3000);

const store = await createStore();
const rooms = new RoomManager(store);
const server = createServer(createApp({ store, rooms }));
const closeRealtime = attachRealtime(server, rooms);
scheduleExpiry(store, rooms);

server.listen(port, () => {
  console.log(`drilldraw listening on http://localhost:${port}`);
});

// Save open drills before App Service stops or restarts the container.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, async () => {
    console.log(`${signal}: saving open drills`);
    await closeRealtime();
    server.close();
    process.exit(0);
  });
}
