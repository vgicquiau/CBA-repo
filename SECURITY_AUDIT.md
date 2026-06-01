# Audit de sécurité — CBA Application
**Date** : 2026-05-29  
**Auditeur** : Claude Code (AppSec Audit)  
**Périmètre** : Intégralité du repo CBA-repo (backend, frontend, infra Bicep, CI/CD)

---

## Synthèse exécutive

| Sévérité | Nombre |
|---|---|
| CRITIQUE | 3 |
| ÉLEVÉE | 6 |
| MOYENNE | 8 |
| FAIBLE | 4 |
| **Total** | **21** |

**L'application ne doit pas être exposée sur internet en l'état.** Trois vulnérabilités critiques rendent l'architecture de sécurité fondamentalement inefficace avant même d'atteindre les couches applicatives. La première — et la plus grave — est l'absence totale d'isolation réseau sur les Function Apps : puisque toutes les routes sont déclarées `authLevel: 'anonymous'` (la validation JWT étant déléguée à APIM), n'importe qui connaissant l'URL prévisible `clos-api-{stage}.azurewebsites.net` peut appeler l'API sans token, forger l'identité de n'importe quel utilisateur, et accéder aux endpoints admin. La deuxième est un webhook Entra (`auth-post-confirmation`) sans aucune validation de l'appelant, accessible directement sur `clos-jobs-{stage}.azurewebsites.net`, permettant la création arbitraire d'utilisateurs dans la base de données. La troisième est l'usage de clés de compte de stockage en clair dans les app settings des Function Apps, exposant des credentials Azure dans l'historique ARM. Les surfaces d'attaque les plus préoccupantes sont : (1) le bypass complet de l'architecture APIM via les URLs `.azurewebsites.net`, (2) l'absence de WAF sur APIM Consumption qui n'offre aucune protection OWASP, et (3) des RBAC assignments trop larges (Storage Blob Contributor et Service Bus Sender scopés au Resource Group entier). Quatre findings sont des blockers absolus de mise en production (SEV-001, SEV-002, SEV-003, SEV-004).

---

## Findings détaillés

---

### [SEV-001] Function Apps accessibles directement : bypass complet de l'architecture APIM

**Sévérité** : CRITIQUE  
**Catégorie** : Authentification / Infrastructure  
**Localisation** : `infra/bicep/modules/api.bicep` lignes 101–168 (closApiFunctionApp) + `backend/src/api/http.ts` lignes 41–63 (decodeJwtPayload, getCurrentUserId)

**Description**  
Toute la sécurité backend repose sur APIM : c'est lui qui valide le JWT, applique le rate-limit, et injecte l'identité via le header `X-Forwarded-User`. Les 29 handlers sont déclarés `authLevel: 'anonymous'` et le backend ne vérifie jamais la signature du JWT (commentaire explicite ligne 42–43 : "We decode (not verify) to extract claims — trust is established by APIM"). Or, les Function Apps `clos-api-{stage}` et `clos-jobs-{stage}` ne définissent aucune restriction IP (`ipSecurityRestrictions` absente du `siteConfig`) et sont accessibles directement via leur URL Azure prévisible : `https://clos-api-dev.azurewebsites.net/api/<route>`. Un attaquant peut appeler n'importe quelle route sans token, et en ajoutant un header `X-Forwarded-User: <JWT_forgé>` avec `oid` et `roles: ["admin"]` arbitraires dans le payload base64, se faire passer pour n'importe quel utilisateur avec n'importe quel rôle. Cette vulnérabilité annule intégralement APIM, le rate-limit, le CORS, et la validation JWT.

**Preuve**  
```typescript
// backend/src/api/http.ts:44-62
// "APIM validates the JWT and forwards it via X-Forwarded-User header.
//  We decode (not verify) to extract claims — trust is established by APIM."
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) throw new ForbiddenError('Invalid token format');
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new ForbiddenError('Cannot decode token');
  }
}

// Aucune restriction IP dans la Bicep :
// infra/bicep/modules/api.bicep:112-168
// siteConfig: { ... } — pas de ipSecurityRestrictions
```

Exemple d'exploitation (appel direct sans passer par APIM) :
```bash
# Payload forgé : {"oid":"any-user-id","roles":["admin"]}
FORGED=$(echo -n '{"oid":"target-user-oid","roles":["admin"]}' | base64 -w0)
curl https://clos-api-prod.azurewebsites.net/api/admin/users \
  -H "X-Forwarded-User: header.${FORGED}.sig"
# Retourne la liste complète des utilisateurs — aucune validation
```

**Remédiation recommandée**  
Ajouter des restrictions IP dans la Bicep pour limiter l'accès aux Function Apps aux seules IPs APIM Consumption. Pour APIM Consumption, les IPs sortantes sont fournies par la propriété `apimService.properties.publicIPAddresses`.

```bicep
// infra/bicep/modules/api.bicep — dans siteConfig de closApiFunctionApp
siteConfig: {
  linuxFxVersion: 'Node|20'
  ipSecurityRestrictions: [
    {
      // APIM Consumption outbound IPs — récupérer après premier déploiement APIM :
      // az apim show --name clos-apim-${stage} --resource-group rg-clos-bon-accueil-${stage}
      //   --query "publicIpAddresses"
      ipAddress: apimService.properties.publicIPAddresses[0]
      action: 'Allow'
      priority: 100
      name: 'allow-apim'
    }
    {
      ipAddress: 'Any'
      action: 'Deny'
      priority: 2147483647
      name: 'deny-all'
    }
  ]
  ipSecurityRestrictionsDefaultAction: 'Deny'
  // ...
}
```

Alternative plus robuste : activer VNet Integration sur APIM (nécessite APIM Developer/Premium) et placer les Function Apps en accès privé. Pour le tier Consumption actuel, la restriction IP est le seul mécanisme disponible.

---

### [SEV-002] Webhook auth-post-confirmation sans validation de l'appelant

**Sévérité** : CRITIQUE  
**Catégorie** : Authentification  
**Localisation** : `backend/src/handlers/auth-post-confirmation.ts` lignes 8–66

**Description**  
Le webhook Entra External ID `POST /auth/post-confirmation` est déployé sur `clos-jobs-{stage}` avec `authLevel: 'anonymous'` et est **absent de la liste des opérations APIM** (`apimOperationsList`, api.bicep lignes 342–380). Il est donc accessible directement sur `clos-jobs-dev.azurewebsites.net/api/auth/post-confirmation` sans aucune protection. Le handler crée un enregistrement User dans Cosmos DB à partir du JSON reçu sans vérifier que la requête vient d'Entra. Microsoft recommande que le webhook valide le token Bearer envoyé par Entra dans le header `Authorization` (audience = Function App URL, issuer = Entra External ID tenant). En l'absence de cette validation, un attaquant peut POSTer un payload arbitraire et créer des utilisateurs dans la base de données avec n'importe quel `userId` (y compris l'OID d'un utilisateur Entra existant), polluant la base ou causant des conflits d'accès.

**Preuve**  
```typescript
// backend/src/handlers/auth-post-confirmation.ts:8-35
// Aucune validation du header Authorization
async function rawHandler(request: HttpRequest, _context: InvocationContext) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON' } };
  }
  // ... extraction directe du payload sans vérification de la source
  const userId = (data.objectId as string | undefined) ?? '';
  // ...
  await repo.createUser({
    userId,
    email: email.toLowerCase(),
    role: 'guest',         // rôle hardcodé — seule protection
    createdAt: new Date().toISOString(),
  });
}

app.http('auth-post-confirmation', {
  methods: ['POST'],
  authLevel: 'anonymous',  // aucune auth Function-level
  route: 'auth/post-confirmation',
  handler: rawHandler,     // withErrorHandling absent aussi
});
```

**Remédiation recommandée**  
Valider le token Bearer envoyé par Entra External ID. Ce token est un JWT signé par Entra avec `audience = <Function App URL>`.

```typescript
// backend/src/handlers/auth-post-confirmation.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';  // ou azure/identity

const ENTRA_TENANT_ID = process.env.ENTRA_TENANT_ID ?? '';
const ENTRA_CLIENT_ID = process.env.ENTRA_CLIENT_ID ?? ''; // audience = Function App URL ou client_id

async function validateEntraWebhookToken(request: HttpRequest): Promise<void> {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new ForbiddenError('Missing Entra webhook token');
  }
  const token = authHeader.slice(7);
  const JWKS = createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${ENTRA_TENANT_ID}/discovery/v2.0/keys`)
  );
  await jwtVerify(token, JWKS, {
    issuer: `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/v2.0`,
    audience: ENTRA_CLIENT_ID,
  });
}

// Puis dans rawHandler, première ligne :
async function rawHandler(request: HttpRequest, _context: InvocationContext) {
  await validateEntraWebhookToken(request);
  // ... suite du traitement
}
```

---

### [SEV-003] AzureWebJobsStorage utilise une clé de compte de stockage en clair

**Sévérité** : CRITIQUE  
**Catégorie** : Secrets  
**Localisation** : `infra/bicep/modules/api.bicep` ligne 119–121 + `infra/bicep/modules/notifications.bicep` ligne 172–176

**Description**  
Les deux Function Apps (`clos-api-{stage}` et `clos-jobs-{stage}`) utilisent une connection string contenant la clé de compte de stockage Azure pour `AzureWebJobsStorage`. Cette clé est récupérée via `apiStorageAccount.listKeys().keys[0].value` et injectée directement dans les app settings. Elle apparaît en clair : (1) dans l'historique de déploiement ARM accessible à tout Principal avec le rôle `Reader` sur le Resource Group, (2) dans les app settings des Function Apps visibles via Azure Portal ou `az functionapp config appsettings list`, (3) dans les sorties Bicep si un pipeline les loggue. La clé de compte permet un accès complet (lecture, écriture, suppression) à tous les blobs du compte de stockage, y compris les triggers des Functions et les checkpoints Service Bus.

**Preuve**  
```bicep
// infra/bicep/modules/api.bicep:119-121
{
  name: 'AzureWebJobsStorage'
  value: 'DefaultEndpointsProtocol=https;AccountName=${apiStorageAccount.name};AccountKey=${apiStorageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
}

// infra/bicep/modules/notifications.bicep:172-176 — même pattern pour clos-jobs
{
  name: 'AzureWebJobsStorage'
  value: 'DefaultEndpointsProtocol=https;AccountName=${jobsStorageAccount.name};AccountKey=${jobsStorageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
}
```

**Remédiation recommandée**  
Utiliser l'authentification Managed Identity pour `AzureWebJobsStorage` via le format de connexion sans clé (disponible depuis Azure Functions v4) :

```bicep
// infra/bicep/modules/api.bicep — remplacer l'app setting AzureWebJobsStorage
// 1. Supprimer le connection string avec clé
// 2. Ajouter les app settings Managed Identity :
{
  name: 'AzureWebJobsStorage__accountName'
  value: apiStorageAccount.name
}
// Le runtime Functions résoudra via DefaultAzureCredential (Managed Identity)

// 3. Assigner Storage Blob Data Owner + Storage Queue Data Contributor à la Managed Identity :
resource storageOwnerRoleApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-api-${stage}', 'storage-blob-owner')
  scope: apiStorageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions',
      'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')  // Storage Blob Data Owner
    principalId: closApiFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}
resource storageQueueRoleApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-api-${stage}', 'storage-queue-contributor')
  scope: apiStorageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions',
      '974c5e8b-45b9-4653-ba55-5f855dd0fb88')  // Storage Queue Data Contributor
    principalId: closApiFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// 4. Désactiver l'accès par clé partagée sur le Storage Account :
properties: {
  allowSharedKeyAccess: false  // était true — data.bicep:141 + à appliquer sur apiStorageAccount
  // ...
}
```

---

### [SEV-004] APIM health endpoint : JWT toujours validé malgré la policy d'override

**Sévérité** : ÉLEVÉE  
**Catégorie** : Exposition API  
**Localisation** : `infra/bicep/modules/api.bicep` lignes 405–427

**Description**  
Le handler `health.ts` est déclaré `authLevel: 'anonymous'` avec l'intention d'être un endpoint public de monitoring. La policy d'opération APIM `health-get` tente de bypasser la validation JWT avec un `<set-variable name="skipJwtValidation">`. Ce mécanisme est inefficace : APIM évalue les policies en ordre, et `<base />` (ligne 412) exécute la policy API-level (`validate-jwt`) **avant** que la variable soit définie. Le endpoint `/v1/health` retourne 401 en production sans JWT valide. Conséquence opérationnelle : les outils de monitoring (uptime checks) ne peuvent pas appeler ce endpoint sans token, masquant potentiellement une panne réelle derrière un faux 401. Conséquence sécurité : la confusion entre `authLevel: 'anonymous'` (Function) et le comportement réel (401 via APIM) reflète une incompréhension du modèle de sécurité, symptôme du problème plus large de SEV-001.

**Preuve**  
```bicep
// infra/bicep/modules/api.bicep:410-427
value: '''<policies>
  <inbound>
    <base />  // ← exécute validate-jwt de la policy API-level EN PREMIER
    <!-- Override: skip JWT validation for health check -->
    <set-variable name="skipJwtValidation" value="true" />
    // ↑ Cette variable n'a AUCUN effet sur validate-jwt déjà exécuté
  </inbound>
  ...
</policies>'''
```

**Remédiation recommandée**  
Supprimer `<base />` de la section inbound de la policy health-get et déclarer explicitement uniquement le rate-limit :

```bicep
value: '''<policies>
  <inbound>
    <!-- Pas de <base /> : on ne veut PAS hériter de validate-jwt -->
    <rate-limit-by-key calls="20" renewal-period="1"
      counter-key="@(context.Request.IpAddress)"
      increment-condition="@(context.Response.StatusCode &lt; 500)" />
    <!-- Pas de CORS sur health — pas de navigateur qui appelle ce endpoint -->
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
```

---

### [SEV-005] disableLocalAuth: false sur Cosmos DB + fallback COSMOS_KEY dans le code

**Sévérité** : ÉLEVÉE  
**Catégorie** : Secrets / Infrastructure  
**Localisation** : `infra/bicep/modules/data.bicep` ligne 63 + `backend/src/data/repository.cosmos.ts` lignes 55–61

**Description**  
L'accès à Cosmos DB par clé maîtresse (`disableLocalAuth: false`) est laissé activé, et le code de création du client Cosmos contient un fallback explicite sur `COSMOS_KEY` si cette variable d'environnement est présente. Si un développeur ou une automation injecte accidentellement `COSMOS_KEY` dans les app settings (depuis un copier-coller de test local, un script de seed, etc.), le client basculera silencieusement sur la clé maîtresse au lieu de Managed Identity. L'accès par clé maîtresse contourne les audit logs RBAC et donne accès à toutes les données du compte (cross-database).

**Preuve**  
```typescript
// backend/src/data/repository.cosmos.ts:55-61
function buildClient(): CosmosClient {
  const endpoint = process.env.COSMOS_ENDPOINT ?? 'https://localhost:8081';
  if (process.env.COSMOS_KEY) {
    // Si COSMOS_KEY est défini (accidentellement ou non), utilise la clé maîtresse
    return new CosmosClient({ endpoint, key: process.env.COSMOS_KEY });
  }
  return new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
}
```

```bicep
// infra/bicep/modules/data.bicep:63
disableLocalAuth: false  // Clé partagée Cosmos DB NON désactivée
```

**Remédiation recommandée**  
```bicep
// infra/bicep/modules/data.bicep — activer RBAC-only
properties: {
  disableLocalAuth: true  // Force RBAC — clé maîtresse désactivée
  // ...
}
```

```typescript
// backend/src/data/repository.cosmos.ts — supprimer le fallback clé
function buildClient(): CosmosClient {
  const endpoint = process.env.COSMOS_ENDPOINT;
  if (!endpoint) throw new Error('COSMOS_ENDPOINT environment variable is required');
  return new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
}
```

---

### [SEV-006] RBAC trop large : Storage Blob Contributor et Service Bus Sender scopés au Resource Group

**Sévérité** : ÉLEVÉE  
**Catégorie** : Infrastructure  
**Localisation** : `infra/bicep/modules/api.bicep` lignes 183–209

**Description**  
Deux RBAC assignments de `clos-api-{stage}` utilisent `scope: resourceGroup()` au lieu d'être scopés à la ressource cible. `Storage Blob Data Contributor` sur le Resource Group donne à la Function App des droits lecture/écriture/suppression sur **tous** les comptes de stockage du RG (y compris `closjobsfn{stage}` et `closapifn{stage}` — les stockages internes des Function Apps). `Azure Service Bus Data Sender` sur le Resource Group permet d'envoyer des messages à **tout** topic Service Bus du RG. En cas de compromission de la Managed Identity de `clos-api`, l'impact est amplifié.

**Preuve**  
```bicep
// infra/bicep/modules/api.bicep:197-209
resource blobContributorRoleApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: resourceGroup()  // ← trop large, devrait être scopé au container 'photos'
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions',
      'ba92f5b4-2d11-453d-a403-e96b0029c9fe')  // Storage Blob Data Contributor
    principalId: closApiFunctionApp.identity.principalId
  }
}

// infra/bicep/modules/api.bicep:183-195
resource sbSenderRoleApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: resourceGroup()  // ← trop large, devrait être scopé au topic SB
  // ...
}
```

**Remédiation recommandée**  
```bicep
// Scoper au storage account cible uniquement (ou au container)
resource dataStorageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: 'closstorage${stage}'
}
resource blobContributorRoleApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: dataStorageAccount  // ← scope réduit au storage account photos
  // ...
}

// Scoper au topic Service Bus
resource serviceBusTopic 'Microsoft.ServiceBus/namespaces/topics@2022-10-01-preview' existing = {
  name: '${serviceBusNamespaceName}/clos-notifications-${stage}'
}
resource sbSenderRoleApi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: serviceBusTopic  // ← scope réduit au topic
  // ...
}
```

---

### [SEV-007] ACS Email : rôle Contributor assigné à clos-jobs (trop permissif)

**Sévérité** : ÉLEVÉE  
**Catégorie** : Infrastructure  
**Localisation** : `infra/bicep/modules/notifications.bicep` lignes 303–315

**Description**  
La Function App `clos-jobs-{stage}` se voit assigner le rôle `Contributor` (GUID `b24988ac-6180-42a0-ab88-20f7382dd24c`) sur la ressource Azure Communication Services. Le rôle `Contributor` est un rôle de gestion (control plane) qui permet de modifier la configuration du service ACS — y compris créer/supprimer des domaines email, modifier les politiques d'envoi, et gérer les clés d'accès. Pour envoyer des emails via Managed Identity, le rôle nécessaire est uniquement `Communication Services Email Sender` (data plane). En cas de compromission de `clos-jobs`, un attaquant pourrait reconfigurer le service ACS pour exfiltrer les emails vers un domaine tiers.

**Preuve**  
```bicep
// infra/bicep/modules/notifications.bicep:303-315
resource acsContributorRoleJobs 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acsCommunication
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions',
      'b24988ac-6180-42a0-ab88-20f7382dd24c')  // Contributor — trop large
    principalId: closJobsFunctionApp.identity.principalId
  }
}
```

**Remédiation recommandée**  
```bicep
// Remplacer par le rôle data plane spécifique à l'envoi d'emails ACS
resource acsEmailSenderRoleJobs 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, 'clos-jobs-${stage}', 'acs-email-sender')
  scope: acsCommunication
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions',
      'b9a7eb27-f8ce-4e22-8edf-e40f1b79e8d2')  // Communication Services Email Sender
    principalId: closJobsFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}
```

---

### [SEV-008] Absence de WAF — aucune protection OWASP sur les endpoints exposés

**Sévérité** : ÉLEVÉE  
**Catégorie** : Exposition API  
**Localisation** : `infra/bicep/modules/api.bicep` lignes 229–231 (commentaire)

**Description**  
APIM Consumption tier ne propose aucune protection WAF (Web Application Firewall). Le commentaire Bicep l'indique explicitement : "Full WAF requires Azure Front Door". Il n'y a ni Azure Front Door, ni Azure Application Gateway avec WAF, ni DDoS Protection Standard. L'API est donc exposée sans protection contre les attaques OWASP Top 10 automatisées : scan de vulnérabilités, fuzzing des paramètres, attaques de force brute multi-IP (le rate-limit 100 req/s/IP ne protège pas d'une attaque distribuée). Pour une application de réservation exposée sur internet, c'est un risque de sécurité et de disponibilité.

**Preuve**  
```bicep
// infra/bicep/modules/api.bicep:229-231
// WAF: APIM built-in rate limiting + OWASP rules emulated via policies.
//   Full WAF requires Azure Front Door (upgrade path if needed post-PM1).
// ↑ Aucun WAF déployé — ce commentaire documente un manque accepté mais non corrigé
```

**Remédiation recommandée**  
Ajouter Azure Front Door Standard devant APIM avec WAF policy en mode Prevention :

```bicep
resource frontDoor 'Microsoft.Cdn/profiles@2023-05-01' = {
  name: 'clos-afd-${stage}'
  location: 'global'
  sku: { name: 'Standard_AzureFrontDoor' }
}

resource wafPolicy 'Microsoft.Network/frontDoorWebApplicationFirewallPolicies@2022-05-01' = {
  name: 'closWaf${stage}'
  location: 'global'
  sku: { name: 'Standard_AzureFrontDoor' }
  properties: {
    policySettings: {
      mode: 'Prevention'  // Pas Detection — mode prévention dès le départ
      enabledState: 'Enabled'
    }
    managedRules: {
      managedRuleSets: [
        { ruleSetType: 'Microsoft_DefaultRuleSet', ruleSetVersion: '2.1' }
        { ruleSetType: 'Microsoft_BotManagerRuleSet', ruleSetVersion: '1.0' }
      ]
    }
  }
}
```

---

### [SEV-009] Aucun header de sécurité HTTP sur les réponses API et frontend

**Sévérité** : MOYENNE  
**Catégorie** : Exposition API / Frontend  
**Localisation** : `backend/src/api/http.ts` lignes 16–38 + `infra/bicep/modules/api.bicep` lignes 288–334 (policy outbound)

**Description**  
Les helpers de réponse (`ok()`, `created()`, `errorResponse()`) ne définissent aucun header de sécurité. La policy outbound APIM ne les ajoute pas non plus. Manquent sur les réponses API : `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `Cache-Control: no-store` sur les endpoints retournant des données personnelles. Le SPA frontend servi via CDN n'a pas non plus de `Content-Security-Policy` injectée (les delivery rules CDN dans `data.bicep` n'en définissent pas).

**Preuve**  
```typescript
// backend/src/api/http.ts:16-18
export function ok<T>(body: T): HttpResponseInit {
  return { status: 200, jsonBody: body };
  // Aucun header de sécurité — ni HSTS, ni X-Content-Type-Options
}
```

```bicep
// infra/bicep/modules/api.bicep:323-332
<outbound>
  <base />
  <!-- Aucun set-header de sécurité -->
</outbound>
```

**Remédiation recommandée**  
Ajouter les headers dans la policy outbound APIM (couvre toutes les réponses API) :

```xml
<outbound>
  <base />
  <set-header name="X-Content-Type-Options" exists-action="override">
    <value>nosniff</value>
  </set-header>
  <set-header name="X-Frame-Options" exists-action="override">
    <value>DENY</value>
  </set-header>
  <set-header name="Strict-Transport-Security" exists-action="override">
    <value>max-age=31536000; includeSubDomains</value>
  </set-header>
  <set-header name="Referrer-Policy" exists-action="override">
    <value>strict-origin-when-cross-origin</value>
  </set-header>
  <set-header name="Cache-Control" exists-action="override">
    <value>no-store</value>
  </set-header>
</outbound>
```

Pour le SPA, ajouter une delivery rule CDN dans `data.bicep` pour injecter un header `Content-Security-Policy` sur toutes les réponses du endpoint `clos-cdn-web-{stage}`.

---

### [SEV-010] Pas de validation sémantique des dates (start < end, dates passées, dates valides)

**Sévérité** : MOYENNE  
**Catégorie** : Injection / Validation  
**Localisation** : `backend/src/handlers/bookings-create.ts` lignes 10–16 + `backend/src/handlers/admin-bookings-create.ts` lignes 10–17

**Description**  
Les schemas Zod valident le format des dates (`/^\d{4}-\d{2}-\d{2}$/`) mais pas leur validité sémantique. Trois cas non couverts : (1) `start >= end` — une réservation avec start après end passe la validation et s'insère dans Cosmos DB, créant des données corrompues qui ne conflictuent jamais avec rien ; (2) dates dans le passé non bloquées — un guest peut réserver une chambre pour une date passée ; (3) dates calendrier invalides (`2026-02-30`) passent le regex. Ces données corrompues faussent les KPIs du dashboard admin et la réconciliation.

**Preuve**  
```typescript
// backend/src/handlers/bookings-create.ts:10-16
const BodySchema = z.object({
  roomId: z.string().min(1),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),  // format OK, sémantique non vérifiée
  end:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),  // pas de contrainte start < end
  people: z.number().int().min(1),
  name:  z.string().min(1),
  notes: z.string().default(''),
  // Pas de .refine() pour start < end
});
```

**Remédiation recommandée**  
```typescript
import { isValid, parseISO, isBefore, isAfter } from 'date-fns'; // ou dayjs
import { todayIsoInAppTz } from '@clos/shared-types';

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (d) => isValid(parseISO(d)),
  { message: 'Invalid calendar date' }
);

const BodySchema = z.object({
  roomId: z.string().min(1).max(100),
  start:  DateSchema,
  end:    DateSchema,
  people: z.number().int().min(1).max(20),
  name:   z.string().min(1).max(200),
  notes:  z.string().max(2000).default(''),
}).refine(
  (data) => data.start < data.end,
  { message: 'start must be before end', path: ['end'] }
).refine(
  (data) => data.start >= todayIsoInAppTz(),
  { message: 'start cannot be in the past', path: ['start'] }
);
```

---

### [SEV-011] admin-users-delete : utilisateur non supprimé de Cosmos DB

**Sévérité** : MOYENNE  
**Catégorie** : Authentification  
**Localisation** : `backend/src/handlers/admin-users-delete.ts` lignes 7–17

**Description**  
Le handler `DELETE /admin/users/{userId}` lit l'utilisateur depuis Cosmos DB, log l'action, et retourne `{ deletedUserId }` — sans jamais appeler de méthode de suppression. L'interface `Repository` (`repository.ts`) ne définit pas de méthode `deleteUser`. Conséquence : l'utilisateur reste actif en Cosmos DB après "suppression". Si son compte Entra est révoqué mais pas l'enregistrement Cosmos, des références à cet utilisateur (BookingRefs) subsistent et causent des incohérences. Conséquence RGPD : la suppression de données personnelles (email, displayName) n'est pas effective.

**Preuve**  
```typescript
// backend/src/handlers/admin-users-delete.ts:7-17
async function rawHandler(request: HttpRequest, _context: InvocationContext) {
  requireRole(request, 'admin');
  const userId = getPathParam(request, 'userId');
  const repo = getRepository();
  const user = await repo.getUser(userId);
  if (!user) throw new NotFoundError('User', userId);

  // TODO PM4: delete user from Entra External ID via Microsoft Graph API
  // ↑ Absence totale de suppression en Cosmos DB aussi

  logger.info('User deleted', { userId, email: user.email });
  return ok({ deletedUserId: userId });  // Retourne succès sans rien avoir supprimé
}
```

**Remédiation recommandée**  
```typescript
// 1. Ajouter deleteUser à l'interface Repository (repository.ts)
deleteUser(userId: string): Promise<void>;

// 2. Implémenter dans repository.cosmos.ts
async deleteUser(userId: string): Promise<void> {
  const existing = await readItem<UserDoc>(docId.user(userId), pk.user(userId));
  if (!existing) throw new NotFoundError('User', userId);
  await container.item(docId.user(userId), pk.user(userId)).delete();
},

// 3. Dans le handler, supprimer de Cosmos + annuler les bookings actifs
const bookings = await repo.listMyBookings(userId);
for (const booking of bookings) {
  await repo.deleteBooking(booking.roomId, booking.start, booking.bookingId);
}
await repo.deleteUser(userId);  // Ajouter cette ligne
// TODO: Graph API delete reste à implémenter
```

---

### [SEV-012] SAS photo upload : absence de limite de taille et de validation du type de fichier

**Sévérité** : MOYENNE  
**Catégorie** : Validation  
**Localisation** : `backend/src/handlers/admin-rooms-photo-url.ts` lignes 26–36

**Description**  
Le SAS token généré pour l'upload de photos n'impose aucune contrainte de taille maximale (`ContentLengthRange` non défini) ni de type MIME (`ContentType` non imposé). Les CORS rules dans `data.bicep` autorisent explicitement `x-ms-blob-content-type` et `x-ms-blob-type`, ce qui permet au client de déclarer n'importe quel type de contenu. Un admin peut uploader un fichier de plusieurs GB (consommation de stockage) ou un fichier non-image (PDF, exécutable) qui sera ensuite servi via le CDN avec un Content-Type arbitraire. Si un attaquant compromet un compte admin, il peut uploader des fichiers malveillants servis publiquement via le CDN.

**Preuve**  
```typescript
// backend/src/handlers/admin-rooms-photo-url.ts:26-36
const sasToken = generateBlobSASQueryParameters(
  {
    containerName: PHOTOS_CONTAINER,
    blobName: key,
    permissions: BlobSASPermissions.from({ write: true }),
    startsOn,
    expiresOn,
    // Manquant : contentType: 'image/jpeg', contentLengthRange
  },
  delegationKey,
  accountName,
).toString();
```

**Remédiation recommandée**  
```typescript
import { BlobSASPermissions, BlobSASSignatureValues } from '@azure/storage-blob';

const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const sasParams: BlobSASSignatureValues = {
  containerName: PHOTOS_CONTAINER,
  blobName: key,
  permissions: BlobSASPermissions.from({ write: true }),
  startsOn,
  expiresOn,
  contentType: 'image/jpeg',       // Force le Content-Type déclaré
  // Note : Azure Blob SAS ne supporte pas nativement ContentLengthRange.
  // Mitigation alternative : Azure Storage lifecycle policy pour quota,
  // ou validation post-upload avec une Function timer.
};
```

Compléter avec une validation post-upload : une Function timer peut vérifier les blobs uploadés, rejeter ceux dont la taille dépasse le seuil ou dont le magic bytes ne correspond pas à une image.

---

### [SEV-013] secrets: inherit expose les credentials de déploiement au workflow E2E

**Sévérité** : MOYENNE  
**Catégorie** : CI-CD  
**Localisation** : `.github/workflows/deploy-dev.yml` ligne 134 + `.github/workflows/deploy-prod.yml` ligne 136

**Description**  
Les workflows de déploiement appellent le workflow réutilisable `e2e.yml` avec `secrets: inherit`, ce qui transmet **l'intégralité** des secrets du contexte parent au workflow E2E — y compris `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (credentials de déploiement Azure), et `ENTRA_CLIENT_ID`/`ENTRA_TENANT_ID`. Le workflow `e2e.yml` n'a besoin que de `E2E_GUEST_EMAIL`, `E2E_GUEST_PASSWORD`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`. En cas de compromission du code de test Playwright (supply chain sur `@playwright/test`), tous les secrets de déploiement seraient accessibles.

**Preuve**  
```yaml
# .github/workflows/deploy-dev.yml:130-135
e2e:
  name: E2E Tests
  needs: deploy
  uses: ./.github/workflows/e2e.yml
  with:
    base-url: 'https://dev.clos-bon-accueil.fr'
  secrets: inherit  # ← Tous les secrets, y compris AZURE_CLIENT_ID et AZURE_SUBSCRIPTION_ID
```

**Remédiation recommandée**  
Passer uniquement les secrets nécessaires aux tests E2E :
```yaml
e2e:
  needs: deploy
  uses: ./.github/workflows/e2e.yml
  with:
    base-url: 'https://dev.clos-bon-accueil.fr'
  secrets:
    E2E_GUEST_EMAIL:    ${{ secrets.E2E_GUEST_EMAIL }}
    E2E_GUEST_PASSWORD: ${{ secrets.E2E_GUEST_PASSWORD }}
    E2E_ADMIN_EMAIL:    ${{ secrets.E2E_ADMIN_EMAIL }}
    E2E_ADMIN_PASSWORD: ${{ secrets.E2E_ADMIN_PASSWORD }}
```

---

### [SEV-014] Aucun scan de sécurité automatisé dans la CI (SAST, SCA)

**Sévérité** : MOYENNE  
**Catégorie** : CI-CD  
**Localisation** : `.github/workflows/pr.yml` — absence de steps de sécurité

**Description**  
Les workflows CI (`pr.yml`, `deploy-dev.yml`) n'incluent ni `npm audit`, ni scan SAST (CodeQL, Semgrep), ni Software Composition Analysis (Snyk, Dependabot alerts). Les dépendances Azure SDK avec des versions flottantes (`^`) ne sont pas auditées pour des vulnérabilités connues. Une vulnérabilité introduite par une mise à jour mineure d'une dépendance (`@azure/identity`, `@azure/msal-browser`) passerait inaperçue jusqu'au déploiement en production.

**Preuve**  
```yaml
# .github/workflows/pr.yml — aucun step de sécurité
steps:
  - run: npm ci
  - run: npm run build --workspace=shared-types
  - run: npm run lint
  - run: npm run typecheck
  - run: npm run test --workspaces --if-present
  # Manquant : npm audit --audit-level=high
  # Manquant : CodeQL analysis / Semgrep / Snyk
```

**Remédiation recommandée**  
```yaml
# Dans pr.yml, ajouter après npm ci :
- name: Security audit
  run: npm audit --audit-level=high --workspaces

# Ajouter CodeQL via l'action GitHub officielle :
- name: Initialize CodeQL
  uses: github/codeql-action/init@v3
  with:
    languages: javascript-typescript
- name: Perform CodeQL Analysis
  uses: github/codeql-action/analyze@v3
```

Ajouter aussi un fichier `.github/dependabot.yml` pour les mises à jour automatiques de dépendances.

---

### [SEV-015] Erreurs 404 exposent l'entité et l'identifiant (énumération)

**Sévérité** : MOYENNE  
**Catégorie** : Exposition API  
**Localisation** : `backend/src/api/http.ts` lignes 147–150

**Description**  
Les réponses 404 incluent l'entité manquante et son identifiant dans le corps : `{ entity: 'User', id: '<oid>' }`. Sur l'endpoint `GET /me`, si un utilisateur authentifié Entra n'a pas encore de profil Cosmos DB, il reçoit `{ entity: 'User', id: '<son-propre-oid>' }`. Cela confirme l'OID Entra dans la réponse HTTP. Plus problématique : sur `GET /bookings/{bookingId}`, une tentative sur un ID inexistant retourne `{ entity: 'Booking', id: 'BOOKING#<uuid>' }` — incluant le préfixe de clé interne Cosmos DB.

**Preuve**  
```typescript
// backend/src/api/http.ts:147-150
if (err instanceof NotFoundError) {
  return errorResponse(404, 'NOT_FOUND', err.message,
    { entity: err.entity, id: err.id });  // ← expose le type d'entité ET l'ID interne
}

// NotFoundError.message = "Booking not found: BOOKING#<uuid>"
// → expose le préfixe de clé Cosmos DB 'BOOKING#'
```

**Remédiation recommandée**  
```typescript
if (err instanceof NotFoundError) {
  // Ne jamais retourner l'ID — la réponse générique suffit
  return errorResponse(404, 'NOT_FOUND', 'Resource not found');
}
```

---

### [SEV-016] Absence de Content Security Policy sur le SPA

**Sévérité** : FAIBLE  
**Catégorie** : Frontend  
**Localisation** : `infra/bicep/modules/data.bicep` — delivery rules CDN endpoint web

**Description**  
Le SPA est servi via Azure CDN Standard from Microsoft. Les delivery rules dans `data.bicep` (règles `EnforceHTTPS` et `SpaFallback`) n'injectent pas de header `Content-Security-Policy`. Sans CSP, en cas de XSS (contenu tiers injecté via SSRF ou compromission de dépendance), le navigateur ne restreint pas l'exécution de scripts arbitraires, l'exfiltration de tokens sessionStorage, ou les requêtes cross-origin.

**Remédiation recommandée**  
Ajouter une delivery rule dans `data.bicep` pour injecter le header CSP :
```bicep
{
  name: 'SecurityHeaders'
  order: 3
  conditions: []  // S'applique à toutes les requêtes
  actions: [
    {
      name: 'ModifyResponseHeader'
      parameters: {
        typeName: 'DeliveryRuleHeaderActionParameters'
        headerAction: 'Overwrite'
        headerName: 'Content-Security-Policy'
        value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://cdn.clos-bon-accueil.fr data:; connect-src 'self' https://api.clos-bon-accueil.fr https://login.microsoftonline.com; frame-ancestors 'none'"
      }
    }
  ]
}
```

---

### [SEV-017] Versions flottantes (^) pour les librairies d'authentification et Azure SDK

**Sévérité** : FAIBLE  
**Catégorie** : Dépendances  
**Localisation** : `backend/package.json` + `frontend/package.json`

**Description**  
Les packages de sécurité critique utilisent `^` permettant des mises à jour mineures automatiques au prochain `npm install` local. Concernés : `@azure/identity ^4.4.0` (credential provider — attaque supply chain haute valeur), `@azure/msal-browser ^3.28.1` (auth frontend — manipulation du flux OAuth possible), `@azure/cosmos ^4.1.0`. Le `package-lock.json` atténue le risque en CI (`npm ci`), mais un développeur faisant `npm install` localement après une publication malveillante d'une version mineure serait exposé.

**Remédiation recommandée**  
Pour les packages d'authentification et de gestion des credentials, pinner les versions exactes :
```json
"@azure/identity": "4.4.0",
"@azure/msal-browser": "3.28.1",
"@azure/msal-react": "2.1.2"
```
Utiliser Dependabot ou Renovate pour les mises à jour contrôlées avec revue de PR.

---

### [SEV-018] admin-users-invite : userId aléatoire désynchro avec l'OID Entra

**Sévérité** : FAIBLE  
**Catégorie** : Authentification  
**Localisation** : `backend/src/handlers/admin-users-invite.ts` ligne 21

**Description**  
L'invitation d'un utilisateur génère un UUID v4 aléatoire comme `userId` au lieu de l'OID Entra réel. Quand l'utilisateur invité se connecte, son JWT contiendra son OID Entra réel, différent du UUID en base. La recherche `repo.getUser(oid)` retournera null, et l'utilisateur ne trouvera pas son profil. Le TODO ligne 19 l'indique mais le code est déployable en production dans cet état, créant des comptes fantômes inutilisables.

**Remédiation recommandée**  
Bloquer le déploiement de cet endpoint tant que l'intégration Microsoft Graph API n'est pas complète, ou remplacer par une invitation directe via Graph :
```typescript
// Appel Microsoft Graph pour inviter l'utilisateur dans Entra External ID
// et récupérer son OID avant de créer l'enregistrement Cosmos
import { Client } from '@microsoft/microsoft-graph-client';
const userId = await inviteUserViaGraph(email, displayName); // retourne l'OID Entra
```

---

### [SEV-019] Import AWS SDK résiduel dans repository.ts

**Sévérité** : FAIBLE  
**Catégorie** : Dépendances  
**Localisation** : `backend/src/data/repository.ts` ligne 1

**Description**  
L'interface `Repository` importe `DynamoDBDocumentClient` depuis `@aws-sdk/lib-dynamodb` pour le typage d'un stub factory `createRepository` jamais appelé en production. Ce package n'est pas déclaré dans `backend/package.json`. Le code ne compile correctement que si ce package est disponible transitivement. En plus de l'incohérence avec la migration Azure, du dead code non nettoyé augmente la surface d'analyse des dépendances.

**Remédiation recommandée**  
Supprimer la fonction `createRepository` et l'import DynamoDB de `repository.ts`. L'implémentation active est dans `repository.cosmos.ts`.

---

## Plan de remédiation

| Priorité | ID | Titre | Effort | Responsable |
|---|---|---|---|---|
| 1 | SEV-001 | Restriction IP sur Function Apps (bloquer accès direct) | Moyen | Infra |
| 2 | SEV-002 | Validation du token Entra sur le webhook auth-post-confirmation | Moyen | Backend |
| 3 | SEV-003 | AzureWebJobsStorage → Managed Identity (supprimer clé de compte) | Moyen | Infra |
| 4 | SEV-004 | Fix policy APIM health-get (supprimer `<base />`) | Faible | Infra |
| 5 | SEV-005 | disableLocalAuth: true sur Cosmos + supprimer fallback COSMOS_KEY | Faible | Infra + Backend |
| 6 | SEV-006 | Réduire scope RBAC Storage Blob et Service Bus Sender | Faible | Infra |
| 7 | SEV-007 | Remplacer rôle Contributor ACS par Communication Services Email Sender | Faible | Infra |
| 8 | SEV-008 | Déployer Azure Front Door + WAF policy Prevention | Élevé | Infra |
| 9 | SEV-011 | Implémenter deleteUser dans Repository et corriger admin-users-delete | Moyen | Backend |
| 10 | SEV-009 | Ajouter security headers dans policy outbound APIM | Faible | Infra |
| 11 | SEV-010 | Validation sémantique des dates (start < end, dates valides) | Faible | Backend |
| 12 | SEV-013 | Ajouter npm audit + CodeQL dans le pipeline CI | Faible | DevOps |
| 13 | SEV-012 | Contraindre SAS photo upload (taille max, content-type) | Moyen | Backend |
| 14 | SEV-015 | Masquer entity/id dans les réponses 404 | Faible | Backend |
| 15 | SEV-014 | Ajouter Dependabot + pinner les versions de sécurité | Faible | DevOps |
| 16 | SEV-016 | Content Security Policy via delivery rule CDN | Faible | Infra |
| 17 | SEV-013 | Scoper secrets: inherit dans les workflows E2E | Faible | DevOps |
| 18 | SEV-017 | Pinner les versions ^  des libs auth | Faible | Backend + Frontend |
| 19 | SEV-018 | Bloquer admin-users-invite jusqu'à intégration Graph API | Faible | Backend |
| 20 | SEV-019 | Supprimer import AWS SDK résiduel (repository.ts) | Faible | Backend |

### Blockers absolus avant mise en production

Les findings suivants **doivent être corrigés avant tout déploiement exposé sur internet** — ils annulent des couches de sécurité entières ou permettent une compromission directe :

- **SEV-001** : Sans restriction IP, l'architecture APIM est un décor. Tout le JWT validation, rate-limit et CORS est contournable en 30 secondes par quiconque connaît le pattern de nommage `clos-api-{stage}.azurewebsites.net`.
- **SEV-002** : Le webhook `auth-post-confirmation` permet à n'importe qui de créer des enregistrements utilisateur arbitraires dans Cosmos DB — directement exploitable depuis internet.
- **SEV-003** : Une clé de compte de stockage dans les app settings (visibles dans l'historique ARM) est une fuite de credential à corriger avant toute ouverture.
- **SEV-004** : Sans ce fix, aucun outil de monitoring ne peut vérifier la santé du service via l'endpoint `/health` prévu à cet effet.
- **SEV-005** : Tant que `disableLocalAuth: false` et que le fallback `COSMOS_KEY` existe, un compte de configuration erronée peut bypasser silencieusement la chaîne Managed Identity.

### Améliorations traitables dans les 30 premiers jours post-lancement

SEV-006 à SEV-019 peuvent être traités après la mise en production initiale, sans impact bloquant sur la sécurité de base — à condition que les 5 blockers ci-dessus soient corrigés. SEV-008 (WAF Azure Front Door) est recommandé avant tout lancement à trafic significatif.

---

## Ce qui était en place (défenses existantes)

Aucun élément de sécurité clairement au-dessus du standard minimal attendu n'a été identifié dans ce périmètre. Les éléments présents (Managed Identity, RBAC, TLS 1.2, PITR Cosmos DB, OIDC WIF en CI) constituent la pratique de base attendue pour une application Azure en 2026 — non des investissements de sécurité supplémentaires. Leur présence ne mérite pas d'être distinguée dans un audit dont l'objet est d'identifier ce qui manque.

---

*Rapport généré sur la base de l'exploration complète du repo. Fichier de notes brutes : `security-audit-notes.md`.*
