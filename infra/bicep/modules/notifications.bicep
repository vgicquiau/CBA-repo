targetScope = 'resourceGroup'

// ─── Parameters ───────────────────────────────────────────────────────────────

@description('Deployment stage')
@allowed(['dev', 'prod'])
param stage string

@description('Primary Azure region')
param location string

@description('Log Analytics workspace retention in days')
param logRetentionDays int

@description('App Configuration store name')
param appConfigName string

@description('Key Vault name')
param keyVaultName string

@description('Key Vault URI for app setting references')
param keyVaultUri string

@description('Cosmos DB account name (for data plane RBAC assignment)')
param cosmosAccountName string

@description('Application Insights connection string for telemetry')
param appInsightsConnectionString string

// ─── Existing references ──────────────────────────────────────────────────────

resource appConfig 'Microsoft.AppConfiguration/configurationStores@2023-03-01' existing = {
  name: appConfigName
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-02-15-preview' existing = {
  name: cosmosAccountName
}

// ─── Service Bus ──────────────────────────────────────────────────────────────
// Replaces SNS topic + Lambda subscription.
// Topic: clos-notifications-{stage}
// Subscriptions:
//   - dispatcher: triggers notification-dispatcher function (email via ACS)
//   - reconciliation-monitor: could trigger monitoring alerts (currently unused)

resource serviceBusNamespaceResource 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: 'clos-servicebus-${stage}'
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    zoneRedundant: false
  }
}

resource serviceBusTopic 'Microsoft.ServiceBus/namespaces/topics@2022-10-01-preview' = {
  name: 'clos-notifications-${stage}'
  parent: serviceBusNamespaceResource
  properties: {
    defaultMessageTimeToLive: 'PT1H'
    maxSizeInMegabytes: 1024
    requiresDuplicateDetection: false
    enablePartitioning: false
    enableExpress: false
  }
}

resource sbSubscriptionDispatcher 'Microsoft.ServiceBus/namespaces/topics/subscriptions@2022-10-01-preview' = {
  name: 'dispatcher'
  parent: serviceBusTopic
  properties: {
    lockDuration: 'PT30S'
    maxDeliveryCount: 3
    deadLetteringOnMessageExpiration: true
  }
}

resource sbSubscriptionMonitor 'Microsoft.ServiceBus/namespaces/topics/subscriptions@2022-10-01-preview' = {
  name: 'reconciliation-monitor'
  parent: serviceBusTopic
  properties: {
    lockDuration: 'PT30S'
    maxDeliveryCount: 3
    deadLetteringOnMessageExpiration: true
  }
}

// ─── Azure Communication Services Email ───────────────────────────────────────
// Replaces SES + templated emails.
// Note (D3): ACS Email Data Location must be verified for RGPD compliance.
//   az communication email list --resource-group rg-clos-bon-accueil-${stage} (post-deploy)
// ACS Email in France Central: check availability before PM5.
// Fallback: Sweden Central (EU data residency, RGPD compliant).

resource acsEmail 'Microsoft.Communication/emailServices@2023-06-01-preview' = {
  name: 'clos-email-${stage}'
  location: 'global'
  properties: {
    dataLocation: 'Europe'
  }
}

resource acsCommunication 'Microsoft.Communication/communicationServices@2023-06-01-preview' = {
  name: 'clos-comm-${stage}'
  location: 'global'
  properties: {
    dataLocation: 'Europe'
  }
}

// ─── Storage Account for clos-jobs Function App ───────────────────────────────

resource jobsStorageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'closjobsfn${stage}'
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

// ─── App Service Plan (Consumption) for clos-jobs ────────────────────────────

resource jobsAppServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'clos-jobs-plan-${stage}'
  location: location
  kind: 'functionapp'
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true
  }
}

// ─── clos-jobs Function App ───────────────────────────────────────────────────
// Hosts three functions:
//   - notification-dispatcher: triggered by Service Bus topic subscription "dispatcher"
//   - reconciliation-job:      triggered by Timer (NCRONTAB "0 0 1 * * *" = 01:00 UTC)
//   - auth-trigger:            Entra External ID custom extension webhook (PM3)
// Node.js 20, arm64 not available on Consumption Y1 (arm64 requires Premium/Dedicated).
// Using x64 for Consumption; upgrade to Premium in PM7 if arm64 is needed for perf.

resource closJobsFunctionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: 'clos-jobs-${stage}'
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: jobsAppServicePlan.id
    reserved: true
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'Node|20'
      functionAppScaleLimit: 10
      minimumElasticInstanceCount: 0
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${jobsStorageAccount.name};AccountKey=${jobsStorageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'AZURE_APPCONFIG_ENDPOINT'
          value: 'https://${appConfigName}.azconfig.io'
        }
        {
          name: 'SERVICEBUS_FULLY_QUALIFIED_NAMESPACE'
          value: '${serviceBusNamespaceResource.name}.servicebus.windows.net'
        }
        {
          name: 'SERVICEBUS_TOPIC_NAME'
          value: serviceBusTopic.name
        }
        {
          name: 'STAGE'
          value: stage
        }
        {
          name: 'LOG_LEVEL'
          value: stage == 'prod' ? 'INFO' : 'DEBUG'
        }
        {
          name: 'ADMIN_EMAIL'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultUri}secrets/admin-email/)'
        }
        {
          name: 'EMAIL_FROM_ADDRESS'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultUri}secrets/email-from-address/)'
        }
        {
          name: 'ACS_ENDPOINT'
          value: acsCommunication.properties.hostName
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
      ]
    }
  }
}

// ─── RBAC assignments for clos-jobs ──────────────────────────────────────────

// Cosmos DB data plane: Built-in Data Contributor (role ID: 00000000-0000-0000-0000-000000000002)
resource cosmosRoleAssignmentJobs 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-02-15-preview' = {
  name: guid(resourceGroup().id, 'clos-jobs-${stage}', 'cosmos-data-contributor')
  parent: cosmosAccount
  properties: {
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: closJobsFunctionApp.identity.principalId
    scope: cosmosAccount.id
  }
}

// Service Bus Data Receiver on the dispatcher subscription
resource sbReceiverRoleJobs 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-jobs-${stage}', 'sb-data-receiver')
  scope: serviceBusTopic
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0'  // Azure Service Bus Data Receiver
    )
    principalId: closJobsFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Service Bus Data Sender (reconciliation-job publishes to the topic)
resource sbSenderRoleJobs 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-jobs-${stage}', 'sb-data-sender')
  scope: serviceBusTopic
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39'  // Azure Service Bus Data Sender
    )
    principalId: closJobsFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Key Vault Secrets User (to read admin-email and email-from-address)
resource kvSecretsUserJobs 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-jobs-${stage}', 'kv-secrets-user')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6'  // Key Vault Secrets User
    )
    principalId: closJobsFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// App Configuration Data Reader
resource appConfigReaderJobs 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-jobs-${stage}', 'appconfig-data-reader')
  scope: appConfig
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '516239f1-63e1-4d78-a4de-a74fb236a071'  // App Configuration Data Reader
    )
    principalId: closJobsFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ACS Contributor (required to send emails via DefaultAzureCredential / Managed Identity)
resource acsContributorRoleJobs 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-jobs-${stage}', 'acs-contributor')
  scope: acsCommunication
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'b24988ac-6180-42a0-ab88-20f7382dd24c'  // Contributor
    )
    principalId: closJobsFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ─── App Configuration entries ────────────────────────────────────────────────

resource configServiceBusNamespace 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-notifications-servicebus-namespace'
  parent: appConfig
  properties: {
    value: '${serviceBusNamespaceResource.name}.servicebus.windows.net'
    contentType: 'text/plain'
  }
}

resource configServiceBusTopic 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-notifications-servicebus-topic'
  parent: appConfig
  properties: {
    value: serviceBusTopic.name
    contentType: 'text/plain'
  }
}

resource configAcsEndpoint 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-notifications-acs-endpoint'
  parent: appConfig
  properties: {
    value: acsCommunication.properties.hostName
    contentType: 'text/plain'
  }
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

output serviceBusNamespace string = '${serviceBusNamespaceResource.name}.servicebus.windows.net'
output serviceBusTopicName string = serviceBusTopic.name
output closJobsPrincipalId string = closJobsFunctionApp.identity.principalId
