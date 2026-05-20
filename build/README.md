# Spécifications SDD — Le Clos Bon Accueil

> **Single Source of Truth** pour l'implémentation par Claude Code.
> Tous les fichiers de ce dossier sont rédigés en mode impératif et doivent
> être consommés tels quels, sans interprétation.

---

## Sommaire

| Fichier | Contenu | Quand le lire |
|---|---|---|
| [`01-data-model.md`](./01-data-model.md) | Entités TypeScript, Single Table DynamoDB, GSI, règles d'intégrité transactionnelles, repository, seed, dates, identifiants, idempotence, DTO | **En tout premier**, avant tout code |
| [`02-api-contract.md`](./02-api-contract.md) | Routes REST, payloads, codes d'erreur, auth/ownership, mapping Lambdas, événements SNS, utilitaires HTTP, intégration frontend (hooks React Query) | Pour implémenter chaque handler et chaque hook |
| [`03-infrastructure.md`](./03-infrastructure.md) | Organisation monorepo, stacks CDK (Data, Auth, Notifications, Api, Frontend), config par stage, DNS/ACM, sécurité, RGPD, CI/CD, plan de bring-up, variables d'env | Pour structurer le repo et déployer |

---

## Hiérarchie des décisions

1. **Spec >** code existant : si le code du prototype contredit une spec, la spec prévaut.
2. **Plus précis >** plus général : une règle d'une section spécifique prévaut sur une convention globale.
3. **Sécurité >** convenance : aucune entorse aux règles IAM ni au CORS ni au RGPD pour des raisons de simplicité.

---

## Stack technique imposée (non négociable)

- **Frontend** : React 18 + TypeScript + Vite + React Query + Amplify Auth v6 + dayjs
- **Backend** : Node.js 20 + TypeScript + Lambda (arm64) + Zod + Powertools v2 + uuid v7
- **BDD** : DynamoDB Single Table Design (3 GSI)
- **API** : API Gateway REST + Cognito User Pools Authorizer
- **Auth** : Cognito User Pool (USER_PASSWORD_AUTH, pas de Hosted UI)
- **Infra** : AWS CDK v2 (TypeScript) + esbuild bundling
- **CI/CD** : GitHub Actions + OIDC

Région principale : `eu-west-3` (Paris). Région secondaire (certificats CloudFront uniquement) : `us-east-1`.

---

## Conventions d'implémentation

### Nommage
- Fichiers handlers : `kebab-case.ts` (ex: `admin-bookings-update.ts`).
- Types/interfaces : `PascalCase`.
- Variables/fonctions : `camelCase`.
- Constantes globales : `SCREAMING_SNAKE_CASE`.
- Stacks CDK : `ClosBonAccueil-{StackName}-{Stage}`.
- Ressources AWS : `clos-{resource}-{stage}-{suffix?}`.

### Imports
- Toujours utiliser le package `@clos/shared-types` pour les types domain/dto/dates/events.
- Jamais d'import direct entre `frontend/src` et `backend/src` (interdit par les workspaces npm).

### Erreurs
- Jamais de `throw new Error(...)` nu dans le code métier.
- Toujours une des classes typées : `ConflictError`, `NotFoundError`, `ValidationError`, `CapacityReductionError`, `ForbiddenError`, ou `ApiError` (côté frontend).

### Tests
- Tests unitaires `*.test.ts` à côté des fichiers source.
- Tests d'intégration `backend/test/integration/*.test.ts` (LocalStack).
- Tests E2E `frontend/tests/e2e/*.spec.ts` (Playwright).

---

## Points de contact entre les 3 specs

| Sujet | Spec primaire | Référencé dans |
|---|---|---|
| Types `Room`, `Booking`, `User`, `HouseConfig` | 01 § 1.1 | 02 (payloads), 03 (shared-types) |
| GSI3 pour `findBookingById` | 01 § 1.2.3 + § 1.3 | 02 § 2.2 (routes PATCH/DELETE/GET /bookings/{id}) |
| Mapping erreur → HTTP | 02 § 2.1.5 + § 2.7 | 01 § 1.5 (classes d'erreur) |
| Variables d'env Lambda | 03 § 3.12 | 02 § 2.5 (handlers) |
| Découplage stacks via SSM | 03 § 3.2.1 | 03 § 3.2.2–3.2.6 |
| Timezone Europe/Paris | 01 § 1.8 | 02 (dates), 03 (cron reconciliation) |
| Idempotence | 01 § 1.10 | 02 § 2.1.9 + § 2.2 (POST bookings) |
| Anti-double-booking (Phase 1+2) | 01 § 1.4.1 | 02 § 2.2 (POST bookings) |
| RGPD | 03 § 3.7.5 | 02 § 2.4 (routes /me) |
