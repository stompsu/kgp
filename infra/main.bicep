targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('azd environment name, e.g. "dev". Used to name the resource group and resources.')
param environmentName string

@description('Primary region for all resources except Static Web Apps.')
param location string = 'polandcentral'

@description('Static Web Apps is available in a limited set of regions.')
param staticWebAppLocation string = 'westeurope'

var tags = { 'azd-env-name': environmentName, app: 'kgp' }
var token = toLower(uniqueString(subscription().id, environmentName, location))

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-kgp-${environmentName}'
  location: location
  tags: tags
}

module monitoring 'modules/monitoring.bicep' = {
  scope: rg
  params: { location: location, tags: tags, token: token }
}

module identity 'modules/identity.bicep' = {
  scope: rg
  params: { location: location, tags: tags, token: token }
}

module registry 'modules/registry.bicep' = {
  scope: rg
  params: { location: location, tags: tags, token: token, pullPrincipalId: identity.outputs.principalId }
}

module storage 'modules/storage.bicep' = {
  scope: rg
  params: { location: location, tags: tags, token: token, dataPrincipalId: identity.outputs.principalId }
}

module keyVault 'modules/keyvault.bicep' = {
  scope: rg
  params: { location: location, tags: tags, token: token, readerPrincipalId: identity.outputs.principalId }
}

module sql 'modules/sql.bicep' = {
  scope: rg
  params: {
    location: location
    tags: tags
    token: token
    adminName: identity.outputs.name
    adminClientId: identity.outputs.clientId
  }
}

module web 'modules/staticwebapp.bicep' = {
  scope: rg
  params: { location: staticWebAppLocation, tags: tags, token: token }
}

module api 'modules/containerapp.bicep' = {
  scope: rg
  params: {
    location: location
    tags: tags
    token: token
    logAnalyticsWorkspaceName: monitoring.outputs.logAnalyticsWorkspaceName
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    identityId: identity.outputs.id
    identityClientId: identity.outputs.clientId
    registryLoginServer: registry.outputs.loginServer
    allowedOrigin: 'https://${web.outputs.defaultHostname}'
    blobEndpoint: storage.outputs.blobEndpoint
    keyVaultUri: keyVault.outputs.uri
    sqlServerFqdn: sql.outputs.fqdn
    sqlDatabase: sql.outputs.databaseName
  }
}

output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = registry.outputs.loginServer
output API_BASE_URL string = api.outputs.url
output WEB_URL string = 'https://${web.outputs.defaultHostname}'
