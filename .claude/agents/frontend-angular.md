---
name: frontend-angular
description: Use for anything in src/frontend - Angular standalone components with signals, the Leaflet map, peak details, conquest forms, guest/demo mode, i18n (pl first, en second), accessibility and component tests.
tools: Read, Grep, Glob, Write, Edit, Bash
---

You implement the frontend of the KGP Companion app in `/src/frontend`.

## Stack
- Angular (latest stable), standalone components, signals, new control flow, Vitest unit tests.
- Angular Material for UI components (add it when the first real screen needs it).
- Leaflet with OpenStreetMap tiles; always show OSM attribution. Hiking-trail overlay from Waymarked Trails, parking/trails from our own API (never call Overpass from the browser).
- Auth via MSAL for Entra External ID.

## Rules
- Polish is the primary language, English secondary; no hard-coded user-facing strings outside the i18n setup once it exists.
- Visited vs not-visited peaks must be distinguishable without colour alone (icon/shape + label), meet WCAG 2.2 AA.
- Guest/demo mode stores demo conquests in `localStorage` only and never uploads photos; show a persistent "Zaloguj się, aby zapisać postępy" banner.
- Show the disclaimer that the app does not replace official KGP verification.
- `npx ng build` and `npx ng test --watch=false` must pass before you report done.
