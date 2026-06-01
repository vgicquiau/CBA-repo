# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Le Clos Bon Accueil** is a vacation rental management system for a family guesthouse (12 rooms). The project evolves from a static React prototype (in root) to a production-grade serverless application with dedicated backend, frontend, and infrastructure.

**Infrastructure target**: **Azure** (migration from AWS in progress as of 2026-05-28). The backend and CDK infrastructure were originally written for AWS (P1–P9). Phases PM1–PM8 migrate them to Azure. See `docs/migration-azure/` for the audit and mapping decisions.

**Single Source of Truth for application requirements**: `specs/` (4 markdown files). Never contradict or reinterpret them — the specs are binding for API contract, data model, and business logic. Note: `specs/03-infrastructure.md` describes the original AWS target; the current infrastructure target is Azure (see `docs/migration-azure/02-mapping-services.md`).

---

## Monorepo Structure (npm workspaces)

```
clos-bon-accueil/
├── shared-types/          # @clos/shared-types — types, DTO, dates, events
├── backend/               # Node.js Azure Functions handlers + repository layer
├── frontend/              # React 18 SPA (Vite)
├── infra/
│   ├── lib/               # CDK stacks (AWS — archive, ne pas modifier)
│   └── bicep/             # Bicep modules Azure (cible de PM1)
├── docs/migration-azure/  # Audit AWS + mapping AWS → Azure
├── specs/                 # Spécifications applicatives (immutable)
└── package.json           # Workspaces root
```

**Workspace dependencies**:
- `shared-types` → consumed by `backend` and `frontend` (no direct cross-imports)
- `backend` → Azure Functions handlers, repository, HTTP utils
- `frontend` → React components, API client, React Query hooks
- `infra/bicep` → Bicep modules (Azure deployment)

---

## Essential Commands

All commands run from **repository root** (applies to all workspaces via `--workspace=<name>` or `--workspaces`).

### Setup
```bash
npm install                              # Install all workspace deps
```

### Development
```bash
npm run dev --workspace=frontend        # Vite dev server (localhost:5173)
npm run lint --workspaces               # ESLint + Prettier check across all workspaces
npm run typecheck --workspaces          # TypeScript type-check without emit
npm run test --workspace=backend        # Run backend tests (vitest)
npm run test --workspace=frontend       # Run frontend tests
npm run test --workspace=backend -- --watch  # Watch mode
npm run test --workspace=backend -- src/data/repository.test.ts  # Single test file
```

### Building
```bash
npm run build --workspace=shared-types  # Build shared-types package
npm run build --workspace=frontend      # Vite build (→ frontend/dist)
```

### Infrastructure & Deployment (Azure — cible post-PM1)

> **Sandbox** : le compte Azure restreint utilise `rg-sp4-d-vgi-azu-vgi-sandbox-txt` avec `nameSuffix=vgi`.
> Voir le guide complet : `docs/deployment-sandbox.md`.

```bash
# Valider les templates Bicep
az deployment group validate \
  --resource-group <rg-name> \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/parameters/dev.bicepparam

# Déployer en dev
az deployment group create \
  --resource-group <rg-name> \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/parameters/dev.bicepparam

# Seed initial (après PM2)
npm run seed --workspace=backend -- --stage dev

# Déployer le frontend (après PM6)
az storage blob upload-batch \
  --destination '$web' \
  --account-name closstorage<stage><nameSuffix> \
  --source frontend/dist
```

**Paramètres Bicep notables** (`infra/bicep/main.bicep`) :
- `nameSuffix` — suffixe court (ex. `vgi`) ajouté à tous les noms de ressources globalement uniques, pour éviter les collisions en sandbox/multi-instance.
- `enableEmailNotifications` (défaut `true`) — mettre à `false` si `Microsoft.Communication` n'est pas enregistré dans la subscription.
- `authBypassEnabled` (défaut `false`) — **sandbox uniquement** : supprime la validation JWT APIM et injecte `X-Forwarded-User: bypass-dev-user`. Ne jamais activer en prod.

### Linting & Formatting
```bash
npm run lint:fix --workspaces           # Auto-fix ESLint + Prettier
npm run typecheck --workspaces          # Full type check
```

---

## État de la migration AWS → Azure

**Phases accomplies** (P1–P9, code écrit pour AWS) :
- P1–P3 : scaffold + shared-types + repository interface (agnostiques cloud)
- P4–P5 : 32 handlers écrits avec signatures AWS Lambda — à migrer en PM4
- P6 : CDK 6 stacks AWS — archive conservée dans `infra/lib/`, à remplacer par Bicep (PM1)
- P8–P9 : frontend avec `@aws-amplify/auth` — à migrer vers MSAL.js (PM3)

**Ne pas écrire de nouveau code AWS** (nouveau Lambda, CDK construct, `@aws-sdk/*`) — tout nouveau code doit viser Azure.

**Référence** : `dev/Plan.md` pour l'ordre des phases PM1–PM8 et leurs critères "fait".

---

## Architecture Principles

### 1. Specs Drive Everything
- **Read specs first**: `specs/README.md` → `01-data-model.md` → `02-api-contract.md`
- **`03-infrastructure.md`** décrit une cible AWS désormais remplacée — utiliser `docs/migration-azure/02-mapping-services.md` pour les décisions infra.
- **Never invent**: If a requirement is not in specs, ask. Don't assume.
- **Strict compliance**: Code must match specs exactly (field names, types, error codes, HTTP mappings).

### 2. Cosmos DB — Single Container Design (remplace DynamoDB)

Azure Cosmos DB for NoSQL est la cible de PM2. La logique reste identique :
- **Un container** `clos-bon-accueil-{stage}`, partition key `/pk`
- **Indexation automatique** — pas besoin de déclarer des GSIs explicitement
- **TTL natif** — enregistrements d'idempotence, expiry 24h
- **Transactions** : `TransactionalBatch` Cosmos (remplace `TransactWriteItems` DynamoDB)
- **Pas d'accès direct au SDK** — tout passe par `backend/src/data/repository.ts`

### 3. Repository Layer (Data Access)

- L'**interface** `IRepository` dans `backend/src/data/repository.ts` est agnostique cloud — ne pas la modifier.
- L'**implémentation** Cosmos DB (`backend/src/data/repository.cosmos.ts`) sera créée en PM2.
- Toutes les Azure Functions accèdent aux données via l'interface, pas via le SDK directement.
- Error classes: `ConflictError`, `NotFoundError`, `ValidationError`, `CapacityReductionError`, `ForbiddenError`.

### 4. Azure Functions Handlers (One Route = One Function)

Après PM4, le skeleton cible est :
```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

async function rawHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const userId = getCurrentUserId(request);
  const body = await parseBody(request, BodySchema);
  const repo = getRepository();
  const result = await repo.operation(/* ... */);
  return ok(result);
}

app.http('route-name', {
  methods: ['GET'],
  authLevel: 'anonymous', // auth via APIM JWT validation
  handler: withErrorHandling(rawHandler),
});
```

**Pendant la migration** (avant PM4), les handlers gardent la signature AWS Lambda `APIGatewayProxyHandlerV2WithJWTAuthorizer` — ne pas les modifier sans avoir complété PM3 (auth) en parallèle.

### 5. Frontend Integration

- **Auth**: MSAL.js v3 (`@azure/msal-browser` + `@azure/msal-react`) — remplace Amplify Auth (PM3).
- **Data fetching**: React Query avec hooks définis dans `frontend/src/api/hooks.ts` — inchangé.
- **Query keys**: Hierarchiques (ex. `['rooms', roomId, 'bookings', from]`).
- **Configuration**: Chargée depuis `/config.json` au runtime, injectée à deploy-time par Bicep/az CLI.
  - Champs : `apiBaseUrl`, `tenantId`, `clientId`, `cdnDomain`, `stage`
  - Note : `userPoolId`/`userPoolClientId` (Cognito) → `tenantId`/`clientId` (Entra) en PM3.

### 6. Dates & Timezone
- **All date logic uses Europe/Paris timezone** (functions in `shared-types/src/dates.ts`).
- **Day-level dates**: `YYYY-MM-DD` (no time).
- **Instant dates**: ISO 8601 UTC.
- **Never use `Date.now()` directly** — use `todayIsoInAppTz()`.

### 7. Idempotence
- Optional `Idempotency-Key` header on `POST /v1/bookings` and `POST /v1/admin/bookings`.
- Idempotency records stored in Cosmos DB with 24h TTL.

### 8. Events & Notifications

- **Azure Service Bus topic** `clos-notifications-{stage}` publie les événements métier (BOOKING_CREATED, etc.).
- **Azure Function `notification-dispatcher`** consomme le topic Service Bus et envoie des emails via **Azure Communication Services Email**.
- **Azure Monitor Alerts** (email Action Group) remplace le SNS alarms topic pour les alertes ops.
- **Event schema** défini dans `shared-types/src/events.ts` — inchangé.

### 9. TypeScript & Validation
- **All inputs validated with Zod** (`backend/src/api/schemas/`).
- **Strict types everywhere**; no `any` except in exceptional cases.
- **DTO pattern**: shared types for requests/responses (`shared-types/src/dto.ts`).

---

## Deployment Strategy

### Two Stages
- **Development** (`dev`): PITR off, mock bookings seeded, Application Insights sampling réduit, logs 30 days (minimum PerGB2018 SKU).
- **Production** (`prod`): PITR on, no mock bookings, Application Insights full, logs 90 days.

### Bicep Module Deployment Order (cible post-PM1)

1. **data.bicep** — Cosmos DB, Azure Blob (photos + `$web`), Azure CDN (photos + SPA)
2. **auth.bicep** — Entra External ID app registration, Function App `clos-jobs` (auth-trigger)
3. **notifications.bicep** — Service Bus namespace + topic, ACS Email, Function `clos-jobs` (dispatcher + reconciliation)
4. **api.bicep** — Azure API Management, Function App `clos-api` (29 functions), WAF policy, Azure DNS
5. **frontend.bicep** — upload `frontend/dist/`, injection `config.json`

### Decoupling via Azure App Configuration
- **No ARM template outputs cross-module** — tout passe par **Azure App Configuration**.
- Convention de nommage : `clos-{stage}-{category}-{key}` (ex. `clos-dev-data-container-name`)
- Les secrets (SES from address, admin email) → **Azure Key Vault** (référencé par App Configuration via Key Vault reference)

### Région principale : France Central (`francecentral`)

Les certificats TLS pour Azure CDN sont gérés automatiquement — aucune contrainte de région spéciale (contrairement à ACM us-east-1 pour CloudFront).

---

## Testing Strategy

### Unit Tests
- **Backend**: `backend/src/**/*.test.ts` (vitest + mocks Cosmos DB SDK).
  - En PM2 : utiliser `jest-mock` ou `vi.mock()` pour mocker `@azure/cosmos` — remplace `aws-sdk-client-mock`.
- **Frontend**: `frontend/src/**/*.test.ts` (vitest + @testing-library/react).
- Run: `npm run test --workspace=backend` / `npm run test --workspace=frontend`.

### Integration Tests (Cosmos DB Emulator)
- En PM2 : les tests d'intégration utilisent le **Cosmos DB Emulator** local (Docker).
- Remplace LocalStack DynamoDB.
- `docker run -p 8081:8081 mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator`
- Endpoint : `https://localhost:8081` + clé émulateur par défaut.

### E2E Tests (Playwright)
- `frontend/tests/e2e/` avec 3 scénarios :
  1. Guest: login → browse rooms → create booking → verify in "My trips" → cancel.
  2. Admin: login → dashboard → create room → delete room (cascade) → verify KPI.
  3. Conflict: create booking → attempt conflicting booking → verify 409 error.
- Run: `npm run test:e2e --workspace=frontend` (requires deployed backend or emulators).
- **Bloqué par PM4** (Azure Functions fonctionnelles) + P10 (écrans migrés).

### CI/CD Workflow (cible PM8)
- **PR**: lint, typecheck, unit tests, build, `az deployment group validate`.
- **Merge to main**: deploy to dev + smoke tests.
- **Tag v*.*.***: deploy to prod (requires manual approval via GitHub environment).

---

## Important Files & Their Roles

| File / Path | Purpose |
|---|---|
| `specs/01-data-model.md` | Domain entities, data schema, Repository interface, seed strategy |
| `specs/02-api-contract.md` | All 27 routes, payloads, error codes, auth/ownership rules |
| `docs/migration-azure/01-audit-aws.md` | Audit complet de l'empreinte AWS (source de vérité pré-migration) |
| `docs/migration-azure/02-mapping-services.md` | Mapping AWS → Azure + décisions structurantes (D1–D6) |
| `dev/Plan.md` | Plan de phases P1–P12 + PM1–PM8, statuts, critères "fait" |
| `shared-types/src/domain.ts` | TypeScript interfaces (User, Room, Booking, HouseConfig) |
| `shared-types/src/dto.ts` | Request/response DTOs (CreateBookingInput, etc.) |
| `shared-types/src/dates.ts` | Date utilities (todayIsoInAppTz, intervalsOverlap, etc.) |
| `shared-types/src/events.ts` | Domain event types (inchangé) |
| `backend/src/data/repository.ts` | Interface Repository + classes d'erreurs (agnostique cloud) |
| `backend/src/data/repository.cosmos.ts` | Implémentation Cosmos DB (créée en PM2) |
| `backend/src/api/http.ts` | Utilities (CORS, auth, error mapping, `withErrorHandling`) — signatures AWS Lambda pendant PM1–PM3 |
| `backend/src/api/schemas/` | Zod schemas for every route |
| `backend/src/handlers/` | 32 function handlers (un fichier par route/trigger) |
| `backend/src/api/deps.ts` | Dependency injection (Repository, Logger, SDK clients) |
| `backend/scripts/seed.ts` | Initial data seeding (HouseConfig, Rooms, mock Bookings on dev) — à écrire en P7 |
| `infra/bicep/` | Modules Bicep Azure (créés en PM1) |
| `infra/bicep/parameters/dev.bicepparam` | Paramètres sandbox (nameSuffix=vgi, authBypassEnabled=true, enableEmailNotifications=false) |
| `docs/deployment-sandbox.md` | Guide de déploiement autonome pour le sandbox Azure restreint (5 étapes) |
| `infra/lib/` | CDK stacks AWS (archive — ne pas modifier) |
| `frontend/src/api/client.ts` | HTTP wrapper (fetch + auth token + error handling) |
| `frontend/src/api/hooks.ts` | React Query hooks (9 queries + 10 mutations) |
| `frontend/src/auth/AuthProvider.tsx` | Auth context (Amplify → MSAL.js en PM3) |

---

## Common Patterns

### Adding a New API Route (post-PM4)
1. **Spec it** in `specs/02-api-contract.md` § 2.2 or 2.3.
2. **Define DTO** in `shared-types/src/dto.ts`.
3. **Create Zod schema** in `backend/src/api/schemas/{route-name}.ts`.
4. **Write handler** in `backend/src/handlers/{route-name}.ts` (skeleton Azure Functions).
5. **Add tests** in `backend/src/handlers/{route-name}.test.ts`.
6. **Register in APIM** (`infra/bicep/modules/api.bicep`) avec la route et les paramètres.
7. **Add React Query hook** in `frontend/src/api/hooks.ts`.

### Handling Cosmos DB Errors (post-PM2)
- **409 Conflict** sur TransactionalBatch → `ConflictError` → 409 `BOOKING_CONFLICT`.
- **404 Not Found** → `NotFoundError` → 404 `NOT_FOUND`.
- **StatusCode 409 (etag mismatch)** → optimistic concurrency, retry ou `ConflictError`.
- All other Cosmos errors → 500 `INTERNAL_ERROR` (never expose raw error messages).

### Adding a New Domain Event (post-PM5)
1. Add type to `shared-types/src/events.ts`.
2. Publish from handler via `deps.publishEvent()` (Service Bus sender sous le capot).
3. Ajouter une subscription Service Bus pour le consumer dans `notifications.bicep`.
4. Ajouter le template email ACS et le mapping dans `notification-dispatcher.ts`.

### Managed Identity & RBAC (post-PM1)
- Chaque Function App (`clos-api`, `clos-jobs`) a une **System-Assigned Managed Identity**.
- Les RBAC assignments sont définis dans les modules Bicep (pas de credentials dans le code).
- Cosmos DB : `Cosmos DB Built-in Data Contributor` sur le container scope.
- Service Bus : `Azure Service Bus Data Sender` (handlers qui publient) / `Data Receiver` (dispatcher).
- Blob : `Storage Blob Data Contributor` (upload photos) / `Storage Blob Data Reader` (CDN).

---

## Prototype Migration (P10)

The root directory contains a static React prototype (`app.jsx`, `screens-*.jsx`, etc.) that will be archived once frontend is fully migrated to Vite. This phase has **no Azure dependency** and can start now.

- **Extract UI primitives** → `frontend/src/ui/` (buttons, cards, modals, etc.).
- **Extract styles** → copy `styles.css` verbatim to `frontend/src/styles.css`.
- **Replace mock data** — remove `data.jsx` imports, use React Query hooks instead.
- **Replace `AdminMode` toggle** — read from `useMe().data.role === 'admin'`.
- **Image uploads** → drag-drop via `useUploadRoomPhoto` mutation + direct Azure Blob PUT (SAS token) + `PATCH` room with photoUrl.

---

## Key Constraints & Non-Negotiables

1. **Application stack is fixed**: React 18 + TypeScript + Vite, Node.js 20 + Azure Functions v4 (isolated worker, arm64), Cosmos DB for NoSQL, Azure API Management, Entra External ID, Bicep IaC, GitHub Actions + OIDC.
2. **Region** is `francecentral` (Paris). Aucune contrainte de région spéciale pour les certificats TLS.
3. **No breaking changes to specs** — if you detect a contradiction, flag it **before coding**.
4. **Least-privilege Managed Identity** — chaque Function App a une Managed Identity avec des assignments RBAC précis (jamais de wildcard).
5. **No secrets in code** — sensitive values (admin email, ACS connection string) in **Azure Key Vault**.
6. **CORS always explicit** — origins list in `StageConfig` (Bicep parameters), never `*`.
7. **Error codes are canonical** — map from Zod/repository exceptions to HTTP codes exactly as spec table.
8. **Timezone is Europe/Paris everywhere** — no exceptions, no UTC shortcuts.
9. **Ne pas écrire de nouveau code AWS** — aucun nouveau `@aws-sdk/*`, `aws-cdk-lib`, `@aws-amplify/*` dans les nouvelles phases. Les fichiers AWS existants (P4–P6) sont en attente de migration uniquement.

---

## Troubleshooting

### `npm install` fails in a workspace
- Run `npm ci` at root (respects `package-lock.json`).
- Delete `node_modules` in affected workspace and retry.

### TypeScript errors across workspaces
- Run `npm run typecheck --workspaces` (reports all errors).
- Ensure `@clos/shared-types` is built first: `npm run build --workspace=shared-types`.

### Backend handler tests fail
- Check that `COSMOS_ENDPOINT` + `COSMOS_KEY` env vars are set in test setup (ou use emulator endpoint).
- Mock `@azure/cosmos` avec `vi.mock()` pour les tests unitaires.
- Ensure repository.cosmos.ts is tested separately (unit tests with mocked client).

### Bicep deployment fails
- Run `az deployment group validate` pour voir les erreurs ARM.
- Vérifier que les Key Vault references sont accessibles (RBAC `Key Vault Secrets User` sur la Function App Managed Identity).
- Vérifier que Azure App Configuration est peuplée avant le déploiement des Functions (sinon les env vars sont vides).

### Cosmos DB Emulator issues
- Vérifier que le container Docker tourne : `docker ps | grep cosmosdb`
- URL émulateur : `https://localhost:8081` — certificat auto-signé, désactiver la vérification TLS en dev.
- `TABLE_NAME` → `COSMOS_DATABASE` + `COSMOS_CONTAINER` (renaming en PM2).

### Entra External ID issues (post-PM3)
- Vérifier que le token JWT contient bien la claim `oid` (user ID) et les App Roles.
- Comparer l'audience (`aud`) du token avec le `clientId` configuré dans APIM JWT validation policy.
- En dev : utiliser `jwt.ms` pour décoder le token et inspecter les claims.

---

## Next Steps

**PM1 est terminé** (Bicep scaffold complet — tous les modules écrits, validés, `dev.bicepparam` sandbox configuré).

**Prochaine phase recommandée** :
- **P10** (migration écrans prototype → Vite) peut démarrer sans dépendance Azure.
- **PM2** (Cosmos DB) débloque P7 (seed) et PM4 (handlers).
- **Déploiement sandbox** disponible dès maintenant — voir `docs/deployment-sandbox.md`.

**Pre-deployment checklist (avant deploy prod)** :
- `npm run typecheck --workspaces` passes.
- `npm run test --workspaces` passes.
- `az deployment group validate --parameters prod.bicepparam` succeeds.
- E2E tests pass against dev.

---

## Contact & References

- **Specs applicatives** : `specs/` (README.md + 3 docs — source de vérité des exigences fonctionnelles).
- **Migration Azure** : `docs/migration-azure/` (audit + mapping + décisions).
- **Plan de phases** : `dev/Plan.md` (statuts P1–P12 + PM1–PM8).
- **Project overview** : `README.md` (user-facing features, prototype design tokens).

**All future Claude Code instances should read `specs/README.md` + `docs/migration-azure/02-mapping-services.md` first.**
