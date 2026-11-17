param location string
param tags object
param token string

resource site 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'swa-kgp-${token}'
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}

output defaultHostname string = site.properties.defaultHostname
