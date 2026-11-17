# API contract

Owned by the **architect**. Endpoints are added here before they are implemented.

| Method | Path | Auth | Milestone | Description |
|---|---|---|---|---|
| GET | `/health` | none | M0 | Liveness probe. Never touches the database. Returns `{ "status": "ok" }` |
| GET | `/api/peaks` | none | M1 | All 28 peaks ordered by KGP number. Output-cached for 1 h |
| GET | `/api/peaks/{slug}` | none | M1 | One peak, or `404` if the slug is unknown. Output-cached for 1 h |

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
