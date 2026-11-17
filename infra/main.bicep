targetScope = 'resourceGroup'

// Deployed into an existing resource group (azd env AZURE_RESOURCE_GROUP, e.g. rg-kgp-dev).
// Keeping the scope at the resource group means CI only needs rights on that group, not the subscription.

@minLength(1)
@maxLength(64)
@description('azd environment name, e.g. "dev". Used to name the resource group and resources.')
param environmentName string

@description('Primary region for all resources except Static Web Apps.')
param location string = resourceGroup().location

@description('API image from the last azd deploy; empty before the first deploy.')
param apiImage string = ''

@description('Static Web Apps is available in a limited set of regions.')
param staticWebAppLocation string = 'westeurope'

// Sign-in (ADR 0003). The Entra External ID tenant lives outside azd (rg-kgp-identity, docs/auth-setup.md).
// All empty until it exists, which keeps sign-in off. None of these are secrets.
@description('Entra External ID tenant ID (KGP_AUTH_TENANT_ID).')
param authTenantId string = ''

@description('External tenant subdomain, the part before .ciamlogin.com (KGP_AUTH_TENANT_SUBDOMAIN).')
param authTenantSubdomain string = ''

@description('Client ID of the kgp-api app registration, used as the token audience (KGP_API_CLIENT_ID).')
param apiClientId string = ''

var tags = { 'azd-env-name': environmentName, app: 'kgp' }
var authEnabled = !empty(authTenantId) && !empty(authTenantSubdomain) && !empty(apiClientId)
var token = toLower(uniqueString(subscription().id, environmentName, location))

module monitoring 'modules/monitoring.bicep' = {
  params: { location: location, tags: tags, token: token }
}

module identity 'modules/identity.bicep' = {
  params: { location: location, tags: tags, token: token }
}

module registry 'modules/registry.bicep' = {
  params: { location: location, tags: tags, token: token, pullPrincipalId: identity.outputs.principalId }
}

module storage 'modules/storage.bicep' = {
  params: { location: location, tags: tags, token: token, dataPrincipalId: identity.outputs.principalId }
}

module keyVault 'modules/keyvault.bicep' = {
  params: { location: location, tags: tags, token: token, readerPrincipalId: identity.outputs.principalId }
}

module sql 'modules/sql.bicep' = {
  params: {
    location: location
    tags: tags
    token: token
    adminName: identity.outputs.name
    adminClientId: identity.outputs.clientId
  }
}

module web 'modules/staticwebapp.bicep' = {
  params: { location: staticWebAppLocation, tags: tags, token: token }
}

module api 'modules/containerapp.bicep' = {
  params: {
    location: location
    tags: tags
    token: token
    logAnalyticsWorkspaceName: monitoring.outputs.logAnalyticsWorkspaceName
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    image: apiImage
    identityId: identity.outputs.id
    identityClientId: identity.outputs.clientId
    registryLoginServer: registry.outputs.loginServer
    allowedOrigin: 'https://${web.outputs.defaultHostname}'
    blobEndpoint: storage.outputs.blobEndpoint
    keyVaultUri: keyVault.outputs.uri
    sqlServerFqdn: sql.outputs.fqdn
    sqlDatabase: sql.outputs.databaseName
    authAuthority: authEnabled ? 'https://${authTenantSubdomain}.ciamlogin.com/${authTenantId}/v2.0' : ''
    authAudience: authEnabled ? apiClientId : ''
  }
}

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = registry.outputs.loginServer
output API_BASE_URL string = api.outputs.url
output WEB_URL string = 'https://${web.outputs.defaultHostname}'
