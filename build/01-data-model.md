# 01 — Modèle de données

> **Source of Truth.** Ce fichier définit toutes les entités, leur projection
> DynamoDB Single Table, les index, les contraintes d'intégrité, la couche
> d'accès, les DTO partagés et les règles de date. Toute divergence dans le
> code est un bug.

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
//   - Un User est créé UNIQUEMENT par invitation Cognito (pas de signup public).
//   - userId === Cognito sub (UUID v4 fourni par Cognito, jamais généré côté app).
//   - role est dérivé de l'appartenance au groupe Cognito ; ne JAMAIS le stocker
//     comme source de vérité (le claim JWT prime).
//   - L'unicité de email est garantie nativement par Cognito (pas par DynamoDB).
// ─────────────────────────────────────────────────────────────────────────────
export interface User {
  userId: string;        // Cognito sub, UUID v4
  email: string;         // unique, lowercase, validé Cognito
  displayName: string;   // prénom affiché (ex: "Claire")
  role: 'guest' | 'admin'; // dérivé du groupe Cognito au runtime
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
  photoUrl: string | null;   // CloudFront URL ou null
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

## 1.2 — DynamoDB Single Table Design

### 1.2.1 — Table principale

Nom : `clos-bon-accueil-{stage}` (stage ∈ `dev`, `prod`).
Billing : `PAY_PER_REQUEST`.
Encryption : `AWS_MANAGED`.
Point-in-time recovery : **activé** sur `prod`, désactivé sur `dev`.

| Attribut | Type | Rôle |
|---|---|---|
| `pk` | S | Partition key |
| `sk` | S | Sort key |
| `gsi1pk` | S | GSI1 partition key (sparse) |
| `gsi1sk` | S | GSI1 sort key (sparse) |
| `gsi2pk` | S | GSI2 partition key (sparse) |
| `gsi2sk` | S | GSI2 sort key (sparse) |
| `gsi3pk` | S | GSI3 partition key (sparse) |
| `gsi3sk` | S | GSI3 sort key (sparse) |

### 1.2.2 — Items projetés

Pour chaque item, applique strictement les patterns ci-dessous. Stocke
l'intégralité des champs de l'entité TypeScript en attributs DynamoDB
top-level (pas de nested attribute). Ajoute systématiquement un attribut
`entityType` de type string pour discriminer les items lors d'un scan.

#### Item `Room`
```
pk         = "ROOM#<roomId>"
sk         = "META"
gsi1pk     = "ROOMS#ALL"
gsi1sk     = "ROOM#<roomId>"
entityType = "Room"
+ tous les champs de l'interface Room
```

#### Item `Booking`
```
pk         = "ROOM#<roomId>"
sk         = "BOOKING#<start>#<bookingId>"
gsi1pk     = userId ? "USER#<userId>" : null       // sparse : pas indexé si null
gsi1sk     = userId ? "BOOKING#<start>#<bookingId>" : null
gsi2pk     = "BOOKINGS#ALL"
gsi2sk     = "<start>#<bookingId>"
gsi3pk     = "BOOKING#<bookingId>"                 // lookup par ID seul
gsi3sk     = "META"
entityType = "Booking"
+ tous les champs de l'interface Booking
```

#### Item `User`
```
pk         = "USER#<userId>"
sk         = "META"
gsi1pk     = "USERS#ALL"
gsi1sk     = "USER#<email>"
entityType = "User"
+ tous les champs de l'interface User
```

#### Item `HouseConfig`
```
pk         = "HOUSE#CONFIG"
sk         = "META"
entityType = "HouseConfig"
+ tous les champs de l'interface HouseConfig
```

#### Item `IdempotencyRecord` (cf. § 1.10)
```
pk         = "IDEMPOTENCY#<key>"
sk         = "META"
entityType = "IdempotencyRecord"
+ bookingId, createdAt, ttl (epoch seconds, 24h)
```

### 1.2.3 — Index secondaires

**GSI1** — projection `ALL`
- pk : `gsi1pk`, sk : `gsi1sk`
- Sert : `listMyBookings(userId)`, `listAllUsers()`, `listAllRooms()`

**GSI2** — projection `ALL`
- pk : `gsi2pk`, sk : `gsi2sk`
- Sert : `listAllBookingsByDate()`, `listUpcomingBookings()`, dashboard admin,
  vue calendrier semaine.

**GSI3** — projection `ALL`
- pk : `gsi3pk`, sk : `gsi3sk`
- Sert : `findBookingById(bookingId)` — lookup direct d'un Booking par son
  ID seul, sans connaître roomId ni start. Indispensable pour les routes
  `PATCH /v1/bookings/{bookingId}`, `DELETE /v1/bookings/{bookingId}`,
  `GET /v1/bookings/{bookingId}` et leurs équivalents admin.

**Note explicite — Pas de GSI pour `getUserByEmail`** : l'unicité de l'email
est enforced nativement par Cognito User Pool (`UsernameAttributes: ['email']`
et `AutoVerifiedAttributes: ['email']`). Il n'est jamais nécessaire de
vérifier l'unicité en DynamoDB côté Lambda. La fonction `getUserByEmail`
n'existe pas dans le Repository.

---

## 1.3 — Mapping access patterns → opérations DynamoDB

Chaque ligne ci-dessous est **la seule** opération DynamoDB autorisée pour
l'access pattern correspondant. Toute requête qui ne match pas cette table
doit être justifiée explicitement dans la PR.

| Access pattern | Opération | Paramètres |
|---|---|---|
| `getRoom(roomId)` | `GetItem` | `pk=ROOM#<id>, sk=META` |
| `listRooms()` | `Query GSI1` | `gsi1pk=ROOMS#ALL` |
| `createRoom(room)` | `PutItem` (`ConditionExpression: attribute_not_exists(pk)`) | unicité du roomId |
| `updateRoom(roomId, patch)` | `UpdateItem` | `pk=ROOM#<id>, sk=META` |
| `deleteRoom(roomId)` | `TransactWriteItems` itéré | voir § 1.4.2 (cascade) |
| `getBooking(roomId, start, bookingId)` | `GetItem` | `pk=ROOM#<id>, sk=BOOKING#<start>#<bookingId>` |
| `findBookingById(bookingId)` | `Query GSI3` | `gsi3pk=BOOKING#<bookingId>` (renvoie 0 ou 1 item) |
| `listBookingsByRoom(roomId, fromDate)` | `Query` | `pk=ROOM#<id>, sk begins_with "BOOKING#"`, filter `start >= fromDate` côté Lambda |
| `listBookingsByRoomInRange(roomId, start, end)` | `Query` | `pk=ROOM#<id>, sk BETWEEN BOOKING#<start>... AND BOOKING#<end>...`, post-filtre overlap exact en Lambda |
| `listMyBookings(userId)` | `Query GSI1` | `gsi1pk=USER#<userId>`, ScanIndexForward=false |
| `listAllBookings(fromDate?, toDate?)` | `Query GSI2` | `gsi2pk=BOOKINGS#ALL`, `gsi2sk BETWEEN <fromDate> AND <toDate>` |
| `listUpcomingBookings(today)` | `Query GSI2` | `gsi2pk=BOOKINGS#ALL, gsi2sk >= <today>` |
| `searchBookings(text)` | `Query GSI2` + filter côté Lambda | filter sur `name` contains (volume <2000) |
| `createBooking(b)` | pré-Query + `TransactWriteItems` | voir § 1.4.1 |
| `updateBooking(b)` | pré-Query + `TransactWriteItems` (delete+put si start change) | voir § 1.4.1 et § 1.4.4 |
| `deleteBooking(roomId, start, bookingId)` | `DeleteItem` | — |
| `getUser(userId)` | `GetItem` | `pk=USER#<id>, sk=META` |
| `listUsers()` | `Query GSI1` | `gsi1pk=USERS#ALL` |
| `createUser(user)` | `PutItem` (`ConditionExpression: attribute_not_exists(pk)`) | idempotent |
| `getHouseConfig()` | `GetItem` | `pk=HOUSE#CONFIG, sk=META` |
| `updateHouseConfig(patch)` | `UpdateItem` | `pk=HOUSE#CONFIG, sk=META` |
| `getIdempotencyRecord(key)` | `GetItem` | `pk=IDEMPOTENCY#<key>, sk=META` |
| `putIdempotencyRecord(record)` | `PutItem` (`ConditionExpression: attribute_not_exists(pk)`) | TTL 24h |

---

## 1.4 — Règles d'intégrité transactionnelles

### 1.4.1 — Création de Booking : détection de conflit

`createBooking(b)` s'exécute en **deux phases strictes** :

**Phase 1 — Pré-validation (Query)** :
1. Exécute `Query` `listBookingsByRoomInRange(roomId, start, end)`.
2. Calcule en Lambda l'overlap exact selon la règle : deux intervalles
   `[s1, e1)` et `[s2, e2)` chevauchent ssi `s1 < e2 AND s2 < e1`.
3. Si overlap détecté → **lève `ConflictError(conflictingBookings)`** → 409.
4. Récupère également la Room pour valider `capacity >= people` ; sinon
   → `ValidationError`.

**Phase 2 — Écriture (TransactWriteItems)** :
La transaction contient **deux opérations** :
1. **`ConditionCheck`** sur la Room :
   - `pk=ROOM#<roomId>, sk=META`
   - `ConditionExpression: attribute_exists(pk) AND capacity >= :people`
   - Garantit que la Room n'a pas été supprimée ni que sa capacité n'a
     pas été réduite entre la Phase 1 et la Phase 2.
2. **`Put`** du Booking avec
   `ConditionExpression: attribute_not_exists(pk) AND attribute_not_exists(sk)`
   pour garantir qu'aucun item identique n'existe déjà.

**Pas de mécanisme de `version` / optimistic locking sur la Room.** La
fenêtre de race condition entre Phase 1 et Phase 2 est acceptée car :
- Volume très faible (audit § F-9 : 1 admin + quelques guests, ~quelques
  réservations par mois).
- Conséquence d'un double-booking accidentel = email à l'admin via le
  job de réconciliation (voir ci-dessous).

**Job de réconciliation nocturne** : crée une Lambda
`reconciliation-job.ts` déclenchée par EventBridge tous les jours à
03:00 Europe/Paris. Elle scan toutes les Bookings futures (Query GSI2
`gsi2sk >= today`) groupées par `roomId`, détecte les chevauchements et
publie un événement `BOOKING_CONFLICT_DETECTED` sur SNS pour notifier
l'admin par email. Aucun fix automatique — décision humaine.

### 1.4.2 — Suppression de Room : cascade

`deleteRoom(roomId)` s'exécute en plusieurs étapes :

1. `Query` toutes les `Booking` de la room (`pk=ROOM#<roomId>, sk begins_with "BOOKING#"`).
2. Construis une liste d'événements `BOOKING_CANCELLED` à émettre (un par
   booking, avec `userId` du propriétaire, `reason: "ROOM_DELETED"`).
3. `TransactWriteItems` (chunks de 100 max — limite DynamoDB) supprimant :
   la `Room` (`sk=META`) et toutes les `Booking` associées.
4. Pour chaque booking supprimé avec `userId !== null`, publie un message
   sur le topic SNS `clos-notifications-{stage}` avec payload :
   `{type: "BOOKING_CANCELLED", bookingId, userId, roomName, start, end, reason: "ROOM_DELETED"}`.
   Une Lambda `notification-dispatcher` consomme et envoie l'email SES.

Si le nombre de bookings > 100, itère par chunks et logge un warning. La
cascade est **idempotente** : réexécuter la suppression sur une Room déjà
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
4. **Si `start` est inchangé** : `TransactWriteItems` avec :
   - `ConditionCheck` Room (capacity).
   - `Update` du Booking (champs non-clé uniquement).
5. **Si `start` change** : `TransactWriteItems` avec :
   - `ConditionCheck` Room (capacity).
   - `Delete` de l'ancien item (`pk=ROOM#<roomId>, sk=BOOKING#<oldStart>#<bookingId>`)
     avec `ConditionExpression: attribute_exists(pk)`.
   - `Put` du nouvel item (`sk=BOOKING#<newStart>#<bookingId>`) avec tous
     les attributs et nouveaux `gsi*sk` recalculés.

Cette règle s'applique identiquement aux routes user et admin.

---

## 1.5 — Couche d'accès (Data Access Layer)

Crée le fichier `backend/src/data/repository.ts` exportant **exactement** les
fonctions ci-dessous. Toute Lambda doit passer par ce repository — **interdit**
d'utiliser le `DynamoDBDocumentClient` directement dans le code handler.

```typescript
// backend/src/data/repository.ts
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Room, Booking, User, HouseConfig } from '@clos/shared-types';

export interface IdempotencyRecord {
  key: string;
  bookingId: string;
  createdAt: string;
  ttl: number;  // epoch seconds
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

export function createRepository(
  ddb: DynamoDBDocumentClient,
  tableName: string,
): Repository;

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
- Tout `null` DynamoDB est traduit en `null` TypeScript explicite (jamais `undefined`).
- Aucune fonction ne logge — c'est le handler appelant qui logue.
- Les erreurs métier lèvent les classes ci-dessus (jamais des Error nues).
- Les erreurs techniques DynamoDB (`ConditionalCheckFailedException`,
  `TransactionCanceledException`, etc.) remontent telles quelles ; le
  mapping vers HTTP se fait dans `withErrorHandling`
  (cf. `02-api-contract § 2.5`).

---

## 1.6 — Volumétrie attendue (sizing)

| Entité | Cardinalité MVP | Cardinalité 5 ans |
|---|---|---|
| Room | ~12 | ~15 |
| User | ~30 | ~100 |
| Booking | ~200/an | ~2000 cumulés |
| HouseConfig | 1 | 1 |
| IdempotencyRecord | éphémère (TTL 24h) | ≤ 50 en permanence |

Le mode `PAY_PER_REQUEST` reste largement sous le seuil de coût significatif
(<5 € / mois). Pas d'auto-scaling à configurer.

---

## 1.7 — Seed de données initial

Au premier déploiement, exécute un script `backend/scripts/seed.ts` qui :

1. Crée le `HouseConfig` singleton avec les valeurs par défaut du prototype
   (`name: "Le Clos Bon Accueil"`, `region: "Normandie"`, etc. — extraits
   verbatim de `data.jsx`).
2. Crée les 12 Rooms du prototype (données verbatim de `ROOMS` dans `data.jsx`).
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
**Jamais généré par l'app.** Toujours égal au `sub` Cognito (UUID v4)
récupéré dans `event.requestContext.authorizer.claims.sub`.

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
     `putIdempotencyRecord({key, bookingId, createdAt, ttl: now + 86400})`.
     TTL DynamoDB activé sur l'attribut `ttl` (epoch seconds).

**Activation du TTL DynamoDB** : dans `infra/lib/data-stack.ts`, configure
la table avec `timeToLiveAttribute: 'ttl'`.

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
