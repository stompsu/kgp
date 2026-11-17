param location string
param tags object
param token string

resource apiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-kgp-api-${token}'
  location: location
  tags: tags
}

output id string = apiIdentity.id
output name string = apiIdentity.name
output principalId string = apiIdentity.properties.principalId
output clientId string = apiIdentity.properties.clientId
