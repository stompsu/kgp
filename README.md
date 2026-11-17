# KGP Companion

Companion app for people collecting the **Korona Gór Polski** (Crown of Polish Mountains): a map of the 28 peaks, peak details with trails and parking, and a personal log of conquered peaks with photo, date and notes. Guests can try it in demo mode.

> The app is a personal log. Official verification of conquests is done by the Klub Zdobywców KGP: https://kgp.info.pl

## Quick start

Needs Docker, the .NET 10 SDK and Node. Full steps are in [docs/architecture.md](docs/architecture.md#local-development).

```bash
cp .env.example .env && docker compose up -d     # local SQL Server
dotnet tool restore
dotnet run --project src/backend/Kgp.Api          # http://localhost:5080/api/peaks
cd src/frontend && npm install && npx ng serve    # http://localhost:4200
```

## Deploy (Azure)
```bash
az group create -n rg-kgp-dev -l polandcentral   # once per environment
azd env set AZURE_RESOURCE_GROUP rg-kgp-dev
azd provision   # creates everything inside the resource group
azd deploy      # builds the API image and the web app
# Not `azd up`: it packages the web app in parallel with provisioning,
# before the API URL that the web build needs is known.
```

See [docs/architecture.md](docs/architecture.md) and [docs/milestones.md](docs/milestones.md).

Map data © OpenStreetMap contributors (ODbL).
