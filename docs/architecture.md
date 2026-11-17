# Architecture

The KGP Companion app is a personal tracker and guide for Korona Gór Polski. It **does not replace** official verification of conquests by the Klub Zdobywców KGP (Loża Zdobywców); see https://kgp.info.pl/regulamin-klubu/.

## Components

| Part | Tech | Azure resource |
|---|---|---|
| Web app | Angular (standalone, signals), Leaflet + OSM | Static Web Apps (Free) |
| API | .NET 10 Minimal API, EF Core | Container Apps (consumption, scale to zero) |
| Database | Azure SQL (spatial `geography`) | Azure SQL Database serverless, **free offer** (auto-pause) |
| Photos | Private blob container `conquest-photos`, written and read only by the API | Storage account (LRS, shared keys disabled, no CORS, no soft delete) |
| Secrets | Only for future third-party keys | Key Vault (RBAC) |
| Telemetry | OpenTelemetry → Application Insights | App Insights + Log Analytics |
| Images | API container image | Container Registry Basic |
| Identity | Users: Entra External ID (email one-time code); services: one user-assigned managed identity | External tenant in `rg-kgp-identity` (outside azd); managed identity |

All app resources live in one resource group, `rg-kgp-<env>`, defined in `infra/main.bicep` and deployed with `azd`. The one exception is the **Entra External ID tenant**: the user creates it by hand in its own resource group, `rg-kgp-identity` ([auth-setup.md](auth-setup.md)), so `azd down` can never delete it and its users. Bicep only receives its IDs.

```
Browser ──► Static Web App (Angular)
   │  ▲
   │  └── sign-in (MSAL, auth code + PKCE) ──► <sub>.ciamlogin.com (External ID tenant, rg-kgp-identity)
   │  Bearer token (scope Conquests.ReadWrite)
   └──────► Container App API ──(managed identity)──► Azure SQL / Blob / Key Vault
```

The browser never talks to Blob Storage: photos go up and come back through the API.

## Key flows
- **Peaks and map**: the 28 peaks are seeded from `data/peaks.json`. Parking and trails are imported offline from OSM into Azure SQL `geography` columns (M3) and served by the API as GeoJSON.
- **Sign-in** ([ADR 0003](decisions/0003-auth-and-photos.md)): the SPA signs in with MSAL against the External ID tenant (`https://<sub>.ciamlogin.com/<tenant-id>/v2.0`) and sends an access token for `api://<api-client-id>/Conquests.ReadWrite` only to `/api/me/*`. The API validates it with `Auth__Authority` / `Auth__Audience` and keys data by the `oid` claim. If the settings are empty (tenant not created yet), sign-in is off: the UI hides it and `/api/me/*` returns 401.
- **Conquest and photo**: one conquest per peak, `PUT /api/me/conquests/{slug}`. The photo (optional, ≤ 15 MB, JPEG/PNG/HEIC) is uploaded **to the API** as `multipart/form-data`. The API re-encodes it with Magick.NET (max 2048 px, all metadata stripped, JPEG), keeps only the capture time, and writes it to the private `conquest-photos` container with its managed identity. It is read back through `GET /api/me/conquests/{slug}/photo`. No SAS, no storage CORS. Deleting a conquest deletes the blob at once; blob soft delete is deliberately off.
- **Guest/demo**: the frontend keeps demo conquests in `localStorage`. Nothing is sent to the API.
- **Startup**: the API serves `/health` straight away. A background service applies EF Core migrations and upserts the peaks from `data/peaks.json` (bundled into the image). The database may take up to about a minute to resume, so EF uses retry-on-failure. The frontend shows a "waking up" message after 4 seconds.
- **Frontend config**: one build works for every environment. At deploy time, azd's `prepackage` hook (`infra/hooks/write-web-config.sh`) writes `public/runtime-config.json` with the API URL, and the app loads it before bootstrapping. When `KGP_AUTH_TENANT_ID`, `KGP_AUTH_TENANT_SUBDOMAIN`, `KGP_API_CLIENT_ID` and `KGP_SPA_CLIENT_ID` are all set in the azd env, it also writes `"auth": { "clientId", "authority", "apiScope" }`; otherwise the block is left out and sign-in is hidden. Locally the file is missing, so the app falls back to `http://localhost:5080`.

## Local development

```bash
cp .env.example .env                    # set KGP_SQL_PASSWORD (local only)
docker compose up -d                    # SQL Server 2022 (Developer edition, emulated on Apple Silicon)
dotnet user-secrets set "ConnectionStrings:Kgp" \
  "Server=localhost,1433;Database=kgp;User Id=sa;Password=<same password>;TrustServerCertificate=True" \
  --project src/backend/Kgp.Api
dotnet run --project src/backend/Kgp.Api   # http://localhost:5080, migrates + seeds on start
cd src/frontend && npx ng serve            # http://localhost:4200
```

Backend integration tests start their own SQL Server container through Testcontainers, so they need Docker running.

## API configuration (env vars set by Bicep)

| Setting | Meaning |
|---|---|
| `AZURE_CLIENT_ID` | Client ID of the API's managed identity (for `DefaultAzureCredential`) |
| `ConnectionStrings__Kgp` | SqlClient connection string with `Authentication=Active Directory Managed Identity`. No password |
| `Storage__BlobEndpoint` | Blob endpoint for photos |
| `KeyVault__Uri` | Key Vault URI |
| `Cors__AllowedOrigins__0` | Static Web App origin |
| `Auth__Authority` | `https://<sub>.ciamlogin.com/<tenant-id>/v2.0`, from azd env `KGP_AUTH_TENANT_SUBDOMAIN` + `KGP_AUTH_TENANT_ID`. Empty = sign-in off |
| `Auth__Audience` | `kgp-api` client ID, from azd env `KGP_API_CLIENT_ID`. Empty = sign-in off |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Telemetry |

## Estimated dev cost (Poland Central, list prices, approx. USD/month)

| Resource | Est. |
|---|---|
| Azure SQL serverless free offer (100k vCore-s, 32 GB/month; pauses at the limit) | 0 |
| Container Registry Basic | ~5 |
| Container Apps (0.5 vCPU / 1 GiB, scale to zero, within the free monthly grant) | ~0 |
| Entra External ID (free up to 50k monthly active users) | 0 |
| Static Web Apps Free | 0 |
| Storage, Key Vault, Log Analytics (low volume) | ~1–3 |
| **Total** | **~6–8** |

The container registry is now most of the bill. The free database pauses after 60 minutes idle, and the first request after that waits up to ~1 minute while it resumes. If the 100k vCore-seconds run out in a month (about 14 h at 2 vCores, or ~55 h at the 0.5 vCore minimum), the database stays paused until the 1st of the next month. You only pay if you switch it to `BillOverUsage`.

The API container has 0.5 vCPU / 1 GiB (raised from 0.25 / 0.5 GiB in M2 because Magick.NET needs the memory for photos up to 15 MB). That doubles the cost per active second, so the monthly free grant (180,000 vCPU-s and 360,000 GiB-s) now covers about **100 hours** of active replica time instead of ~200. A personal app that scales to zero uses far less, so it stays at ~0; beyond the grant it would be roughly $0.05 per active hour.

## CI deploy

`.github/workflows/deploy.yml` deploys `main` to the `dev` environment with GitHub OIDC. No secrets are stored.

| Piece | Value |
|---|---|
| Deploy identity | User-assigned managed identity `id-kgp-github-dev` in `rg-kgp-dev`. It's an Azure resource, not an Entra app registration, so it lives in the resource group and can never hold a client secret |
| Federated credential | issuer `https://token.actions.githubusercontent.com`, subject `repo:stompsu@12047598/kgp@1461006413:environment:dev`. GitHub's ID-based subject format: it pins the owner and repo IDs, so a renamed or re-created repo with the same name isn't trusted |
| Roles (scope `rg-kgp-dev` only) | **Contributor**; **Role Based Access Control Administrator**, with a condition that only allows granting or removing AcrPull, Storage Blob Data Contributor and Key Vault Secrets User |
| Repository variables | `AZURE_CLIENT_ID` (the identity's client ID), `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_ENV_NAME=dev`, `AZURE_LOCATION=polandcentral`, `AZURE_RESOURCE_GROUP=rg-kgp-dev` |
| Optional sign-in variables | `KGP_AUTH_TENANT_ID`, `KGP_AUTH_TENANT_SUBDOMAIN`, `KGP_API_CLIENT_ID`, `KGP_SPA_CLIENT_ID` ([auth-setup.md](auth-setup.md)). IDs, not secrets. Note `AZURE_TENANT_ID` stays the Azure (workforce) tenant; the External ID tenant is a different one |

The Bicep deploys at **resource-group scope** into an existing `rg-kgp-<env>`, so CI needs no subscription-wide rights. Creating a new environment means creating its resource group first, outside CI.

Each run:
1. Copies the running API image into the fresh azd environment (`SERVICE_API_IMAGE_NAME`), so `azd provision` doesn't roll the Container App back to the placeholder, and copies the non-empty `KGP_*` sign-in variables into it with `azd env set` (read by Bicep and by the web prepackage hook).
2. Runs `azd provision`, then `azd deploy`. The web app's upload tool is x86-only and runs fine on GitHub's Linux runners.
