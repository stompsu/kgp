# 0001: Tech stack and hosting

**Status:** accepted (M0)

## Context
Hobby-scale app for KGP participants. It needs a map with spatial data (peaks, trails, parking), user accounts, photo storage and a small Azure bill. Everything sits in one resource group.

## Decision
- .NET 10 Minimal API on Azure Container Apps (consumption, scale to zero).
- Angular (latest) on Static Web Apps Free.
- PostgreSQL Flexible + PostGIS rather than Azure SQL: better geo tooling (GeoJSON, NetTopologySuite) and a cheap Burstable tier.
- Microsoft Entra External ID for customer accounts.
- Managed identity for all service-to-service access; storage shared keys and Postgres passwords are disabled.
- Leaflet + OpenStreetMap; trails and parking are imported from OSM offline, not queried live.

## Consequences
- PostgreSQL is the main fixed cost (~$16–19/month).
- Container Apps cold start of a few seconds after idle. Acceptable for this app.
- Browser photo uploads need user-delegation SAS and Blob CORS (tighten allowed origins in M2).
