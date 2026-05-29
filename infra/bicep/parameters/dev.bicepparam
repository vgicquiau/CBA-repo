using '../main.bicep'

// ─── Stage: dev ───────────────────────────────────────────────────────────────
// Resource group: rg-clos-bon-accueil-dev (francecentral)
// Deploy:
//   az deployment group create \
//     --resource-group rg-clos-bon-accueil-dev \
//     --template-file infra/bicep/main.bicep \
//     --parameters infra/bicep/parameters/dev.bicepparam \
//     --parameters tenantId=<entra-tenant-id> clientId=<entra-client-id>

param stage = 'dev'
param location = 'francecentral'

param domain = 'dev.clos-bon-accueil.fr'
param apiDomain = 'api.dev.clos-bon-accueil.fr'
param cdnDomain = 'cdn.dev.clos-bon-accueil.fr'
param rootDomain = 'clos-bon-accueil.fr'

// Cosmos DB: low throughput for dev, no PITR
param enablePointInTimeRecovery = false
param cosmosMaxThroughput = 1000

// Logs: 7-day retention for dev
param logRetentionDays = 7

// CORS: localhost + dev frontend
param allowedOrigins = [
  'http://localhost:5173'
  'https://dev.clos-bon-accueil.fr'
]

// Entra: override at deploy time (az deployment group create ... --parameters tenantId=<value> clientId=<value>)
// Leave empty here — these have defaults in main.bicep
// param tenantId = ''
// param clientId = ''
