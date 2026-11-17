param location string
param tags object
param token string
param logAnalyticsWorkspaceName string
@secure()
param appInsightsConnectionString string
param identityId string
param identityClientId string
param registryLoginServer string
param allowedOrigin string
param blobEndpoint string
param keyVaultUri string
param postgresHost string
param postgresDatabase string
param postgresUser string

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsWorkspaceName
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-kgp-${token}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
  }
}

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-kgp-api-${token}'
  location: location
  tags: union(tags, { 'azd-service-name': 'api' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identityId}': {} }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
      }
      registries: [ { server: registryLoginServer, identity: identityId } ]
      secrets: [ { name: 'appinsights-connection-string', value: appInsightsConnectionString } ]
    }
    template: {
      containers: [
        {
          name: 'api'
          // Placeholder listening on 8080; `azd deploy` replaces it with the built API image.
          image: 'mcr.microsoft.com/dotnet/samples:aspnetapp'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'AZURE_CLIENT_ID', value: identityClientId }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', secretRef: 'appinsights-connection-string' }
            { name: 'Cors__AllowedOrigins__0', value: allowedOrigin }
            { name: 'Storage__BlobEndpoint', value: blobEndpoint }
            { name: 'KeyVault__Uri', value: keyVaultUri }
            { name: 'ConnectionStrings__Kgp', value: 'Host=${postgresHost};Database=${postgresDatabase};Username=${postgresUser};Ssl Mode=Require' }
          ]
          probes: [
            { type: 'Liveness', httpGet: { path: '/health', port: 8080 } }
          ]
        }
      ]
      scale: { minReplicas: 0, maxReplicas: 2 }
    }
  }
}

output url string = 'https://${api.properties.configuration.ingress.fqdn}'
