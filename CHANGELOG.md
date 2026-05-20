# CHANGELOG — Le Clos Bon Accueil

---

## ✅ Phase P1 — Scaffold du monorepo npm workspaces

**Date** : 2026-05-20

### Fichiers créés

| Fichier / Dossier | Description |
|---|---|
| `package.json` | Racine workspaces (shared-types, backend, frontend, infra) |
| `tsconfig.base.json` | Config TypeScript partagée (strict, ES2020, commonjs) |
| `.eslintrc.json` | ESLint v8 + @typescript-eslint + prettier |
| `.prettierrc.json` | 2 espaces, trailingComma es5, semi, printWidth 100 |
| `.gitignore` | node_modules, dist, cdk.out, .env, coverage, cdk.context.json |
| `specs/` | Copie des specs de référence (01-data-model, 02-api-contract, 03-infrastructure, README) |
| `shared-types/package.json` | Workspace @clos/shared-types |
| `shared-types/tsconfig.json` | Extends tsconfig.base.json, rootDir=src |
| `shared-types/src/index.ts` | Stub placeholder (sera remplacé en P2) |
| `backend/package.json` | Workspace @clos/backend, dépend de @clos/shared-types |
| `backend/tsconfig.json` | Extends tsconfig.base.json, include src + scripts |
| `backend/src/index.ts` | Stub placeholder (sera remplacé en P3) |
| `frontend/package.json` | Workspace @clos/frontend, dépend de @clos/shared-types |
| `frontend/tsconfig.json` | Extends tsconfig.base.json, jsx=react-jsx, module=ESNext |
| `frontend/src/index.ts` | Stub placeholder (sera remplacé en P8) |
| `infra/package.json` | Workspace @clos/infra, CDK v2.147.3 |
| `infra/tsconfig.json` | Extends tsconfig.base.json, include lib + bin |
| `infra/lib/index.ts` | Stub placeholder (sera remplacé en P6) |
| `infra/bin/app.ts` | Stub placeholder CDK entry-point (sera remplacé en P6) |

### Commandes exécutées et résultats

```
$ npm install
✅ 218 packages installés (2m)

$ npm run typecheck --workspaces
✅ @clos/shared-types : 0 errors
✅ @clos/backend : 0 errors
✅ @clos/frontend : 0 errors
✅ @clos/infra : 0 errors
```

### Décisions / Obstacles

- `dev/` (non-tracké git) contient les orchestration files. Les 4 specs ont été copiés dans `specs/` pour correspondre aux références du PROMPT-ORCHESTRATEUR (`specs/01-data-model.md § X.X`).
- `build/` (anciens fichiers trackés, déjà supprimés du disque) : supprimés de l'index git via `git rm -r --cached build/`.
- Stubs `export {};` créés dans chaque workspace pour satisfaire TypeScript (`TS18003 : No inputs found`). Ils seront remplacés phase par phase.

---

## ✅ Phase P2 — Implémentation de `@clos/shared-types`

**Date** : 2026-05-20

### Fichiers créés/modifiés

| Fichier | Description |
|---|---|
| `shared-types/src/domain.ts` | 4 interfaces : User, Room, Booking, HouseConfig + RoomPhotoTint + ROOM_PHOTO_TINTS |
| `shared-types/src/dto.ts` | 10 Input/Output interfaces + BookingFilter + ApiError class |
| `shared-types/src/dates.ts` | todayIsoInAppTz, toAppDateString, nightsBetween, intervalsOverlap + APP_TIMEZONE |
| `shared-types/src/events.ts` | Type union DomainEvent (5 variants) |
| `shared-types/src/index.ts` | Re-exports de tous les modules |
| `shared-types/package.json` | Dépendance dayjs@1.11.13 (pinnée) |
| `shared-types/src/dates.test.ts` | 19 tests unitaires |

### Commandes exécutées et résultats

```
$ npm run typecheck --workspace=shared-types
✅ 0 errors

$ npm run test --workspace=shared-types
✅ 19 tests pass
   APP_TIMEZONE (1), todayIsoInAppTz (3), toAppDateString (4),
   nightsBetween (5), intervalsOverlap (6)
```

### Décisions / Obstacles

- `intervalsOverlap` : `s1 < e2 && s2 < e1` — correct pour YYYY-MM-DD lexicographique.
- Tests `toAppDateString` : couvrent UTC+1 hiver et UTC+2 été.

---

## ✅ Phase P3 — Backend : Repository et erreurs typées

**Date** : 2026-05-21

### Fichiers créés/modifiés

| Fichier | Description |
|---|---|
| `backend/src/data/repository.ts` | Interface `Repository` (20 méthodes), 5 classes d'erreur typées, stub factory |
| `backend/src/data/repository.test.ts` | 15 tests (5 classes d'erreur) |
| `backend/src/shared/identifiers.ts` | `generateBookingReference()` — CLOS-XXXXXXXX, base32 sans ambiguïté |
| `backend/src/shared/identifiers.test.ts` | 5 tests |
| `backend/src/api/http.ts` | ok, created, noContent, errorResponse, auth helpers, parseBody/Query/Path, withErrorHandling |
| `backend/src/api/http.test.ts` | 25 tests (helpers HTTP + 8 mappings d'erreur) |
| `backend/src/api/logger.ts` | Singleton Powertools Logger |
| `backend/src/api/deps.ts` | `getRepository()` singleton |
| `backend/package.json` | Dépendances pinnées (@aws-sdk, Powertools, zod, uuid, @types/node) |

### Commandes exécutées et résultats

```
$ npm run typecheck --workspace=backend
✅ 0 errors

$ npm run test --workspace=backend
✅ 45 tests pass
   repository.test.ts : 15 tests
   identifiers.test.ts : 5 tests
   http.test.ts : 25 tests
```

### Décisions / Obstacles

- Fonctions HTTP retournent `APIGatewayProxyStructuredResultV2` (évite union `| string`).
- Erreurs DynamoDB catchées par `err.name` (pas de dépendance supplémentaire sur les SDK types).
- `_resetRepository()` exposé pour tests unitaires des handlers (P4).

---
