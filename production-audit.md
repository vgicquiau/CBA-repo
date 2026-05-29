# Production Audit — Le Clos Bon Accueil

**Date** : 2026-05-29  
**Analyste** : Claude Code (DevOps/SRE review)

---

## Stack détecté

| Couche | Technologie | Détail |
|---|---|---|
| Runtime backend | Node.js 20, TypeScript 5.4, Azure Functions v4 isolated | Linux, Consumption plan (Y1) |
| Frontend | React 18 + Vite → Azure Blob `$web` → Azure CDN | SPA, fallback `index.html` |
| Base de données | Cosmos DB for NoSQL (Session consistency) | DB `clos-bon-accueil`, container `main`, partition key `/pk`, TTL activé |
| Auth | Entra External ID + MSAL.js v3 (frontend) + APIM JWT validation (backend) | Claims `oid` + App Roles |
| API Gateway | Azure API Management Consumption | 29 opérations, rate-limit 100 calls/s/IP, CORS explicite |
| Notifications | Azure Service Bus Standard + ACS Email | Topic `clos-notifications-{stage}` |
| Stockage fichiers | Azure Blob Storage (container `photos`, SAS token) + CDN `clos-cdn-photos-{stage}` | |
| Monitoring | Log Analytics `clos-logs-{stage}` + App Insights `clos-insights-{stage}` + 5 alertes Azure Monitor | |
| Secrets | Azure Key Vault `clos-kv-{stage}` + App Configuration `clos-appconfig-{stage}` | RBAC authorization |
| IaC | Bicep — `main.bicep` + 6 modules (`data`, `auth`, `notifications`, `api`, `frontend`, `monitoring`) | |
| CI/CD | GitHub Actions OIDC (4 workflows) | WIF, `azure/login@v2` |
| Région | `francecentral` | Deux stages : `dev` / `prod` |

---

## Services Azure identifiés (noms de ressources)

| Ressource | Dev | Prod |
|---|---|---|
| Resource Group | `rg-clos-bon-accueil-dev` | `rg-clos-bon-accueil-prod` |
| Cosmos DB | `clos-cosmos-dev` | `clos-cosmos-prod` |
| Blob Storage | `closstoragedev` | `closstorageprod` |
| Function App API | `clos-api-dev` | `clos-api-prod` |
| Function App Jobs | `clos-jobs-dev` | `clos-jobs-prod` |
| APIM | `clos-apim-dev` | `clos-apim-prod` |
| Service Bus | `clos-servicebus-dev` | `clos-servicebus-prod` |
| Key Vault | `clos-kv-dev` | `clos-kv-prod` |
| App Configuration | `clos-appconfig-dev` | `clos-appconfig-prod` |
| Log Analytics | `clos-logs-dev` | `clos-logs-prod` |
| Application Insights | `clos-insights-dev` | `clos-insights-prod` |
| CDN Profile | `clos-cdn-dev` | `clos-cdn-prod` |
| CDN Endpoint SPA | `clos-cdn-web-dev` | `clos-cdn-web-prod` |
| CDN Endpoint Photos | `clos-cdn-photos-dev` | `clos-cdn-photos-prod` |

---

## État du code

- ✅ `npm ci` + `npm run build --workspaces` fonctionnels
- ✅ 32 handlers Azure Functions v4 dans `backend/src/handlers/`
- ✅ `backend/host.json` présent, `extensionBundle` v4
- ✅ `backend/tsconfig.json` → `outDir: dist`, `rootDir: .` (couvre `src/` et `scripts/`)
- ✅ Workflow de packaging : `cd backend && zip -r backend-deploy.zip dist/ node_modules/ host.json package.json`
- ✅ `frontend/dist/index.html` présent (build de base commité)
- ✅ Health endpoint `GET /v1/health` → `{ status: 'ok', timestamp }` (handler anonyme)
- ✅ `shared-types/dist/` commité (nécessaire comme dépendance workspace)
- ✅ `.gitignore` : `node_modules/`, `dist/`, `.env*`, `frontend/dist/` couverts

---

## Points bloquants avant premier déploiement

### BLOQUANT — Ressources Azure inexistantes

1. **Resource Groups** non créés — `rg-clos-bon-accueil-dev` et `prod` doivent exister avant `az deployment group create`
2. **App Registration Entra External ID** non créée — `tenantId` et `clientId` Entra sont requis comme paramètres Bicep ; sans eux, APIM JWT validation est inopérant
3. **Federated Credential GitHub** non configuré — les 3 secrets GitHub OIDC (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) doivent exister pour que les workflows s'authentifient
4. **Secrets Key Vault** doivent être posés manuellement après le premier déploiement Bicep : `admin-email`, `email-from-address`

### BLOQUANT — Secrets GitHub manquants (9 secrets total)

```
AZURE_CLIENT_ID          # Service principal WIF (OIDC)
AZURE_TENANT_ID          # Tenant Azure AD
AZURE_SUBSCRIPTION_ID    # Subscription cible
ENTRA_TENANT_ID          # Tenant Entra External ID (≠ AZURE_TENANT_ID si B2C)
ENTRA_CLIENT_ID          # App Registration client ID
ADMIN_EMAIL_DEV          # Email alertes ops dev
ADMIN_EMAIL_PROD         # Email alertes ops prod
E2E_GUEST_EMAIL          # Compte guest pour tests E2E Playwright
E2E_GUEST_PASSWORD       # Mot de passe compte guest E2E
E2E_ADMIN_EMAIL          # Compte admin pour tests E2E Playwright
E2E_ADMIN_PASSWORD       # Mot de passe compte admin E2E
```

### BLOQUANT — DNS non configuré

Les domaines `clos-bon-accueil.fr` et sous-domaines (`dev.*`, `api.*`, `cdn.*`) doivent pointer vers Azure avant activation TLS CDN.

---

## Risques de sécurité identifiés

### 🔴 CRITIQUE — `local.settings.json` absent du `.gitignore`

Le fichier `local.settings.json` (utilisé pour le développement local Azure Functions — contient `AzureWebJobsStorage`, connection strings Cosmos DB, etc.) **n'est pas dans `.gitignore`**. Si un développeur crée ce fichier et le commit accidentellement, des credentials Azure seraient exposés dans le repo.

**Correction immédiate** : ajouter `local.settings.json` au `.gitignore`.

### 🟡 MOYEN — Bug APIM : health endpoint non réellement anonyme

Le handler `health.ts` déclare `authLevel: 'anonymous'` et l'opération APIM `health-get` a une policy d'override. Cependant, la policy d'opération appelle `<base />` en premier, ce qui exécute la policy API-level incluant `validate-jwt`. Le `<set-variable name="skipJwtValidation" value="true" />` ne désactive **pas** la validation JWT — c'est une variable sans effet sur la politique parente.

**Conséquence** : `GET /v1/health` exige un token JWT valide en production, contrairement à l'intention.

**Correction** : supprimer `<base />` de la policy `health-get` et n'inclure que rate-limit + CORS.

### 🟡 MOYEN — Pas de `local.settings.json.example`

Aucun fichier d'exemple d'environnement local fourni. Les nouveaux développeurs ne savent pas quelles variables configurer pour développer en local.

### 🟢 BAS — `shared-types/dist/` commité

Les artefacts de build de `shared-types` sont dans le repo (commits). C'est fonctionnel mais non conventionnel. Dans une vraie CI, `npm run build --workspace=shared-types` est lancé avant chaque usage. Pas bloquant.

---

## Vérifications positives

- ✅ Pas de secret dans le code — tout passe par `DefaultAzureCredential` + Managed Identity
- ✅ CORS explicite dans APIM (liste blanche, jamais `*`)
- ✅ TLS forcé (HTTP → HTTPS redirect) sur CDN
- ✅ `allowBlobPublicAccess: false` sur tous les Storage Accounts
- ✅ `minimumTlsVersion: 'TLS1_2'` partout
- ✅ RBAC least-privilege : chaque Function App a ses propres assignments (Cosmos Data Contributor, SB Sender/Receiver, Blob Contributor, AppConfig Reader)
- ✅ Key Vault RBAC (`enableRbacAuthorization: true`, soft delete activé)
- ✅ Cosmos DB PITR activé en prod (`Continuous7Days`)
- ✅ `WEBSITE_RUN_FROM_PACKAGE: 1` — package zip immutable (meilleures performances et sécurité)
- ✅ GitHub Actions : `permissions: id-token: write` configuré pour WIF
- ✅ `environment: production` dans deploy-prod.yml → approbation manuelle possible via GitHub

---

## Manquants non bloquants

- Pas de `azure.yaml` (Azure Developer CLI) — non utilisé, Bicep direct suffit ✅
- Pas de `func.json` par handler — normal avec Azure Functions v4 (registration via `app.http()`)
- Pas de `Makefile` / `justfile` — les scripts npm suffisent pour ce projet
- Pas de documentation sur le processus DNS (comment pointer les CNAME vers APIM et CDN)
