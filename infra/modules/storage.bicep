param location string
param tags object
param token string
@description('Principal that reads/writes photos and issues user-delegation SAS tokens.')
param dataPrincipalId string

var blobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource account 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stkgp${token}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false // only Entra auth + user-delegation SAS
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: account
  name: 'default'
  properties: {
    // Browser uploads go straight to Blob with a short-lived SAS; allowed origins are tightened in M2.
    cors: {
      corsRules: [
        {
          allowedOrigins: [ '*' ]
          allowedMethods: [ 'PUT', 'OPTIONS' ]
          allowedHeaders: [ '*' ]
          exposedHeaders: [ '*' ]
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

resource photos 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'conquest-photos'
  properties: { publicAccess: 'None' }
}

resource dataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: account
  name: guid(account.id, dataPrincipalId, blobDataContributorRoleId)
  properties: {
    principalId: dataPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributorRoleId)
  }
}

output blobEndpoint string = account.properties.primaryEndpoints.blob
