# Architecture

The KGP Companion app is a personal tracker and guide for Korona Gór Polski. It **does not replace** official verification of conquests by the Klub Zdobywców KGP (Loża Zdobywców); see https://kgp.info.pl/regulamin-klubu/.

## Components

| Part | Tech | Azure resource |
|---|---|---|
| Web app | Angular (standalone, signals), Leaflet + OSM | Static Web Apps (Free) |
| API | .NET 10 Minimal API, EF Core | Container Apps (consumption, scale to zero) |
| Database | Azure SQL (spatial `geography`) | Azure SQL Database serverless, **free offer** (auto-pause) |
| Photos | Private blob container `conquest-photos` | Storage account (LRS, shared keys disabled) |
| Secrets | Only for future third-party keys | Key Vault (RBAC) |
| Telemetry | OpenTelemetry → Application Insights | App Insights + Log Analytics |
| Images | API container image | Container Registry Basic |
| Identity | Users: Entra External ID; services: one user-assigned managed identity | Managed identity |

All resources live in one resource group, `rg-kgp-<env>`, defined in `infra/main.bicep` and deployed with `azd`.

```
Browser ──► Static Web App (Angular)
   │  JWT (Entra External ID)
   ├──────► Container App API ──(managed identity)──► Azure SQL / Blob / Key Vault
   └──PUT (short-lived user-delegation SAS)──► Blob Storage (photo upload)
```

## Key flows
- **Peaks and map**: the 28 peaks are seeded from `data/peaks.json`. Parking and trails are imported offline from OSM into Azure SQL `geography` columns (M3) and served by the API as GeoJSON.
- **Conquest**: the user requests an upload SAS from the API, the browser uploads the photo directly to Blob, then posts the conquest (date, notes, blob name). The API validates the blob, resizes it, strips EXIF GPS from the served copy and keeps the capture date.
- **Guest/demo**: the frontend keeps demo conquests in `localStorage`. Nothing is sent to the API.

## API configuration (env vars set by Bicep)

| Setting | Meaning |
|---|---|
| `AZURE_CLIENT_ID` | Client ID of the API's managed identity (for `DefaultAzureCredential`) |
| `ConnectionStrings__Kgp` | SqlClient connection string with `Authentication=Active Directory Managed Identity`. No password |
| `Storage__BlobEndpoint` | Blob endpoint for photos |
| `KeyVault__Uri` | Key Vault URI |
| `Cors__AllowedOrigins__0` | Static Web App origin |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Telemetry |

## Estimated dev cost (Poland Central, list prices, approx. USD/month)

| Resource | Est. |
|---|---|
| Azure SQL serverless free offer (100k vCore-s, 32 GB/month; pauses at the limit) | 0 |
| Container Registry Basic | ~5 |
| Container Apps (scale to zero, within the free monthly grant) | ~0 |
| Static Web Apps Free | 0 |
| Storage, Key Vault, Log Analytics (low volume) | ~1–3 |
| **Total** | **~6–8** |

The container registry is now most of the bill. The free database pauses after 60 minutes idle, and the first request after that waits up to ~1 minute while it resumes. If the 100k vCore-seconds run out in a month (about 14 h at 2 vCores, or ~55 h at the 0.5 vCore minimum), the database stays paused until the 1st of the next month. You only pay if you switch it to `BillOverUsage`.
