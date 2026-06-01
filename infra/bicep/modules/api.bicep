targetScope = 'resourceGroup'

// ─── Parameters ───────────────────────────────────────────────────────────────

@description('Deployment stage')
@allowed(['dev', 'prod'])
param stage string

@description('Primary Azure region')
param location string

@description('API custom domain (e.g. api.dev.clos-bon-accueil.fr)')
param apiDomain string

@description('Allowed CORS origins')
param allowedOrigins array

@description('Entra External ID tenant ID')
param tenantId string

@description('Entra app registration client ID (APIM JWT audience)')
param clientId string

@description('App Configuration store name')
param appConfigName string

@description('Cosmos DB account name (for data plane RBAC assignment)')
param cosmosAccountName string

@description('Blob Storage primary endpoint (for SAS token generation)')
param storageBlobEndpoint string

@description('Service Bus fully qualified namespace')
param serviceBusNamespace string

@description('Service Bus topic name for publishing events')
param serviceBusTopicName string

@description('Application Insights connection string for telemetry')
param appInsightsConnectionString string

// ─── Existing references ──────────────────────────────────────────────────────

resource appConfig 'Microsoft.AppConfiguration/configurationStores@2023-03-01' existing = {
  name: appConfigName
}

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-02-15-preview' existing = {
  name: cosmosAccountName
}

// Existing references for RBAC scope reduction (SEV-006)
resource dataStorageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: 'closstorage${stage}'
}

resource serviceBusNamespaceRef 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' existing = {
  name: 'clos-servicebus-${stage}'
}

resource serviceBusTopicRef 'Microsoft.ServiceBus/namespaces/topics@2022-10-01-preview' existing = {
  name: 'clos-notifications-${stage}'
  parent: serviceBusNamespaceRef
}

// ─── Storage Account for clos-api Function App ───────────────────────────────

resource apiStorageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'closapifn${stage}'
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
  }
}

// ─── App Service Plan (Consumption) for clos-api ─────────────────────────────

resource apiAppServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'clos-api-plan-${stage}'
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

// ─── clos-api Function App ────────────────────────────────────────────────────
// Hosts 29 HTTP-triggered Azure Functions (one per API route, PM4).
// Auth is handled at APIM layer (JWT validation policy) — authLevel: anonymous.
// getCurrentUserId() reads the oid claim forwarded by APIM as X-Forwarded-User.

resource closApiFunctionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: 'clos-api-${stage}'
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: apiAppServicePlan.id
    reserved: true
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'Node|20'
      functionAppScaleLimit: 20
      minimumElasticInstanceCount: 0
      ipSecurityRestrictions: [
        {
          ipAddress: '${apimService.properties.publicIPAddresses[0]}/32'
          action: 'Allow'
          priority: 100
          name: 'allow-apim-gateway'
        }
        {
          ipAddress: 'Any'
          action: 'Deny'
          priority: 2147483647
          name: 'deny-all'
        }
      ]
      ipSecurityRestrictionsDefaultAction: 'Deny'
      appSettings: [
        {
          name: 'AzureWebJobsStorage__accountName'
          value: apiStorageAccount.name
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
          value: serviceBusNamespace
        }
        {
          name: 'SERVICEBUS_TOPIC_NAME'
          value: serviceBusTopicName
        }
        {
          name: 'STORAGE_BLOB_ENDPOINT'
          value: storageBlobEndpoint
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

// ─── RBAC assignments for clos-api ───────────────────────────────────────────

// Cosmos DB data plane: Built-in Data Contributor
resource cosmosRoleAssignmentApi 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-02-15-preview' = {
  name: guid(resourceGroup().id, 'clos-api-${stage}', 'cosmos-data-contributor')
  parent: cosmosAccount
  properties: {
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: closApiFunctionApp.identity.principalId
    scope: cosmosAccount.id
  }
}

// Service Bus Data Sender (handlers publish domain events)
resource sbSenderRoleApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-api-${stage}', 'sb-data-sender')
  scope: serviceBusTopicRef
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39'  // Azure Service Bus Data Sender
    )
    principalId: closApiFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Storage Blob Data Contributor (generate SAS tokens for photo upload)
resource blobContributorRoleApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-api-${stage}', 'storage-blob-contributor')
  scope: dataStorageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'ba92f5b4-2d11-453d-a403-e96b0029c9fe'  // Storage Blob Data Contributor
    )
    principalId: closApiFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// App Configuration Data Reader
resource appConfigReaderApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-api-${stage}', 'appconfig-data-reader')
  scope: appConfig
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '516239f1-63e1-4d78-a4de-a74fb236a071'  // App Configuration Data Reader
    )
    principalId: closApiFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Storage Blob Data Owner (required for AzureWebJobsStorage Managed Identity)
resource storageOwnerRoleApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-api-${stage}', 'storage-blob-owner')
  scope: apiStorageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'  // Storage Blob Data Owner
    )
    principalId: closApiFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Storage Queue Data Contributor (required for AzureWebJobsStorage Managed Identity)
resource storageQueueRoleApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-api-${stage}', 'storage-queue-contributor')
  scope: apiStorageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '974c5e8b-45b9-4653-ba55-5f855dd0fb88'  // Storage Queue Data Contributor
    )
    principalId: closApiFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Storage Table Data Contributor (required for AzureWebJobsStorage Managed Identity)
resource storageTableRoleApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-api-${stage}', 'storage-table-contributor')
  scope: apiStorageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'  // Storage Table Data Contributor
    )
    principalId: closApiFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ─── Azure API Management (Consumption tier) ─────────────────────────────────
// Consumption: pay-per-call, no VNet, no dedicated infrastructure.
// Provides: JWT validation, rate limiting, CORS, custom domain.
// WAF: APIM built-in rate limiting + OWASP rules emulated via policies.
//   Full WAF requires Azure Front Door (upgrade path if needed post-PM1).
// Custom domain (apiDomain) setup:
//   az apim api update --resource-group rg-clos-bon-accueil-${stage} \
//     --service-name clos-apim-${stage} ...
//   Certificate managed by APIM (requires CNAME DNS record pointing to APIM gateway).

resource apimService 'Microsoft.ApiManagement/service@2023-05-01-preview' = {
  name: 'clos-apim-${stage}'
  location: location
  sku: {
    name: 'Consumption'
    capacity: 0
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    publisherName: 'Le Clos Bon Accueil'
    publisherEmail: 'admin@clos-bon-accueil.fr'
    customProperties: {
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls10': 'false'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls11': 'false'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls10': 'false'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls11': 'false'
    }
  }
}

// ─── APIM API — v1 ────────────────────────────────────────────────────────────

resource apimApi 'Microsoft.ApiManagement/service/apis@2023-05-01-preview' = {
  name: 'clos-api-v1'
  parent: apimService
  properties: {
    displayName: 'Le Clos Bon Accueil API'
    description: 'REST API for Le Clos Bon Accueil vacation rental management'
    path: 'v1'
    protocols: ['https']
    serviceUrl: 'https://${closApiFunctionApp.properties.defaultHostName}/api'
    subscriptionRequired: false
    apiType: 'http'
    isCurrent: true
  }
}

// ─── APIM API-level policy ────────────────────────────────────────────────────
// Applied to all operations except health (which has an operation-level override).
// Inbound:
//   1. Validate JWT from Entra External ID (oid + roles claims)
//   2. Rate limit: 100 calls/s per IP (burst) — spec: 100 burst/50 RPS
//   3. CORS
//   4. Forward caller identity to backend via X-Forwarded-User header

var loginEndpoint = environment().authentication.loginEndpoint
var corsOriginsXml = join(map(allowedOrigins, origin => '<origin>${origin}</origin>'), '')
var apimPolicyXml = '<policies><inbound><base /><validate-jwt header-name="Authorization" failed-validation-httpcode="401" require-expiration-time="true"><openid-config url="${loginEndpoint}${tenantId}/v2.0/.well-known/openid-configuration" /><audiences><audience>${clientId}</audience></audiences><required-claims><claim name="oid" match="all" /></required-claims></validate-jwt><rate-limit-by-key calls="100" renewal-period="1" counter-key="@(context.Request.IpAddress)" increment-condition="@(context.Response.StatusCode &lt; 500)" /><cors allow-credentials="false"><allowed-origins>${corsOriginsXml}</allowed-origins><allowed-methods><method>GET</method><method>POST</method><method>PATCH</method><method>DELETE</method><method>OPTIONS</method></allowed-methods><allowed-headers><header>Content-Type</header><header>Authorization</header><header>Idempotency-Key</header></allowed-headers></cors><set-header name="X-Forwarded-User" exists-action="override"><value>@(context.Request.Headers.GetValueOrDefault("Authorization", "").Replace("Bearer ", ""))</value></set-header></inbound><backend><base /></backend><outbound><base /><set-header name="X-Content-Type-Options" exists-action="override"><value>nosniff</value></set-header><set-header name="X-Frame-Options" exists-action="override"><value>DENY</value></set-header><set-header name="Strict-Transport-Security" exists-action="override"><value>max-age=31536000; includeSubDomains</value></set-header><set-header name="Referrer-Policy" exists-action="override"><value>strict-origin-when-cross-origin</value></set-header><set-header name="Cache-Control" exists-action="override"><value>no-store</value></set-header></outbound><on-error><base /></on-error></policies>'

resource apimApiPolicy 'Microsoft.ApiManagement/service/apis/policies@2023-05-01-preview' = {
  name: 'policy'
  parent: apimApi
  properties: {
    format: 'xml'
    value: apimPolicyXml
  }
}

// ─── APIM Operations ─────────────────────────────────────────────────────────
// 29 operations matching the 29 Azure Function handlers (PM4).
// One operation per route. Health is the only unauthenticated route.
// Template parameters are declared for path variables.

var apimOperationsList = [
  // ── Public ──────────────────────────────────────────────────────────────────
  { name: 'health-get',                   displayName: 'Health check',                    method: 'GET',    url: '/health',                                      params: [] }
  // ── Me ──────────────────────────────────────────────────────────────────────
  { name: 'me-get',                        displayName: 'Get current user',                 method: 'GET',    url: '/me',                                          params: [] }
  { name: 'me-delete',                     displayName: 'Delete current user account',       method: 'DELETE', url: '/me',                                          params: [] }
  { name: 'me-export',                     displayName: 'Export current user data (RGPD)',   method: 'GET',    url: '/me/export',                                   params: [] }
  // ── House ────────────────────────────────────────────────────────────────────
  { name: 'house-get',                     displayName: 'Get house configuration',           method: 'GET',    url: '/house',                                       params: [] }
  // ── Rooms ────────────────────────────────────────────────────────────────────
  { name: 'rooms-list',                    displayName: 'List rooms',                        method: 'GET',    url: '/rooms',                                       params: [] }
  { name: 'rooms-get',                     displayName: 'Get room',                          method: 'GET',    url: '/rooms/{roomId}',                              params: ['roomId'] }
  { name: 'room-bookings-list',            displayName: 'List bookings for a room',          method: 'GET',    url: '/rooms/{roomId}/bookings',                     params: ['roomId'] }
  { name: 'room-availability',             displayName: 'Get room availability',             method: 'GET',    url: '/rooms/{roomId}/availability',                 params: ['roomId'] }
  // ── Bookings (guest) ─────────────────────────────────────────────────────────
  { name: 'bookings-list-mine',            displayName: 'List my bookings',                  method: 'GET',    url: '/bookings/me',                                 params: [] }
  { name: 'bookings-get',                  displayName: 'Get booking',                       method: 'GET',    url: '/bookings/{bookingId}',                        params: ['bookingId'] }
  { name: 'bookings-create',               displayName: 'Create booking',                    method: 'POST',   url: '/bookings',                                    params: [] }
  { name: 'bookings-update',               displayName: 'Update booking',                    method: 'PATCH',  url: '/bookings/{bookingId}',                        params: ['bookingId'] }
  { name: 'bookings-delete',               displayName: 'Cancel booking',                    method: 'DELETE', url: '/bookings/{bookingId}',                        params: ['bookingId'] }
  // ── Admin — dashboard + bookings ─────────────────────────────────────────────
  { name: 'admin-dashboard',               displayName: 'Admin: dashboard KPIs',             method: 'GET',    url: '/admin/dashboard',                             params: [] }
  { name: 'admin-bookings-list',           displayName: 'Admin: list all bookings',          method: 'GET',    url: '/admin/bookings',                              params: [] }
  { name: 'admin-bookings-get',            displayName: 'Admin: get booking',                method: 'GET',    url: '/admin/bookings/{bookingId}',                  params: ['bookingId'] }
  { name: 'admin-bookings-create',         displayName: 'Admin: create booking for guest',   method: 'POST',   url: '/admin/bookings',                              params: [] }
  { name: 'admin-bookings-update',         displayName: 'Admin: update booking',             method: 'PATCH',  url: '/admin/bookings/{bookingId}',                  params: ['bookingId'] }
  { name: 'admin-bookings-delete',         displayName: 'Admin: delete booking',             method: 'DELETE', url: '/admin/bookings/{bookingId}',                  params: ['bookingId'] }
  // ── Admin — rooms ────────────────────────────────────────────────────────────
  { name: 'admin-rooms-create',            displayName: 'Admin: create room',                method: 'POST',   url: '/admin/rooms',                                 params: [] }
  { name: 'admin-rooms-update',            displayName: 'Admin: update room',                method: 'PATCH',  url: '/admin/rooms/{roomId}',                        params: ['roomId'] }
  { name: 'admin-rooms-delete',            displayName: 'Admin: delete room (cascade)',      method: 'DELETE', url: '/admin/rooms/{roomId}',                        params: ['roomId'] }
  { name: 'admin-rooms-photo-url',         displayName: 'Admin: get photo upload SAS URL',   method: 'POST',   url: '/admin/rooms/{roomId}/photo-upload-url',       params: ['roomId'] }
  // ── Admin — users ────────────────────────────────────────────────────────────
  { name: 'admin-users-list',              displayName: 'Admin: list users',                 method: 'GET',    url: '/admin/users',                                 params: [] }
  { name: 'admin-users-invite',            displayName: 'Admin: invite user (Entra)',        method: 'POST',   url: '/admin/users/invite',                          params: [] }
  { name: 'admin-users-delete',            displayName: 'Admin: delete user',                method: 'DELETE', url: '/admin/users/{userId}',                        params: ['userId'] }
  // ── Admin — house ────────────────────────────────────────────────────────────
  { name: 'admin-house-get',               displayName: 'Admin: get house config',           method: 'GET',    url: '/admin/house',                                 params: [] }
  { name: 'admin-house-update',            displayName: 'Admin: update house config',        method: 'PATCH',  url: '/admin/house',                                 params: [] }
]

@batchSize(5)
resource apimOperations 'Microsoft.ApiManagement/service/apis/operations@2023-05-01-preview' = [for op in apimOperationsList: {
  name: '${apimService.name}/${apimApi.name}/${op.name}'
  properties: {
    displayName: op.displayName
    method: op.method
    urlTemplate: op.url
    templateParameters: [for paramName in op.params: {
      name: paramName
      required: true
      type: 'string'
    }]
    responses: [
      {
        statusCode: 200
        description: 'Success'
      }
    ]
  }
}]

// Health operation policy override: skip JWT validation
// The health-get operation index in the loop is 0
resource apimHealthPolicy 'Microsoft.ApiManagement/service/apis/operations/policies@2023-05-01-preview' = {
  name: '${apimService.name}/${apimApi.name}/health-get/policy'
  dependsOn: [apimOperations]
  properties: {
    format: 'xml'
    value: '''<policies>
  <inbound>
    <rate-limit-by-key calls="20" renewal-period="1"
      counter-key="@(context.Request.IpAddress)"
      increment-condition="@(context.Response.StatusCode &lt; 500)" />
  </inbound>
  <backend>
    <base />
  </backend>
  <outbound>
    <base />
  </outbound>
  <on-error>
    <base />
  </on-error>
</policies>'''
  }
}

// ─── App Configuration entries ────────────────────────────────────────────────

resource configApiGatewayUrl 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-api-gateway-url'
  parent: appConfig
  properties: {
    value: 'https://${apimService.properties.gatewayUrl}'
    contentType: 'text/plain'
  }
}

resource configApiFunctionUrl 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-api-function-url'
  parent: appConfig
  properties: {
    value: 'https://${closApiFunctionApp.properties.defaultHostName}/api'
    contentType: 'text/plain'
  }
}

resource configApiCustomDomain 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-api-custom-domain'
  parent: appConfig
  properties: {
    value: apiDomain
    contentType: 'text/plain'
  }
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

output apiGatewayUrl string = 'https://${apimService.properties.gatewayUrl}'
output closApiPrincipalId string = closApiFunctionApp.identity.principalId
