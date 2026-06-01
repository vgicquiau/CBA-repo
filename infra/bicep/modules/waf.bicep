targetScope = 'resourceGroup'

// ─── Parameters ───────────────────────────────────────────────────────────────

@description('Deployment stage')
@allowed(['dev', 'prod'])
param stage string

@description('APIM gateway URL (origin for Front Door, e.g. https://clos-apim-dev.azure-api.net)')
param apimGatewayUrl string

@description('App Configuration store name')
param appConfigName string

@description('Short suffix appended to resource names to avoid collisions (lowercase alphanumeric, no hyphens)')
param nameSuffix string = ''

@description('Enable OWASP + BotManager managed rule sets — requires Premium_AzureFrontDoor SKU. Set false in sandbox to keep Standard SKU (no managed rules, WAF custom rules only).')
param enableManagedWafRules bool = true

// ─── Computed names ───────────────────────────────────────────────────────────

var kebabSuffix = empty(nameSuffix) ? '' : '-${nameSuffix}'

// Standard supports custom rules only. Premium adds OWASP managed rule sets.
var afdSku = enableManagedWafRules ? 'Premium_AzureFrontDoor' : 'Standard_AzureFrontDoor'

// ─── App Configuration reference ─────────────────────────────────────────────

resource appConfig 'Microsoft.AppConfiguration/configurationStores@2023-03-01' existing = {
  name: appConfigName
}

// ─── WAF Policy ───────────────────────────────────────────────────────────────
// Prevention mode: blocks requests matching OWASP rules (no Detection-only drift).
// Microsoft_DefaultRuleSet 2.1 covers OWASP Top 10.
// Microsoft_BotManagerRuleSet 1.0 covers bot scraping and credential stuffing.

resource wafPolicy 'Microsoft.Network/frontDoorWebApplicationFirewallPolicies@2022-05-01' = {
  name: 'closWaf${stage}${nameSuffix}'
  location: 'global'
  sku: {
    name: afdSku
  }
  properties: {
    policySettings: {
      mode: 'Prevention'
      enabledState: 'Enabled'
      requestBodyCheck: 'Enabled'
    }
    managedRules: enableManagedWafRules ? {
      managedRuleSets: [
        {
          ruleSetType: 'Microsoft_DefaultRuleSet'
          ruleSetVersion: '2.1'
          ruleSetAction: 'Block'
        }
        {
          ruleSetType: 'Microsoft_BotManagerRuleSet'
          ruleSetVersion: '1.0'
        }
      ]
    } : {}
  }
}

// ─── Azure Front Door Standard ────────────────────────────────────────────────
// Front Door sits in front of APIM (Consumption tier) and provides:
//   - WAF OWASP + Bot protection in Prevention mode
//   - DDoS protection (included in Standard tier)
//   - Service tag AzureFrontDoor.Backend for restricting Function App ingress
// Post-deployment: update api.bicep ipSecurityRestrictions to use
// AzureFrontDoor.Backend service tag instead of APIM IP-based rule.

resource frontDoorProfile 'Microsoft.Cdn/profiles@2023-05-01' = {
  name: 'clos-afd-${stage}${kebabSuffix}'
  location: 'global'
  sku: {
    name: afdSku
  }
}

resource frontDoorEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-05-01' = {
  name: 'clos-api-${stage}${kebabSuffix}'
  parent: frontDoorProfile
  location: 'global'
  properties: {
    enabledState: 'Enabled'
  }
}

resource frontDoorOriginGroup 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = {
  name: 'apim-origin-group'
  parent: frontDoorProfile
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/v1/health'
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 30
    }
    sessionAffinityState: 'Disabled'
  }
}

var apimHost = replace(replace(apimGatewayUrl, 'https://', ''), '/', '')

resource frontDoorOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = {
  name: 'apim-origin'
  parent: frontDoorOriginGroup
  properties: {
    hostName: apimHost
    httpPort: 80
    httpsPort: 443
    originHostHeader: apimHost
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
    enforceCertificateNameCheck: true
  }
}

resource frontDoorRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = {
  name: 'api-route'
  parent: frontDoorEndpoint
  dependsOn: [frontDoorOrigin]
  properties: {
    originGroup: {
      id: frontDoorOriginGroup.id
    }
    supportedProtocols: ['Https']
    patternsToMatch: ['/*']
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
    enabledState: 'Enabled'
  }
}

// ─── Security policy — attach WAF to Front Door endpoint ─────────────────────

resource frontDoorSecurityPolicy 'Microsoft.Cdn/profiles/securityPolicies@2023-05-01' = {
  name: 'waf-policy'
  parent: frontDoorProfile
  properties: {
    parameters: {
      type: 'WebApplicationFirewall'
      wafPolicy: {
        id: wafPolicy.id
      }
      associations: [
        {
          domains: [
            { id: frontDoorEndpoint.id }
          ]
          patternsToMatch: ['/*']
        }
      ]
    }
  }
}

// ─── App Configuration entries ────────────────────────────────────────────────

resource configAfdEndpoint 'Microsoft.AppConfiguration/configurationStores/keyValues@2023-03-01' = {
  name: 'clos-${stage}-waf-afd-endpoint'
  parent: appConfig
  properties: {
    value: 'https://${frontDoorEndpoint.properties.hostName}'
    contentType: 'text/plain'
  }
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

output frontDoorEndpointHostName string = frontDoorEndpoint.properties.hostName
output frontDoorProfileId string = frontDoorProfile.id
output wafPolicyId string = wafPolicy.id
