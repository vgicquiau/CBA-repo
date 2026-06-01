# Notes brutes d'audit — CBA Application
**Date** : 2026-05-29  
**Auditeur** : Claude Code (AppSec)

---

## 1.1 Authentification et autorisation

### Fichiers lus
- `backend/src/api/http.ts` — auth helpers
- `frontend/src/auth/AuthProvider.tsx` — MSAL init
- `frontend/src/auth/msalInstance.ts` — singleton PCA
- `frontend/src/api/client.ts` — token acquisition
- `backend/src/handlers/auth-post-confirmation.ts` — webhook Entra
- `infra/bicep/modules/api.bicep` — APIM JWT policy
- `infra/bicep/modules/auth.bicep` — config Entra

### Observations

**[OBS-1.1-A] Modèle de trust basé sur X-Forwarded-User sans isolation réseau**
`http.ts` ligne 57 : `const token = request.headers.get('x-forwarded-user')`. APIM injecte ce header après avoir validé le JWT (api.bicep ligne 319-322). Le backend ne re-vérifie pas la signature du token — il décode sans vérifier (décrit ligne 42-43 : "APIM validates the JWT and forwards it via X-Forwarded-User header. We decode (not verify) to extract claims — trust is established by APIM."). 

**Ce modèle n'est sécurisé que si toutes les requêtes passent obligatoirement par APIM.** Or les Function Apps (`clos-api-dev.azurewebsites.net`) sont accessibles directement sans passer par APIM. Un attaquant peut forger n'importe quel `X-Forwarded-User` et se faire passer pour n'importe quel utilisateur, y compris avec le rôle `admin`.

**[OBS-1.1-B] auth-post-confirmation : aucune validation de l'appelant**
`auth-post-confirmation.ts` ligne 59-66 : handler exposé sur `auth/post-confirmation`, `authLevel: 'anonymous'`. L'endpoint n'est PAS dans la liste APIM (`apimOperationsList`, api.bicep lignes 342-380) — il est déployé directement sur `clos-jobs-{stage}.azurewebsites.net/api/auth/post-confirmation`. Ce handler crée un enregistrement User dans Cosmos DB à partir du payload JSON reçu (lignes 27-35). **Aucune vérification que la requête vient d'Entra External ID.** Microsoft recommande de valider le bearer token envoyé par Entra dans le header `Authorization`. Un attaquant peut créer des users arbitraires en Cosmos DB.

Note : le rôle est hardcodé `'guest'` (ligne 34), donc pas d'escalade d'admin. Mais pollution de la base de données possible.

**[OBS-1.1-C] admin-users-delete : incomplète — user non supprimé de Cosmos DB**
`admin-users-delete.ts` lignes 16-17 : le handler lit l'user, log l'action, retourne `{ deletedUserId }`, mais n'appelle jamais de méthode de suppression. La méthode `deleteUser` n'existe pas dans l'interface `Repository` (`repository.ts`). L'user reste en Cosmos DB. Logiquement l'admin pense avoir supprimé l'user alors que ce n'est pas le cas.

**[OBS-1.1-D] admin-users-invite : userId random, désynchro avec Entra OID**
`admin-users-invite.ts` ligne 21 : `const userId = uuidv4()` au lieu de l'Entra OID réel. Quand l'utilisateur invité se connecte, son JWT contiendra l'`oid` Entra qui sera différent de ce UUID. La recherche `repo.getUser(oid)` ne trouvera rien. TODO ligne 19 signale que l'intégration Graph API est manquante.

**[OBS-1.1-E] MSAL authority non conforme Entra External ID**
`AuthProvider.tsx` ligne 77 : `https://login.microsoftonline.com/${cfg.tenantId}`. Pour Entra External ID (CIAM), l'authority recommandée est `https://<tenant>.ciamlogin.com/`. Commentaire dans `auth.bicep` ligne 72 reconnaît : "Standard Entra v2 issuer — update to Entra External ID specific URL in PM3". Non corrigé.

**[OBS-1.1-F] APIM health-get policy override inopérante (JWT toujours validé)**
`api.bicep` lignes 405-427 : la policy opération `health-get` appelle `<base />` en premier, ce qui exécute la policy API-level (`validate-jwt`). La variable `skipJwtValidation` est définie APRÈS, sans effet. `GET /v1/health` retourne 401 en production.

**[OBS-1.1-G] requireOwnership correctement implémenté**
`http.ts` ligne 87-91 : ownership check sur `booking.userId !== userId`. Fonctionne correctement pour les routes guest.

**[OBS-1.1-H] Token stocké en sessionStorage (pas localStorage)**
`AuthProvider.tsx` ligne 84 : `cacheLocation: 'sessionStorage'`. Pas de persistance cross-onglet, pas de persistence après fermeture du navigateur. Correct pour une app de gestion.

---

## 1.2 Gestion des secrets et de la configuration

### Fichiers lus
- `infra/bicep/modules/api.bicep` — app settings clos-api
- `infra/bicep/modules/notifications.bicep` — app settings clos-jobs
- `infra/bicep/main.bicep` — Key Vault, App Configuration
- `backend/src/data/repository.cosmos.ts` — Cosmos client factory
- `infra/bicep/modules/data.bicep` — Cosmos DB config
- `.gitignore` — fichiers exclus

### Observations

**[OBS-1.2-A] AzureWebJobsStorage utilise une connection string avec clé de compte**
`api.bicep` lignes 119-121 :
```
value: 'DefaultEndpointsProtocol=https;AccountName=${apiStorageAccount.name};AccountKey=${apiStorageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
```
Idem dans `notifications.bicep` lignes 172-176 pour `closjobsfn{stage}`.

La clé de compte de stockage est transmise en clair dans les app settings. Elle apparaît :
1. Dans l'historique de déploiement ARM (accessible à tout Principal ayant `Reader` sur le RG)
2. Dans les app settings du Function App (Azure Portal, `az functionapp config appsettings list`)
3. Potentiellement dans les logs ARM si un pipeline log les sorties

La solution recommandée : `AzureWebJobsStorage__accountName` + Managed Identity (sans clé).

**[OBS-1.2-B] COSMOS_KEY fallback + disableLocalAuth: false**
`repository.cosmos.ts` lignes 55-61 : si `COSMOS_KEY` est défini comme variable d'environnement, le client utilise la clé maîtresse Cosmos DB au lieu de Managed Identity. `data.bicep` ligne 63 : `disableLocalAuth: false` — l'auth par clé partagée n'est PAS désactivée sur le compte Cosmos. Combinaison : si quelqu'un injecte `COSMOS_KEY` (accidentellement ou malicieusement) dans les app settings, l'accès passe par la clé maîtresse (non traçable via RBAC audit).

**[OBS-1.2-C] allowSharedKeyAccess: true sur Storage Account**
`data.bicep` ligne 141 : `allowSharedKeyAccess: true`. Les clés de compte peuvent être utilisées directement (et elles le sont via AzureWebJobsStorage). Devrait être `false` une fois la migration AzureWebJobsStorage Managed Identity faite.

**[OBS-1.2-D] Application Insights connection string stockée en plaintext dans App Config**
`monitoring.bicep` lignes 124-130 : `configInsightsConnectionString` écrit la connection string App Insights en clair dans App Configuration. La connection string est aussi une sortie Bicep (output ligne 144). Les sorties Bicep apparaissent dans l'historique ARM. La connection string App Insights n'est pas un secret critique (ingestion seulement) mais expose le point d'ingestion et la clé d'instrumentation.

**[OBS-1.2-E] COSMOS_ENDPOINT fallback vers localhost**
`repository.cosmos.ts` ligne 56 : `?? 'https://localhost:8081'`. En cas de misconfiguration (COSMOS_ENDPOINT absent), l'app essaie de se connecter à localhost sans lever d'erreur explicite au démarrage. L'erreur surviendra seulement au premier accès à Cosmos — difficile à diagnostiquer.

**[OBS-1.2-F] .gitignore : local.settings.json ajouté (fix précédent)**
Déjà corrigé dans la session précédente. La ligne `local.settings.json` est présente dans `.gitignore`.

---

## 1.3 Validation des entrées

### Fichiers lus
- `backend/src/handlers/bookings-create.ts` — BodySchema
- `backend/src/handlers/bookings-update.ts` — BodySchema update
- `backend/src/handlers/admin-rooms-photo-url.ts` — SAS token generation
- `backend/src/data/repository.cosmos.ts` — queries Cosmos
- `backend/src/handlers/notification-dispatcher.ts` — email templates

### Observations

**[OBS-1.3-A] Pas de validation sémantique des dates (start < end)**
`bookings-create.ts` lignes 12-13 : regex `/^\d{4}-\d{2}-\d{2}$/` valide le format mais pas :
- `start < end` : une réservation avec `start: "2026-12-31"`, `end: "2026-01-01"` passe Zod
- Pas de dates dans le passé
- `2026-02-30` (date invalide) passe le regex
Idem dans `admin-bookings-create.ts`. La logique de conflit dans Cosmos ne créerait pas de conflit car l'intervalle vide ne chevauche rien, mais ce sont des données corrompues.

**[OBS-1.3-B] Pas de limite de taille sur les champs texte**
Schemas sans `.max()` : `name: z.string().min(1)`, `notes: z.string().default('')`. Un attaquant peut soumettre des champs de plusieurs MB, causant de larges documents Cosmos.

**[OBS-1.3-C] Photo upload SAS : pas de limite de taille, pas de validation content-type côté backend**
`admin-rooms-photo-url.ts` lignes 26-36 : SAS généré avec `permissions: BlobSASPermissions.from({ write: true })` sans contrainte de taille (`ContentLength` max non défini). Un admin peut uploader un fichier de n'importe quelle taille. Le content-type n'est pas validé (le header `x-ms-blob-content-type` est autorisé dans les CORS rules de `data.bicep` ligne 159). La clé blob a `.jpg` dans le nom, mais le contenu réel n'est pas vérifié.

**[OBS-1.3-D] Injection HTML dans les emails (faible risque actuel)**
`notification-dispatcher.ts` lignes 19-22 : template literals sans échappement HTML. Les valeurs `${data.bookingId}`, `${data.roomId}`, `${data.start}`, `${data.end}` sont insérées directement dans du HTML. Ces valeurs viennent de Cosmos DB (via Service Bus message). `bookingId` = UUID, `roomId` = UUID, `start`/`end` = dates ISO — formats contrôlés. Risque faible mais pattern dangereux.

**[OBS-1.3-E] Queries Cosmos DB paramétrisées correctement**
`repository.cosmos.ts` : toutes les queries utilisent des paramètres nommés (`@id`, `@from`, `@text`, `@ref`). Pas d'injection NoSQL détectée.

**[OBS-1.3-F] searchBookings : CONTAINS sur texte utilisateur**
`repository.cosmos.ts` lignes 245-255 : `searchBookings(text)` utilise `CONTAINS(LOWER(c.name), LOWER(@text))` avec le texte passé comme paramètre. Paramétrisé correctement — pas d'injection.

---

## 1.4 Sécurité HTTP et exposition des APIs

### Fichiers lus
- `backend/src/api/http.ts` — response helpers
- `infra/bicep/modules/api.bicep` — APIM policies
- `backend/host.json` — host config

### Observations

**[OBS-1.4-A] Aucun header de sécurité HTTP dans les réponses**
`http.ts` fonctions `ok()`, `created()`, `errorResponse()` : aucun header de sécurité ajouté. La policy outbound APIM (`<base />` seulement) n'ajoute rien non plus. Absents :
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Frame-Options: DENY`
- `Cache-Control: no-store` sur les endpoints sensibles
- `Referrer-Policy: strict-origin-when-cross-origin`

**[OBS-1.4-B] Pas de WAF (APIM Consumption)**
`api.bicep` ligne 229-231 : commentaire "Full WAF requires Azure Front Door". APIM Consumption n'a aucune protection WAF. Pas de protection OWASP automatique, pas de détection de bot, pas de geo-filtering.

**[OBS-1.4-C] CORS configuré correctement via APIM**
Origins whitelist dans les paramètres Bicep. `allow-credentials="false"`. Pas de wildcard.

**[OBS-1.4-D] Rate limit APIM : 100 calls/s par IP mais uniquement via APIM**
Le rate limit ne s'applique pas aux appels directs aux Function Apps (voir OBS-1.1-A). Le webhook `auth-post-confirmation` n'a aucun rate limit (bypass APIM).

**[OBS-1.4-E] Error responses exposent entity + id**
`http.ts` ligne 148 : `errorResponse(404, 'NOT_FOUND', err.message, { entity: err.entity, id: err.id })`. La réponse 404 contient l'ID de l'entité non trouvée (ex. OID Entra d'un utilisateur). Permet l'énumération d'utilisateurs si les IDs sont devinables.

**[OBS-1.4-F] withErrorHandling log l'erreur brute avec console.error**
`http.ts` ligne 165 : `console.error('[withErrorHandling] Unhandled error:', err)`. Les erreurs non gérées (incluant potentiellement des objets Cosmos DB avec info de connexion) sont loguées en entier via `console.error`, qui feed Application Insights. La valeur `err` n'est pas assainie avant logging.

---

## 1.5 Infrastructure Azure (Bicep)

### Fichiers lus
- `infra/bicep/main.bicep`
- `infra/bicep/modules/data.bicep`
- `infra/bicep/modules/api.bicep`
- `infra/bicep/modules/notifications.bicep`
- `infra/bicep/modules/monitoring.bicep`

### Observations

**[OBS-1.5-A] Function Apps accessibles directement sans restriction réseau**
Aucune `ipSecurityRestrictions` définie dans `closApiFunctionApp` (`api.bicep` lignes 101-168) ni dans `closJobsFunctionApp` (`notifications.bicep` lignes 157-232). Les URLs `*.azurewebsites.net` sont accessibles depuis n'importe quelle IP. L'architecture suppose que tout le trafic passe par APIM, mais rien ne l'impose au niveau réseau.

**[OBS-1.5-B] Cosmos DB : accès réseau public non restreint**
`data.bicep` : pas de `publicNetworkAccess: 'Disabled'`, pas d'IP firewall rules, pas de Private Endpoint. `networkAclBypass: 'AzureServices'` (ligne 78) permet aux services Azure d'accéder sans restriction IP, mais n'empêche pas les accès depuis internet si quelqu'un a la clé maîtresse (qui n'est pas désactivée).

**[OBS-1.5-C] Pas de Private Endpoints**
Cosmos DB, Storage Account, Service Bus, App Configuration, Key Vault — tous accessibles sur réseau public. Seule la couche auth (Managed Identity + RBAC) protège. Pas d'isolation réseau.

**[OBS-1.5-D] Application Insights : publicNetworkAccessForIngestion: 'Enabled'**
`monitoring.bicep` lignes 41-44 : n'importe qui avec la connection string (qui est en App Configuration en plaintext) peut envoyer de fausses données de télémétrie à Application Insights. Cela pourrait polluer les métriques d'alerte.

**[OBS-1.5-E] ACS rôle Contributor assigné à clos-jobs**
`notifications.bicep` lignes 303-315 : `Contributor` (b24988ac-6180-42a0-ab88-20f7382dd24c) assigné sur la resource ACS Communication. Le rôle `Contributor` est bien trop large (permet de modifier la configuration du service, pas seulement d'envoyer des emails). Le bon rôle est `Azure Communication Services Contributor` ou spécifiquement `Communication Services Email Sender`.

**[OBS-1.5-F] Service Bus Standard : pas de TLS minimum configuré**
`notifications.bicep` ligne 51-60 : pas de propriété `minimumTlsVersion`. Service Bus Standard utilise TLS 1.2 par défaut depuis 2021, mais pas explicitement déclaré.

**[OBS-1.5-G] RBAC clos-api : Storage Blob Data Contributor sur le RG entier**
`api.bicep` lignes 197-209 : `blobContributorRoleApi` est assigné `scope: resourceGroup()`. Cela donne à `clos-api` des droits lecture/écriture/suppression sur TOUS les blobs du resource group, pas seulement le container `photos`. Devrait être scopé au storage account ou au container.

**[OBS-1.5-H] RBAC clos-api : Service Bus Data Sender sur le RG entier**
`api.bicep` lignes 183-195 : `sbSenderRoleApi` est assigné `scope: resourceGroup()`. Devrait être scopé au namespace ou au topic Service Bus.

---

## 1.6 Sécurité frontend

### Fichiers lus
- `frontend/src/auth/AuthProvider.tsx`
- `frontend/src/api/client.ts`
- `frontend/src/config.ts`
- `frontend/vite.config.ts`

### Observations

**[OBS-1.6-A] Aucune CSP configurée**
`frontend/vite.config.ts` : pas de plugin CSP. Les CDN delivery rules dans `data.bicep` n'injectent pas de header `Content-Security-Policy`. Sans CSP, tout script injecté (XSS) peut exécuter du code arbitraire, accéder aux tokens MSAL en sessionStorage.

**[OBS-1.6-B] console.error en prod dans AuthProvider**
`AuthProvider.tsx` ligne 89 : `console.error('[AuthProvider] MSAL initialization failed:', err)`. En production, les erreurs d'init MSAL (incluant les détails de config) sont visibles dans la console du navigateur.

**[OBS-1.6-C] putExternal : aucune validation de l'URL cible**
`client.ts` lignes 83-85 : la méthode `putExternal(url, file)` accepte n'importe quelle URL sans vérifier que c'est un domaine Azure Blob. En théorie, si un attaquant pouvait intercepter ou modifier la réponse de l'API (`uploadUrl`), le fichier serait uploadé vers un serveur tiers. Faible probabilité, mais absence de validation.

**[OBS-1.6-D] sourcemap: false en production**
`vite.config.ts` ligne 10 : `sourcemap: false`. Correct — pas de source maps exposées.

**[OBS-1.6-E] Pas de dangerouslySetInnerHTML détecté**
Recherche non exhaustive, mais les fichiers frontend lus ne montrent pas d'usage de `dangerouslySetInnerHTML`.

---

## 1.7 CI/CD

### Fichiers lus
- `.github/workflows/pr.yml`
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/deploy-prod.yml`
- `.github/workflows/e2e.yml`

### Observations

**[OBS-1.7-A] Pas de npm audit dans la CI**
Aucun step `npm audit` ou outil de SAST (Snyk, CodeQL, Semgrep) dans aucun des 4 workflows. Les dépendances vulnérables ne sont pas détectées automatiquement.

**[OBS-1.7-B] permissions: id-token: write au niveau workflow (trop large)**
`pr.yml` lignes 7-9 : `permissions: id-token: write` au niveau du workflow. Les deux jobs (`lint-typecheck-test` et `validate-bicep`) héritent de cette permission. Seul `validate-bicep` en a besoin. `lint-typecheck-test` n'a pas besoin de tokens OIDC Azure.

**[OBS-1.7-C] secrets: inherit passe tous les secrets au workflow e2e**
`deploy-dev.yml` ligne 134, `deploy-prod.yml` ligne 136 : `secrets: inherit`. Le workflow E2E hérite de TOUS les secrets du parent, y compris `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` — credentials de déploiement inutiles pour les tests E2E.

**[OBS-1.7-D] Pas de scan SAST (CodeQL, Semgrep)**
Aucune analyse statique de sécurité dans le pipeline. OWASP Top 10 vulnérabilités potentielles dans le code ne sont pas scannées automatiquement.

**[OBS-1.7-E] OIDC WIF correctement implémenté**
`azure/login@v2` avec `client-id`, `tenant-id`, `subscription-id`. Pas de service principal avec secret statique. Correct.

---

## 1.8 Dépendances et supply chain

### Fichiers lus
- `backend/package.json`
- `frontend/package.json`
- `package.json` (root)

### Observations

**[OBS-1.8-A] Dépendances Azure SDK avec versions flottantes (^)**
Backend : `@azure/communication-email: ^1.0.0`, `@azure/cosmos: ^4.1.0`, `@azure/functions: ^4.5.0`, `@azure/identity: ^4.4.0`, `@azure/service-bus: ^7.9.0`, `@azure/storage-blob: ^12.25.0`
Frontend : `@azure/msal-browser: ^3.28.1`, `@azure/msal-react: ^2.1.2`

Les `^` permettent des mises à jour mineures automatiques au prochain `npm install`. Pour des librairies d'auth et de chiffrement, c'est un vecteur supply chain. `package-lock.json` fixe les versions en CI (`npm ci`), ce qui atténue le risque en pipeline, mais pas en développement local.

**[OBS-1.8-B] Pas de Dependabot ou Renovate**
Aucun fichier `.github/dependabot.yml`. Les vulnérabilités dans les dépendances ne seront pas signalées automatiquement.

**[OBS-1.8-C] Import DynamoDB dans repository.ts (dead code)**
`repository.ts` ligne 1 : `import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'`. Ce package n'est pas dans `backend/package.json`. Le type est utilisé seulement dans le stub `createRepository` (jamais appelé). Si le package n'est pas installé, cette ligne pourrait causer une erreur TypeScript à la compilation. Dead code non nettoyé.

**[OBS-1.8-D] package-lock.json présent et committé**
`package-lock.json` est committé. `npm ci` est utilisé en CI. Reproductibilité des builds assurée. Correct.

---

## Récapitulatif des observations par sévérité

| Sévérité | Observations |
|---|---|
| CRITIQUE (exploitable directement) | OBS-1.1-A, OBS-1.1-B, OBS-1.2-A |
| ÉLEVÉE | OBS-1.1-F (APIM health bypass), OBS-1.2-B+C (Cosmos/Storage keys), OBS-1.1-C (delete user vide), OBS-1.4-B (no WAF), OBS-1.5-A (direct access), OBS-1.5-E (ACS Contributor) |
| MOYENNE | OBS-1.4-A (no security headers), OBS-1.3-A (no date validation), OBS-1.3-C (SAS no limit), OBS-1.7-C (secrets inherit), OBS-1.7-A (no audit), OBS-1.4-E (entity enumeration), OBS-1.5-G/H (RBAC trop large), OBS-1.6-A (no CSP) |
| FAIBLE | OBS-1.8-A (float deps), OBS-1.6-B (console.error), OBS-1.1-E (MSAL authority), OBS-1.8-C (dead import) |
