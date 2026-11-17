param location string
@description('Image deployed by azd (SERVICE_API_IMAGE_NAME). Empty on the very first provision, then a placeholder is used.')
param image string = ''
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
param sqlServerFqdn string
param sqlDatabase string

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
          // Keep the image azd deployed so re-provisioning doesn't roll the API back to a placeholder.
          image: empty(image) ? 'mcr.microsoft.com/dotnet/samples:aspnetapp' : image
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'AZURE_CLIENT_ID', value: identityClientId }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', secretRef: 'appinsights-connection-string' }
            { name: 'Cors__AllowedOrigins__0', value: allowedOrigin }
            { name: 'Storage__BlobEndpoint', value: blobEndpoint }
            { name: 'KeyVault__Uri', value: keyVaultUri }
            { name: 'ConnectionStrings__Kgp', value: 'Server=tcp:${sqlServerFqdn},1433;Database=${sqlDatabase};Authentication=Active Directory Managed Identity;User Id=${identityClientId};Encrypt=True;Connect Timeout=60' }
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
