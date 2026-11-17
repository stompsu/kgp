# API contract

Owned by the **architect**. Endpoints are added here before they are implemented.

| Method | Path | Auth | Milestone | Description |
|---|---|---|---|---|
| GET | `/health` | none | M0 | Liveness probe. Never touches the database. Returns `{ "status": "ok" }` |
| GET | `/api/peaks` | none | M1 | All 28 peaks ordered by KGP number. Output-cached for 1 h |
| GET | `/api/peaks/{slug}` | none | M1 | One peak, or `404` if the slug is unknown. Output-cached for 1 h |
| GET | `/api/me/conquests` | bearer | M2 | The signed-in user's conquests, ordered by peak number |
| PUT | `/api/me/conquests/{slug}` | bearer | M2 | Create or update the conquest of a peak. `201` when created, `200` when updated, `404` for an unknown slug, `400` (validation problem) for bad input |
| DELETE | `/api/me/conquests/{slug}` | bearer | M2 | Delete the conquest and its photo. `204`, or `404` if there is none |
| PUT | `/api/me/conquests/{slug}/photo` | bearer | M2 | Upload or replace the photo (`multipart/form-data`, field `file`). `200` with the conquest, `404` if there is no conquest yet, `413` over 15 MB, `415` not JPEG/PNG/HEIC |
| GET | `/api/me/conquests/{slug}/photo` | bearer | M2 | The processed photo, `image/jpeg`, `Cache-Control: private, max-age=3600`. `404` if there is none |
| DELETE | `/api/me/conquests/{slug}/photo` | bearer | M2 | Remove the photo, keep the conquest. `204`, or `404` |

## `Peak`

```json
{
  "number": 3,
  "slug": "skopiec",
  "name": "Skopiec",
  "range": "Góry Kaczawskie",
  "heightMeters": 721,
  "latitude": 50.94393,
  "longitude": 15.88471,
  "notes": { "pl": "Nowsze pomiary wskazują…", "en": "Newer measurements put…" },
  "sources": ["https://kgp.info.pl/wykaz-szczytow/", "https://pl.wikipedia.org/wiki/…", "https://www.openstreetmap.org/node/4593556759"]
}
```

- `number`: official KGP number, 1–28, in ascending order of height.
- `heightMeters`: the height per kgp.info.pl. Other sources may differ by a few metres; the differences are described in `notes`.
- `latitude`, `longitude`: WGS84 coordinates of the OSM summit node. Can be `null` only if a peak isn't verified yet (all 28 are verified now).
- `notes`: `null` unless the choice of summit or its height is disputed.

Caching: the peak list only changes on deploy, so the API caches it in memory (output cache). Guests browsing peaks don't wake the serverless database.

## Auth (M2)

See [ADR 0003](decisions/0003-auth-and-photos.md). `/api/me/*` needs an Entra External ID access token with the scope `api://<api-client-id>/Conquests.ReadWrite`. The user is the token's `oid` claim. Every query is filtered by it: another user's conquest is indistinguishable from a missing one (`404`, never `403`).
Missing or invalid token → `401`. Sign-in not configured on the server → `401` as well. A valid token without the `Conquests.ReadWrite` scope → `403`.

## `Conquest`

```json
{
  "peakSlug": "rysy",
  "peakNumber": 28,
  "conqueredOn": "2025-08-14",
  "notes": "Od Morskiego Oka, mgła na szczycie.",
  "hasPhoto": true,
  "photoTakenAt": "2025-08-14T11:42:10",
  "updatedAt": "2025-08-15T19:03:22Z"
}
```

- `photoTakenAt`: the photo's original capture time from EXIF, local time without offset, or `null`.
- `updatedAt`: UTC. Changes on every edit and photo upload; the frontend uses it to bust the photo cache (`?v=<updatedAt>`).

## `ConquestRequest` (body of `PUT /api/me/conquests/{slug}`)

```json
{ "conqueredOn": "2025-08-14", "notes": "Od Morskiego Oka." }
```

- `conqueredOn`: required, ISO date, not after today in Europe/Warsaw, not before 1900-01-01.
- `notes`: optional, at most 2000 characters, trimmed; empty becomes `null`.
- Errors: `400` `application/problem+json` with `errors` keyed by field name (`conqueredOn`, `notes`).

## Photo upload rules
- At most 15 MB (15 × 1024 × 1024 bytes). Larger → `413`.
- The format is detected from the bytes: JPEG, PNG or HEIC/HEIF. Anything else, or a file that doesn't decode → `415`.
- A request that isn't `multipart/form-data` → `415`; no `file` field → `400` (validation problem keyed `file`).
- Stored as JPEG, at most 2048 px on the long edge, auto-oriented, **all metadata removed** (no GPS).

## Known limits (M2)
- Two simultaneous first `PUT`s for the same peak can hit the unique index and return `500`; retrying succeeds. Not worth a `409` for a single-user form.
- Photos are stripped of their ICC profile without converting to sRGB, so wide-gamut (Display P3) photos may look slightly duller.
