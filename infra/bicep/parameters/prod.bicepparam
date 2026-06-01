using '../main.bicep'

// ─── Stage: prod ──────────────────────────────────────────────────────────────
// Resource group: rg-clos-bon-accueil-prod (francecentral)
// Deploy (requires manual approval via GitHub environment "production"):
//   az deployment group create \
//     --resource-group rg-clos-bon-accueil-prod \
//     --template-file infra/bicep/main.bicep \
//     --parameters infra/bicep/parameters/prod.bicepparam \
//     --parameters tenantId=<entra-tenant-id> clientId=<entra-client-id>

param stage = 'prod'
param location = 'francecentral'

param domain = 'www.clos-bon-accueil.fr'
param apiDomain = 'api.clos-bon-accueil.fr'
param cdnDomain = 'cdn.clos-bon-accueil.fr'

// Cosmos DB: higher throughput + PITR for prod
param enablePointInTimeRecovery = true
param cosmosMaxThroughput = 4000

// Logs: 30-day retention for prod
param logRetentionDays = 30

// CORS: prod frontend only (no localhost)
param allowedOrigins = [
  'https://www.clos-bon-accueil.fr'
]

// Entra: override at deploy time (az deployment group create ... --parameters tenantId=<value> clientId=<value>)
// param tenantId = ''
// param clientId = ''
