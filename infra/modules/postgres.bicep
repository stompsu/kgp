param location string
param tags object
param token string
@description('Managed identity that becomes the Entra admin; the API connects as this identity, no passwords.')
param adminPrincipalId string
param adminPrincipalName string

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: 'psql-kgp-${token}'
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    storage: { storageSizeGB: 32, autoGrow: 'Disabled' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Disabled'
      tenantId: subscription().tenantId
    }
  }
}

resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: server
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource extensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'azure.extensions'
  properties: { value: 'POSTGIS', source: 'user-override' }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: 'kgp'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

resource entraAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = {
  parent: server
  name: adminPrincipalId
  dependsOn: [ database, extensions, allowAzure ]
  properties: {
    principalName: adminPrincipalName
    principalType: 'ServicePrincipal'
    tenantId: subscription().tenantId
  }
}

output host string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name
