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

## ✅ Phase P8 — Frontend : bootstrap Vite + Auth

**Date** : 2026-05-26

### Fichiers créés/modifiés

| Fichier | Description |
|---|---|
| `frontend/package.json` | Dépendances pinnées : react 18.3.1, react-dom 18.3.1, @aws-amplify/auth 6.20.0, @tanstack/react-query 5.100.14, dayjs 1.11.13, vite 5.4.21, @vitejs/plugin-react 4.7.0, vitest 1.6.1, @testing-library/react 16.3.2 |
| `frontend/tsconfig.json` | Ajout de `"types": ["vitest/globals"]` |
| `frontend/vite.config.ts` | Plugin React, target es2020, test environment jsdom + setupFiles |
| `frontend/index.html` | Point d'entrée HTML |
| `frontend/src/main.tsx` | Entry-point React avec QueryClientProvider (staleTime 30s, retry 1) |
| `frontend/src/App.tsx` | Composant racine qui monte AuthProvider |
| `frontend/src/config.ts` | Lecteur de `/config.json` avec cache (fallback `window.CONFIG`) |
| `frontend/src/vite-env.d.ts` | Triple-slash `/// <reference types="vite/client" />` |
| `frontend/src/test-setup.ts` | Import `@testing-library/jest-dom` pour les matchers |
| `frontend/src/auth/AuthProvider.tsx` | Context React `{ user, isLoading, signOut }` — charge config.json, configure Amplify, vérifie session existante |
| `frontend/src/auth/LoginScreen.tsx` | Formulaire email/password, gère challenge `NEW_PASSWORD_REQUIRED`, affiche erreurs Cognito user-friendly |
| `frontend/src/auth/LoginScreen.test.tsx` | 2 tests unitaires (rendu email/password/bouton, titre) |

### Commandes exécutées et résultats

```
$ npm install
✅ 135 packages ajoutés (530 audités)

$ npm run typecheck --workspace=frontend
✅ 0 errors

$ npm run test --workspace=frontend
✅ 2 tests pass
   LoginScreen.test.tsx : 2 tests

$ npm run build --workspace=frontend
✅ dist/index.html  0.33 kB
   dist/assets/index-DE6XT-Id.js  293.47 kB (gzip: 88.47 kB)
   Built in 14.96s
```

### Décisions / Obstacles

- React 19 et Vite 8 sont disponibles mais la spec impose React 18 → pinné à 18.3.1 / Vite 5.4.21.
- `Amplify.configure()` importé depuis `@aws-amplify/core` (dep directe de `@aws-amplify/auth@6`) — pas besoin d'installer `aws-amplify` complet.
- `vi.mock('@aws-amplify/auth')` dans le test pour éviter les appels réseaux Cognito en CI.
- `App.tsx` affiche un placeholder "Connecté — routes P10" : le vrai routeur sera branché en P10.
- Warning CJS de Vite dans les tests (déprécation build CJS Node API) : non bloquant, sera corrigé en P12 avec la config ESM stricte.

---

## ✅ Phase P9 — Frontend : client HTTP + hooks React Query

**Date** : 2026-05-26

### Fichiers créés/modifiés

| Fichier | Description |
|---|---|
| `frontend/src/api/client.ts` | Wrapper fetch : `Authorization: Bearer <jwt>`, retry 401 avec `fetchAuthSession({ forceRefresh: true })`, parse JSON, lève `ApiError`, `putExternal` pour S3 pré-signé |
| `frontend/src/api/hooks.ts` | 13 hooks query + 13 hooks mutation exactement comme § 2.9.2, query keys canoniques, invalidations onSuccess |
| `frontend/src/api/hooks.test.tsx` | 5 tests unitaires : useRooms (2), useCreateBooking (2), useDeleteRoom (1) |

### Commandes exécutées et résultats

```
$ npm run typecheck --workspace=frontend
✅ 0 errors

$ npm run test --workspace=frontend
✅ 7 tests pass
   hooks.test.tsx : 5 tests
   LoginScreen.test.tsx : 2 tests
```

### Décisions / Obstacles

- `beforeEach(() => vi.clearAllMocks())` retourne `VitestUtils` → conflit avec la signature `beforeEach` en mode strict. Corrigé avec la forme bloc `beforeEach(() => { vi.clearAllMocks(); })`.
- `useDeleteMe` invalide le cache entier via `queryClient.clear()` (l'utilisateur est déconnecté, toutes les données sont obsolètes).
- `useUploadRoomPhoto` fait deux appels : POST pour obtenir l'URL pré-signée, puis PUT direct vers S3 via `apiClient.putExternal` (sans header Authorization — auth dans les query params S3).
- `useDeleteBooking` invalide `['rooms']` (préfixe large) car l'input est juste un `bookingId` sans `roomId`.
- `useAdminBookings` : query key `['admin', 'bookings', filter, search]` avec `search` potentiellement `undefined` — React Query traite ce cas correctement.

---

## ✅ Phase PM2 — Data layer : Cosmos DB (implémentation Repository)

**Date** : 2026-05-28  
**Branche** : `feat/pm2-cosmos` → commit `f2aa4a9`

### Fichiers créés/modifiés

| Fichier | Description |
|---|---|
| `backend/src/data/repository.cosmos.ts` | Implémentation `IRepository` complète sur `@azure/cosmos` |
| `backend/src/data/repository.cosmos.test.ts` | 31 tests Vitest (tous passants) |
| `backend/package.json` | Ajout `@azure/cosmos ^4.1.0` + `@azure/identity ^4.4.0` |

### Architecture retenue

- **Container unique** `clos-bon-accueil-{stage}`, partition key `/pk`
- **Conventions de clés** :
  - Rooms → `pk = ROOM#<roomId>`, `id = ROOM#<roomId>#METADATA`
  - Bookings → `pk = ROOM#<roomId>`, `id = BOOKING#<bookingId>`
  - Guest refs → `pk = GUEST#<userId>`, `id = BOOKING_REF#<bookingId>` (pour `listMyBookings` efficace)
  - Users → `pk = USER#<userId>`, `id = USER#<userId>#METADATA`
  - HouseConfig → `pk = HOUSE_CONFIG`, `id = HOUSE_CONFIG#MAIN`
  - Idempotency → `pk = IDEMPOTENCY`, `id = IDEMPOTENCY#<key>`, TTL 86400s
- **Auth** : `COSMOS_KEY` en dev, `DefaultAzureCredential` (Managed Identity) en prod
- **Concurrence optimiste** : `accessCondition: { type: 'IfMatch', condition: _etag }` sur les `replace()`
- **Détection de conflit** : lecture de tous les bookings du `ROOM#<id>` partition + `intervalsOverlap()` côté code avant création (évite une GSI dédiée)
- **Guest refs** : créées/supprimées en miroir de chaque Booking pour `listMyBookings` sans cross-partition query

### Commandes exécutées et résultats

```
$ npm run build --workspace=shared-types
✅ 0 errors

$ node_modules/.bin/tsc --noEmit -p backend/tsconfig.json
✅ 0 errors

$ npm run test --workspace=backend -- src/data/repository.cosmos.test.ts
✅ 31 tests pass
   Rooms (5), Bookings (14), Users (3), HouseConfig (2), Idempotency (2),
   getBooking (2), findBookingById (1), listAllBookings (2)
```

### Décisions / Obstacles

- `ttl` : la propriété Cosmos `ttl` doit être positionnée **après** le spread du record pour ne pas être écrasée par le champ `ttl` éventuel du record source → corrigé en mettant `ttl: 86400` en dernier.
- `mockQueryFn` distinct de `mockQuery` : le mock Vitest capturait les args de `fetchAll` (pas de `query`) — séparé en deux mocks distincts pour pouvoir asserter le `SqlQuerySpec` passé à `.query()`.
- L'interface `IRepository` reste **inchangée** — les 32 handlers existants ne bougent pas.

---
