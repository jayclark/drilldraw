import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

// Runs against the production build: run `npm run build` first.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "tablet",
      use: { ...devices["iPad Pro 11"], browserName: "chromium" },
    },
  ],
  webServer: {
    command: `node dist/server/src/server.js`,
    env: { PORT: String(PORT), NODE_ENV: "test" },
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
  },
});
