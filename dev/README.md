# Spécifications SDD — Le Clos Bon Accueil

> **Single Source of Truth** pour l'implémentation par Claude Code.
> Tous les fichiers de ce dossier sont rédigés en mode impératif et doivent
> être consommés tels quels, sans interprétation.

---

## Sommaire

| Fichier | Contenu | Quand le lire |
|---|---|---|
| [`01-data-model.md`](./01-data-model.md) | Entités TypeScript, Cosmos DB container design, patterns d'accès, règles d'intégrité transactionnelles (TransactionalBatch), repository, seed, dates, identifiants, idempotence, DTO | **En tout premier**, avant tout code |
| [`02-api-contract.md`](./02-api-contract.md) | Routes REST, payloads, codes d'erreur, auth/ownership, mapping Azure Functions, événements Service Bus, utilitaires HTTP, intégration frontend (hooks React Query) | Pour implémenter chaque handler et chaque hook |
| [`03-infrastructure.md`](./03-infrastructure.md) | ⚠️ Archive AWS — voir [`docs/migration-azure/03-infrastructure-azure.md`](../docs/migration-azure/03-infrastructure-azure.md) pour la cible actuelle | Référence de migration PM1–PM8 uniquement |

---

## Hiérarchie des décisions

1. **Spec >** code existant : si le code du prototype contredit une spec, la spec prévaut.
2. **Plus précis >** plus général : une règle d'une section spécifique prévaut sur une convention globale.
3. **Sécurité >** convenance : aucune entorse aux règles IAM ni au CORS ni au RGPD pour des raisons de simplicité.

---

## Stack technique imposée (non négociable)

- **Frontend** : React 18 + TypeScript + Vite + React Query + **MSAL.js v3** (`@azure/msal-browser`) + dayjs
- **Backend** : Node.js 20 + TypeScript + **Azure Functions v4** (isolated worker, arm64) + Zod + uuid v7 + `applicationinsights`
- **BDD** : **Cosmos DB for NoSQL** — container unique, partition key `/pk`, Serverless
- **API** : **Azure API Management** (Consumption) + JWT validation Entra + WAF policy
- **Auth** : **Microsoft Entra External ID** (invitation-only, App Roles: admin/guest, MSAL Authorization Code PKCE)
- **Infra** : **Bicep** (`infra/bicep/`) + `az deployment group` — CDK AWS conservé en archive (`infra/lib/`)
- **CI/CD** : GitHub Actions + **OIDC `azure/login@v2`** (Federated Credential, pas de secret)
- **Notifications** : **Azure Service Bus Standard** (topic) + **ACS Email**
- **Observabilité** : **Application Insights** + Log Analytics workspace + Azure Monitor Alerts

Région principale : `francecentral` (Paris). Aucune contrainte de région secondaire.

---

## Conventions d'implémentation

### Nommage
- Fichiers handlers : `kebab-case.ts` (ex: `admin-bookings-update.ts`).
- Types/interfaces : `PascalCase`.
- Variables/fonctions : `camelCase`.
- Constantes globales : `SCREAMING_SNAKE_CASE`.
- Modules Bicep : `data`, `auth`, `notifications`, `api`, `frontend`.
- Ressources Azure : `clos-{resource}-{stage}` (ex. `clos-cosmos-dev`).
- Resource groups : `rg-clos-bon-accueil-{stage}`.

### Imports
- Toujours utiliser le package `@clos/shared-types` pour les types domain/dto/dates/events.
- Jamais d'import direct entre `frontend/src` et `backend/src` (interdit par les workspaces npm).

### Erreurs
- Jamais de `throw new Error(...)` nu dans le code métier.
- Toujours une des classes typées : `ConflictError`, `NotFoundError`, `ValidationError`, `CapacityReductionError`, `ForbiddenError`, ou `ApiError` (côté frontend).

### Tests
- Tests unitaires `*.test.ts` à côté des fichiers source.
- Tests d'intégration `backend/test/integration/*.test.ts` (**Cosmos DB Emulator** Docker).
- Tests E2E `frontend/tests/e2e/*.spec.ts` (Playwright).

---

## Points de contact entre les 3 specs

| Sujet | Spec primaire | Référencé dans |
|---|---|---|
| Types `Room`, `Booking`, `User`, `HouseConfig` | 01 § 1.1 | 02 (payloads), 03 (shared-types) |
| GSI3 pour `findBookingById` | 01 § 1.2.3 + § 1.3 | 02 § 2.2 (routes PATCH/DELETE/GET /bookings/{id}) |
| Mapping erreur → HTTP | 02 § 2.1.5 + § 2.7 | 01 § 1.5 (classes d'erreur) |
| Variables d'env Azure Functions | docs/migration-azure/03 § 3.12 | 02 § 2.5 (handlers) |
| Découplage modules via App Configuration | docs/migration-azure/03 § 3.2.1 | docs/migration-azure/03 § 3.2.2–3.2.6 |
| Timezone Europe/Paris | 01 § 1.8 | 02 (dates), 03 (cron reconciliation) |
| Idempotence | 01 § 1.10 | 02 § 2.1.9 + § 2.2 (POST bookings) |
| Anti-double-booking (Phase 1+2) | 01 § 1.4.1 | 02 § 2.2 (POST bookings) |
| RGPD | 03 § 3.7.5 | 02 § 2.4 (routes /me) |
