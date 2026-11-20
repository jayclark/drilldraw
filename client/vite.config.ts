import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const server = process.env.DRILLDRAW_SERVER ?? "http://localhost:3000";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": server,
      "/health": server,
      "/ws": { target: server.replace(/^http/, "ws"), ws: true },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
