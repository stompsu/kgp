# Milestones

Each milestone is closed by **qa-reviewer** once every acceptance criterion has a passing test or a documented manual check.

## M0 Bootstrap ✅
**Owner:** architect, azure-infra
- Repo structure, `/health` API, Angular shell with an empty Leaflet map, Bicep for the full resource group, CI, subagents, docs.
- Acceptance: `dotnet test`, `ng build`, `ng test` and `az bicep build` all pass; initial commit on `main`.

## M1 Walking skeleton ✅ (2026-11-17)

> Live: web https://happy-dune-066863c03.8.azurestaticapps.net · API https://ca-kgp-api-2avduqnk3ybey.jollymushroom-4f5e347b.polandcentral.azurecontainerapps.io/api/peaks
> Deployed from GitHub Actions (`stompsu/kgp`, managed identity `id-kgp-github-dev`, OIDC).

**Owners:** geo-data-curator → backend-dotnet → frontend-angular → azure-infra
- geo-data-curator fills verified coordinates for all 28 peaks in `data/peaks.json`, with sources.
- EF Core + Azure SQL (`geography`) model, seeder, `GET /api/peaks`, `GET /api/peaks/{slug}` (anonymous).
- Map shows 28 markers; clicking one opens a details panel with name, range, height, coordinates and description. Add Angular Material and i18n (pl/en).
- First deploy to Azure with `azd provision` + `azd deploy` (with user approval). Set up OIDC for GitHub Actions.
- Acceptance: a guest opens the deployed URL and sees all 28 peaks with correct positions and details.

## M2 Auth & conquests ✅ (2026-11-17)
Decisions in [ADR 0003](decisions/0003-auth-and-photos.md); tenant setup in [auth-setup.md](auth-setup.md). Verified locally and on the live site with a real External ID account (sign-in, conquest, photo upload).
Changed from the original plan: one conquest per peak (`PUT /api/me/conquests/{slug}`), photos go through the API instead of SAS uploads, email one-time code only (Google later, no code change). Follow-ups: "delete all my data" before inviting other users, Google sign-in.
**Owners:** architect (contract + ADR on auth/photos) → backend-dotnet, frontend-angular
- Entra External ID sign-up/sign-in (email + Google). MSAL in the frontend, JWT bearer in the API.
- `POST/PUT/DELETE /api/me/conquests`, upload SAS endpoint, photo validation, resize and EXIF GPS stripping.
- Conquest form: date (required, not in the future), notes, photo (jpg/png/heic, ≤15 MB).
- Progress: visited markers look different (not by colour alone), list view, "12 / 28" counter.
- Acceptance: a user can only see and change their own conquests and photos (IDOR test); an upload over 15 MB or with the wrong type is rejected.

## M3 Trails & parking
**Owners:** geo-data-curator → backend-dotnet → frontend-angular
- Offline Overpass import of `amenity=parking` and `route=hiking` near each summit into `data/osm/` and Azure SQL.
- `GET /api/peaks/{slug}/parking`, `/trails` (GeoJSON). Map layers with a toggle, plus the Waymarked Trails overlay.
- Acceptance: each peak shows at least one trail, or a note saying none was found; OSM/ODbL attribution is visible.

## M4 Guest demo mode
**Owner:** frontend-angular
- Demo conquests in `localStorage`, no uploads, a persistent "sign in to save your progress" banner.
- A "load sample profile" button with several peaks conquered. Optionally, demo data moves to the account after sign-in.
- Acceptance: a guest can go through the whole conquest flow, and the network shows no calls to conquest or upload endpoints.

## M5 Polish
**Owners:** frontend-angular, backend-dotnet, qa-reviewer
- PWA: installable, offline cached tiles for visited/planned areas.
- Accessibility audit (WCAG 2.2 AA) and performance budget.
- Export progress as CSV/PDF. GDPR account deletion.
