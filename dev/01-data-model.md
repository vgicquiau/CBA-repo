# 01 — Modèle de données

> **Source of Truth.** Ce fichier définit toutes les entités, leur projection
> **Cosmos DB for NoSQL** (container unique, partition key `/pk`), les patterns
> d'accès, les contraintes d'intégrité, la couche d'accès, les DTO partagés et
> les règles de date. Toute divergence dans le code est un bug.
>
> **Migration** : les sections §1.2–§1.5 décrivent la cible Azure (Cosmos DB).
> Le code AWS existant (DynamoDB) est en attente de migration PM2.

---

## 1.1 — Entités TypeScript

Crée le fichier `shared-types/src/domain.ts` contenant **exactement** les
interfaces suivantes, dans cet ordre. N'ajoute aucun champ non listé. Ne
renomme aucun champ. Ce package `shared-types` est consommé à la fois par
le `backend` et le `frontend` (cf. `03-infrastructure § 3.4.3`).

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// User — Utilisateur du système (famille ou ami invité par l'admin).
// Invariants métier :
//   - Un User est créé UNIQUEMENT par invitation Entra External ID (pas de signup public).
//   - userId === Entra External ID `oid` claim (UUID v4, jamais généré côté app).
//   - role est dérivé des App Roles Entra dans le JWT ; ne JAMAIS le stocker
//     comme source de vérité (le claim JWT prime).
//   - L'unicité de email est garantie nativement par Entra (pas par Cosmos DB).
// ─────────────────────────────────────────────────────────────────────────────
export interface User {
  userId: string;        // Entra External ID oid, UUID v4
  email: string;         // unique, lowercase, validé Cognito
  displayName: string;   // prénom affiché (ex: "Claire")
  role: 'guest' | 'admin'; // dérivé des App Roles Entra au runtime
  createdAt: string;     // ISO 8601 UTC, ex: "2026-05-17T14:32:00.000Z"
}

// ─────────────────────────────────────────────────────────────────────────────
// Room — Chambre du gîte familial.
// Invariants métier :
//   - roomId est un slug stable kebab-case (ex: "glycine", "pigeonnier").
//     Il est SAISI par l'admin à la création et NE PEUT PAS être modifié ensuite.
//   - capacity ∈ [1, 10].
//   - floor ∈ {0, 1}.
//   - pricePerPerson est un entier positif (€/personne/nuit).
//   - photoTint est l'un des 12 tints autorisés (cf. ROOM_PHOTO_TINTS).
//   - photoUrl est une URL CloudFront vers S3 ; null si aucune photo uploadée.
// ─────────────────────────────────────────────────────────────────────────────
export interface Room {
  roomId: string;
  name: string;              // ex: "La Glycine"
  wing: string;              // ex: "Aile gauche" ; valeur libre
  floor: 0 | 1;
  area: number;              // m², entier positif
  capacity: number;          // 1..10
  beds: string;              // ex: "1 lit double"
  closet: string;            // ex: "Armoire ancienne + commode"
  equipment: string[];       // tags libres
  linen: string[];           // tags libres
  pricePerPerson: number;    // €, entier ≥ 0
  photoTint: RoomPhotoTint;
  blurb: string;             // 1-2 phrases descriptives
  photoUrl: string | null;   // Azure CDN URL ou null
  createdAt: string;         // ISO 8601 UTC
  updatedAt: string;         // ISO 8601 UTC
}

export type RoomPhotoTint =
  | 'rosé' | 'rouge' | 'vert' | 'ocre' | 'bleu' | 'pêche'
  | 'gris' | 'bois' | 'pierre' | 'lin' | 'nuit' | 'mousse';

export const ROOM_PHOTO_TINTS: readonly RoomPhotoTint[] = [
  'rosé', 'rouge', 'vert', 'ocre', 'bleu', 'pêche',
  'gris', 'bois', 'pierre', 'lin', 'nuit', 'mousse',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Booking — Réservation d'une chambre par un user (ou créée par l'admin).
// Invariants métier :
//   - bookingId est un UUID v7 généré côté serveur (timestamp-prefixed).
//   - start < end (strictement). Les dates sont des ISO "YYYY-MM-DD" (jour-level,
//     timezone Europe/Paris, cf. § 1.8).
//   - end est EXCLUSIF (jour de départ non compris dans le séjour).
//   - people ∈ [1, room.capacity] au moment de la création/modification.
//   - userId est null si la réservation a été créée par l'admin pour un tiers
//     non-inscrit (saisie libre du name).
//   - reference est un identifiant lisible "CLOS-XXXXXXXX" généré une fois à la
//     création et immutable (cf. § 1.9).
// ─────────────────────────────────────────────────────────────────────────────
export interface Booking {
  bookingId: string;
  roomId: string;            // FK → Room.roomId
  userId: string | null;     // FK → User.userId, ou null si saisie admin
  name: string;              // nom de la réservation, libre
  start: string;             // "YYYY-MM-DD"
  end: string;               // "YYYY-MM-DD", exclusif
  people: number;            // ≥ 1
  notes: string;             // chaîne, peut être ""
  reference: string;         // "CLOS-XXXXXXXX", immutable
  createdAt: string;         // ISO 8601 UTC
  updatedAt: string;         // ISO 8601 UTC
  createdBy: string;         // userId du créateur (admin ou guest)
}

// ─────────────────────────────────────────────────────────────────────────────
// HouseConfig — Singleton de configuration de la maison.
// Invariants métier :
//   - Il existe TOUJOURS exactement une instance, jamais créée ni supprimée
//     dynamiquement. Elle est seedée au déploiement initial (cf. § 1.7).
//   - Les trois listes (wings, equipmentSuggestions, linenSuggestions) sont
//     uniques sans doublons (trim + dédupe à l'écriture).
// ─────────────────────────────────────────────────────────────────────────────
export interface HouseConfig {
  name: string;
  region: string;
  address: string;              // privée, jamais exposée à un guest non-loggué
  welcomeNote: string;
  wings: string[];
  equipmentSuggestions: string[];
  linenSuggestions: string[];
  updatedAt: string;            // ISO 8601 UTC
}
```

---

## 1.2 — Cosmos DB Container Design

### 1.2.1 — Container principal

Nom : `clos-bon-accueil-{stage}` (stage ∈ `dev`, `prod`).
Base de données : `clos-bon-accueil`.
Partition key : `/pk`.
Throughput : **Serverless** (pay per RU — adapté au volume faible).
Indexing policy : **automatique** — tous les chemins indexés. Pas de GSI
à déclarer : Cosmos DB indexe nativement toutes les propriétés.
TTL : activé au niveau container (`defaultTtl: -1` = respect de la propriété
`ttl` par item, en secondes).
PITR : Continuous 30 days sur `prod`, désactivé sur `dev`.

### 1.2.2 — Structure des items

Chaque item possède :
- `pk` (string) — Partition key.
- `id` (string) — Identifiant unique au sein de la partition (remplace le sort key DynamoDB).
- `entityType` (string) — Discriminant pour les requêtes cross-partition.
- `_etag` (string) — Géré automatiquement par Cosmos DB (optimistic concurrency).
- Tous les champs de l'entité TypeScript correspondante à plat (pas de nested object sauf si l'interface le définit ainsi).

#### Item `Room`
```
pk         = "ROOM#<roomId>"
id         = "META"
entityType = "Room"
+ tous les champs de l'interface Room
```

#### Item `Booking`
```
pk         = "ROOM#<roomId>"
id         = "BOOKING#<start>#<bookingId>"
entityType = "Booking"
+ tous les champs de l'interface Booking
```
*Co-localisé avec sa Room dans la même partition → TransactionalBatch possible.*

#### Item `User`
```
pk         = "USER#<userId>"
id         = "META"
entityType = "User"
+ tous les champs de l'interface User
```

#### Item `HouseConfig`
```
pk         = "HOUSE#CONFIG"
id         = "META"
entityType = "HouseConfig"
+ tous les champs de l'interface HouseConfig
```

#### Item `IdempotencyRecord` (cf. §1.10)
```
pk         = "IDEMPOTENCY#<key>"
id         = "META"
entityType = "IdempotencyRecord"
ttl        = 86400   (secondes depuis la dernière modification — expire 24h après création)
+ bookingId, createdAt
```

**Note — Pas de GSI à déclarer** : toutes les propriétés (`entityType`,
`userId`, `bookingId`, `start`, `end`, etc.) sont auto-indexées par Cosmos DB.
Les patterns d'accès cross-partition (ex. `listMyBookings`, `findBookingById`)
s'expriment en SQL Cosmos DB avec un filtre sur `entityType` + la propriété
concernée. L'unicité de l'email est garantie nativement par Entra External ID.

---

## 1.3 — Mapping access patterns → opérations Cosmos DB

Chaque ligne ci-dessous est **la seule** opération Cosmos DB autorisée pour
l'access pattern correspondant. Toute requête qui ne match pas cette table
doit être justifiée explicitement dans la PR.

SDK : `@azure/cosmos` v4. Authentification via `DefaultAzureCredential` (Managed
Identity en production, CLI token en dev). **Jamais de clé d'accès Cosmos DB dans le code.**

`container.item(id, partitionKey)` — le premier argument est `id`, le deuxième est la
valeur du partition key.

| Access pattern | Opération Cosmos DB | Notes |
|---|---|---|
| `getRoom(roomId)` | `container.item('META', 'ROOM#roomId').read()` | Point read — 1 RU |
| `listRooms()` | `SELECT * FROM c WHERE c.entityType = 'Room' AND c.id = 'META'` | Cross-partition, auto-indexé |
| `createRoom(room)` | `container.items.create(item)` | 409 Conflict si pk+id existe |
| `updateRoom(roomId, patch)` | `container.item('META', 'ROOM#roomId').replace(merged, { accessCondition: { type: 'IfMatch', condition: etag } })` | ETag obligatoire |
| `deleteRoom(roomId)` | `TransactionalBatch` itéré | voir §1.4.2 (cascade) |
| `getBooking(roomId, start, bookingId)` | `container.item('BOOKING#start#bookingId', 'ROOM#roomId').read()` | Point read |
| `findBookingById(bookingId)` | `SELECT * FROM c WHERE c.entityType = 'Booking' AND c.bookingId = @bookingId` | Cross-partition, auto-indexé sur `bookingId` |
| `listBookingsByRoom(roomId, fromDate)` | `SELECT * FROM c WHERE c.pk = 'ROOM#roomId' AND c.entityType = 'Booking' AND c.start >= @from` | In-partition |
| `listBookingsByRoomInRange(roomId, start, end)` | `SELECT * FROM c WHERE c.pk = 'ROOM#roomId' AND c.entityType = 'Booking' AND c.start < @end AND c.end > @start` | In-partition, overlap exact |
| `listMyBookings(userId)` | `SELECT * FROM c WHERE c.entityType = 'Booking' AND c.userId = @userId ORDER BY c.start DESC` | Cross-partition, auto-indexé sur `userId` |
| `listAllBookings(fromDate?, toDate?)` | `SELECT * FROM c WHERE c.entityType = 'Booking' AND c.start >= @from AND c.start <= @to` | Cross-partition |
| `listUpcomingBookings(today)` | `SELECT * FROM c WHERE c.entityType = 'Booking' AND c.start >= @today` | Cross-partition |
| `searchBookings(text)` | `SELECT * FROM c WHERE c.entityType = 'Booking' AND CONTAINS(c.name, @text, true)` | Cross-partition, `true` = case-insensitive |
| `createBooking(b)` | pré-query + `TransactionalBatch` | voir §1.4.1 |
| `updateBooking(b)` | pré-query + `TransactionalBatch` | voir §1.4.4 |
| `deleteBooking(roomId, start, bookingId)` | `container.item('BOOKING#start#bookingId', 'ROOM#roomId').delete()` | — |
| `getUser(userId)` | `container.item('META', 'USER#userId').read()` | Point read |
| `listUsers()` | `SELECT * FROM c WHERE c.entityType = 'User' AND c.id = 'META'` | Cross-partition |
| `createUser(user)` | `container.items.create(item)` | 409 si userId existe déjà |
| `getHouseConfig()` | `container.item('META', 'HOUSE#CONFIG').read()` | Point read singleton |
| `updateHouseConfig(patch)` | `container.item('META', 'HOUSE#CONFIG').replace(merged)` | — |
| `getIdempotencyRecord(key)` | `container.item('META', 'IDEMPOTENCY#key').read()` | Point read |
| `putIdempotencyRecord(record)` | `container.items.create({ ...record, ttl: 86400 })` | Auto-expire 24h |

---

## 1.4 — Règles d'intégrité transactionnelles

### 1.4.1 — Création de Booking : détection de conflit

`createBooking(b)` s'exécute en **deux phases strictes** :

**Phase 1 — Pré-validation (Query in-partition)** :
1. Point read de la Room : `container.item('META', 'ROOM#roomId').read()` → obtenir Room + `_etag`.
2. Valider `capacity >= people` ; sinon → `ValidationError`.
3. Exécute `listBookingsByRoomInRange(roomId, start, end)` (in-partition SQL Cosmos DB).
4. Calcule en backend l'overlap exact : deux intervalles `[s1, e1)` et `[s2, e2)`
   chevauchent ssi `s1 < e2 AND s2 < e1`.
5. Si overlap détecté → **lève `ConflictError(conflictingBookings)`** → 409.

**Phase 2 — Écriture (TransactionalBatch — même partition `ROOM#roomId`)** :

La transaction contient **deux opérations** :
1. **Replace Room** avec `accessCondition: { type: 'IfMatch', condition: roomETag }` :
   - Même contenu Room (no-op sémantique, juste pour vérifier que la Room n'a
     pas été modifiée ou supprimée entre Phase 1 et Phase 2).
   - Équivaut au `ConditionCheck` DynamoDB.
2. **Create Booking** : `batch.create(bookingItem)` — échoue avec 409 si
   l'item `BOOKING#start#bookingId` existe déjà.

Si la Room a changé entre Phase 1 et Phase 2 (ETag mismatch) : le batch
échoue avec 412 Precondition Failed → relancer (retry une fois) ou renvoyer 409.

**Job de réconciliation nocturne** : Azure Function `reconciliation-job.ts`
déclenchée par Timer Trigger NCRONTAB `0 0 1 * * *` (01:00:00 UTC). Elle
requête toutes les Bookings futures (`listUpcomingBookings`) groupées par
`roomId`, détecte les chevauchements et publie un événement
`BOOKING_CONFLICT_DETECTED` sur Service Bus pour notifier l'admin par ACS Email.
Aucun fix automatique — décision humaine.

### 1.4.2 — Suppression de Room : cascade

`deleteRoom(roomId)` s'exécute en plusieurs étapes :

1. Query in-partition `listBookingsByRoom(roomId)` → toutes les Bookings de la room.
2. Construis une liste d'événements `BOOKING_CANCELLED` à émettre (un par
   booking, avec `userId` du propriétaire, `reason: "ROOM_DELETED"`).
3. `TransactionalBatch` (même partition `ROOM#roomId`, 100 opérations max) supprimant :
   la Room (`id=META`) et toutes les Bookings associées.
   Si le nombre de bookings > 99 (limite : 100 ops par batch Cosmos DB), itère par
   chunks et logge un warning.
4. Pour chaque booking supprimé avec `userId !== null`, publie un message
   sur le **Service Bus topic** `clos-notifications-{stage}` avec payload :
   `{type: "BOOKING_CANCELLED", bookingId, userId, roomName, start, end, reason: "ROOM_DELETED"}`.
   L'Azure Function `notification-dispatcher` consomme le topic et envoie l'email ACS.

La cascade est **idempotente** : réexécuter la suppression sur une Room déjà
absente renvoie `NotFoundError` (404), pas 500.

### 1.4.3 — Modification de Room avec capacité réduite

Avant tout `UpdateItem` sur une Room modifiant `capacity` :
1. `Query` toutes les Bookings actives (`end > today`) de cette room.
2. Si au moins une a `people > newCapacity`, **lève
   `CapacityReductionError(blockingBookings)`** → 422
   `CAPACITY_REDUCTION_BLOCKED` avec liste des bookings impactés dans
   `details`.
3. Sinon, applique l'update.

### 1.4.4 — Modification de Booking : changement de `start`

La sort key d'un Booking est `BOOKING#<start>#<bookingId>`. Modifier
`start` **change la sort key** ; un `UpdateItem` ne touche jamais la clé,
il faut donc `Delete` de l'ancien item + `Put` du nouveau.

**Implémentation de `updateBooking(b)`** :

1. Récupère l'ancien Booking via `findBookingById(b.bookingId)` (`Query GSI3`).
   Si introuvable → `NotFoundError`.
2. Si tentative de modifier `roomId` → `ValidationError("roomId is immutable")`.
   Pour changer de chambre, annuler et recréer (cf. UX prototype).
3. Pré-validation overlap (Phase 1 de § 1.4.1) en **excluant** le bookingId
   courant du calcul.
4. **Si `start` est inchangé** : `TransactionalBatch` (même partition `ROOM#roomId`) :
   - Replace Room avec `ifMatch: roomETag` (ConditionCheck capacity).
   - Replace Booking avec les champs mis à jour (même `id`, `ifMatch: bookingETag`).
5. **Si `start` change** : `TransactionalBatch` (même partition `ROOM#roomId`) :
   - Replace Room avec `ifMatch: roomETag` (ConditionCheck capacity).
   - Delete l'ancien item (`id=BOOKING#oldStart#bookingId`).
   - Create le nouvel item (`id=BOOKING#newStart#bookingId`) avec tous les champs mis à jour.

Cette règle s'applique identiquement aux routes user et admin.

---

## 1.5 — Couche d'accès (Data Access Layer)

Crée le fichier `backend/src/data/repository.ts` exportant **exactement** les
éléments ci-dessous. Toute Azure Function doit passer par ce repository —
**interdit** d'utiliser le `@azure/cosmos` SDK directement dans le code handler.

L'**interface** `Repository` est cloud-agnostique (ne change pas entre PM2 et
les phases suivantes). Seule l'implémentation (`repository.cosmos.ts`, créée
en PM2) dépend du SDK Cosmos DB.

```typescript
// backend/src/data/repository.ts
import { CosmosClient } from '@azure/cosmos';
import { Room, Booking, User, HouseConfig } from '@clos/shared-types';

export interface IdempotencyRecord {
  key: string;
  bookingId: string;
  createdAt: string;
  ttl: number;  // secondes depuis la création (Cosmos DB ttl property)
}

export interface Repository {
  // Rooms
  getRoom(roomId: string): Promise<Room | null>;
  listRooms(): Promise<Room[]>;
  createRoom(room: Room): Promise<Room>;
  updateRoom(roomId: string, patch: Partial<Room>): Promise<Room>;
  deleteRoom(roomId: string): Promise<{ cancelledBookings: Booking[] }>;

  // Bookings
  getBooking(roomId: string, start: string, bookingId: string): Promise<Booking | null>;
  findBookingById(bookingId: string): Promise<Booking | null>;
  listBookingsByRoom(roomId: string, fromDate?: string): Promise<Booking[]>;
  listBookingsByRoomInRange(roomId: string, start: string, end: string): Promise<Booking[]>;
  listMyBookings(userId: string): Promise<Booking[]>;
  listAllBookings(opts?: { fromDate?: string; toDate?: string }): Promise<Booking[]>;
  searchBookings(text: string): Promise<Booking[]>;
  createBooking(booking: Booking): Promise<Booking>;
  updateBooking(booking: Booking): Promise<Booking>;
  deleteBooking(roomId: string, start: string, bookingId: string): Promise<void>;

  // Users
  getUser(userId: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  createUser(user: User): Promise<User>;

  // House config
  getHouseConfig(): Promise<HouseConfig>;
  updateHouseConfig(patch: Partial<HouseConfig>): Promise<HouseConfig>;

  // Idempotency
  getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null>;
  putIdempotencyRecord(record: IdempotencyRecord): Promise<void>;
}

// Factory Cosmos DB — implémentation réelle dans repository.cosmos.ts (PM2)
export interface CosmosRepositoryOptions {
  client: CosmosClient;
  databaseId: string;
  containerId: string;
}

export function createRepository(options: CosmosRepositoryOptions): Repository;

// Erreurs métier typées — JAMAIS de Error nue
export class ConflictError extends Error {
  constructor(public readonly conflictingBookings: Booking[]) { super('Booking conflict'); }
}
export class NotFoundError extends Error {
  constructor(public readonly entity: string, public readonly id: string) { super(`${entity} not found: ${id}`); }
}
export class ValidationError extends Error {
  constructor(public readonly field: string, public readonly reason: string) { super(`Validation failed on ${field}: ${reason}`); }
}
export class CapacityReductionError extends Error {
  constructor(public readonly blockingBookings: Booking[]) { super('Capacity reduction blocked'); }
}
export class ForbiddenError extends Error {
  constructor(public readonly reason: string) { super(reason); }
}
```

**Règles d'implémentation impératives** :
- Toutes les fonctions sont `async` et retournent des `Promise`.
- Tout item non trouvé Cosmos DB (`404 NotFound`) est traduit en `null` TypeScript
  explicite (jamais `undefined`).
- Aucune fonction ne logge — c'est le handler appelant qui logue.
- Les erreurs métier lèvent les classes ci-dessus (jamais des Error nues).
- Les erreurs Cosmos DB (409 Conflict, 412 PreconditionFailed, 429 TooManyRequests,
  etc.) remontent telles quelles depuis l'implémentation ; le mapping vers HTTP
  se fait dans `withErrorHandling` (cf. `specs/02-api-contract.md §2.5`).

---

## 1.6 — Volumétrie attendue (sizing)

| Entité | Cardinalité MVP | Cardinalité 5 ans |
|---|---|---|
| Room | ~12 | ~15 |
| User | ~30 | ~100 |
| Booking | ~200/an | ~2000 cumulés |
| HouseConfig | 1 | 1 |
| IdempotencyRecord | éphémère (TTL 24h) | ≤ 50 en permanence |

Le mode **Serverless** Cosmos DB reste largement sous le seuil de coût significatif
(< 0,50 € / mois). Pas de throughput à provisionner.

---

## 1.7 — Seed de données initial

Au premier déploiement, exécute un script `backend/scripts/seed.ts` qui :

1. Crée le `HouseConfig` singleton avec les valeurs par défaut du prototype
   (`name: "Le Clos Bon Accueil"`, `region: "Normandie"`, etc. — extraits
   verbatim de `data.jsx`). Utilise `container.items.upsert()` pour l'idempotence.
2. Crée les 12 Rooms du prototype (données verbatim de `ROOMS` dans `data.jsx`).
   Utilise `container.items.create()` + ignore les 409 Conflict (idempotent).
3. **Sur l'environnement `dev` uniquement**, crée également 13 Bookings mock
   avec **des dates relatives à `today`** (et non absolues) pour rester
   pertinents au cours du temps :
   - Calcule `today` en timezone `Europe/Paris`.
   - Décale les dates des 13 bookings de `data.jsx` selon le pattern :
     `newStart = today + (oldStart - "2026-05-15")` (le `2026-05-15` est
     la valeur `TODAY` hardcodée du prototype).
   - Idem pour `end`.
4. **N'effectue aucun seed sur `prod`** au-delà du `HouseConfig` et des 12
   Rooms. Les Bookings réels sont créés par les utilisateurs.

Le seed est idempotent : il vérifie `attribute_not_exists(pk)` avant chaque
write et skip silencieusement les items existants.

---

## 1.8 — Timezone et calcul de dates

**Toutes les comparaisons de date métier utilisent `Europe/Paris`** comme
timezone applicative unique. La maison opère depuis la Normandie ; aucune
internationalisation n'est prévue.

Crée le fichier `shared-types/src/dates.ts` :

```typescript
export const APP_TIMEZONE = 'Europe/Paris' as const;

// Retourne la date "aujourd'hui" en format YYYY-MM-DD selon Europe/Paris,
// indépendamment de la timezone du serveur Lambda (UTC).
export function todayIsoInAppTz(): string;

// Convertit une date ISO en YYYY-MM-DD en timezone Europe/Paris.
export function toAppDateString(iso: string): string;

// Calcule le nombre de nuits entre deux dates YYYY-MM-DD (exclusif sur end).
export function nightsBetween(start: string, end: string): number;

// Détecte un chevauchement strict entre deux intervalles [s1,e1) et [s2,e2).
export function intervalsOverlap(s1: string, e1: string, s2: string, e2: string): boolean;
```

**Implémentation impérative** : utilise `dayjs` avec les plugins `utc` et
`timezone` (dépendance pinnée `dayjs@1.11.x`). Pas de `Date.now()` direct
dans le code métier — toujours passer par `todayIsoInAppTz()`.

Ce module est utilisé par le backend ET le frontend (publié dans
`shared-types`).

---

## 1.9 — Génération des identifiants

### 1.9.1 — `bookingId`
UUID v7 (timestamp-prefixed) généré par la lib `uuid@10` :
`import { v7 as uuidv7 } from 'uuid'`. Tri naturel par création.

### 1.9.2 — `Booking.reference`
Format : `CLOS-XXXXXXXX` où `X` est tiré d'un alphabet base32 sans
ambiguïté visuelle : `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (32 caractères, ni
`0/O`, ni `1/I/L`, ni `0/Q`). 8 caractères = 32⁸ ≈ 10¹² possibilités →
probabilité de collision sur 10 000 bookings < 10⁻¹⁰. **Pas de vérification
d'unicité en table.**

Génération via `crypto.randomBytes(8)` puis mapping sur l'alphabet.
Crée la fonction `generateBookingReference(): string` dans
`backend/src/shared/identifiers.ts`.

### 1.9.3 — `userId`
**Jamais généré par l'app.** Toujours égal au claim `oid` Entra External ID
(UUID v4) extrait du JWT après validation APIM. En post-PM4, récupéré via le
header `x-user-id` injecté par APIM (`request.headers.get('x-user-id')`).

**Migration** : remplace `event.requestContext.authorizer.claims.sub` (Cognito).

---

## 1.10 — Idempotence des mutations

Les routes `POST /v1/bookings` et `POST /v1/admin/bookings` (création de
Booking) acceptent un header optionnel `Idempotency-Key: <uuid>`.

**Comportement** :
- Si le header est absent : comportement standard, pas de garantie.
- Si le header est présent :
  1. Lookup `getIdempotencyRecord(key)`.
  2. Si trouvé : `findBookingById(record.bookingId)` et renvoie le Booking
     existant avec code 200 (au lieu de 201).
  3. Si non trouvé : exécute la création normalement, puis
     `putIdempotencyRecord({key, bookingId, createdAt, ttl: 86400})`.

**TTL Cosmos DB** : la propriété `ttl` sur l'item `IdempotencyRecord` est en
**secondes** (durée de vie depuis la dernière modification). Configurer le
container avec `defaultTtl: -1` pour activer le TTL opt-in par item.
Bicep : `resource container 'containers@2024-02-15-preview' { properties: { resource: { defaultTtl: -1 } } }`.

---

## 1.11 — DTO partagés frontend/backend

Crée `shared-types/src/dto.ts` exportant **exactement** :

```typescript
import { Room, Booking, User, HouseConfig } from './domain';

// ─── Inputs (créations / modifications) ───────────────────────────────

export interface CreateBookingInput {
  roomId: string;
  start: string;          // YYYY-MM-DD
  end: string;            // YYYY-MM-DD
  people: number;
  name: string;
  notes: string;
}

export interface AdminCreateBookingInput extends CreateBookingInput {
  userId: string | null;  // null si saisie pour tiers
}

export interface UpdateBookingInput {
  start?: string;
  end?: string;
  people?: number;
  notes?: string;
  // roomId NON autorisé (cf. § 1.4.4)
}

export interface AdminUpdateBookingInput extends UpdateBookingInput {
  roomId?: string;        // l'admin peut déplacer une résa
  name?: string;
  userId?: string | null;
}

export interface CreateRoomInput {
  roomId: string;
  name: string;
  wing: string;
  floor: 0 | 1;
  area: number;
  capacity: number;
  beds: string;
  closet: string;
  equipment: string[];
  linen: string[];
  pricePerPerson: number;
  photoTint: Room['photoTint'];
  blurb: string;
}

export interface UpdateRoomInput {
  name?: string;
  wing?: string;
  floor?: 0 | 1;
  area?: number;
  capacity?: number;
  beds?: string;
  closet?: string;
  equipment?: string[];
  linen?: string[];
  pricePerPerson?: number;
  photoTint?: Room['photoTint'];
  blurb?: string;
  photoUrl?: string | null;
  // roomId NON autorisé (immutable)
}

export interface InviteUserInput {
  email: string;
  displayName: string;
  role: 'guest' | 'admin';
}

export interface UpdateHouseConfigInput {
  name?: string;
  region?: string;
  address?: string;
  welcomeNote?: string;
  wings?: string[];
  equipmentSuggestions?: string[];
  linenSuggestions?: string[];
}

// ─── Outputs (résultats spécifiques) ──────────────────────────────────

export interface AvailabilityResult {
  roomId: string;
  start: string;
  end: string;
  available: boolean;
  conflicts: Booking[];
}

export interface DashboardData {
  todayCount: number;
  weekCount: number;
  totalRoomCount: number;
  totalUpcomingRevenue: number;
  upcomingArrivals: Booking[];
}

export type BookingFilter = 'upcoming' | 'past' | 'all';

export interface PhotoUploadUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  expiresIn: number;     // secondes
}

export interface DeleteRoomResult {
  deletedRoomId: string;
  cancelledBookings: number;
}

// ─── Réponses standardisées ───────────────────────────────────────────

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) { super(message); }
}
```

Tout DTO ajouté dans le code doit être **d'abord déclaré ici**, jamais
inventé dans un handler.
