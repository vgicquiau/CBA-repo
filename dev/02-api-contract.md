# 02 — Contrat d'API

> **Source of Truth.** Ce fichier définit toutes les routes REST de
> l'application, leurs payloads, leurs codes d'erreur et leur sémantique
> d'authentification. L'OpenAPI généré doit correspondre à ce document au
> bit près.

---

## 2.1 — Conventions globales

### 2.1.1 — Base URL et versioning
- Base URL : `https://api.{stage}.clos-bon-accueil.fr/v1` (stage `dev`)
  ou `https://api.clos-bon-accueil.fr/v1` (stage `prod`).
- Tous les endpoints sont préfixés par `/v1`.
- Un breaking change majeur incrémentera : `/v2`.

### 2.1.2 — Format de payload
- **Toujours JSON** (`Content-Type: application/json; charset=utf-8`).
- Encodage UTF-8 strict.
- Dates "jour" : format `YYYY-MM-DD` en timezone `Europe/Paris`
  (cf. `01-data-model § 1.8`).
- Dates "instant" : ISO 8601 UTC (ex : `"2026-05-17T14:32:00.000Z"`).
- Tous les identifiants sont des `string`.

### 2.1.3 — Authentification
- Toutes les routes (sauf `GET /v1/health`) exigent un header
  `Authorization: Bearer <JWT>` issu de Cognito.
- La JWT est validée par un **Cognito User Pools Authorizer** d'API Gateway.
- L'authorizer expose dans le contexte Lambda :
  - `event.requestContext.authorizer.claims.sub` → userId
  - `event.requestContext.authorizer.claims["cognito:groups"]` → liste de groupes
  - `event.requestContext.authorizer.claims.email` → email
- **Si la JWT est absente ou invalide, API Gateway renvoie 401 directement
  sans atteindre la Lambda.**
- Flow d'authentification : `ALLOW_USER_PASSWORD_AUTH` (cf.
  `03-infrastructure § 3.2.2` et § 3.4.5). Pas de Hosted UI, pas d'OAuth
  redirect.

### 2.1.4 — Autorisation
Deux groupes Cognito : `admin` et `guest`. Toutes les routes `/v1/admin/*`
exigent l'appartenance au groupe `admin`. La vérification est faite **dans
la Lambda** au début du handler (utilitaire `requireRole(event, 'admin')`
défini § 2.7). Si le rôle est insuffisant, renvoie **403 Forbidden**
(jamais 401, qui est réservé à l'auth manquante).

**Ownership** : pour les routes `PATCH /v1/bookings/{bookingId}`,
`DELETE /v1/bookings/{bookingId}` et `GET /v1/bookings/{bookingId}`, le
handler doit vérifier que `booking.userId === currentUserId`. Si non →
403 `FORBIDDEN`. Cette vérification est faite après le `findBookingById`,
au début du handler (utilitaire `requireOwnership(booking, userId)`).

### 2.1.5 — Format des erreurs
Toutes les réponses d'erreur suivent ce schéma strict :

```json
{
  "error": {
    "code": "ERROR_CODE_SNAKE_UPPER",
    "message": "Phrase lisible en français",
    "details": { /* objet libre, optionnel */ }
  }
}
```

Codes d'erreur normalisés et mapping depuis les exceptions :

| HTTP | code | Sémantique | Levé par |
|---|---|---|---|
| 400 | `VALIDATION_FAILED` | Payload mal formé ou champ invalide | `ZodError` → details = `zodError.flatten()` ; `ValidationError` du repository |
| 401 | (renvoyé par API Gateway) | Auth manquante / JWT invalide | API Gateway authorizer |
| 403 | `FORBIDDEN` | Rôle ou ownership insuffisant | `ForbiddenError` |
| 404 | `NOT_FOUND` | Ressource inexistante | `NotFoundError` |
| 409 | `BOOKING_CONFLICT` | Chevauchement de réservations | `ConflictError` ; `ConditionalCheckFailedException` sur Put Booking |
| 409 | `ROOM_ALREADY_EXISTS` | roomId déjà pris | `ConditionalCheckFailedException` sur Put Room |
| 409 | `EMAIL_ALREADY_EXISTS` | Email déjà invité dans Cognito | Cognito `UsernameExistsException` |
| 422 | `CAPACITY_REDUCTION_BLOCKED` | Modification de Room bloquée par résa active | `CapacityReductionError` |
| 422 | `BUSINESS_RULE_VIOLATED` | Règle métier (catch-all) | — |
| 500 | `INTERNAL_ERROR` | Erreur inattendue (jamais de détail technique exposé) | Toute exception non typée |

**Mapping spécial pour les transactions DynamoDB** :
`TransactionCanceledException` doit être inspectée via
`error.CancellationReasons` :
- Si une raison est `ConditionalCheckFailed` sur la Room (capacity) →
  409 `BOOKING_CONFLICT` avec `details: { reason: "ROOM_CAPACITY_OR_DELETED" }`.
- Si une raison est `ConditionalCheckFailed` sur le Booking (already exists) →
  409 `BOOKING_CONFLICT` avec `details: { reason: "DUPLICATE_BOOKING" }`.
- Sinon → 500 `INTERNAL_ERROR`.

### 2.1.6 — CORS
Géré par API Gateway, pas par les Lambdas.
- `Access-Control-Allow-Origin` : liste explicite issue de `stageConfig.allowedOrigins`
  (jamais `*`).
- `Access-Control-Allow-Methods` : `GET, POST, PUT, PATCH, DELETE, OPTIONS`.
- `Access-Control-Allow-Headers` : `Content-Type, Authorization, Idempotency-Key`.
- `Access-Control-Max-Age` : 600 secondes.

### 2.1.7 — Pagination
Aucune route n'est paginée au MVP (volumétrie sous le seuil). Si une route
renvoie > 100 items, logge un warning ; au-delà de 500, refuse avec 422
`BUSINESS_RULE_VIOLATED` et message "Trop d'items renvoyés, ajouter un
filtre".

### 2.1.8 — Validation
Toutes les routes valident leur input via **Zod** (`zod@3.23.x`, pinné).
Les schémas sont définis dans `backend/src/api/schemas/` (un fichier par
route). Une validation échouée → 400 `VALIDATION_FAILED` avec `details`
contenant `zodError.flatten()`.

### 2.1.9 — Idempotence
Les routes `POST /v1/bookings` et `POST /v1/admin/bookings` acceptent un
header optionnel `Idempotency-Key: <uuid>` (cf. `01-data-model § 1.10`).
Si la clé a déjà été vue, la route renvoie le Booking pré-existant avec
code **200** (au lieu de 201) — l'idempotence est silencieuse côté client.

---

## 2.2 — Routes publiques authentifiées (tous rôles connectés)

### `GET /v1/health`
**Non authentifié.** Sanity check.
- Réponse 200 : `{ "status": "ok", "timestamp": "<ISO>" }`

### `GET /v1/me`
Renvoie le profil de l'utilisateur courant (lecture depuis DynamoDB).
- Réponse 200 : `User`
- Réponse 404 si l'utilisateur n'existe pas encore en table — ce cas ne
  doit normalement jamais survenir car la route `POST /v1/admin/users/invite`
  crée l'item User immédiatement (cf. § 2.3).

### `GET /v1/house`
Renvoie le `HouseConfig`.
- Réponse 200 : `HouseConfig`
- **Filtre de visibilité du champ `address`** :
  - Si rôle `admin` → `address` exposé tel quel.
  - Si rôle `guest` ET l'utilisateur a au moins une réservation avec
    `end > today` → `address` exposé.
  - Sinon → `address` remplacé par `null` dans la réponse.

### `GET /v1/rooms`
Liste toutes les chambres.
- Réponse 200 : `{ "rooms": Room[] }`
- Tri : par `name` ascendant.

### `GET /v1/rooms/{roomId}`
- Réponse 200 : `Room`
- Réponse 404 : `NOT_FOUND` si inexistante.

### `GET /v1/rooms/{roomId}/bookings`
Liste les bookings d'une chambre.
- Query params :
  - `from` : ISO date (optionnel ; défaut = `todayIsoInAppTz()`).
  - `limit` : entier (optionnel ; défaut 50, max 200).
- Réponse 200 : `{ "bookings": Booking[] }`
- **Filtre de visibilité (privacy)** :
  - Si rôle `admin` → aucun masquage.
  - Si rôle `guest` → pour chaque Booking dont `userId !== currentUserId`
    (y compris `userId === null`), remplace `notes` par `""`. Le `name`
    reste toujours visible (sens métier : "qui est là cette semaine").

### `GET /v1/rooms/{roomId}/availability`
Vérifie la disponibilité.
- Query params (obligatoires) : `start`, `end` (ISO dates).
- Validation : `start < end`, `start >= todayIsoInAppTz()`.
- Réponse 200 : `AvailabilityResult` (cf. `01-data-model § 1.11`).
- `conflicts` contient les bookings en chevauchement (avec `notes`
  masquées pour un guest selon la règle ci-dessus).

### `GET /v1/bookings/me`
Liste les bookings de l'utilisateur courant.
- Réponse 200 : `{ "bookings": Booking[] }`
- Tri : `start` descendant (les plus récents en premier).

### `GET /v1/bookings/{bookingId}`
Récupère un Booking par son ID. Utilisé notamment au refresh d'une page
"Mes séjours / Édition" ou depuis un lien email.
- Implémentation : `findBookingById(bookingId)` (`Query GSI3`).
- Réponse 200 : `Booking`.
- Erreurs :
  - 404 si le booking n'existe pas.
  - 403 `FORBIDDEN` si le booking existe mais `booking.userId !== currentUserId`
    (un guest ne peut pas voir le booking d'un autre via cette route).

### `POST /v1/bookings`
Crée une nouvelle réservation pour l'utilisateur courant.
- Headers optionnels : `Idempotency-Key`.
- Body : `CreateBookingInput` (cf. `01-data-model § 1.11`).
- Validation (Zod) :
  - `roomId`: string, doit exister en table (vérifié dans le handler).
  - `start < end`, dates au format `YYYY-MM-DD`.
  - `start >= todayIsoInAppTz()` (pas de booking dans le passé pour un guest).
  - `people ∈ [1, room.capacity]`.
  - `name` non vide après trim, ≤ 100 caractères.
  - `notes` ≤ 2000 caractères.
- **Comportement** :
  1. Si `Idempotency-Key` présent et déjà vu → renvoie le Booking existant
     (code **200**).
  2. Sinon : appelle `repo.createBooking(...)` qui exécute la séquence de
     `01-data-model § 1.4.1`.
  3. Enregistre l'idempotency record si la clé était fournie.
  4. Publie l'événement `BOOKING_CREATED` sur SNS (cf. § 2.6).
- Réponse **201** (création) ou **200** (idempotence) : `Booking`.
- Erreurs : 400, 404, 409, 422.

### `PATCH /v1/bookings/{bookingId}`
Modifie une réservation. **Ownership obligatoire** : `booking.userId ===
currentUserId`.
- Implémentation :
  1. `findBookingById(bookingId)`.
  2. `requireOwnership(booking, currentUserId)`.
  3. Applique la logique de `01-data-model § 1.4.4` (gestion start
     change).
- Body : `UpdateBookingInput` (`roomId` strictement interdit ; toute
  présence → 400 `VALIDATION_FAILED`).
- Réponse 200 : `Booking` mis à jour.
- Publie `BOOKING_UPDATED` sur SNS.
- Erreurs : 400, 403, 404, 409.

### `DELETE /v1/bookings/{bookingId}`
Annule une réservation. **Ownership obligatoire**.
- Implémentation : `findBookingById` → `requireOwnership` → `deleteBooking`.
- Réponse **204** : pas de body.
- Publie `BOOKING_CANCELLED` avec `reason: "USER_CANCELLED"`.
- Erreurs : 403, 404.

---

## 2.3 — Routes admin (rôle `admin` requis)

### `GET /v1/admin/dashboard`
Renvoie les KPIs.
- Réponse 200 : `DashboardData` (cf. `01-data-model § 1.11`).
  - `todayCount` : bookings actifs aujourd'hui.
  - `weekCount` : bookings chevauchant les 7 prochains jours.
  - `totalRoomCount` : nombre total de chambres.
  - `totalUpcomingRevenue` : somme `nights × people × pricePerPerson` des
    bookings à venir.
  - `upcomingArrivals` : 6 prochaines arrivées triées par `start` asc.

### `GET /v1/admin/bookings`
Liste filtrée.
- Query params :
  - `filter` : `"upcoming" | "past" | "all"` (défaut `"upcoming"`).
  - `search` : string (optionnel, contains insensible casse sur `name`
    ou `room.name`).
  - `from`, `to` : ISO dates (optionnels).
- Réponse 200 : `{ "bookings": Booking[] }`.

### `GET /v1/admin/bookings/{bookingId}`
Récupère n'importe quel Booking (pas de restriction d'ownership).
- Implémentation : `findBookingById(bookingId)`.
- Réponse 200 : `Booking`.
- 404 si introuvable.

### `POST /v1/admin/bookings`
Crée une réservation en tant qu'admin. Différences avec `POST /v1/bookings` :
- Headers optionnels : `Idempotency-Key`.
- Body : `AdminCreateBookingInput` (avec `userId: string | null`).
- Permet `start` dans le passé (corrections rétroactives) : la validation
  `start >= today` est **désactivée** pour l'admin.
- Réponse 201 (ou 200 si idempotence) : `Booking`.
- Publie `BOOKING_CREATED`.

### `PATCH /v1/admin/bookings/{bookingId}`
Modifie n'importe quelle réservation (pas de restriction d'ownership).
- Body : `AdminUpdateBookingInput`. **L'admin PEUT modifier `roomId`**
  (use case : déplacer une réservation). En revanche, changer `roomId`
  s'implémente comme un **Delete + Put** (la PK change), pas un Update.
- Si modification de `roomId` ou `start` : applique la logique
  Delete+Put de `01-data-model § 1.4.4`, étendue au changement de
  `roomId` (la PK change aussi).
- Réponse 200 : `Booking` mis à jour.
- Publie `BOOKING_UPDATED`.

### `DELETE /v1/admin/bookings/{bookingId}`
Supprime n'importe quelle réservation.
- Réponse 204.
- Publie `BOOKING_CANCELLED` avec `reason: "ADMIN_CANCELLED"`. L'email est
  envoyé au propriétaire (`userId` non null) ; rien n'est envoyé si
  `userId === null`.

### `POST /v1/admin/rooms`
Crée une chambre.
- Body : `CreateRoomInput`.
- Validation : `roomId` kebab-case `/^[a-z][a-z0-9-]{1,30}$/`, unicité.
- Réponse 201 : `Room`.
- Erreurs : 409 `ROOM_ALREADY_EXISTS`.

### `PATCH /v1/admin/rooms/{roomId}`
Modifie une chambre. `roomId` non modifiable (champ absent du DTO).
- Body : `UpdateRoomInput`.
- Si modification de `capacity` à la baisse impossible : 422
  `CAPACITY_REDUCTION_BLOCKED` avec `details.blockingBookings: Booking[]`
  (cf. `01-data-model § 1.4.3`).
- Réponse 200 : `Room`.

### `DELETE /v1/admin/rooms/{roomId}`
Supprime une chambre (cascade sur Bookings, cf. `01-data-model § 1.4.2`).
- Réponse 200 : `DeleteRoomResult` (cf. `01-data-model § 1.11`).
- Publie un `BOOKING_CANCELLED` par booking avec `reason: "ROOM_DELETED"`.

### `POST /v1/admin/rooms/{roomId}/photo-upload-url`
Demande une URL pré-signée S3 pour uploader la photo.
- Body : `{ "contentType": string, "sizeBytes": number }`.
- Validation :
  - `contentType ∈ {"image/jpeg", "image/png", "image/webp"}`.
  - `sizeBytes <= 5_000_000` (5 MB).
- Réponse 200 : `PhotoUploadUrlResponse`.
- L'URL pré-signée expire en 5 minutes (`expiresIn: 300`).
- Le frontend `PUT` directement sur `uploadUrl` puis appelle
  `PATCH /v1/admin/rooms/{roomId}` avec `{ "photoUrl": publicUrl }`.

### `GET /v1/admin/users`
Liste tous les users. Réponse 200 : `{ "users": User[] }`.

### `POST /v1/admin/users/invite`
Crée un user dans Cognito (invitation par email) et l'enregistre en
DynamoDB.
- Body : `InviteUserInput`.
- Validation : `email` format valide, `role ∈ {"guest", "admin"}`,
  `displayName` non vide et ≤ 50 caractères.
- **Séquence d'exécution stricte** :
  1. **`AdminCreateUser`** Cognito (sans `MessageAction` — donc envoi
     automatique de l'email d'invitation avec mot de passe temporaire).
     Attributs : `email` (vérifié), `name` (= displayName), `email_verified: true`.
  2. **`AdminAddUserToGroup`** Cognito avec le groupe `role` demandé.
  3. **`repo.createUser({ userId: cognitoSub, email, displayName, role,
     createdAt: now })`** avec `attribute_not_exists(pk)` (idempotent).
  4. Publie `USER_INVITED` sur SNS.
- Si l'étape 1 échoue avec `UsernameExistsException` → 409
  `EMAIL_ALREADY_EXISTS`.
- Si une étape 2 ou 3 échoue après que l'étape 1 ait réussi : logge en
  ERROR (compensation manuelle requise par l'admin). Retourne tout de
  même 500 — surveillance via CloudWatch Alarms.
- Réponse 201 : `User`.

**Trigger Cognito `post-confirmation`** : la Lambda
`auth-post-confirmation.ts` est appelée lors du premier login confirmé.
Elle exécute un `createUser` avec `attribute_not_exists(pk)` (idempotent)
pour gérer le cas où l'étape 3 ci-dessus aurait échoué. Elle ne fait
rien si l'item User existe déjà.

### `DELETE /v1/admin/users/{userId}`
Supprime un user (cf. § 2.8 RGPD pour le détail de la cascade).
- Réponse 200 : `{ "deletedUserId": string, "anonymizedBookings": number }`.

### `GET /v1/admin/house`
Renvoie le `HouseConfig` complet (sans masquage de l'address).

### `PATCH /v1/admin/house`
Modifie le `HouseConfig`.
- Body : `UpdateHouseConfigInput`.
- Réponse 200 : `HouseConfig`.

---

## 2.4 — Routes "moi" (user courant — droit à l'effacement RGPD)

### `DELETE /v1/me`
Permet à un user de demander la suppression de son compte (RGPD).
- Implémentation :
  1. `repo.listMyBookings(currentUserId)` : liste les bookings futurs.
  2. Pour chaque booking futur : `repo.deleteBooking(...)` + publie
     `BOOKING_CANCELLED` avec `reason: "USER_DELETED"` (anonymisé : pas
     d'email envoyé).
  3. Pour chaque booking passé : `repo.updateBooking(...)` en remplaçant
     `userId` par null et `name` par `"Compte supprimé"` (anonymisation
     plutôt que suppression, pour préserver l'historique du gîte).
  4. Cognito `AdminDeleteUser`.
  5. DynamoDB `DeleteItem` sur l'item User.
- Réponse 204.

### `GET /v1/me/export`
Export RGPD des données personnelles (article 20 RGPD).
- Réponse 200 :
  ```json
  {
    "user": User,
    "bookings": Booking[],
    "exportedAt": "<ISO>"
  }
  ```

---

## 2.5 — Mapping routes ↔ Lambdas

Chaque route est servie par **une Lambda dédiée**. Pas de monolambda
routée. Les Lambdas sont déclarées dans `infra/lib/api-stack.ts` et leurs
handlers dans `backend/src/handlers/`.

| Route | Handler | Memory | Timeout |
|---|---|---|---|
| `GET /v1/health` | `health.ts` | 128 MB | 3 s |
| `GET /v1/me` | `me-get.ts` | 256 MB | 5 s |
| `DELETE /v1/me` | `me-delete.ts` | 512 MB | 30 s |
| `GET /v1/me/export` | `me-export.ts` | 512 MB | 10 s |
| `GET /v1/house` | `house-get.ts` | 256 MB | 5 s |
| `GET /v1/rooms` | `rooms-list.ts` | 256 MB | 5 s |
| `GET /v1/rooms/{roomId}` | `rooms-get.ts` | 256 MB | 5 s |
| `GET /v1/rooms/{roomId}/bookings` | `room-bookings-list.ts` | 256 MB | 5 s |
| `GET /v1/rooms/{roomId}/availability` | `room-availability.ts` | 256 MB | 5 s |
| `GET /v1/bookings/me` | `bookings-list-mine.ts` | 256 MB | 5 s |
| `GET /v1/bookings/{bookingId}` | `bookings-get.ts` | 256 MB | 5 s |
| `POST /v1/bookings` | `bookings-create.ts` | 512 MB | 10 s |
| `PATCH /v1/bookings/{bookingId}` | `bookings-update.ts` | 512 MB | 10 s |
| `DELETE /v1/bookings/{bookingId}` | `bookings-delete.ts` | 256 MB | 5 s |
| `GET /v1/admin/dashboard` | `admin-dashboard.ts` | 512 MB | 10 s |
| `GET /v1/admin/bookings` | `admin-bookings-list.ts` | 256 MB | 5 s |
| `GET /v1/admin/bookings/{bookingId}` | `admin-bookings-get.ts` | 256 MB | 5 s |
| `POST /v1/admin/bookings` | `admin-bookings-create.ts` | 512 MB | 10 s |
| `PATCH /v1/admin/bookings/{bookingId}` | `admin-bookings-update.ts` | 512 MB | 10 s |
| `DELETE /v1/admin/bookings/{bookingId}` | `admin-bookings-delete.ts` | 256 MB | 5 s |
| `POST /v1/admin/rooms` | `admin-rooms-create.ts` | 256 MB | 5 s |
| `PATCH /v1/admin/rooms/{roomId}` | `admin-rooms-update.ts` | 256 MB | 5 s |
| `DELETE /v1/admin/rooms/{roomId}` | `admin-rooms-delete.ts` | 1024 MB | 30 s |
| `POST /v1/admin/rooms/{roomId}/photo-upload-url` | `admin-rooms-photo-url.ts` | 256 MB | 5 s |
| `GET /v1/admin/users` | `admin-users-list.ts` | 256 MB | 5 s |
| `POST /v1/admin/users/invite` | `admin-users-invite.ts` | 512 MB | 10 s |
| `DELETE /v1/admin/users/{userId}` | `admin-users-delete.ts` | 512 MB | 30 s |
| `GET /v1/admin/house` | `admin-house-get.ts` | 256 MB | 5 s |
| `PATCH /v1/admin/house` | `admin-house-update.ts` | 256 MB | 5 s |

**Lambdas hors API Gateway** :
| Trigger | Handler | Memory | Timeout |
|---|---|---|---|
| Cognito `post-confirmation` | `auth-post-confirmation.ts` | 256 MB | 5 s |
| SNS `clos-notifications-{stage}` | `notification-dispatcher.ts` | 512 MB | 30 s |
| EventBridge cron (03:00 Paris) | `reconciliation-job.ts` | 512 MB | 60 s |

---

## 2.6 — Événements et notifications

### 2.6.1 — Topic SNS unique
Nom : `clos-notifications-{stage}`. Tous les événements métier y sont
publiés en JSON.

### 2.6.2 — Schéma d'événement
```typescript
export type DomainEvent =
  | { type: 'BOOKING_CREATED';   bookingId: string; userId: string | null; roomId: string; start: string; end: string }
  | { type: 'BOOKING_UPDATED';   bookingId: string; userId: string | null; roomId: string; changes: Record<string, unknown> }
  | { type: 'BOOKING_CANCELLED'; bookingId: string; userId: string | null; roomId: string; reason: 'USER_CANCELLED' | 'ADMIN_CANCELLED' | 'ROOM_DELETED' | 'USER_DELETED' }
  | { type: 'USER_INVITED';      userId: string; email: string; role: 'guest' | 'admin' }
  | { type: 'BOOKING_CONFLICT_DETECTED'; bookingIds: string[]; roomId: string; detectedAt: string };
```

Publie ce type dans `shared-types/src/events.ts`.

### 2.6.3 — Lambda consommatrice `notification-dispatcher`
Abonnée au topic, elle envoie les emails via SES selon une map
`eventType → templateName` :

| Événement | Template SES | Destinataire |
|---|---|---|
| `BOOKING_CREATED` | `booking-created` | `user.email` |
| `BOOKING_UPDATED` | `booking-updated` | `user.email` |
| `BOOKING_CANCELLED` (reason ≠ USER_DELETED) | `booking-cancelled` | `user.email` |
| `BOOKING_CANCELLED` (reason = USER_DELETED) | (rien) | — |
| `USER_INVITED` | (rien — Cognito gère l'email d'invitation natif) | — |
| `BOOKING_CONFLICT_DETECTED` | `admin-conflict-alert` | email admin (SSM) |

Si `userId === null` → aucun email envoyé.

Templates SES définis dans `infra/lib/ses-templates/`.

Adresse FROM : `clos-bon-accueil@notifications.{rootDomain}`.
Adresse REPLY-TO : email admin lu depuis SSM Parameter Store
`/clos/{stage}/admin-email`.

---

## 2.7 — Utilitaires HTTP (`backend/src/api/http.ts`)

Crée `backend/src/api/http.ts` exportant exactement :

```typescript
import { APIGatewayProxyHandlerV2, APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { z } from 'zod';
import { Booking } from '@clos/shared-types';
import {
  ConflictError, NotFoundError, ValidationError,
  CapacityReductionError, ForbiddenError,
} from '../data/repository';

export const CORS_HEADERS: Record<string, string>;

// Réponses 2xx
export const ok: <T>(body: T) => APIGatewayProxyResultV2;
export const created: <T>(body: T) => APIGatewayProxyResultV2;
export const noContent: () => APIGatewayProxyResultV2;

// Réponse d'erreur
export const errorResponse: (
  status: number,
  code: string,
  message: string,
  details?: unknown,
) => APIGatewayProxyResultV2;

// Auth/autorisation
export function getCurrentUserId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string;
export function getCurrentUserGroups(event: APIGatewayProxyEventV2WithJWTAuthorizer): string[];
export function requireRole(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  role: 'admin' | 'guest',
): void;
export function requireOwnership(booking: Booking, userId: string): void;

// Parsing
export function parseBody<T extends z.ZodType>(event: APIGatewayProxyEventV2WithJWTAuthorizer, schema: T): z.infer<T>;
export function parseQuery<T extends z.ZodType>(event: APIGatewayProxyEventV2WithJWTAuthorizer, schema: T): z.infer<T>;
export function getPathParam(event: APIGatewayProxyEventV2WithJWTAuthorizer, name: string): string;

// Wrapper d'erreur — OBLIGATOIRE autour de tout handler
export const withErrorHandling: <T extends APIGatewayProxyHandlerV2>(h: T) => T;
```

**Mapping d'erreurs dans `withErrorHandling`** (impératif strict) :

| Exception attrapée | HTTP | code | details |
|---|---|---|---|
| `ZodError` | 400 | `VALIDATION_FAILED` | `error.flatten()` |
| `ValidationError` | 400 | `VALIDATION_FAILED` | `{field, reason}` |
| `ForbiddenError` | 403 | `FORBIDDEN` | `{reason}` |
| `NotFoundError` | 404 | `NOT_FOUND` | `{entity, id}` |
| `ConflictError` | 409 | `BOOKING_CONFLICT` | `{conflicts: Booking[]}` |
| `CapacityReductionError` | 422 | `CAPACITY_REDUCTION_BLOCKED` | `{blockingBookings: Booking[]}` |
| `ConditionalCheckFailedException` | 409 | `BOOKING_CONFLICT` | `{reason: "PRECONDITION_FAILED"}` |
| `TransactionCanceledException` | voir § 2.1.5 | `BOOKING_CONFLICT` | inspecte `CancellationReasons` |
| `UsernameExistsException` (Cognito) | 409 | `EMAIL_ALREADY_EXISTS` | — |
| Toute autre `Error` | 500 | `INTERNAL_ERROR` | (jamais `error.message` exposé en prod, log uniquement) |

Toute Lambda **doit** être wrappée par `withErrorHandling` à l'export.

---

## 2.8 — Squelette standard d'un handler Lambda

Tout handler suit **strictement** ce squelette :

```typescript
// backend/src/handlers/<route>.ts
import { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { z } from 'zod';
import {
  withErrorHandling, requireRole, requireOwnership, getCurrentUserId,
  parseBody, parseQuery, getPathParam, ok, created, noContent,
} from '../api/http';
import { getRepository } from '../api/deps';

const BodySchema = z.object({ /* ... */ });

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  // 1. Auth/autorisation
  const userId = getCurrentUserId(event);
  // requireRole(event, 'admin'); // pour les routes admin

  // 2. Validation
  const body = parseBody(event, BodySchema);

  // 3. Business logic via repository
  const repo = getRepository();
  const result = await repo.someOperation(/* ... */);

  // 4. Réponse standardisée
  return ok(result);
};

export const handler = withErrorHandling(rawHandler);
```

**Règles impératives** :
- `withErrorHandling` est **toujours** appliqué à l'export.
- Aucun `console.log` direct. Utiliser `@aws-lambda-powertools/logger`
  (instance unique exportée depuis `backend/src/api/logger.ts`).
- Aucun appel SDK AWS direct dans un handler hors via le `repository`
  (interdit d'instancier `DynamoDBClient`, `SNSClient`, `S3Client` dans
  un handler — passer par `deps.ts` qui les expose).
- Aucun `throw new Error(...)` nu : toujours une classe typée du
  repository.

---

## 2.9 — Frontend : intégration

### 2.9.1 — Client HTTP
Crée `frontend/src/api/client.ts` exportant un wrapper `fetch` qui :
- Ajoute `Authorization: Bearer <jwt>` depuis Amplify Auth
  (`fetchAuthSession`).
- Ajoute `Content-Type: application/json` sur les requêtes POST/PATCH.
- Parse la réponse JSON.
- Si non 2xx, lit `body.error` et lève un `ApiError(status, code, message, details)`.
- Refresh automatique du token si 401 (un seul retry).

### 2.9.2 — Hooks React Query (`frontend/src/api/hooks.ts`)
Exporte **exactement** :

```typescript
// Queries
export function useRooms(): UseQueryResult<Room[]>;
export function useRoom(roomId: string): UseQueryResult<Room>;
export function useRoomBookings(roomId: string, from?: string): UseQueryResult<Booking[]>;
export function useRoomAvailability(roomId: string, start: string, end: string): UseQueryResult<AvailabilityResult>;
export function useMyBookings(): UseQueryResult<Booking[]>;
export function useBooking(bookingId: string): UseQueryResult<Booking>;
export function useHouseConfig(): UseQueryResult<HouseConfig>;
export function useMe(): UseQueryResult<User>;

// Admin queries
export function useAdminDashboard(): UseQueryResult<DashboardData>;
export function useAdminBookings(filter: BookingFilter, search?: string): UseQueryResult<Booking[]>;
export function useAdminBooking(bookingId: string): UseQueryResult<Booking>;
export function useAdminUsers(): UseQueryResult<User[]>;
export function useAdminHouse(): UseQueryResult<HouseConfig>;

// Mutations user
export function useCreateBooking(): UseMutationResult<Booking, ApiError, CreateBookingInput>;
export function useUpdateBooking(): UseMutationResult<Booking, ApiError, { bookingId: string; patch: UpdateBookingInput }>;
export function useDeleteBooking(): UseMutationResult<void, ApiError, string>;
export function useDeleteMe(): UseMutationResult<void, ApiError, void>;

// Mutations admin
export function useAdminCreateBooking(): UseMutationResult<Booking, ApiError, AdminCreateBookingInput>;
export function useAdminUpdateBooking(): UseMutationResult<Booking, ApiError, { bookingId: string; patch: AdminUpdateBookingInput }>;
export function useAdminDeleteBooking(): UseMutationResult<void, ApiError, string>;
export function useCreateRoom(): UseMutationResult<Room, ApiError, CreateRoomInput>;
export function useUpdateRoom(): UseMutationResult<Room, ApiError, { roomId: string; patch: UpdateRoomInput }>;
export function useDeleteRoom(): UseMutationResult<DeleteRoomResult, ApiError, string>;
export function useUploadRoomPhoto(): UseMutationResult<{ photoUrl: string }, ApiError, { roomId: string; file: File }>;
export function useInviteUser(): UseMutationResult<User, ApiError, InviteUserInput>;
export function useUpdateHouseConfig(): UseMutationResult<HouseConfig, ApiError, UpdateHouseConfigInput>;
```

**Convention de query keys** :
`['rooms']`, `['rooms', roomId]`, `['rooms', roomId, 'bookings', from]`,
`['rooms', roomId, 'availability', start, end]`,
`['bookings', 'mine']`, `['bookings', bookingId]`,
`['admin', 'dashboard']`, `['admin', 'bookings', filter, search]`,
`['admin', 'bookings', bookingId]`, `['admin', 'users']`,
`['house']`, `['me']`.

**Invalidations** : chaque mutation invalide les query keys pertinentes
via `queryClient.invalidateQueries({ queryKey: [...] })`. Exemples :
- `useCreateBooking` → invalide `['bookings', 'mine']`,
  `['rooms', roomId, 'bookings']`, `['admin', 'dashboard']`.
- `useDeleteRoom` → invalide `['rooms']`, `['admin', 'bookings']`,
  `['admin', 'dashboard']`.
