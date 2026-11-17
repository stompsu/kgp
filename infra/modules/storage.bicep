param location string
param tags object
param token string
@description('Principal that reads, writes and deletes photos (the API identity).')
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
    allowSharedKeyAccess: false // Entra auth only (the API's managed identity)
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: account
  name: 'default'
  properties: {
    // Photos go through the API (ADR 0003); browsers never talk to storage. An explicit empty list
    // also removes the CORS rule that M1 deployed.
    cors: { corsRules: [] }
    // Soft delete stays off on purpose: deleting a conquest must remove its photo (GPS-free, but still
    // personal data) at once, not keep it recoverable for days.
    deleteRetentionPolicy: { enabled: false }
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
