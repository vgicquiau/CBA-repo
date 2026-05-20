# PROMPT — Phase Implementation by Claude Code

**Contexte** : Tu es responsable de l'implémentation complète d'une application AWS Serverless (Le Clos Bon Accueil). Les specs/ contiennent la SoT absolue. Tu dois procéder par **12 phases courtes, séquentielles et vérifiables**.

**Règles d'or NON NÉGOCIABLES** :
1. **Une phase à la fois.** N'avance à la phase suivante que si la phase actuelle est 100% complète et validée.
2. **Après chaque phase, tu génères un bloc commit Git** avec le message standardisé.
3. **Tu mets à jour le `CHANGELOG.md` à la racine du projet** avec :
   - L'en-tête de phase (ex: `## ✅ Phase P2 — Implémentation de @clos/shared-types`)
   - Les fichiers créés/modifiés
   - Les commandes de test lancées et leur résultat
   - Les éventuels obstacles rencontrés et leur solution
4. **Tu fournis une checklist de validation manuelle** à la fin de chaque phase.
5. **Si tu détectes une ambiguïté dans les specs**, tu signales et tu demandes clarification — tu ne décides PAS seul.
6. **Versions pinnées uniquement** : jamais de `^` ni `~` dans les `package.json`.
7. **Pas de secrets en clair** : tout ce qui ressemble à un email, URL, clé API va dans SSM Parameter Store ou en variable d'env.

---

## PHASE P1 — Scaffold du monorepo npm workspaces

**Objectif** : créer l'architecture de base du projet avec tous les workspaces, configs TypeScript/ESLint/Prettier partagées, et vérifier que `npm install` fonctionne.

**Livrables attendus** :
- `package.json` racine avec `"workspaces": ["shared-types", "backend", "frontend", "infra"]` et dépendances partagées (typescript, eslint, prettier).
- `tsconfig.base.json` à la racine (extends par tous).
- `tsconfig.json` dans chaque workspace.
- `.eslintrc.json`, `.prettierrc.json` à la racine.
- `.gitignore` complet.
- Dossiers `shared-types/src`, `backend/src`, `frontend/src`, `infra/lib`.
- `npm install` à la racine fonctionne sans erreur.
- Pas de contenu métier yet — juste la structure.

**Tâches à accomplir** :
1. Initialise le repo Git avec `git init`.
2. Crée la structure de dossiers.
3. Rédige le `package.json` racine avec les workspaces.
4. Crée les `package.json` de chaque workspace (vides pour l'instant, dépendances ajoutées en phase P2+).
5. Rédige `tsconfig.base.json` avec `strict: true`, `target: ES2020`, `moduleResolution: node`.
6. Crée `.eslintrc.json` (ESLint v8 + plugin TypeScript + Prettier integration).
7. Crée `.prettierrc.json` (2 espaces, trailing comma, semi).
8. Lance `npm install` et vérifie que tout install sans erreur.
9. Teste : `npm run typecheck` (doit passer trivialement, il n'y a pas de code).

**Après cette phase** :
- Lance `npm run typecheck` et fournis le résultat.
- Fournis un `git log --oneline` court (1-2 commits).
- Mets à jour `CHANGELOG.md` avec la section P1.
- **PAUSE.** Attends ma validation avant P2.

---

## PHASE P2 — Implémentation de `@clos/shared-types`

**Objectif** : créer le package `@clos/shared-types` qui contient **TOUS** les types partagés frontend/backend. C'est le contrat central.

**Source de vérité** : `specs/01-data-model.md § 1.1`, `§ 1.8`, `§ 1.11` + `specs/02-api-contract.md § 2.6.2`.

**Livrables attendus** :
- `shared-types/src/domain.ts` : interfaces `User`, `Room`, `Booking`, `HouseConfig`, types `RoomPhotoTint`, constante `ROOM_PHOTO_TINTS`.
- `shared-types/src/dto.ts` : tous les Input (CreateBookingInput, etc.), Output (AvailabilityResult, etc.), et type `BookingFilter`.
- `shared-types/src/dates.ts` : fonction `todayIsoInAppTz()`, `toAppDateString()`, `nightsBetween()`, `intervalsOverlap()`. Utilise `dayjs@1.11.x` avec plugins `utc` et `timezone`.
- `shared-types/src/events.ts` : type `DomainEvent` union.
- `shared-types/src/index.ts` : exports de tous les ci-dessus.
- `shared-types/package.json` : dépendance `dayjs@1.11.x` pinnée.
- Tests unitaires `shared-types/src/*.test.ts` pour les fonctions de dates (au moins 3 tests par fonction).

**Tâches à accomplir** :
1. Rédige `domain.ts` **exactement** comme spécifié § 1.1 (copie mot-pour-mot les interfaces).
2. Rédige `dto.ts` **exactement** comme spécifié § 1.11.
3. Rédige `dates.ts` avec implémentation `dayjs` : cf. spec 01 § 1.8.
4. Rédige `events.ts` avec la type union complète : cf. spec 02 § 2.6.2.
5. Rédige les tests unitaires pour `dates.ts`.
6. `npm install @clos/shared-types --workspace=shared-types` (installer dayjs).
7. Lance `npm run typecheck --workspace=shared-types` — doit passer 100%.
8. Lance `npm run test --workspace=shared-types` — tous les tests doivent passer.

**Après cette phase** :
- Lance `npm run typecheck --workspace=shared-types` et fournis le résultat (doit être : 0 errors).
- Lance `npm run test --workspace=shared-types` et fournis le résultat (tous les tests verts).
- Fournis un `git log --oneline` (1-2 commits).
- Mets à jour `CHANGELOG.md` section P2.
- **PAUSE.** Attends ma validation avant P3.

---

## PHASE P3 — Backend : Repository et erreurs typées

**Objectif** : implémenter la couche d'accès aux données (repository pattern) avec toutes les classes d'erreur et les interfaces métier. Aucune Lambda n'existe yet.

**Source de vérité** : `specs/01-data-model.md § 1.3`, `§ 1.4`, `§ 1.5` + `specs/02-api-contract.md § 2.7`.

**Livrables attendus** :
- `backend/src/data/repository.ts` :
  - Interface `Repository` avec les 20+ méthodes listées § 1.5.
  - Classes : `ConflictError`, `NotFoundError`, `ValidationError`, `CapacityReductionError`, `ForbiddenError` (toutes extends Error).
  - Interface `IdempotencyRecord`.
  - Fonction factory `createRepository(ddb, tableName): Repository` qui retourne une implémentation (juste un stub pour l'instant, pas d'implémentation DynamoDB réelle yet).
- `backend/src/shared/identifiers.ts` :
  - Fonction `generateBookingReference(): string` — format `CLOS-XXXXXXXX`.
  - Utilise `crypto.randomBytes(8)` + alphabet base32 sans ambiguïté.
- `backend/src/api/http.ts` :
  - Types réexportés depuis Lambda : `APIGatewayProxyHandlerV2`, etc.
  - Utilitaires : `ok()`, `created()`, `noContent()`, `errorResponse()`.
  - Auth : `getCurrentUserId()`, `getCurrentUserGroups()`, `requireRole()`, `requireOwnership()`.
  - Parsing : `parseBody()`, `parseQuery()`, `getPathParam()` (utilise Zod).
  - Wrapper : `withErrorHandling()` qui mappe les exceptions → réponses HTTP (cf. § 2.1.5 + § 2.7).
- `backend/src/api/logger.ts` : instance singleton `logger` via Powertools.
- `backend/src/api/deps.ts` : function `getRepository()` qui retourne une instance singleton (utilise une variable module-level).
- Tests unitaires `backend/src/**/*.test.ts` pour chaque classe d'erreur et utilitaire HTTP.
- `backend/package.json` : dépendances `@aws-sdk/lib-dynamodb@3.x`, `@aws-lambda-powertools/logger@2.x`, `uuid@10.x`, `zod@3.23.x` (toutes pinnées).

**Tâches à accomplir** :
1. Crée le dossier `backend/src/{data,api,shared}`.
2. Rédige `repository.ts` avec les interfaces, pas d'implémentation DynamoDB yet.
3. Rédige toutes les classes d'erreur.
4. Rédige `identifiers.ts` avec `generateBookingReference()`.
5. Rédige `http.ts` avec tous les utilitaires. **IMPORTANT** : pour `withErrorHandling()`, ajoute le mapping complet des erreurs vers HTTP selon le tableau § 2.1.5 :
   - ZodError → 400 VALIDATION_FAILED.
   - ValidationError → 400 VALIDATION_FAILED.
   - ForbiddenError → 403 FORBIDDEN.
   - NotFoundError → 404 NOT_FOUND.
   - ConflictError → 409 BOOKING_CONFLICT.
   - CapacityReductionError → 422 CAPACITY_REDUCTION_BLOCKED.
   - Autres Error → 500 INTERNAL_ERROR.
6. Rédige `logger.ts` avec instance Powertools.
7. Rédige `deps.ts` qui expose `getRepository()`.
8. Rédige les tests unitaires.
9. Lance `npm run typecheck --workspace=backend`.
10. Lance `npm run test --workspace=backend`.

**Après cette phase** :
- Lance `npm run typecheck --workspace=backend` et fournis le résultat.
- Lance `npm run test --workspace=backend` et fournis le résultat.
- Fournis un `git log --oneline` (3-5 commits).
- Mets à jour `CHANGELOG.md` section P3.
- **PAUSE.** Attends ma validation avant P4.

---

## PHASE P4 — Backend : Lambdas API (handlers)

**Objectif** : implémenter les 25 handlers Lambda pour les 25 routes de l'API Gateway. Chacun suit le squelette standard (§ 2.8), utilise le repository (même si c'est juste un stub), et est wrappé par `withErrorHandling()`.

**Source de vérité** : `specs/02-api-contract.md § 2.2` à `§ 2.4` (routes), `§ 2.5` (mapping Lambdas), `§ 2.7`–`§ 2.8` (squelette + utilitaires).

**Livrables attendus** :
- 25 fichiers handlers dans `backend/src/handlers/{route}.ts` (ex: `health.ts`, `me-get.ts`, `rooms-list.ts`, etc.) selon la liste § 2.5.
- Chaque handler a un test unitaire `handlers/{route}.test.ts`.
- Schemas Zod pour tous les inputs dans `backend/src/api/schemas/{route}.ts`.
- Export canonique : `export const handler = withErrorHandling(rawHandler);`.

**Tâches à accomplir** :
Pour chaque groupe de routes (guest publiques, bookings, admin bookings, rooms, users, house), crée les handlers dans cet ordre :

1. **Groupe 1 — Routes de base (3 handlers)** :
   - `health.ts` : `GET /v1/health` → 200 `{status, timestamp}`.
   - `me-get.ts` : `GET /v1/me` → User courant (utilise `getCurrentUserId`).
   - `house-get.ts` : `GET /v1/house` → HouseConfig (avec filtre address).

2. **Groupe 2 — Rooms (4 handlers)** :
   - `rooms-list.ts` : `GET /v1/rooms` → `{rooms: Room[]}`.
   - `rooms-get.ts` : `GET /v1/rooms/{roomId}` → Room.
   - `room-bookings-list.ts` : `GET /v1/rooms/{roomId}/bookings` → `{bookings}` avec privacy filter.
   - `room-availability.ts` : `GET /v1/rooms/{roomId}/availability` → AvailabilityResult.

3. **Groupe 3 — Bookings guest (4 handlers)** :
   - `bookings-list-mine.ts` : `GET /v1/bookings/me` → liste des bookings du user courant.
   - `bookings-get.ts` : `GET /v1/bookings/{bookingId}` → Booking (avec ownership check).
   - `bookings-create.ts` : `POST /v1/bookings` → 201 Booking (avec idempotency key support § 2.1.9).
   - `bookings-update.ts` : `PATCH /v1/bookings/{bookingId}` → Booking (avec ownership check).
   - `bookings-delete.ts` : `DELETE /v1/bookings/{bookingId}` → 204 (avec ownership check).

4. **Groupe 4 — Admin dashboard & bookings (6 handlers)** :
   - `admin-dashboard.ts` : `GET /v1/admin/dashboard` → DashboardData (require admin role).
   - `admin-bookings-list.ts` : `GET /v1/admin/bookings` → avec filters (require admin).
   - `admin-bookings-get.ts` : `GET /v1/admin/bookings/{bookingId}` → (require admin).
   - `admin-bookings-create.ts` : `POST /v1/admin/bookings` → 201 (require admin).
   - `admin-bookings-update.ts` : `PATCH /v1/admin/bookings/{bookingId}` → (require admin, peut modifier roomId).
   - `admin-bookings-delete.ts` : `DELETE /v1/admin/bookings/{bookingId}` → 204 (require admin).

5. **Groupe 5 — Admin rooms (4 handlers)** :
   - `admin-rooms-create.ts` : `POST /v1/admin/rooms` → 201.
   - `admin-rooms-update.ts` : `PATCH /v1/admin/rooms/{roomId}` → 200 (gère la validation capacity).
   - `admin-rooms-delete.ts` : `DELETE /v1/admin/rooms/{roomId}` → DeleteRoomResult (cascade).
   - `admin-rooms-photo-url.ts` : `POST /v1/admin/rooms/{roomId}/photo-upload-url` → PhotoUploadUrlResponse.

6. **Groupe 6 — Admin users & house (4 handlers)** :
   - `admin-users-list.ts` : `GET /v1/admin/users` → User[].
   - `admin-users-invite.ts` : `POST /v1/admin/users/invite` → 201 User (crée dans Cognito + DDB).
   - `admin-users-delete.ts` : `DELETE /v1/admin/users/{userId}` → 200.
   - `admin-house-get.ts` : `GET /v1/admin/house` → HouseConfig.
   - `admin-house-update.ts` : `PATCH /v1/admin/house` → HouseConfig.

7. **Groupe 7 — User RGPD (2 handlers)** :
   - `me-delete.ts` : `DELETE /v1/me` → 204 (RGPD).
   - `me-export.ts` : `GET /v1/me/export` → export JSON (RGPD).

**Implémentation** :
- Chaque handler utilise `repository` comme si c'était une vraie implémentation (même si c'est juste un stub retournant des valeurs mock).
- Tous les handlers sont wrappés par `withErrorHandling()` à l'export.
- La validation input est toujours via Zod.
- Les réponses 2xx utilisent `ok()`, `created()`, `noContent()`.
- Les erreurs métier lèvent les classes du repository, jamais une Error nue.
- Logging via `logger.info()` / `logger.error()` (Powertools) à minima sur les entrées/sorties importants.

**Tests** :
- Un test par handler minimum. Exemple : `health.test.ts` teste que le handler retourne 200 avec `{status: "ok"}`.
- Mock du `repository` via `vi.mock('../data/repository')`.

**Après cette phase** :
- Lance `npm run typecheck --workspace=backend` : 0 errors.
- Lance `npm run test --workspace=backend` : tous les tests verts.
- Fournis un `git log --oneline` (vous devriez avoir ~15 commits pour les 25 handlers).
- Mets à jour `CHANGELOG.md` section P4 avec la liste des 25 handlers.
- **PAUSE.** Attends ma validation avant P5.

---

## PHASE P5 — Backend : Lambdas hors API Gateway

**Objectif** : implémenter les 3 Lambdas qui ne sont **pas** sur API Gateway.

**Source de vérité** : `specs/01-data-model.md § 1.4.1` (reconciliation), `specs/02-api-contract.md § 2.3` + `§ 2.6`, `specs/03-infrastructure.md § 3.2.3`.

**Livrables attendus** :
- `backend/src/handlers/auth-post-confirmation.ts` : Lambda Cognito trigger `post-confirmation`.
  - Lit `event.request.userAttributes.sub` (userId Cognito).
  - Crée un item User en DynamoDB via `repo.createUser()`.
  - Idempotent : `attribute_not_exists(pk)` sur le Put.
  - Test unitaire.
- `backend/src/handlers/notification-dispatcher.ts` : Lambda SNS subscriber.
  - Input : SNS message avec `DomainEvent`.
  - Parsage de l'événement.
  - Switch sur `type` (BOOKING_CREATED, BOOKING_UPDATED, etc.).
  - Appels SES `SendTemplatedEmail` selon la map du spec 02 § 2.6.3.
  - Loggge tout.
  - Test unitaire (mock SNS + SES).
- `backend/src/handlers/reconciliation-job.ts` : Lambda EventBridge cron.
  - Schedulée quotidiennement à 01:00 UTC (cf. spec 03 § 3.2.4).
  - Query DynamoDB GSI2 pour toutes les bookings futures.
  - Détecte les overlaps en Lambda.
  - Publie SNS `BOOKING_CONFLICT_DETECTED` s'il y en a.
  - Test unitaire.

**Tâches à accomplir** :
1. Rédige `auth-post-confirmation.ts` avec log de debug.
2. Rédige `notification-dispatcher.ts` avec switch complet et SES calls (mock OK pour maintenant).
3. Rédige `reconciliation-job.ts` avec logique d'overlap.
4. Chaque handler a son test unitaire.
5. Lance `npm run typecheck --workspace=backend`.
6. Lance `npm run test --workspace=backend`.

**Après cette phase** :
- Lance `npm run typecheck --workspace=backend` : 0 errors.
- Lance `npm run test --workspace=backend` : tous les tests verts.
- Fournis un `git log --oneline`.
- Mets à jour `CHANGELOG.md` section P5.
- **PAUSE.** Attends ma validation avant P6.

---

## PHASE P6 — Infrastructure CDK

**Objectif** : créer la définition CDK complète des 5 stacks + config.

**Source de vérité** : `specs/03-infrastructure.md § 3.1` à `§ 3.7`.

**Livrables attendus** :
- `infra/lib/config.ts` : `StageConfig` interface + exports `stageConfig['dev']` et `['prod']`.
- `infra/lib/certs-stack.ts` : stack Certs (certificats ACM).
- `infra/lib/data-stack.ts` : stack Data (DynamoDB + S3 photos + CloudFront).
- `infra/lib/auth-stack.ts` : stack Auth (Cognito User Pool + groups + post-confirmation trigger).
- `infra/lib/notifications-stack.ts` : stack Notifications (SNS + Lambda dispatcher + EventBridge cron).
- `infra/lib/api-stack.ts` : stack API (API Gateway + 25 Lambdas + WAF).
- `infra/lib/frontend-stack.ts` : stack Frontend (S3 + CloudFront + BucketDeployment avec config.json généré).
- `infra/bin/app.ts` : entry-point CDK qui instancie les 5 stacks.
- `infra/cdk.json`.
- Tous les outputs écrits dans SSM Parameter Store (cf. spec 03 § 3.2.1).
- Aucune Lambda intégrée yet (juste des placeholders `NodejsFunction` avec handler vide).

**Tâches à accomplir** :
1. Rédige `config.ts` avec les deux stages complets.
2. Rédige `certs-stack.ts` : certificats ACM pour CloudFront (us-east-1) et API Gateway (eu-west-3). Validation DNS depuis la hosted zone.
3. Rédige `data-stack.ts` :
   - Table DynamoDB avec PK, SK, 3 GSI, TTL, encryption AWS_MANAGED.
   - S3 bucket photos avec versioning, lifecycle (IA 90j), CORS pour PUT.
   - CloudFront distribution pour photos (OAC).
   - Tous les outputs → SSM.
4. Rédige `auth-stack.ts` :
   - User Pool sans self-signup, password policy, groups admin/guest.
   - App Client avec USER_PASSWORD_AUTH + REFRESH_TOKEN_AUTH flows.
   - Post-confirmation trigger (intégration avec Lambda Cognito).
   - Outputs → SSM.
5. Rédige `notifications-stack.ts` :
   - SNS topic + Lambda dispatcher (placeholder).
   - EventBridge rule pour cron.
   - SES identity verified.
   - Outputs → SSM.
6. Rédige `api-stack.ts` :
   - API Gateway REST avec Cognito authorizer.
   - 25 routes avec `LambdaIntegration` (handlers sont des placeholders vides pour maintenant).
   - WAF v2.
   - Throttling.
   - Outputs → SSM.
7. Rédige `frontend-stack.ts` :
   - S3 bucket web.
   - CloudFront SPA (error 403/404 → /index.html).
   - BucketDeployment qui génère `/config.json` en lisant les SSM params des autres stacks.
   - Invalidation CF.
8. Rédige `infra/bin/app.ts` qui instancie tous les stacks en ordre : Certs → Data → Auth → Notifications → Api → Frontend.
9. Lance `cdk synth -c stage=dev` et vérifie que le CloudFormation template est généré sans erreur.

**Après cette phase** :
- Lance `cdk synth -c stage=dev` et fournis le résultat (doit être 0 errors, CloudFormation générée).
- Fournis un `git log --oneline`.
- Mets à jour `CHANGELOG.md` section P6.
- **PAUSE.** Attends ma validation avant P7.

---

## PHASE P7 — Script de seed

**Objectif** : créer le script `backend/scripts/seed.ts` qui peuple la table DynamoDB en dev.

**Source de vérité** : `specs/01-data-model.md § 1.7`.

**Livrables attendus** :
- `backend/scripts/seed.ts` :
  - CLI argument `--stage dev|prod`.
  - Crée le `HouseConfig` singleton (données verbatim du prototype).
  - Crée les 12 Rooms (données verbatim du prototype).
  - Si `--stage dev` : crée 13 Bookings mock avec **dates relatives à aujourd'hui** (calcul `today = todayIsoInAppTz()`, puis décale chaque booking de `oldStart - "2026-05-15"`).
  - Si `--stage prod` : ne crée que HouseConfig + Rooms, pas de bookings.
  - Idempotent : chaque Put utilise `ConditionExpression: attribute_not_exists(pk)`.
  - Loggue ce qui a été créé / skippé.
- Test unitaire du seed (avec LocalStack ou mock).

**Tâches à accomplir** :
1. Rédige le script.
2. Test en local avec LocalStack : `npm run seed -- --stage dev` doit fonctionner.
3. Vérifie que les dates des bookings mock sont relatives (elles changeront chaque jour).

**Après cette phase** :
- Lance le seed localement en dev et fournis un exemple de logs.
- Mets à jour `CHANGELOG.md` section P7.
- **PAUSE.** Attends ma validation avant P8.

---

## PHASE P8 — Frontend : bootstrap Vite + Auth

**Objectif** : mettre en place le frontend Vite avec Amplify Auth intégré.

**Source de vérité** : `specs/03-infrastructure.md § 3.4` (`3.4.1` à `3.4.5`).

**Livrables attendus** :
- `frontend/vite.config.ts` avec plugin React, target ES2020, build settings.
- `frontend/src/main.tsx` : entry-point React.
- `frontend/src/App.tsx` : composant racine qui monte l'AuthProvider.
- `frontend/src/auth/AuthProvider.tsx` : context React qui gère l'authentification via Amplify (lecture de `config.json`, `fetchAuthSession()`).
- `frontend/src/auth/LoginScreen.tsx` : écran de login avec form email/password, gère `Auth.signIn()` et challenges NEW_PASSWORD_REQUIRED.
- `frontend/src/config.ts` : lecteur de `/config.json` (ou `window.CONFIG` si défini globalement).
- Build OK, pas de TypeScript errors.
- Un test simple unitaire sur LoginScreen (vérifier qu'il rend).

**Tâches à accomplir** :
1. Crée la structure Vite (scaffold + cleanup).
2. Installe `@aws-amplify/auth@6` + React Query + dayjs.
3. Rédige `vite.config.ts`.
4. Rédige l'AuthProvider avec gestion du state auth.
5. Rédige le LoginScreen avec form et intégration Auth.signIn().
6. Rédige le lecteur de config.json.
7. Lance `npm run build --workspace=frontend`.
8. Lance `npm run dev --workspace=frontend` en local (doit montrer la LoginScreen).

**Après cette phase** :
- Lance `npm run build --workspace=frontend` : 0 errors.
- Lance `npm run dev --workspace=frontend` localement et valide que la page charge (même si elle est vide hormis le login).
- Fournis un `git log --oneline`.
- Mets à jour `CHANGELOG.md` section P8.
- **PAUSE.** Attends ma validation avant P9.

---

## PHASE P9 — Frontend : client HTTP + hooks React Query

**Objectif** : créer le wrapper fetch et tous les hooks React Query.

**Source de vérité** : `specs/02-api-contract.md § 2.9`.

**Livrables attendus** :
- `frontend/src/api/client.ts` :
  - Wrapper fetch qui ajoute `Authorization: Bearer <jwt>`.
  - Gère l'erreur 401 avec refresh automatique.
  - Parse JSON et lève `ApiError(status, code, message, details)`.
- `frontend/src/api/hooks.ts` : **exactement** les hooks listés § 2.9.2 :
  - Queries : useRooms, useRoom, useRoomBookings, useRoomAvailability, useMyBookings, useBooking, useHouseConfig, useMe, useAdminDashboard, useAdminBookings, useAdminBooking, useAdminUsers, useAdminHouse.
  - Mutations : useCreateBooking, useUpdateBooking, useDeleteBooking, useDeleteMe, useAdminCreateBooking, useAdminUpdateBooking, useAdminDeleteBooking, useCreateRoom, useUpdateRoom, useDeleteRoom, useUploadRoomPhoto, useInviteUser, useUpdateHouseConfig.
  - Convention query keys selon la spec.
  - Invalidations correctes après chaque mutation.
- Tests unitaires de quelques hooks clés.

**Tâches à accomplir** :
1. Rédige `client.ts` avec toute la logique d'auth + error handling.
2. Rédige `hooks.ts` avec TOUS les hooks — copiage direct du code stub si nécessaire.
3. Chaque hook a une ligne de comment avec sa source (ex: `// GET /v1/rooms`).
4. Tests unitaires.
5. Lance `npm run typecheck --workspace=frontend`.

**Après cette phase** :
- Lance `npm run typecheck --workspace=frontend` : 0 errors.
- Fournis un `git log --oneline`.
- Mets à jour `CHANGELOG.md` section P9.
- **PAUSE.** Attends ma validation avant P10.

---

## PHASE P10 — Frontend : migration des écrans du prototype (sources réelles)

**Objectif** : Convertir les 6 fichiers JSX du prototype en TypeScript et les
connecter aux hooks React Query, en conservant à l'identique le design, la mise
en page, les interactions et le wording.

**Règle absolue** : le rendu visuel doit être **pixel-perfect** par rapport au
prototype. Si un doute existe sur un détail CSS, le prototype fait foi.

**Source de vérité** :
- `specs/03-infrastructure.md § 3.4.3` (inventaire fichiers, routeur, mapping données)
- `specs/03-infrastructure.md § 3.4.6` (design tokens NON NÉGOCIABLES)
- `specs/02-api-contract.md § 2.10` (mapping exhaustif écrans → appels API)

**Tâches à accomplir (dans cet ordre)** :

1. **Copie `styles.css` verbatim** → `frontend/src/styles.css`. Aucune modification.
2. **Copie `image-slot.js` verbatim** → `frontend/src/ui/image-slot.ts`.
   Ajoute la déclaration JSX dans `frontend/src/vite-env.d.ts` (cf. spec 03 § 3.4.3).
3. **Convertis `ui.jsx`** → `frontend/src/ui/index.tsx` :
   - Ajoute les types TypeScript sur chaque prop.
   - Imports depuis `@clos/shared-types` pour Room, Booking, etc.
   - `RoomPhoto` : en mode guest → `<img src={room.photoUrl}>` (ou placeholder teinté si null) ;
     en mode admin → conserve `<image-slot>` + déclenche `useUploadRoomPhoto`.
   - Ajoute `<PageSkeleton />` (spinner centré `var(--muted)`).
4. **Convertis `app.jsx`** → `frontend/src/App.tsx` :
   - Remplace `useTweaks(DEFAULTS)` par `AuthProvider` + `useMe()`.
   - Conserve routeur stack identique (push/pop/reset, 17 routes, noms exacts).
   - Switch admin/guest via `isAdmin = useMe().data?.role === 'admin'`.
   - Conserve `hideTabBar` sur les 9 routes listées en spec 03 § 3.4.3.
5. **Convertis `screens-main.jsx`** → 3 fichiers séparés :
   - `frontend/src/screens/home.tsx` → `HomeScreen`
   - `frontend/src/screens/rooms.tsx` → `RoomsScreen`
   - `frontend/src/screens/room-detail.tsx` → `RoomDetailScreen`, `FactRow`
6. **Convertis `screens-flow.jsx`** → 3 fichiers :
   - `frontend/src/screens/calendar.tsx` → `CalendarScreen`, `MiniCal`
   - `frontend/src/screens/booking-flow.tsx` → `BookingStepDates`, `BookingStepRoom`,
     `BookingStepGuests`, `BookingStepNotes`, `BookingRecap`, `ConfirmationScreen`, `RecapRow`
   - `frontend/src/screens/my-bookings.tsx` → `MyBookingsScreen`, `MyBookingCard`, `EditBookingScreen`
7. **Convertis `screens-admin.jsx`** → 4 fichiers :
   - `frontend/src/screens/admin-dashboard.tsx` → `AdminDashboard`, `Kpi`, `AdminTile`
   - `frontend/src/screens/admin-bookings.tsx` → `AdminBookingsScreen`, `AdminEditBookingScreen`,
     `AdminTabBar`, `AdminTopBar`
   - `frontend/src/screens/admin-rooms.tsx` → `AdminLieuScreen`, `AdminRoomsList`,
     `AdminEditRoomScreen`, `ChipInput`
   - `frontend/src/screens/admin-house.tsx` → `AdminHouseConfig`, `ConfigSection`,
     `FieldRow`, `ListEditor`
8. **Supprime** `data.jsx`, `tweaks-panel.jsx`.
9. **Branche** chaque référence à `ROOMS`, `BOOKINGS`, etc. sur les hooks
   (cf. mapping exhaustif en spec 02 § 2.10).
10. **Ajoute les états de chargement** `if (isLoading) return <PageSkeleton />`
    pour chaque hook consommé dans un écran.
11. **Gère le photo upload** en mode admin via `useUploadRoomPhoto`
    (cf. spec 03 § 3.4.3 "Photo upload").

**Validation** :
- `npm run build --workspace=frontend` → 0 errors TypeScript.
- `npm run dev --workspace=frontend` → valide **chaque route** (17 routes).
- Compare visuellement au prototype avant de marquer terminé.

**Après cette phase** :
- Lance `npm run build --workspace=frontend` : 0 errors.
- Fournis un `git log --oneline` (10-15 commits attendus).
- Mets à jour `CHANGELOG.md` section P10 avec le tableau des 17 routes testées.
- **PAUSE.** Attends ma validation avant P11.

---

## PHASE P11 — Tests E2E Playwright

**Objectif** : créer 3 scénarios E2E complets qui couvrent les flows utilisateur critiques.

**Source de vérité** : `specs/03-infrastructure.md § 3.8.5`.

**Livrables attendus** :
- `frontend/tests/e2e/` directory avec trois fichiers `.spec.ts` :
  - `guest-booking-flow.spec.ts` : login guest → home → liste chambres → tunnel réservation 4 étapes → confirmation → "Mes séjours" → annulation.
  - `admin-room-flow.spec.ts` : login admin → dashboard → création chambre → suppression → vérif KPI mis à jour.
  - `booking-conflict.spec.ts` : créer un booking → tenter un chevauchement → vérif erreur 409.
- `playwright.config.ts` avec `baseURL` localhost:5173 (dev).
- Tous les tests passent en local contre le backend dev (LocalStack + app Vite running).

**Tâches à accomplir** :
1. Installe Playwright et ses dépendances.
2. Rédige les trois spec files avec des steps clairs.
3. Lance `npm run test:e2e --workspace=frontend` en local (doit passer).

**Après cette phase** :
- Lance les tests E2E en local : tous passent.
- Fournis un `git log --oneline`.
- Mets à jour `CHANGELOG.md` section P11.
- **PAUSE.** Attends ma validation avant P12.

---

## PHASE P12 — CI/CD GitHub Actions

**Objectif** : créer les workflows GitHub Actions pour lint, test, build, deploy dev et deploy prod.

**Source de vérité** : `specs/03-infrastructure.md § 3.8`.

**Livrables attendus** :
- `.github/workflows/ci.yml` :
  - Déclenché sur PR.
  - Étapes : lint, typecheck, test, `cdk synth`.
- `.github/workflows/deploy-dev.yml` :
  - Déclenché sur merge `main`.
  - Toutes les étapes de ci.yml.
  - `cdk deploy --all -c stage=dev`.
  - Frontend build + BucketDeployment.
  - Smoke tests (GET /health, cf. § 3.8.2).
- `.github/workflows/deploy-prod.yml` :
  - Déclenché sur tag `v*.*.*`.
  - Idem deploy-dev mais `-c stage=prod`.
  - Avec approbation manuelle via GitHub Environments.
- OIDC GitHub configuré dans le rôle AWS `ClosBonAccueil-GitHubActions` (cf. spec 03 § 3.8.4) — créé manuellement avant, ou via une stack CDK.

**Tâches à accomplir** :
1. Rédige les trois workflows YAML.
2. Configure le contexte OIDC GitHub (manuel, hors scope Claude Code).
3. Valide localement que les commandes des workflows tournent (lint, test, build, cdk synth).

**Après cette phase** :
- Fournis un `git log --oneline`.
- Mets à jour `CHANGELOG.md` section P12 avec "✅ CI/CD COMPLET".
- Fournis une vue d'ensemble finale avec liste de tous les fichiers créés.
- **FINAL PAUSE.** Attends ma validation avant déploiement.

---

## Après chaque phase — Checklist de validation manuelle

Fournis-moi systématiquement :
1. **Commandes lancées et résultats** :
   ```
   $ npm run typecheck --workspace=XXX
   ✅ 0 errors
   
   $ npm run test --workspace=XXX
   ✅ 15 tests pass
   ```
2. **Listes des fichiers créés/modifiés** (format tableau).
3. **Résumé des décisions/obstacles** : y a-t-il eu une ambiguïté levée ? Une réécriture necessaire ?
4. **`git log --oneline` (derniers commits de la phase)**.
5. **PAUSE avant prochain message.** N'avance pas à la phase suivante sans validation explicite de ma part.

---

## Checklist finale après P12

Quand tout est complet, fournis-moi :
1. ✅ `npm run build` à la racine passe (tous les workspaces).
2. ✅ `npm run test` à la racine passe (tous les workspaces).
3. ✅ `cdk synth -c stage=prod` génère du CloudFormation.
4. ✅ `CHANGELOG.md` complet avec toutes les phases.
5. ✅ `git log --oneline` depuis le début (vous devriez avoir ~100+ commits).
6. ✅ Tests E2E Playwright passent en local (contre LocalStack + app Vite running).

---

## Règles d'or (rappel) — AUCUNE entorse

1. **Une phase à la fois.** Pas d'avance en parallèle.
2. **Specs = SoT.** Zéro improvisation. Si c'est flou, demande.
3. **Versions pinnées.** Jamais de `^` ni `~`.
4. **Tests obligatoires.** Chaque fonctionnalité a un test.
5. **Pas de secrets en clair.** Tout en SSM ou en variable d'env.
6. **Imports propres.** Frontend et backend jamais accouplés directement.
7. **CHANGELOG.md tenu à jour.** C'est ta SoT opérationnelle.
8. **Commits atomiques.** Chaque commit = un changement logique complet.
9. **Loggue tes actions.** Powertools Logger dans tous les handlers.
10. **Si tu hésites, demande.** Je suis là pour clarifier, pas pour t'abandonner.

---

## Début — Phase P1

Tu es prêt·e ? J'attends ta confirmation que tu as lu ce prompt dans son intégralité.

Ensuite, je te donne le feu vert pour **commencer exactement à Phase P1 — Scaffold du monorepo**.

À toi ! 🚀
