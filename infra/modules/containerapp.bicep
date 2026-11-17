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
@description('Browser origins allowed by CORS (Cors__AllowedOrigins__<i>).')
param allowedOrigins array
param blobEndpoint string
param keyVaultUri string
param sqlServerFqdn string
param sqlDatabase string
@description('JWT authority of the Entra External ID tenant; empty = sign-in off.')
param authAuthority string = ''
@description('Client ID of the kgp-api app registration (token audience); empty = sign-in off.')
param authAudience string = ''

// ASP.NET Core binds Cors__AllowedOrigins__0, __1, ... to the Cors:AllowedOrigins string array.
var corsEnv = [for (origin, i) in allowedOrigins: { name: 'Cors__AllowedOrigins__${i}', value: origin }]

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
          // Photo processing (Magick.NET, uploads up to 15 MB) needs more than 0.5 Gi. 0.5 vCPU / 1 Gi is a valid Consumption pair.
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: concat([
            { name: 'AZURE_CLIENT_ID', value: identityClientId }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', secretRef: 'appinsights-connection-string' }
            { name: 'Storage__BlobEndpoint', value: blobEndpoint }
            { name: 'KeyVault__Uri', value: keyVaultUri }
            // Not secrets. Empty values switch sign-in off in the API (/api/me/* returns 401).
            { name: 'Auth__Authority', value: authAuthority }
            { name: 'Auth__Audience', value: authAudience }
            { name: 'ConnectionStrings__Kgp', value: 'Server=tcp:${sqlServerFqdn},1433;Database=${sqlDatabase};Authentication=Active Directory Managed Identity;User Id=${identityClientId};Encrypt=True;Connect Timeout=60' }
          ], corsEnv)
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
