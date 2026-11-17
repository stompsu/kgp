param location string
param tags object
param token string
@description('Managed identity that becomes the Entra admin; the API connects as this identity, no passwords.')
param adminName string
@description('Application (client) ID of the admin identity. Azure SQL uses the application ID as the SID for service principals.')
param adminClientId string

resource server 'Microsoft.Sql/servers@2023-08-01' = {
  name: 'sql-kgp-${token}'
  location: location
  tags: tags
  properties: {
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      azureADOnlyAuthentication: true // SQL logins disabled entirely
      login: adminName
      sid: adminClientId
      principalType: 'Application'
      tenantId: subscription().tenantId
    }
  }
}

resource allowAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01' = {
  parent: server
  name: 'AllowAllWindowsAzureIps'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

// Free offer: 100,000 vCore-seconds + 32 GB data + 32 GB backup per month, per subscription (max 10 DBs).
// AutoPause means it pauses at the monthly limit instead of billing. It never incurs compute charges.
resource database 'Microsoft.Sql/servers/databases@2023-08-01' = {
  parent: server
  name: 'kgp'
  location: location
  tags: tags
  sku: {
    name: 'GP_S_Gen5_2'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 2
  }
  properties: {
    useFreeLimit: true
    freeLimitExhaustionBehavior: 'AutoPause'
    autoPauseDelay: 60
    minCapacity: json('0.5')
    maxSizeBytes: 34359738368 // 32 GB, the free limit
    requestedBackupStorageRedundancy: 'Local'
    zoneRedundant: false
  }
}

output fqdn string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name
