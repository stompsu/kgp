# Sign-in setup (Entra External ID)

One-off manual setup for [ADR 0003](decisions/0003-auth-and-photos.md). About 10 minutes in the Azure portal. Nothing here is a secret: the IDs below end up in `runtime-config.json`, which anyone can read.

## 1. Create the external tenant
1. Azure portal → **Microsoft Entra External ID** → **Overview** → **Create a tenant** → **External** → Continue.
2. Basics:
   - Tenant name: `KGP Companion`
   - Domain name: e.g. `kgpcompanion` (gives `kgpcompanion.ciamlogin.com`)
   - Location: Europe
3. Subscription: the same one as `rg-kgp-dev`. Resource group: **create a new one, `rg-kgp-identity`**. Keep it out of `rg-kgp-dev` so `azd down` can never take the tenant (and its users) with it.
4. Review + create. It takes a few minutes.

## 2. Register the API (`kgp-api`)
Switch to the new tenant (top-right → Switch directory), then **App registrations** → **New registration**:
1. Name `kgp-api`, accounts in this organizational directory only, no redirect URI → Register.
2. **Expose an API** → Application ID URI → **Add** → accept `api://<api-client-id>` → Save.
3. **Add a scope**: name `Conquests.ReadWrite`, who can consent: **Admins and users**, display name "Read and write your KGP conquests" → Add scope.
4. **Manifest** → set `"requestedAccessTokenVersion": 2` (under `api`) → Save.

## 3. Register the web app (`kgp-spa`)
**App registrations** → **New registration**:
1. Name `kgp-spa`, accounts in this organizational directory only.
2. Redirect URI: platform **Single-page application (SPA)**, `http://localhost:4200` → Register.
3. **Authentication** → under the SPA platform add `https://happy-dune-066863c03.8.azurestaticapps.net` and, if `KGP_WEB_CUSTOM_DOMAIN` is set, the custom domain too (`https://kgp.highpace.dev`) → Save. Leave implicit grant off. MSAL redirects to `window.location.origin`, so every origin users open the app on must be listed.
4. **API permissions** → Add a permission → **APIs my organization uses** → `kgp-api` → `Conquests.ReadWrite` → Add. Then **Grant admin consent for KGP Companion**.

## 4. User flow (email one-time code)
**External Identities** → **User flows** → **New user flow**:
1. Name `signupsignin`, identity provider **Email one-time passcode**, user attributes: **Display Name** → Create.
2. Open the flow → **Applications** → **Add application** → `kgp-spa` → Select.

## 5. Send these four values
| Value | Where to find it |
|---|---|
| Tenant ID | tenant **Overview** → Tenant ID |
| Tenant subdomain | the part before `.ciamlogin.com`, e.g. `kgpcompanion` |
| `kgp-api` client ID | app registration **Overview** → Application (client) ID |
| `kgp-spa` client ID | same, for `kgp-spa` |

They are then set as:
- **Local:** API user-secrets `Auth:Authority` = `https://<subdomain>.ciamlogin.com/<tenant-id>/v2.0` and `Auth:Audience` = `<api-client-id>`; frontend `src/frontend/public/runtime-config.json` with the `auth` block (gitignored).
- **Azure:** GitHub repository variables `KGP_AUTH_TENANT_ID`, `KGP_AUTH_TENANT_SUBDOMAIN`, `KGP_API_CLIENT_ID`, `KGP_SPA_CLIENT_ID`. The Deploy workflow passes them to `azd`, Bicep sets the API settings and the prepackage hook writes the frontend `auth` block.

## Later: Google sign-in
Create an OAuth client in Google Cloud Console (redirect URIs `https://<subdomain>.ciamlogin.com/<tenant-id>/federation/oauth2` and `https://<subdomain>.ciamlogin.com/<subdomain>.onmicrosoft.com/federation/oauth2`), add Google under **External Identities → All identity providers**, and tick it in the user flow. The Google client secret stays in the tenant; no code change.
