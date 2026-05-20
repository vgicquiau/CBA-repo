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
