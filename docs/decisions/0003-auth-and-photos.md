# 0003: Sign-in with Entra External ID; photos go through the API

**Status:** accepted (M2). Replaces the "browser uploads to Blob with a user-delegation SAS" idea from M0/M1.

## Context
M2 adds personal data: which peaks a user has conquered, when, notes, and a summit photo. Product decisions from the user (2026-11-17):
- **One conquest per peak.** A peak is conquered or not, as in KGP. Editing replaces the record.
- **Photo optional.** Only the date is required, so old climbs can be backfilled.
- **Email sign-in first** (email one-time code). Google is added later as an extra identity provider in the same tenant, without code changes.
- The **external tenant is created by the user in the Azure portal**. Infra stays resource-group scoped.

## Decision

### Identity
- **Microsoft Entra External ID** (external tenant, free up to 50k monthly active users), user flow "sign up and sign in" with email one-time passcode.
- Two app registrations in the external tenant: **`kgp-api`** exposes the scope `api://<api-client-id>/Conquests.ReadWrite`; **`kgp-spa`** is a SPA (auth code + PKCE) with redirect URIs `http://localhost:4200` and the Static Web App URL. No client secrets anywhere.
- **Frontend:** `@azure/msal-browser` used directly through a small signal-based `AuthService` and a functional HTTP interceptor that attaches the token only to calls to `apiBaseUrl/api/me/*`. We don't use `@azure/msal-angular`: it is zone- and module-oriented, and its peer ranges trail Angular majors.
- **API:** JWT bearer. Authority `https://<tenant-subdomain>.ciamlogin.com/<tenant-id>/v2.0`, audience = `kgp-api` client ID, required scope `Conquests.ReadWrite`. The user key is the **`oid`** claim (a GUID, stable per tenant).
- **Configuration, not code:** `Auth:Authority`, `Auth:Audience` in the API; `auth: { clientId, authority, apiScope }` in `runtime-config.json`. If they are empty, sign-in is off: the UI hides it and `/api/me/*` returns 401. That's the state until the tenant exists.

### Photos
- The browser uploads the photo **to the API** (`multipart/form-data`, ≤ 15 MB). The API validates, re-encodes and stores it. It never stores the original.
- Processing with **Magick.NET** (Apache 2.0; reads HEIC, which ImageSharp can't): detect the format from the bytes (JPEG/PNG/HEIC only, the declared content type isn't trusted), cap decoded dimensions at 12,000 px a side (decompression bombs), auto-orient, resize to at most 2048 px on the long edge, **strip all metadata** (EXIF incl. GPS, XMP, IPTC, comments), save as JPEG quality 85. The original capture time (`DateTimeOriginal`), if present, is kept in the database as `photoTakenAt`.
- Stored in the private `conquest-photos` container as `{userId}/{peakNumber}/{guid}.jpg`. A new upload replaces and deletes the previous blob.
- Photos are **read through the API** (`GET /api/me/conquests/{slug}/photo`, bearer token). The frontend fetches it as a blob and shows an object URL. No SAS, no storage CORS, no user-delegation keys. The ownership check lives in one place: the query filtered by `oid`.
- `IPhotoStore` has two implementations: Azure Blob (managed identity, `Storage:BlobEndpoint` set) and local file system (`Storage:LocalPath`, local dev and tests).

### Data
- `Conquest`: `Id` (GUID), `UserId` (GUID from `oid`), `PeakNumber` (FK → `Peak`), `ConqueredOn` (date), `Notes` (≤ 2000 chars, nullable), `PhotoBlobName` (nullable), `PhotoTakenAt` (nullable), `CreatedAt`, `UpdatedAt`. Unique index on `(UserId, PeakNumber)`.
- No user table: the user is whoever the token says. Display name and email come from the ID token in the browser and are not stored.

## Consequences
- **Simpler and safer** than SAS uploads: no unprocessed photo with GPS ever lands in storage, no storage CORS, nothing to clean up after abandoned uploads. Cost: photo bytes pass through the Container App (the API runs at 0.5 vCPU / 1 GiB so Magick.NET can decode a 15 MB photo; resized photos are ~300–600 kB).
- HEIC decoding adds Magick.NET's native library (~30 MB) to the image.
- The API endpoint shape is `PUT /api/me/conquests/{slug}` (upsert by peak) rather than `POST` + `PUT`, because there is one conquest per peak. Idempotent, and the URL names the peak.
- **Privacy:** deleting a conquest deletes its photo blob at once (soft-delete is off on the container). Account deletion ("delete all my data") is a follow-up, needed before inviting other users (GDPR art. 17).
- The tenant's app registrations are created by hand (steps in `docs/auth-setup.md`). They have no secrets, so nothing goes to Key Vault.
