# Plan d'implémentation — Le Clos Bon Accueil

**Dernière mise à jour** : 2026-05-29  
**État** : P1–P11 ✅ PM1–PM8 ✅ — Migration AWS → Azure terminée

---

## Contexte — Changement d'infrastructure cible

Les phases P1–P9 ont été implémentées pour AWS (Lambda, DynamoDB, Cognito, CDK). Un changement de contrainte survenu en 2026-05-28 bascule l'hébergement cible vers **Azure**. Les phases PM1–PM8 portent la migration. Les phases P10–P11 et PM8 (ex-P12) restent à faire.

**Source de vérité de la décision de mapping** : `docs/migration-azure/02-mapping-services.md`  
**Audit AWS complet** : `docs/migration-azure/01-audit-aws.md`

---

## Avancement — Phases historiques (P1–P12)

| Phase | Intitulé | Statut | Commit | Notes |
|---|---|---|---|---|
| P1 | Scaffold monorepo npm workspaces | ✅ Terminé | c92ed20 | Agnostique fournisseur |
| P2 | @clos/shared-types (types, DTOs, dates, events) | ✅ Terminé | dd3a677 | Agnostique fournisseur |
| P3 | Backend : repository interface + erreurs typées | ✅ Terminé | 4a7a433 | Interface agnostique, impl DynamoDB à migrer (PM2) |
| P4 | Backend : 29 Lambda handlers API | ✅ Terminé | 31f9098 | Signatures AWS Lambda — à migrer (PM4) |
| P5 | Backend : 3 Lambdas hors API GW | ✅ Terminé | f95f1ec | Triggers AWS spécifiques — à migrer (PM4+PM5) |
| P6 | Infrastructure CDK 6 stacks AWS | ✅ Terminé | e8e0296 | Remplacé par Bicep en PM1 — archive conservée |
| P7 | Script de seed | ✅ Terminé | — | seed.ts + tsx ; typecheck ✅ ; `npm run seed --workspace=backend -- --stage dev` |
| P8 | Frontend : Vite + Amplify Auth (Cognito) | ✅ Terminé | c576442 | Auth AWS — à migrer (PM3) |
| P9 | Frontend : HTTP client + hooks React Query | ✅ Terminé | 7be287c | Client HTTP agnostique ; seul getToken() à changer (PM3) |
| P10 | Frontend : migration écrans prototype | ✅ Terminé | 75d0d45 | 6 écrans TS + router + ui/ — typecheck ✅ ; branche `feat/p10-screens` |
| P11 | Tests E2E Playwright | ✅ Terminé | — | 3 scénarios Playwright dans `frontend/tests/e2e/` ; auth MSAL via storageState ; `playwright.config.ts` |
| P12 | CI/CD GitHub Actions | ↳ PM8 | — | Absorbé dans PM8 (déploiement Azure) |

---

## Avancement — Phases de migration Azure (PM1–PM8)

| Phase | Intitulé | Statut | Critère "fait" |
|---|---|---|---|
| PM1 | IaC Bicep — scaffold et modules | ✅ Terminé | 8 fichiers Bicep créés dans `infra/bicep/` ; `az deployment group validate` à vérifier avec un Resource Group Azure actif |
| PM2 | Data layer — Cosmos DB (impl Repository) | ✅ Terminé | 31 tests Vitest ✅ ; typecheck ✅ ; branche `feat/pm2-cosmos` — commit `f2aa4a9` |
| PM3 | Auth — Entra External ID + MSAL.js | ✅ Terminé | `oid`/App Roles claims dans http.ts ; MSAL.js frontend (AuthProvider + LoginScreen + client.ts) ; `@aws-sdk/client-cognito-identity-provider` supprimé ; 134 tests ✅ |
| PM4 | Compute — Azure Functions (handlers + deps.ts) | ✅ Terminé | 32 handlers Azure Functions v4 ; `app.http()` + timer + Service Bus triggers ; 126 tests Vitest ✅ |
| PM5 | Events + Notifications — Service Bus + ACS Email | ✅ Terminé | `publishEvent()` → ServiceBusClient ; `sendEmail()` → ACS EmailClient ; 132 tests ✅ |
| PM6 | CDN + Static Hosting — Azure CDN + Blob | ✅ Terminé | Blob+CDN dans data.bicep ✅ ; frontend.bicep ✅ ; putExternal SAS (client.ts) ✅ ; admin-rooms-photo-url Azure Blob SAS ✅ ; 126 tests ✅ |
| PM7 | Monitoring — Application Insights + Azure Monitor | ✅ Terminé | `monitoring.bicep` : Log Analytics + App Insights + Action Group + Alert (5 erreurs/5 min) ; `APPLICATIONINSIGHTS_CONNECTION_STRING` injecté dans clos-api et clos-jobs |
| PM8 | CI/CD GitHub Actions → Azure OIDC | ✅ Terminé | `.github/workflows/` : pr.yml, deploy-dev.yml, deploy-prod.yml, e2e.yml — OIDC WIF, build+deploy Azure Functions + Blob frontend |

---

## Dépendances entre phases

```
P3 ✅ (interface)
  └─► PM2 (impl Cosmos DB) ──► P7 (seed Cosmos DB)
                              └─► PM4 (handlers Azure Functions)
                                    └─► PM5 (events/notifs)
                                    └─► PM8 (CI/CD)
                                    └─► PM7 (monitoring)

PM1 (Bicep IaC) — peut commencer en parallèle de PM2 et PM3

PM3 (Auth Entra) ──► PM4 (authorizer backend + frontend login)
                  └─► P10 (écrans) [frontend Auth Provider swap]

P9 ✅ (hooks RQ) ──► P10 (écrans) ──► P11 (E2E) — bloqué par PM4 aussi

PM6 (CDN/hosting) dépend de PM1 (Bicep) + Vite build disponible
PM8 (CI/CD) dépend de tout le reste
```

**Chemin critique pour avoir un backend Azure fonctionnel** :
```
PM1 → PM2 → PM3 → PM4 → PM5 → PM7 → PM8
```

**P10 peut commencer maintenant** (frontend pur, aucune dépendance Azure).

---

## Détail des phases PM

### PM1 — IaC Bicep

**Objectif** : Remplacer les 6 stacks CDK par des modules Bicep Azure.  
**Structure cible** :
```
infra/bicep/
  main.bicep
  modules/
    data.bicep          ← Cosmos DB, Blob, Azure CDN
    auth.bicep          ← Entra External ID, Function auth-trigger
    notifications.bicep ← Service Bus, ACS Email, Function jobs
    api.bicep           ← APIM, 29 Azure Functions (clos-api), WAF
    frontend.bicep      ← Blob $web, Azure CDN SPA
  parameters/
    dev.bicepparam
    prod.bicepparam
```
**Decisions à trancher avant de commencer** : D1 (Bicep vs Pulumi), D2 (granularité Function Apps) — voir `02-mapping-services.md`.  
**Critère "fait"** : `az deployment group validate --template-file infra/bicep/main.bicep --parameters infra/bicep/parameters/dev.bicepparam` passe proprement.

### PM2 — Data layer — Cosmos DB

**Objectif** : Implémenter `IRepository` avec le SDK Cosmos DB (`@azure/cosmos`) à la place de DynamoDB.  
**Fichiers touchés** :
- `backend/src/data/repository.cosmos.ts` (nouveau, impl concrète)
- `backend/src/api/deps.ts` (swap `DynamoDBDocumentClient` → `CosmosClient`)
- `backend/package.json` (add `@azure/cosmos`, remove `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)
- Tests : `backend/src/__tests__/repository.test.ts` (mock Cosmos au lieu de DynamoDB)

**Attention** : l'interface `IRepository` dans `backend/src/data/repository.ts` reste inchangée — les 32 handlers ne bougent pas dans cette phase.  
**Critère "fait"** : `npm run test --workspace=backend` passe avec la nouvelle implémentation.

### PM3 — Auth — Entra External ID + MSAL.js

**Objectif** : Remplacer Cognito + Amplify par Entra External ID côté backend (JWT claims) et MSAL.js côté frontend.  
**Backend** :
- `backend/src/api/http.ts` : `getCurrentUserId()` extrait `oid` au lieu de `sub` ; `requireRole()` lit App Roles au lieu de `cognito:groups`
- `backend/src/handlers/auth-post-confirmation.ts` → à remplacer par un equivalent Entra (webhook ou Logic App — à préciser en PM1)
- Supprimer `@aws-sdk/client-cognito-identity-provider` de `deps.ts`

**Frontend** :
- `frontend/src/auth/AuthProvider.tsx` : swap `@aws-amplify/auth` → `@azure/msal-browser` + `@azure/msal-react`
- `frontend/src/api/client.ts` : `getToken()` utilise MSAL `acquireTokenSilent` au lieu de `fetchAuthSession`
- `frontend/package.json` : supprimer `@aws-amplify/auth`, ajouter `@azure/msal-browser`, `@azure/msal-react`
- `frontend/src/config.ts` : remplacer `userPoolId`/`userPoolClientId` par `tenantId`/`clientId`

**Critère "fait"** : login/logout frontend fonctionnel avec Entra ; claims `oid` + App Roles présents dans le JWT vérifié par le middleware backend.

### PM4 — Compute — Azure Functions

**Objectif** : Migrer les 32 handlers Lambda vers Azure Functions v4 (isolated worker, Node.js 20).  
**Fichiers touchés** :
- `backend/src/api/http.ts` : remplacer `APIGatewayProxyHandlerV2WithJWTAuthorizer` par `HttpHandler` Azure Functions ; adapter `ok()`, `withErrorHandling()`, `parseBody()`, `parseQuery()`, `getPathParam()`
- `backend/src/api/deps.ts` : remplacer `@aws-sdk/client-s3` + presigner par `@azure/storage-blob` + SAS tokens ; remplacer `@aws-sdk/client-ssm` par App Configuration / Key Vault ; remplacer `@aws-sdk/client-sns` par Service Bus SDK (PM5)
- `backend/src/handlers/*.ts` : typage de l'event (mécanique — `event.body` → `await request.json()`, path params, etc.)
- `backend/package.json` : ajouter `@azure/functions`, `@azure/storage-blob`, `@azure/app-configuration`, `@azure/keyvault-secrets`, `@azure/identity`
- `infra/bicep/modules/api.bicep` : Function App `clos-api-{stage}` (consumption plan + Managed Identity + RBAC Cosmos + RBAC Service Bus)

**Nota** : `notification-dispatcher` et `reconciliation-job` restent dans la Function App `clos-jobs-{stage}` (déclencheurs Service Bus + Timer).  
**Critère "fait"** : les 27 routes API répondent via APIM (`curl https://api.{stage}.clos-bon-accueil.fr/v1/health` → 200).

### PM5 — Events + Notifications

**Objectif** : Remplacer SNS + SES par Service Bus + Azure Communication Services Email.  
**Fichiers touchés** :
- `backend/src/api/deps.ts` : `publishEvent()` → `ServiceBusClient.createSender().sendMessages()`
- `backend/src/handlers/notification-dispatcher.ts` : déclencheur Service Bus trigger (au lieu de SNS) ; `SendTemplatedEmailCommand` (SES) → ACS Email SDK
- `backend/package.json` : ajouter `@azure/service-bus`, `@azure/communication-email` ; supprimer `@aws-sdk/client-sns`, `@aws-sdk/client-ses`
- `infra/bicep/modules/notifications.bicep` : Service Bus namespace + topic + subscription, ACS Email, Function `clos-jobs`

**Critère "fait"** : un BOOKING_CREATED publié déclenche l'email admin et l'email guest via ACS.

### PM6 — CDN + Static Hosting

**Objectif** : Remplacer S3 + CloudFront par Azure Blob + Azure CDN.  
**Fichiers touchés** :
- `infra/bicep/modules/data.bicep` : Blob Storage (container `photos`, container `$web`), Azure CDN profiles + endpoints
- `infra/bicep/modules/frontend.bicep` : upload `frontend/dist/` via `az storage blob upload-batch`, inject `config.json`
- `frontend/src/api/client.ts` : `putExternal()` swap pré-signed URL S3 → SAS token Azure Blob
- `infra/bicep/modules/api.bicep` : génération SAS token depuis handler `admin-rooms-photo-url` (via Managed Identity)

**config.json à deploy-time** : le champ `userPoolId`/`userPoolClientId` devient `tenantId`/`clientId` (voir PM3).  
**Critère "fait"** : `https://dev.clos-bon-accueil.fr` sert le frontend ; `https://cdn.dev.clos-bon-accueil.fr/{key}` sert les photos.

### PM7 — Monitoring

**Objectif** : Remplacer CloudWatch + X-Ray par Azure Monitor + Application Insights.  
**Fichiers touchés** :
- `backend/package.json` : supprimer `@aws-lambda-powertools/logger`, ajouter `@azure/monitor-opentelemetry` ou Application Insights SDK
- `backend/src/api/deps.ts` : remplacer `Logger` Powertools par logger Application Insights
- `infra/bicep/modules/` : Log Analytics workspace, Application Insights, Azure Monitor Alerts + Action Groups (email admin)

**Critère "fait"** : logs visibles dans Log Analytics ; trace distribuée APIM → Function dans Application Insights ; alerte email déclenchée sur 5 erreurs en 5 min.

### PM8 — CI/CD GitHub Actions (ex-P12)

**Objectif** : Workflows GitHub Actions pour lint/test/deploy vers Azure.  
**Fichiers à créer** :
- `.github/workflows/pr.yml` : lint + typecheck + tests + `az deployment group validate`
- `.github/workflows/deploy-dev.yml` : merge sur main → deploy dev
- `.github/workflows/deploy-prod.yml` : tag `v*.*.*` → deploy prod (avec `environment: production` + approval)
- `.github/workflows/e2e.yml` : tests E2E Playwright post-deploy

**Auth GitHub → Azure** : Workload Identity Federation (OIDC) — `azure/login@v2` avec Federated Credential Entra.  
**Critère "fait"** : un push sur main déclenche le deploy dev sans intervention manuelle ; un tag déclenche l'approval prod puis le deploy.

---

## P7 — Script de seed (rebasé Azure)

**Dépend de** : PM2 (Cosmos DB) ✅  
**Objectif** : Insérer HouseConfig, Rooms de base, et Bookings fictifs (dev uniquement) dans Cosmos DB.  
**Fichier** : `backend/scripts/seed.ts` — actuellement vide (`.gitkeep`)  
**SDK** : `@azure/cosmos` (même client que repository impl)  
**Critère "fait"** : `npm run seed --workspace=backend -- --stage dev` peuple le Cosmos DB de dev sans erreur.

---

## P10 — Migration écrans prototype (démarrable maintenant)

**Aucun blocage Azure** — le frontend consomme les hooks React Query de P9 ; seul `AuthProvider` changera en PM3.  
**Fichiers source** : `app.jsx`, `screens-admin.jsx`, `screens-flow.jsx`, `screens-main.jsx` (root)  
**Destination** : `frontend/src/screens/`, `frontend/src/ui/`  
**Règles** :
- Extraire les primitives UI → `frontend/src/ui/`
- Copier `styles.css` verbatim → `frontend/src/styles.css`
- Remplacer les imports `data.jsx` par les hooks React Query de P9
- Remplacer le toggle `AdminMode` par `useMe().data.role === 'admin'`
- Upload photo : drag-drop + `useUploadRoomPhoto` + PUT pré-signed URL (SAS Azure en PM6)

**Critère "fait"** : `npm run dev --workspace=frontend` affiche tous les écrans ; aucune référence à `data.jsx` ou à l'ancien prototype.

---

## P11 — Tests E2E Playwright

**Bloqué par** : PM4 (backend Azure fonctionnel) + P10  
**3 scénarios** :
1. Guest : login → browse rooms → createBooking → "My trips" → cancel
2. Admin : login → dashboard → createRoom → deleteRoom (cascade) → KPI
3. Conflict : createBooking → tentative booking conflictuel → erreur 409

**Critère "fait"** : les 3 scénarios passent en CI contre l'environnement dev.

---

## Décisions structurantes à trancher (avant PM1)

Voir `docs/migration-azure/02-mapping-services.md` § "Points à confirmer" pour le détail.

| # | Question | Recommandation |
|---|---|---|
| D1 | IaC : Bicep ou Pulumi TypeScript ? | **Bicep** |
| D2 | Granularité Function Apps : 2 ou N ? | **2** (clos-api + clos-jobs) |
| D3 | ACS Email disponible en France Central ? | Vérifier avant PM5 |
| D4 | Entra : App Roles ou Security Groups ? | **App Roles** |
| D5 | APIM tier : Consumption ou Developer ? | **Consumption** |
| D6 | Azure CDN Standard ou Front Door Standard ? | **CDN Standard Microsoft** |

---

## Contrainte PROMPT-ORCHESTRATEUR

Le fichier `PROMPT-ORCHESTRATEUR.md` impose une validation manuelle entre chaque phase. Les phases PM sont conçues pour être atomiques et testables indépendamment. Ordre recommandé de démarrage :

```
Maintenant :   PM1 (Bicep scaffold) ┬── en parallèle avec ──► P10 (écrans prototype)
               PM2 (Cosmos DB)      ┘

Ensuite :      PM3 (Auth Entra) → PM4 (Azure Functions) → PM5 (Events) → PM6 (CDN)
               P7 (seed) — débloqué après PM2
               PM7 (monitoring) — peut accompagner PM4

Fin :          PM8 (CI/CD) + P11 (E2E)
```
