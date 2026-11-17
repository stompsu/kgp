param location string
param tags object
param token string

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-kgp-${token}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-kgp-${token}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
  }
}

output logAnalyticsWorkspaceName string = workspace.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
