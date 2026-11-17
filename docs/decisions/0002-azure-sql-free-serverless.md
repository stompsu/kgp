# 0002: Azure SQL Database serverless (free offer) instead of PostgreSQL

**Status:** accepted (M0). Supersedes the database part of [0001](0001-tech-stack.md).

## Context
Azure Database for PostgreSQL Flexible Server has no serverless or consumption tier. The cheapest option, Burstable B1ms, costs about $16–19 a month whether or not anyone uses the app. Stopping it on a schedule doesn't suit a public app used at random times, and a stopped server starts again by itself after 7 days.

## Decision
Use **Azure SQL Database, General Purpose serverless, with the free offer**:
- `useFreeLimit: true`, `freeLimitExhaustionBehavior: AutoPause`, which never bills for compute.
- 2 vCores max, 0.5 min, auto-pause after 60 minutes idle, 32 GB max size, locally redundant backups.
- Entra-only authentication. The API's user-assigned managed identity is the Entra admin, set with its application (client) ID as the SID.
- Spatial data uses SQL `geography` (SRID 4326) through EF Core NetTopologySuite.

## Consequences
- The database costs $0 a month. The dev total drops to about $6–8, which is mostly the container registry.
- **Cold start:** the first request after the database pauses can take up to about a minute. The API uses retry and a 60-second connect timeout. The frontend should show a "waking up…" state instead of an error.
- **Monthly cap:** 100,000 vCore-seconds. If the app uses it all, the database pauses until the next month. To keep it running past the cap, switch to `BillOverUsage`; that's a deliberate, paid choice.
- **Fewer spatial functions than PostGIS:** there's no `ST_*` toolbox, but distance, intersection and buffering cover what we need (nearest parking, trails near a summit).
- Each subscription gets one free-offer slot per database, up to 10. Each azd environment (dev, prod…) uses one.
