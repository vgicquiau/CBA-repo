import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { v7 as uuidv7 } from 'uuid';
import { todayIsoInAppTz } from '@clos/shared-types';
import type { Room, HouseConfig, Booking } from '@clos/shared-types';
import { generateBookingReference } from '../src/shared/identifiers';

// ─── CLI ──────────────────────────────────────────────────────────────────────

const stageArgIdx = process.argv.indexOf('--stage');
const stage =
  process.argv.find((a) => a.startsWith('--stage='))?.split('=')[1] ??
  (stageArgIdx !== -1 ? process.argv[stageArgIdx + 1] : 'dev');

if (stage !== 'dev' && stage !== 'prod') {
  console.error(`Unknown stage "${stage}". Use --stage dev or --stage prod.`);
  process.exit(1);
}

console.log(`\nSeeding Cosmos DB — stage: ${stage}\n`);

// ─── Cosmos client ────────────────────────────────────────────────────────────

function buildContainer() {
  const endpoint = process.env.COSMOS_ENDPOINT ?? 'https://localhost:8081';
  const client = process.env.COSMOS_KEY
    ? new CosmosClient({ endpoint, key: process.env.COSMOS_KEY })
    : new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
  const dbId = process.env.COSMOS_DATABASE ?? 'clos-bon-accueil';
  const containerId = process.env.COSMOS_CONTAINER ?? `clos-bon-accueil-${stage}`;
  return client.database(dbId).container(containerId);
}

// ─── Idempotent create ────────────────────────────────────────────────────────

type CosmosItem = { pk: string; id: string; entityType: string; [key: string]: unknown };

async function createOrSkip(
  container: ReturnType<typeof buildContainer>,
  item: CosmosItem,
  label: string,
): Promise<void> {
  try {
    await container.items.create(item);
    console.log(`  ✓ ${label}`);
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 409) {
      console.log(`  · skipped ${label} (already exists)`);
    } else {
      throw err;
    }
  }
}

// ─── Key helpers (mirror repository.cosmos.ts) ────────────────────────────────

const pk = {
  room: (id: string) => `ROOM#${id}`,
  house: () => 'HOUSE_CONFIG',
};

const docId = {
  room: (id: string) => `ROOM#${id}#METADATA`,
  booking: (id: string) => `BOOKING#${id}`,
  house: () => 'HOUSE_CONFIG#MAIN',
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

const REFERENCE_DATE = '2026-05-15';

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shiftDate(originalDate: string, today: string): string {
  const refMs = new Date(REFERENCE_DATE + 'T00:00:00Z').getTime();
  const origMs = new Date(originalDate + 'T00:00:00Z').getTime();
  const offsetDays = Math.round((origMs - refMs) / 86400000);
  return addDays(today, offsetDays);
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

const HOUSE_CONFIG: HouseConfig = {
  name: 'Le Clos Bon Accueil',
  region: 'Normandie',
  address: '5 chemin du Verger, 14XXX',
  welcomeNote:
    "Les volets bleus ont été repeints. Et les hortensias sont en fleur. À très vite — Papa & Maman.",
  wings: ['Aile gauche', 'Aile droite', 'Bâtiment principal', 'Dépendance'],
  equipmentSuggestions: [
    'Bureau', 'Vue jardin', 'Cheminée', 'TV', 'Velux',
    'Salon attenant', 'Bouilloire', 'Sèche-cheveux',
    'Coin lecture', 'Liseuse', 'Accès terrasse',
  ],
  linenSuggestions: [
    'Draps fournis', 'Couette + 2 oreillers',
    'Serviettes de bain', 'Serviette de toilette',
    'Drap de bain', 'Peignoirs', 'Tapis de bain',
    'Linge changé toutes les semaines',
  ],
  updatedAt: now,
};

const ROOMS: Room[] = [
  {
    roomId: 'glycine', name: 'La Glycine', wing: 'Aile gauche', floor: 1, area: 22, capacity: 2,
    beds: '1 lit double', closet: 'Armoire ancienne + commode',
    equipment: ['Bureau', 'Cheminée déco', 'Vue jardin'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette', 'Peignoirs'],
    pricePerPerson: 28, photoTint: 'rosé',
    blurb: "La plus grande chambre du premier, baignée de soleil l'après-midi. Lit douillet sous les poutres.",
    photoUrl: null, createdAt: now, updatedAt: now,
  },
  {
    roomId: 'coquelicot', name: 'Le Coquelicot', wing: 'Aile droite', floor: 1, area: 16, capacity: 2,
    beds: '2 lits simples', closet: 'Penderie + étagères',
    equipment: ['Bureau', 'Vue sur la cour'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette'],
    pricePerPerson: 24, photoTint: 'rouge',
    blurb: "Parfaite pour deux amis ou des cousins. Lits jumeaux en fer forgé, papier peint à fleurs.",
    photoUrl: null, createdAt: now, updatedAt: now,
  },
  {
    roomId: 'tilleul', name: 'Le Tilleul', wing: 'Aile droite', floor: 1, area: 14, capacity: 1,
    beds: '1 lit simple', closet: 'Petite armoire',
    equipment: ['Bureau', 'Liseuse', 'Vue tilleul'],
    linen: ['Draps fournis', 'Couette + oreiller', 'Serviette de bain', 'Serviette de toilette'],
    pricePerPerson: 22, photoTint: 'vert',
    blurb: "Petite chambre côté tilleul, idéale pour lire ou écrire le matin.",
    photoUrl: null, createdAt: now, updatedAt: now,
  },
  {
    roomId: 'bergerie', name: 'La Bergerie', wing: 'Dépendance', floor: 0, area: 24, capacity: 3,
    beds: '1 double + 1 simple', closet: 'Grande armoire normande',
    equipment: ['Salon attenant', 'Cheminée', 'Accès direct jardin'],
    linen: ['Draps fournis', 'Couettes + 3 oreillers', 'Serviettes de bain', 'Serviettes de toilette', 'Peignoirs', 'Tapis de bain'],
    pricePerPerson: 30, photoTint: 'ocre',
    blurb: "Ancienne dépendance refaite. Idéale pour une petite famille, plain-pied, sortie sur la prairie.",
    photoUrl: null, createdAt: now, updatedAt: now,
  },
  {
    roomId: 'pigeonnier', name: 'Le Pigeonnier', wing: 'Dépendance', floor: 1, area: 18, capacity: 2,
    beds: '1 lit double', closet: 'Coffre + portants',
    equipment: ['Vue 360°', 'Velux', 'Bureau'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette', 'Peignoirs'],
    pricePerPerson: 32, photoTint: 'bleu',
    blurb: "Tout en haut, dans la tour. Plafond sous charpente, lumière incroyable au lever du jour.",
    photoUrl: null, createdAt: now, updatedAt: now,
  },
  {
    roomId: 'verger', name: 'Le Verger', wing: 'Aile gauche', floor: 1, area: 17, capacity: 2,
    beds: '1 lit double', closet: 'Penderie',
    equipment: ['Vue pommiers', 'Bureau'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette'],
    pricePerPerson: 26, photoTint: 'pêche',
    blurb: "Donne sur le verger. Au printemps, on s'endort sous les fleurs de pommier.",
    photoUrl: null, createdAt: now, updatedAt: now,
  },
  {
    roomId: 'lavoir', name: 'Le Lavoir', wing: 'Bâtiment principal', floor: 0, area: 12, capacity: 1,
    beds: '1 lit simple', closet: 'Étagères',
    equipment: ['Vue ruisseau'],
    linen: ['Draps fournis', 'Couette + oreiller', 'Serviette de bain'],
    pricePerPerson: 20, photoTint: 'gris',
    blurb: "Toute petite, toute fraîche. Pour les courts séjours en solo.",
    photoUrl: null, createdAt: now, updatedAt: now,
  },
  {
    roomId: 'grange', name: 'La Grange', wing: 'Dépendance', floor: 1, area: 28, capacity: 4,
    beds: '2 lits doubles', closet: 'Deux armoires',
    equipment: ['Salon de lecture', 'Bureau', 'TV', 'Velux'],
    linen: ['Draps fournis', 'Couettes + 4 oreillers', 'Serviettes de bain', 'Serviettes de toilette', 'Tapis de bain'],
    pricePerPerson: 26, photoTint: 'bois',
    blurb: "Grande pièce mansardée, deux lits côte à côte. Parfait pour une famille de quatre.",
    photoUrl: null, createdAt: now, updatedAt: now,
  },
  {
    roomId: 'cellier', name: 'Le Cellier', wing: 'Bâtiment principal', floor: 0, area: 15, capacity: 2,
    beds: '1 lit double', closet: 'Penderie discrète',
    equipment: ['Très calme', 'Frais en été'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain'],
    pricePerPerson: 22, photoTint: 'pierre',
    blurb: "Voûte en pierre, fraîche l'été, silence complet la nuit.",
    photoUrl: null, createdAt: now, updatedAt: now,
  },
  {
    roomId: 'mansarde', name: 'La Mansarde', wing: 'Aile gauche', floor: 1, area: 19, capacity: 2,
    beds: '1 lit double', closet: 'Sous-pente aménagé',
    equipment: ['Velux', 'Bureau', 'Vue toits'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette'],
    pricePerPerson: 25, photoTint: 'lin',
    blurb: "Sous les combles, atmosphère atelier. Bureau face à la fenêtre de toit.",
    photoUrl: null, createdAt: now, updatedAt: now,
  },
  {
    roomId: 'etoile', name: "L'Étoile", wing: 'Aile droite', floor: 1, area: 20, capacity: 2,
    beds: '1 lit double', closet: 'Armoire + commode',
    equipment: ['Velux orientable', 'Vue ciel', 'Bureau'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette', 'Peignoirs'],
    pricePerPerson: 28, photoTint: 'nuit',
    blurb: "On l'appelle l'Étoile parce qu'on dort sous le ciel ouvert. Velux qui s'ouvre en grand.",
    photoUrl: null, createdAt: now, updatedAt: now,
  },
  {
    roomId: 'refuge', name: 'Le Refuge', wing: 'Bâtiment principal', floor: 0, area: 13, capacity: 2,
    beds: '1 lit double', closet: 'Niches murales',
    equipment: ['Coin lecture', 'Accès terrasse'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette'],
    pricePerPerson: 24, photoTint: 'mousse',
    blurb: "Petite chambre cosy au rez, sa porte donne sur la terrasse couverte.",
    photoUrl: null, createdAt: now, updatedAt: now,
  },
];

interface MockBookingDef {
  roomId: string;
  name: string;
  originalStart: string;
  originalEnd: string;
  people: number;
}

const MOCK_BOOKING_DEFS: MockBookingDef[] = [
  { roomId: 'glycine',    name: 'Claire & Antoine', originalStart: '2026-05-16', originalEnd: '2026-05-19', people: 2 },
  { roomId: 'glycine',    name: 'Mamie Solange',    originalStart: '2026-05-23', originalEnd: '2026-05-30', people: 1 },
  { roomId: 'coquelicot', name: 'Léa & Marion',     originalStart: '2026-05-17', originalEnd: '2026-05-20', people: 2 },
  { roomId: 'tilleul',    name: 'Pierre',            originalStart: '2026-05-22', originalEnd: '2026-05-24', people: 1 },
  { roomId: 'bergerie',   name: 'Famille Marchand',  originalStart: '2026-05-18', originalEnd: '2026-05-25', people: 3 },
  { roomId: 'pigeonnier', name: 'Hugo & Sarah',      originalStart: '2026-05-29', originalEnd: '2026-06-01', people: 2 },
  { roomId: 'verger',     name: 'Tata Béné',         originalStart: '2026-05-16', originalEnd: '2026-05-18', people: 1 },
  { roomId: 'verger',     name: 'Camille',           originalStart: '2026-05-25', originalEnd: '2026-05-27', people: 2 },
  { roomId: 'grange',     name: 'Cousins Lefort',    originalStart: '2026-05-20', originalEnd: '2026-05-24', people: 4 },
  { roomId: 'mansarde',   name: 'Théo',              originalStart: '2026-05-21', originalEnd: '2026-05-23', people: 1 },
  { roomId: 'etoile',     name: 'Inès & Paul',       originalStart: '2026-05-28', originalEnd: '2026-05-31', people: 2 },
  { roomId: 'refuge',     name: 'Grand-père',        originalStart: '2026-05-19', originalEnd: '2026-05-22', people: 1 },
  { roomId: 'cellier',    name: 'Mathis',            originalStart: '2026-05-26', originalEnd: '2026-05-29', people: 2 },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const container = buildContainer();

  // 1. HouseConfig singleton
  console.log('HouseConfig:');
  await createOrSkip(
    container,
    {
      pk: pk.house(),
      id: docId.house(),
      entityType: 'HouseConfig',
      ...HOUSE_CONFIG,
    },
    'HouseConfig',
  );

  // 2. Rooms
  console.log('\nRooms (12):');
  for (const room of ROOMS) {
    await createOrSkip(
      container,
      {
        pk: pk.room(room.roomId),
        id: docId.room(room.roomId),
        entityType: 'Room',
        ...room,
      },
      `Room ${room.roomId}`,
    );
  }

  // 3. Mock bookings (dev only)
  if (stage === 'dev') {
    console.log('\nMock bookings (13):');
    const today = todayIsoInAppTz();
    for (const def of MOCK_BOOKING_DEFS) {
      const bookingId = uuidv7();
      const start = shiftDate(def.originalStart, today);
      const end = shiftDate(def.originalEnd, today);
      const booking: Booking = {
        bookingId,
        roomId: def.roomId,
        userId: null,
        name: def.name,
        start,
        end,
        people: def.people,
        notes: '',
        reference: generateBookingReference(),
        createdAt: now,
        updatedAt: now,
        createdBy: 'seed',
      };
      await createOrSkip(
        container,
        {
          pk: pk.room(def.roomId),
          id: docId.booking(bookingId),
          entityType: 'Booking',
          ...booking,
        },
        `Booking ${def.name} (${start} → ${end})`,
      );
    }
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
