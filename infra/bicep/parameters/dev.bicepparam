using '../main.bicep'

// ─── Stage: dev (sandbox) ─────────────────────────────────────────────────────
// Resource group: rg-sp4-d-vgi-azu-vgi-sandbox-txt (francecentral)
// Subscription: 07875763-82ff-4808-a7da-e3d0dccc86fc
//
// Deploy:
//   az deployment group create \
//     --resource-group rg-sp4-d-vgi-azu-vgi-sandbox-txt \
//     --template-file infra/bicep/main.bicep \
//     --parameters infra/bicep/parameters/dev.bicepparam
//
// After first deploy, update domain/apiDomain/cdnDomain below with the real Azure endpoints:
//   - apiDomain  → APIM gateway URL from: az apim show --name clos-apim-dev-vgi --query properties.gatewayUrl
//   - domain     → Storage web endpoint from: az storage account show --name closstoragedevvgi --query primaryEndpoints.web
//   - cdnDomain  → same as domain (no CDN in sandbox, use storage web endpoint directly)

param stage = 'dev'
param location = 'francecentral'

// Unique suffix for sandbox — appended to all globally unique resource names
// Resources created: clos-cosmos-dev-vgi, closstoragedevvgi, clos-apim-dev-vgi, etc.
param nameSuffix = 'vgi'

// Domains: update post-first-deploy with real Azure endpoints (see comment above)
param domain = 'placeholder-update-after-deploy'
param apiDomain = 'placeholder-update-after-deploy'
param cdnDomain = 'placeholder-update-after-deploy'

// Cosmos DB: low throughput for dev, no PITR
param enablePointInTimeRecovery = false
param cosmosMaxThroughput = 1000

// Logs: 30-day minimum for PerGB2018 SKU
param logRetentionDays = 30

// CORS: localhost only for sandbox (no custom domain)
param allowedOrigins = [
  'http://localhost:5173'
]

// Sandbox-specific flags
param enableEmailNotifications = false  // Microsoft.Communication not registered in sandbox
param authBypassEnabled = true          // Skip JWT validation — Entra not configured in sandbox
param enableManagedWafRules = false     // Managed rules require Premium SKU — use Standard in sandbox

// Alerts email
param adminEmail = 'gicquiau.vincent@gmail.com'

// Entra: not available in sandbox — leave empty (auth bypassed via authBypassEnabled)
// param tenantId = ''
// param clientId = ''
