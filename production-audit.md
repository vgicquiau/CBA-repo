# Production Audit — Le Clos Bon Accueil

**Date** : 2026-05-29 — Mis à jour : 2026-05-30 (post-remédiation AppSec, commit `0f39bcf`)  
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
| WAF | Azure Front Door Standard + WAF Policy Prevention mode (OWASP 2.1 + Bot Manager 1.0) | Devant APIM |
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
| Front Door (WAF) | `clos-afd-dev` | `clos-afd-prod` |
| WAF Policy | `closWafdev` | `closWafprod` |

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

> **Audit AppSec complet** réalisé le 2026-05-29 (voir `SECURITY_AUDIT.md`). 19 findings (SEV-001 à SEV-019, sévérités Critique → Info) tous résolus dans le commit `0f39bcf` du 2026-05-29.

### ✅ CORRIGÉ — `local.settings.json` dans `.gitignore`

Le fichier était absent du `.gitignore` au moment de l'audit initial. **Corrigé** : `local.settings.json` est désormais à la ligne 16 du `.gitignore`.

### ✅ CORRIGÉ — Bug APIM : health endpoint non réellement anonyme (SEV-004)

La policy `health-get` appelait `<base />` inbound, héritant de `validate-jwt` API-level. **Corrigé** : la policy `health-get` n'appelle plus `<base />` inbound — uniquement `rate-limit-by-key`. `GET /v1/health` est désormais réellement anonyme.

### 🟢 BAS — Pas de `local.settings.json.example`

Aucun fichier d'exemple d'environnement local fourni. Non bloquant — le `PRODUCTION_GUIDE.md` (§3.5) documente les variables requises. Les Function Apps utilisent Managed Identity, donc le seul vrai prérequis local est `COSMOS_ENDPOINT` + `DefaultAzureCredential`.

### 🟢 BAS — `shared-types/dist/` commité

Les artefacts de build de `shared-types` sont dans le repo. Fonctionnel mais non conventionnel. Pas bloquant.

---

## Vérifications positives

### Audit initial (2026-05-29)

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

### Post-remédiation AppSec (commit `0f39bcf`, 2026-05-29)

- ✅ **SEV-001** — IP restrictions Function Apps : seul APIM peut atteindre les Function Apps (deny all autres IPs)
- ✅ **SEV-002** — Webhook Entra (`auth-post-confirmation`) authentifié cryptographiquement via JWKS (`jose`) — plus de handler non protégé
- ✅ **SEV-003** — `AzureWebJobsStorage` via Managed Identity (`__accountName`) sur les deux Function Apps ; `allowSharedKeyAccess: false` sur les Storage Accounts Functions — plus de clé Storage en clair
- ✅ **SEV-004** — Policy `health-get` sans `<base />` inbound : `GET /v1/health` est réellement anonyme
- ✅ **SEV-005** — Cosmos DB `disableLocalAuth: true` ; `COSMOS_KEY` env var supprimé du code — accès RBAC uniquement
- ✅ **SEV-006** — RBAC Service Bus Sender scopé au topic (pas `resourceGroup`) ; Blob Contributor scopé au Storage Account dédié photos
- ✅ **SEV-007** — Rôle ACS `Communication Services Email Sender` (GUID `b9a7eb27`) au lieu de `Contributor` (`b24988ac`)
- ✅ **SEV-008** — Module `waf.bicep` : Azure Front Door Standard + WAF Policy Prevention mode (OWASP 2.1 + Bot Manager 1.0) devant APIM
- ✅ **SEV-009** — Headers de sécurité dans la policy outbound APIM : `X-Content-Type-Options`, `X-Frame-Options`, `HSTS`, `Referrer-Policy`, `Cache-Control: no-store`
- ✅ **SEV-010** — Validation Zod sémantique des dates : date calendaire valide, `start < end`, `start >= today` (côté guest)
- ✅ **SEV-011** — `deleteUser` implémenté avec cascade (supprime bookings room + bookingRefs guest + user doc) — conformité RGPD
- ✅ **SEV-012** — SAS token photo-upload restreint au `contentType: 'image/jpeg'`
- ✅ **SEV-013** — GitHub Actions `secrets:` explicites sur `deploy-dev.yml` et `deploy-prod.yml` — plus de `secrets: inherit`
- ✅ **SEV-014** — CodeQL analysis + `npm audit --audit-level=high` dans `pr.yml` ; `dependabot.yml` pour mises à jour hebdo npm + GitHub Actions
- ✅ **SEV-015** — `NotFoundError` n'expose plus `entity`/`id` dans la réponse HTTP (`Resource not found` générique)
- ✅ **SEV-016** — Headers sécurité CDN SPA via Bicep delivery rule : `X-Content-Type-Options`, `X-Frame-Options`, `HSTS`, `Referrer-Policy` ; CSP à injecter post-déploiement via CLI (voir `PRODUCTION_GUIDE.md §8.5`)
- ✅ **SEV-017** — Versions npm épinglées (suppression `^`) pour `@azure/cosmos`, `@azure/identity`, `@azure/msal-browser`, `@azure/msal-react`
- ✅ **SEV-018** — `POST /v1/admin/users/invite` retourne `501 NOT_IMPLEMENTED` (intégration Graph API en attente PM4) — plus de faux `201`
- ✅ **SEV-019** — `deleteUser` ajouté à l'interface `IRepository` (cohérence interface/implémentation)

---

## Manquants non bloquants

- Pas de `azure.yaml` (Azure Developer CLI) — non utilisé, Bicep direct suffit ✅
- Pas de `func.json` par handler — normal avec Azure Functions v4 (registration via `app.http()`)
- Pas de `Makefile` / `justfile` — les scripts npm suffisent pour ce projet
- Pas de documentation sur le processus DNS (comment pointer les CNAME vers APIM et CDN)
