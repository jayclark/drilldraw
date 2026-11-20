---
name: verify
description: Verify drilldraw changes end to end the way CI does — lint, typecheck, unit tests, build, Playwright e2e. Use before committing or pushing to main, or when asked to check that a change works.
---

Run from the repo root and stop at the first failure, showing its output:

1. `npm run lint && npm run format:check && npm run typecheck`
2. `npm test` (server node:test + client Vitest)
3. `npm run build`
4. `npm run test:e2e` (Playwright, desktop + iPad viewports, against the built app on port 4173). First run needs `npx playwright install chromium`.

For UI changes, also look at what you built: the "every drawing tool" e2e test saves `test-results/*/all-tools.png` — Read it. Report pass/fail per step; don't claim success for a step that didn't run.
