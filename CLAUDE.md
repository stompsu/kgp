# KGP Companion

A personal tracker and guide for **Korona Gór Polski** (28 highest peaks of the Polish mountain ranges, https://kgp.info.pl).
It does **not** replace official verification by the KGP club. Keep that disclaimer visible in the UI.

## Layout
- `src/backend`: .NET 10 solution `Kgp.slnx` (Api, Domain, Infrastructure, Tests)
- `src/frontend`: Angular workspace (Leaflet map)
- `infra`: Bicep for one resource group `rg-kgp-<env>`, deployed via `azd` (`azure.yaml` at the root)
- `data`: `peaks.json` seed (official KGP list) and OSM import
- `docs`: architecture, milestones, ADRs, API contract
- `.claude/agents`: subagents. Route work to the owning agent:
  architect (docs/contracts), backend-dotnet, frontend-angular, azure-infra, geo-data-curator, qa-reviewer

## Commands
- Backend: `cd src/backend && dotnet test Kgp.slnx` · run: `dotnet run --project Kgp.Api`
- Frontend: `cd src/frontend && npx ng serve` · `npx ng build` · `npx ng test --watch=false`
- Infra: `az bicep build --file infra/main.bicep` · `az bicep lint --file infra/main.bicep`

## Rules
- Work milestone by milestone (`docs/milestones.md`). Don't start the next one until the user approves.
- Never run `azd up/provision/down` or change Azure resources without explicit user approval.
- Managed identity only. Don't commit secrets, and don't use storage keys or DB passwords.
- Pin Microsoft.AspNetCore.* packages to 10.0.x (NuGet's latest is 11.x, which targets .NET 11).
- Never invent peak coordinates or heights. Follow kgp.info.pl and cite sources in `data/peaks.json`.
- UI: Polish first, English second.
