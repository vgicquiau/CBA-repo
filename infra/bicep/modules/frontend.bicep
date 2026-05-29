targetScope = 'resourceGroup'

// ─── Parameters ───────────────────────────────────────────────────────────────

@description('Deployment stage')
@allowed(['dev', 'prod'])
param stage string

@description('Frontend SPA domain (e.g. dev.clos-bon-accueil.fr)')
param domain string

@description('App Configuration store name')
param appConfigName string

@description('APIM gateway URL (base URL for API calls)')
param apiGatewayUrl string

@description('CDN web endpoint hostname (Azure CDN $web endpoint)')
param cdnWebDomain string

@description('Entra External ID tenant ID')
param tenantId string

@description('Entra app registration client ID')
param clientId string

// ─── App Configuration reference ─────────────────────────────────────────────

resource appConfig 'Microsoft.AppConfiguration/configurationStores@2023-03-01' existing = {
  name: appConfigName
}

// ─── Frontend config.json values ─────────────────────────────────────────────
// These entries are read by the frontend config loader (frontend/src/config.ts)
// at runtime. The config.json is injected at deploy-time via:
//   az storage blob upload \
//     --account-name closstorage${stage} \
//     --container-name '$web' \
//     --name config.json \
//     --file - \
//     --data '{"apiBaseUrl":"...","tenantId":"...","clientId":"...","cdnDomain":"...","stage":"..."}'
// (PM6 automates this step in the CI/CD pipeline)

resource configApiBaseUrl 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-frontend-api-base-url'
  parent: appConfig
  properties: {
    value: '${apiGatewayUrl}/v1'
    contentType: 'text/plain'
  }
}

resource configCdnDomain 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-frontend-cdn-domain'
  parent: appConfig
  properties: {
    value: cdnWebDomain
    contentType: 'text/plain'
  }
}

resource configSpaUrl 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-frontend-spa-domain'
  parent: appConfig
  properties: {
    value: domain
    contentType: 'text/plain'
  }
}

resource configFrontendTenantId 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-frontend-tenant-id'
  parent: appConfig
  properties: {
    value: tenantId
    contentType: 'text/plain'
  }
}

resource configFrontendClientId 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-frontend-client-id'
  parent: appConfig
  properties: {
    value: clientId
    contentType: 'text/plain'
  }
}

resource configFrontendStage 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-frontend-stage'
  parent: appConfig
  properties: {
    value: stage
    contentType: 'text/plain'
  }
}
