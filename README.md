# KGP Companion

Companion app for people collecting the **Korona Gór Polski** (Crown of Polish Mountains): a map of the 28 peaks, peak details with trails and parking, and a personal log of conquered peaks with photo, date and notes. Guests can try it in demo mode.

> The app is a personal log. Official verification of conquests is done by the Klub Zdobywców KGP: https://kgp.info.pl

## Quick start

```bash
# API: http://localhost:5xxx/health
cd src/backend && dotnet run --project Kgp.Api

# Web: http://localhost:4200
cd src/frontend && npm install && npx ng serve
```

## Deploy (Azure)
```bash
azd up   # creates rg-kgp-<env> with everything inside it
```

See [docs/architecture.md](docs/architecture.md) and [docs/milestones.md](docs/milestones.md).

Map data © OpenStreetMap contributors (ODbL).
