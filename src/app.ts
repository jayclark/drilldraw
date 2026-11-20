import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import fs from "node:fs";
import path from "node:path";
import { drillRoutes, type DrillRouteOptions } from "./drills/routes.js";
import type { DrillStore } from "./drills/store.js";
import type { RoomManager } from "./realtime/rooms.js";

export interface AppDeps {
  store: DrillStore;
  rooms: RoomManager;
  /** Built client (Vite output). Defaults to ./dist/client relative to the working directory. */
  clientDir?: string;
  routeOptions?: DrillRouteOptions;
}

export function createApp({ store, rooms, clientDir, routeOptions }: AppDeps) {
  const app = express();
  // App Service sits behind one proxy hop; needed for correct client IPs in rate limiting.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  // Health probe for Azure App Service (configured Health check path = /health)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", drillRoutes(store, rooms, routeOptions));
  app.use("/api", ((_req, res) => {
    res.status(404).json({ error: "Not found" });
  }) as RequestHandler);

  const dir = clientDir ?? path.resolve(process.cwd(), "dist/client");
  const indexHtml = path.join(dir, "index.html");
  app.use(
    express.static(dir, {
      index: false,
      setHeaders(res, file) {
        // Vite emits content-hashed filenames under /assets.
        if (file.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
  // SPA fallback: every other GET renders the client, which handles routing.
  app.use(((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/ws/")) return next();
    if (!fs.existsSync(indexHtml)) {
      res.status(404).send("Client not built. Run `npm run build`.");
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexHtml);
  }) as RequestHandler);

  app.use(((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }) as ErrorRequestHandler);

  return app;
}
