targetScope = 'resourceGroup'

// ─── Parameters ───────────────────────────────────────────────────────────────

@description('Deployment stage')
@allowed(['dev', 'prod'])
param stage string

@description('Primary Azure region')
param location string = 'francecentral'

@description('Frontend SPA domain (e.g. dev.clos-bon-accueil.fr)')
param domain string

@description('API gateway domain (e.g. api.dev.clos-bon-accueil.fr)')
param apiDomain string

@description('Photos CDN domain (e.g. cdn.dev.clos-bon-accueil.fr)')
param cdnDomain string

@description('Enable Cosmos DB continuous backup (PITR)')
param enablePointInTimeRecovery bool = false

@description('Cosmos DB max autoscale throughput (RU/s, multiples of 100, min 1000)')
@minValue(1000)
@maxValue(100000)
param cosmosMaxThroughput int = 1000

@description('Log Analytics workspace retention in days')
@allowed([30, 90, 180, 365])
param logRetentionDays int = 30

@description('Allowed CORS origins for the API and Blob Storage')
param allowedOrigins array = []

@description('Entra External ID tenant ID — set after app registration (az ad sp create-for-rbac)')
param tenantId string = ''

@description('Entra app registration client ID — set after app registration')
param clientId string = ''

@description('Admin email address for ops alert notifications — set at deploy time')
param adminEmail string = 'admin@clos-bon-accueil.fr'

// ─── App Configuration (cross-module runtime config) ─────────────────────────
// All runtime values (endpoints, names, domains) are written here by each module.
// Function Apps read config at startup via DefaultAzureCredential + AzureAppConfigurationExtension.
// Naming convention: clos-{stage}-{category}-{key}

resource appConfig 'Microsoft.AppConfiguration/configurationStores@2023-03-01' = {
  name: 'clos-appconfig-${stage}'
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    disableLocalAuth: false
    softDeleteRetentionInDays: stage == 'prod' ? 7 : 1
  }
}

// ─── Key Vault ────────────────────────────────────────────────────────────────
// Secrets must be set manually after initial deployment:
//   az keyvault secret set --vault-name clos-kv-${stage} --name admin-email --value <email>
//   az keyvault secret set --vault-name clos-kv-${stage} --name email-from-address --value <address>
// Function App app settings reference these via @Microsoft.KeyVault(SecretUri=...) syntax.

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'clos-kv-${stage}'
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableSoftDelete: true
    softDeleteRetentionInDays: stage == 'prod' ? 90 : 7
    enableRbacAuthorization: true
    enabledForDeployment: false
    enabledForTemplateDeployment: false
    enabledForDiskEncryption: false
  }
}

// ─── Modules ──────────────────────────────────────────────────────────────────

module data 'modules/data.bicep' = {
  name: 'data'
  params: {
    stage: stage
    location: location
    cdnDomain: cdnDomain
    enablePointInTimeRecovery: enablePointInTimeRecovery
    cosmosMaxThroughput: cosmosMaxThroughput
    allowedOrigins: allowedOrigins
    appConfigName: appConfig.name
  }
}

module auth 'modules/auth.bicep' = {
  name: 'auth'
  params: {
    stage: stage
    tenantId: tenantId
    clientId: clientId
    appConfigName: appConfig.name
  }
  dependsOn: [data]
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    stage: stage
    location: location
    logRetentionDays: logRetentionDays
    appConfigName: appConfig.name
    adminEmail: adminEmail
  }
}

module notifications 'modules/notifications.bicep' = {
  name: 'notifications'
  params: {
    stage: stage
    location: location
    appConfigName: appConfig.name
    keyVaultName: keyVault.name
    keyVaultUri: keyVault.properties.vaultUri
    cosmosAccountName: data.outputs.cosmosAccountName
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    entraClientId: clientId
  }
  dependsOn: [auth]
}

module api 'modules/api.bicep' = {
  name: 'api'
  params: {
    stage: stage
    location: location
    apiDomain: apiDomain
    allowedOrigins: allowedOrigins
    tenantId: tenantId
    clientId: clientId
    appConfigName: appConfig.name
    cosmosAccountName: data.outputs.cosmosAccountName
    storageBlobEndpoint: data.outputs.storageBlobEndpoint
    serviceBusNamespace: notifications.outputs.serviceBusNamespace
    serviceBusTopicName: notifications.outputs.serviceBusTopicName
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
  }
  dependsOn: [auth]
}

module waf 'modules/waf.bicep' = {
  name: 'waf'
  params: {
    stage: stage
    apimGatewayUrl: api.outputs.apiGatewayUrl
    appConfigName: appConfig.name
  }
}

module frontend 'modules/frontend.bicep' = {
  name: 'frontend'
  params: {
    stage: stage
    domain: domain
    appConfigName: appConfig.name
    apiGatewayUrl: api.outputs.apiGatewayUrl
    cdnWebDomain: data.outputs.cdnWebDomain
    tenantId: tenantId
    clientId: clientId
  }
}

// ─── Top-level outputs ────────────────────────────────────────────────────────

output appConfigEndpoint string = appConfig.properties.endpoint
output keyVaultUri string = keyVault.properties.vaultUri
output apiGatewayUrl string = api.outputs.apiGatewayUrl
output cdnWebDomain string = data.outputs.cdnWebDomain
output cdnPhotosDomain string = data.outputs.cdnPhotosDomain
output cosmosAccountName string = data.outputs.cosmosAccountName
