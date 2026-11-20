# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

drilldraw is an open web app for drawing and sharing sports drills (Ice Hockey now; Soccer and Football are "coming soon"). Creating a drill gives it an unguessable URL (`/hockey/d/<12-char id>`). Anyone with that URL can view and edit it, live, with no accounts.

## Layout

- `src/` is the Node server: Express (`app.ts`), the drill API (`drills/routes.ts`), storage (`drills/store.ts` in memory, `drills/tableStore.ts` for Azure Tables), and realtime (`realtime/rooms.ts`, `realtime/wsServer.ts`).
- `client/` is the React + Vite SPA with an SVG editor. It builds to `dist/client`, which Express serves with an SPA fallback.
- `shared/drill.ts` holds the drill model and Y.Doc layout, shared by both sides.
- `e2e/` holds the Playwright tests.

## Commands

- `npm run dev`: Vite on :5173 (proxies `/api` and `/ws`) plus the server on :3000. Drills are stored in memory unless storage env vars are set.
- `npm test` runs server node:test, then client Vitest. Run a single server file with `node --test --import tsx src/realtime/realtime.test.ts`.
- `npm run test:e2e` runs Playwright against the **built** app (`npm run build` first).
- The `/verify` skill runs the full CI sequence.
- Prettier formats each file automatically after edits. TypeScript is pinned to `~6.0` because typescript-eslint doesn't support TS 7 yet.
- Local Azure Tables: `npx azurite-table`, then `DRILL_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true npm run dev`.

## Conventions

- Server ESM uses `NodeNext`, so relative imports in `src/` and `shared/` need `.js` extensions. The client uses bundler resolution and takes no extensions.
- All drill content lives in one **Y.Doc** (Yjs CRDT) per drill, synced by our own y-websocket–compatible server. The layout is defined in `shared/drill.ts`; it is persisted, so changing it requires a `schemaVersion` bump and a migration.
- Elements are plain JSON values in the `elements` Y.Map, replaced wholesale on change. Coordinates are **rink feet** (200×85, origin at center ice); rink views are viewBox crops/rotations, so never store screen coordinates.
- Drawing edits use `LOCAL_ORIGIN` and each one is its own undo step. Label typing uses `LABEL_ORIGIN` and groups keystrokes. Text fields use `Y.Text` through `useYText`.
- Drills expire after `DRILL_RETENTION_MONTHS` (9) without a visit. `GET /api/drills/:id` (fetched on every editor open, throttled to one write per 6 h) and every save update `lastVisitedAt`. `src/drills/expiry.ts` deletes stale drills daily and skips drills that are open.
- The header's **History** lists drills opened in this browser. It lives in localStorage (`client/src/drill/recent.ts`), never on the server. **Drill Versions** is the per-drill version and restore panel.
- Drawers opened from the header must portal to `document.body`. The sticky header's `backdrop-filter` makes it the containing block for `position: fixed`.
- SVG rendering uses presentation attributes, not CSS classes, so PNG/PDF export matches the screen. UI-only layers (selection, cursors, drafts) carry `data-export="skip"`.

## Deploy / Azure

- Every push to `main` runs CI (lint, typecheck, tests, build, e2e) and deploys to https://drilldraw.azurewebsites.net through `.github/workflows/azure-webapp.yml`. Work is committed directly to main.
- Resource details and setup steps are in the `/azure-setup` skill. The App Service plan is **shared with other apps**; never change or scale it.
- Realtime rooms live in process memory, so the app must run on **one instance**. Scaling out means moving sync to Azure Web PubSub first.
- Storage access uses managed identity (`DRILL_STORAGE_TABLE_URL`). In production the server refuses to start without a storage setting.

## Gotchas

- The repo lives in iCloud Drive. If `node_modules`/`dist` behave oddly (for example, "file 2" duplicates), delete them and reinstall.
- A Yjs `Awareness` runs an interval timer until it's destroyed. Destroy provider, awareness and doc in tests, or node:test hangs.
- Pointer handlers read the in-progress stroke from a ref (`draftRef`), not React state, because events can arrive faster than renders.
