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

@description('Admin email address for operational alerts')
param adminEmail string

// ─── Existing references ──────────────────────────────────────────────────────

resource appConfig 'Microsoft.AppConfiguration/configurationStores@2023-03-01' existing = {
  name: appConfigName
}

// ─── Log Analytics Workspace ──────────────────────────────────────────────────
// Replaces CloudWatch Log Groups — single workspace for all Function logs.

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'clos-logs-${stage}'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: logRetentionDays
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ─── Application Insights ─────────────────────────────────────────────────────
// Workspace-based: logs unified in Log Analytics for KQL queries.
// Replaces X-Ray + CloudWatch Metrics — traces APIM → Function with correlation.

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'clos-insights-${stage}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    RetentionInDays: logRetentionDays
  }
}

// ─── Action Group — email admin on ops alerts ─────────────────────────────────
// Replaces CloudWatch Alarm → SNS topic → email subscription.

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'clos-ops-${stage}'
  location: 'global'
  properties: {
    groupShortName: 'clos-ops'
    enabled: true
    emailReceivers: [
      {
        name: 'admin-email'
        emailAddress: adminEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

// ─── Alert Rule — 5+ failed requests in 5 minutes ────────────────────────────
// Queries Application Insights requests table (success == false).
// Fires at severity 2 (Warning) → triggers action group email.

resource errorAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: 'clos-error-rate-${stage}'
  location: location
  kind: 'LogAlert'
  properties: {
    displayName: '[${stage}] High error rate — clos-bon-accueil'
    description: 'Fires when 5 or more failed requests occur within a 5-minute window'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [appInsights.id]
    targetResourceTypes: ['microsoft.insights/components']
    criteria: {
      allOf: [
        {
          query: 'requests | where success == false'
          timeAggregation: 'Count'
          threshold: 5
          operator: 'GreaterThanOrEqual'
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [actionGroup.id]
      customProperties: {}
    }
    autoMitigate: true
    checkWorkspaceAlertsStorageConfigured: false
  }
}

// ─── App Configuration entries ────────────────────────────────────────────────

resource configInsightsConnectionString 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-monitoring-insights-connection-string'
  parent: appConfig
  properties: {
    value: appInsights.properties.ConnectionString
    contentType: 'text/plain'
  }
}

resource configLogAnalyticsWorkspaceId 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-monitoring-log-analytics-workspace-id'
  parent: appConfig
  properties: {
    value: logAnalyticsWorkspace.id
    contentType: 'text/plain'
  }
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id
output appInsightsId string = appInsights.id
