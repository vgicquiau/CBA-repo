targetScope = 'resourceGroup'

// ─── Parameters ───────────────────────────────────────────────────────────────

@description('Deployment stage')
@allowed(['dev', 'prod'])
param stage string

@description('Entra External ID tenant ID')
param tenantId string

@description('Entra app registration client ID')
param clientId string

@description('App Configuration store name')
param appConfigName string

// ─── Entra External ID ────────────────────────────────────────────────────────
// Entra External ID app registrations cannot be provisioned via ARM/Bicep directly.
// They require Microsoft Graph API calls (az ad app create / az ad sp create-for-rbac).
//
// Pre-deployment steps (run once per stage):
//   1. Create the external tenant (portal: entra.microsoft.com → External Identities)
//   2. Register the app:
//        az ad app create \
//          --display-name "clos-bon-accueil-${stage}" \
//          --sign-in-audience AzureADMyOrg \
//          --web-redirect-uris "https://${domain}/auth/callback"
//   3. Create App Roles (admin, guest) via portal or az cli
//   4. Note the tenantId and clientId, pass them as bicepparam values
//
// JWT claims used by the backend (PM3):
//   - oid  → userId (replaces Cognito sub)
//   - roles → ['admin'] or ['guest'] (replaces cognito:groups)
//
// Post-confirmation trigger equivalent:
//   Entra External ID supports custom authentication extensions (webhooks).
//   The auth-post-confirmation Function in clos-jobs (notifications module) is triggered
//   by an Entra custom extension configured in PM3.

// ─── App Configuration reference ─────────────────────────────────────────────

resource appConfig 'Microsoft.AppConfiguration/configurationStores@2023-03-01' existing = {
  name: appConfigName
}

// ─── App Configuration entries ────────────────────────────────────────────────

resource configTenantId 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-auth-tenant-id'
  parent: appConfig
  properties: {
    value: tenantId
    contentType: 'text/plain'
  }
}

resource configClientId 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-auth-client-id'
  parent: appConfig
  properties: {
    value: clientId
    contentType: 'text/plain'
  }
}

resource configAuthIssuer 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-auth-issuer'
  parent: appConfig
  properties: {
    // Standard Entra v2 issuer — update to Entra External ID specific URL in PM3
    value: '${environment().authentication.loginEndpoint}${tenantId}/v2.0'
    contentType: 'text/plain'
  }
}
