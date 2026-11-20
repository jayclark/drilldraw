---
name: azure-setup
description: Provision or repair the drilldraw Azure resources (web app, Table Storage, managed identity, GitHub OIDC deploy credentials). Use when the user wants to create, recreate, or audit the Azure setup.
disable-model-invocation: true
---

drilldraw production (created 2026-11-19). Check what already exists before creating anything; every step below is idempotent or should be skipped if present.

| Resource                                                                           | Value                                                                                        |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Subscription                                                                       | Visual Studio Enterprise Subscription (id: `az account show --query id`)                     |
| Resource group                                                                     | `rg-drilldraw` (Canada Central)                                                              |
| App Service plan (shared with tape2tape and other apps — don't modify or scale it) | `hockeyman_102_asp_1204` in RG `seattlestickandpuck`, Linux B1, 1 instance                   |
| Web app                                                                            | `drilldraw` → https://drilldraw.azurewebsites.net, runtime `NODE:24-lts`                     |
| Storage                                                                            | `drilldrawdata` (Standard_LRS, shared-key access disabled), tables `Drills`, `DrillVersions` |

Required web app configuration:

- Startup command `node dist/server/src/server.js`; health check path `/health`.
- **WebSockets enabled** and **Always On** (realtime editing; rooms live in process memory).
- HTTPS only, FTPS disabled, min TLS 1.2.
- App settings: `NODE_ENV=production`, `DRILL_STORAGE_TABLE_URL=https://drilldrawdata.table.core.windows.net`, `SCM_DO_BUILD_DURING_DEPLOYMENT=false`.
- System-assigned managed identity with **Storage Table Data Contributor** on the storage account. The app creates the tables on startup.
- Must stay on **one instance**: the realtime server is single-process. Scaling out requires moving sync to Azure Web PubSub first.

GitHub Actions deploy (**not set up**: deploys are manual for now; only do this if the user asks to automate deploys, then add a deploy job to `.github/workflows/ci.yml`). OIDC, no publish profile:

1. `az ad app create --display-name drilldraw-github` → appId; `az ad sp create --id <appId>`.
2. Federated credential on the app: issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`, subject `repo:jayclark/drilldraw:environment:production`.
3. `az role assignment create --assignee <appId> --role "Website Contributor" --scope <drilldraw web app resource id>` (scope to the web app only).
4. `gh secret set AZURE_CLIENT_ID|AZURE_TENANT_ID|AZURE_SUBSCRIPTION_ID -R jayclark/drilldraw`, and create the `production` environment in the repo.

Manual deploy (the current process): build, then package `dist`, production `node_modules` (`npm ci --omit=dev --ignore-scripts` in a clean copy) and `package.json` into a zip and run `az webapp deploy -g rg-drilldraw -n drilldraw --src-path release.zip --type zip`. Confirm with `curl https://drilldraw.azurewebsites.net/health`.

Confirm with the user before creating anything that costs money or creates identities, and never change the shared plan.
