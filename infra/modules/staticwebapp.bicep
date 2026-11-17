param location string
param tags object
param token string

@description('Optional custom domain (subdomain), e.g. kgp.example.com. Empty = no custom domain.')
param customDomain string = ''

resource site 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'swa-kgp-${token}'
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}

// The DNS record CNAME <customDomain> -> <defaultHostname> must exist before provisioning,
// otherwise cname-delegation validation fails and the deployment errors out.
// A hostname can be bound to only one Static Web App, so keep it out of defaults (set per environment).
resource domain 'Microsoft.Web/staticSites/customDomains@2023-12-01' = if (!empty(customDomain)) {
  parent: site
  name: empty(customDomain) ? 'unused' : customDomain
  properties: {
    validationMethod: 'cname-delegation'
  }
}

output defaultHostname string = site.properties.defaultHostname
@description('Custom hostname when configured, empty otherwise.')
output customHostname string = customDomain
