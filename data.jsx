// Données du Clos Bon Accueil — 12 chambres et réservations
// Tarifs : prix par personne par nuit
//
// Note : ROOMS, BOOKINGS, MY_BOOKINGS sont déclarés avec `let` pour que
// l'interface admin puisse les muter. Les composants doivent appeler
// `storeBump()` pour déclencher un re-render après une mutation.

let ROOMS = [
  {
    id: 'glycine', name: 'La Glycine', wing: 'Aile gauche', floor: 1, area: 22, capacity: 2,
    beds: '1 lit double', closet: 'Armoire ancienne + commode',
    equipment: ['Bureau', 'Cheminée déco', 'Vue jardin'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette', 'Peignoirs'],
    pricePerPerson: 28, photoTint: 'rosé',
    blurb: "La plus grande chambre du premier, baignée de soleil l'après-midi. Lit douillet sous les poutres.",
  },
  {
    id: 'coquelicot', name: 'Le Coquelicot', wing: 'Aile droite', floor: 1, area: 16, capacity: 2,
    beds: '2 lits simples', closet: 'Penderie + étagères',
    equipment: ['Bureau', 'Vue sur la cour'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette'],
    pricePerPerson: 24, photoTint: 'rouge',
    blurb: "Parfaite pour deux amis ou des cousins. Lits jumeaux en fer forgé, papier peint à fleurs.",
  },
  {
    id: 'tilleul', name: 'Le Tilleul', wing: 'Aile droite', floor: 1, area: 14, capacity: 1,
    beds: '1 lit simple', closet: 'Petite armoire',
    equipment: ['Bureau', 'Liseuse', 'Vue tilleul'],
    linen: ['Draps fournis', 'Couette + oreiller', 'Serviette de bain', 'Serviette de toilette'],
    pricePerPerson: 22, photoTint: 'vert',
    blurb: "Petite chambre côté tilleul, idéale pour lire ou écrire le matin.",
  },
  {
    id: 'bergerie', name: 'La Bergerie', wing: 'Dépendance', floor: 0, area: 24, capacity: 3,
    beds: '1 double + 1 simple', closet: 'Grande armoire normande',
    equipment: ['Salon attenant', 'Cheminée', 'Accès direct jardin'],
    linen: ['Draps fournis', 'Couettes + 3 oreillers', 'Serviettes de bain', 'Serviettes de toilette', 'Peignoirs', 'Tapis de bain'],
    pricePerPerson: 30, photoTint: 'ocre',
    blurb: "Ancienne dépendance refaite. Idéale pour une petite famille, plain-pied, sortie sur la prairie.",
  },
  {
    id: 'pigeonnier', name: 'Le Pigeonnier', wing: 'Dépendance', floor: 1, area: 18, capacity: 2,
    beds: '1 lit double', closet: 'Coffre + portants',
    equipment: ['Vue 360°', 'Velux', 'Bureau'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette', 'Peignoirs'],
    pricePerPerson: 32, photoTint: 'bleu',
    blurb: "Tout en haut, dans la tour. Plafond sous charpente, lumière incroyable au lever du jour.",
  },
  {
    id: 'verger', name: 'Le Verger', wing: 'Aile gauche', floor: 1, area: 17, capacity: 2,
    beds: '1 lit double', closet: 'Penderie',
    equipment: ['Vue pommiers', 'Bureau'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette'],
    pricePerPerson: 26, photoTint: 'pêche',
    blurb: "Donne sur le verger. Au printemps, on s'endort sous les fleurs de pommier.",
  },
  {
    id: 'lavoir', name: 'Le Lavoir', wing: 'Bâtiment principal', floor: 0, area: 12, capacity: 1,
    beds: '1 lit simple', closet: 'Étagères',
    equipment: ['Vue ruisseau'],
    linen: ['Draps fournis', 'Couette + oreiller', 'Serviette de bain'],
    pricePerPerson: 20, photoTint: 'gris',
    blurb: "Toute petite, toute fraîche. Pour les courts séjours en solo.",
  },
  {
    id: 'grange', name: 'La Grange', wing: 'Dépendance', floor: 1, area: 28, capacity: 4,
    beds: '2 lits doubles', closet: 'Deux armoires',
    equipment: ['Salon de lecture', 'Bureau', 'TV', 'Velux'],
    linen: ['Draps fournis', 'Couettes + 4 oreillers', 'Serviettes de bain', 'Serviettes de toilette', 'Tapis de bain'],
    pricePerPerson: 26, photoTint: 'bois',
    blurb: "Grande pièce mansardée, deux lits côte à côte. Parfait pour une famille de quatre.",
  },
  {
    id: 'cellier', name: 'Le Cellier', wing: 'Bâtiment principal', floor: 0, area: 15, capacity: 2,
    beds: '1 lit double', closet: 'Penderie discrète',
    equipment: ['Très calme', 'Frais en été'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain'],
    pricePerPerson: 22, photoTint: 'pierre',
    blurb: "Voûte en pierre, fraîche l'été, silence complet la nuit.",
  },
  {
    id: 'mansarde', name: 'La Mansarde', wing: 'Aile gauche', floor: 1, area: 19, capacity: 2,
    beds: '1 lit double', closet: 'Sous-pente aménagé',
    equipment: ['Velux', 'Bureau', 'Vue toits'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette'],
    pricePerPerson: 25, photoTint: 'lin',
    blurb: "Sous les combles, atmosphère atelier. Bureau face à la fenêtre de toit.",
  },
  {
    id: 'etoile', name: "L'Étoile", wing: 'Aile droite', floor: 1, area: 20, capacity: 2,
    beds: '1 lit double', closet: 'Armoire + commode',
    equipment: ['Velux orientable', 'Vue ciel', 'Bureau'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette', 'Peignoirs'],
    pricePerPerson: 28, photoTint: 'nuit',
    blurb: "On l'appelle l'Étoile parce qu'on dort sous le ciel ouvert. Velux qui s'ouvre en grand.",
  },
  {
    id: 'refuge', name: 'Le Refuge', wing: 'Bâtiment principal', floor: 0, area: 13, capacity: 2,
    beds: '1 lit double', closet: 'Niches murales',
    equipment: ['Coin lecture', 'Accès terrasse'],
    linen: ['Draps fournis', 'Couette + 2 oreillers', 'Serviettes de bain', 'Serviette de toilette'],
    pricePerPerson: 24, photoTint: 'mousse',
    blurb: "Petite chambre cosy au rez, sa porte donne sur la terrasse couverte.",
  },
];

const TODAY = new Date(2026, 4, 15);

let BOOKINGS = [
  { id: 'b-01', roomId: 'glycine',    name: 'Claire & Antoine', start: '2026-05-16', end: '2026-05-19', people: 2 },
  { id: 'b-02', roomId: 'glycine',    name: 'Mamie Solange',   start: '2026-05-23', end: '2026-05-30', people: 1 },
  { id: 'b-03', roomId: 'coquelicot', name: 'Léa & Marion',    start: '2026-05-17', end: '2026-05-20', people: 2 },
  { id: 'b-04', roomId: 'tilleul',    name: 'Pierre',          start: '2026-05-22', end: '2026-05-24', people: 1 },
  { id: 'b-05', roomId: 'bergerie',   name: 'Famille Marchand',start: '2026-05-18', end: '2026-05-25', people: 3 },
  { id: 'b-06', roomId: 'pigeonnier', name: 'Hugo & Sarah',    start: '2026-05-29', end: '2026-06-01', people: 2 },
  { id: 'b-07', roomId: 'verger',     name: 'Tata Béné',       start: '2026-05-16', end: '2026-05-18', people: 1 },
  { id: 'b-08', roomId: 'verger',     name: 'Camille',         start: '2026-05-25', end: '2026-05-27', people: 2 },
  { id: 'b-09', roomId: 'grange',     name: 'Cousins Lefort',  start: '2026-05-20', end: '2026-05-24', people: 4 },
  { id: 'b-10', roomId: 'mansarde',   name: 'Théo',            start: '2026-05-21', end: '2026-05-23', people: 1 },
  { id: 'b-11', roomId: 'etoile',     name: 'Inès & Paul',     start: '2026-05-28', end: '2026-05-31', people: 2 },
  { id: 'b-12', roomId: 'refuge',     name: 'Grand-père',      start: '2026-05-19', end: '2026-05-22', people: 1 },
  { id: 'b-13', roomId: 'cellier',    name: 'Mathis',          start: '2026-05-26', end: '2026-05-29', people: 2 },
];

let MY_BOOKINGS = [
  { id: 'my-1', roomId: 'glycine', name: 'Claire & Antoine', start: '2026-05-16', end: '2026-05-19', people: 2, status: 'à venir', notes: 'On arrivera samedi vers 17h, après les courses au village.' },
  { id: 'my-2', roomId: 'verger',  name: 'Claire',           start: '2026-06-12', end: '2026-06-14', people: 1, status: 'à venir', notes: '' },
  { id: 'my-3', roomId: 'tilleul', name: 'Claire',           start: '2026-04-03', end: '2026-04-05', people: 1, status: 'passé',  notes: '' },
];

// ── House-level configuration ───────────────────────────────────────────
// Wings, equipment suggestions, linen suggestions… are managed in the
// admin "Maison" tab and drive the suggestion chips in the room editor.
let HOUSE_CONFIG = {
  name: 'Le Clos Bon Accueil',
  region: 'Normandie',
  address: '5 chemin du Verger, 14XXX',
  welcomeNote: "Les volets bleus ont été repeints. Et les hortensias sont en fleur. À très vite — Papa & Maman.",
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
};

// Simple pub-sub bump so admin mutations re-render readers
const _bumpSubs = new Set();
function storeBump() { _bumpSubs.forEach(fn => fn()); }
function useStoreSubscribe() {
  const [, setV] = React.useState(0);
  React.useEffect(() => {
    const fn = () => setV(v => v + 1);
    _bumpSubs.add(fn);
    return () => _bumpSubs.delete(fn);
  }, []);
}

// CRUD helpers — mutate in place so all references see the change
function getRoom(id) { return ROOMS.find(r => r.id === id); }
function getBooking(id) { return BOOKINGS.find(b => b.id === id); }

function upsertBooking(b) {
  const idx = BOOKINGS.findIndex(x => x.id === b.id);
  if (idx >= 0) BOOKINGS[idx] = { ...b };
  else BOOKINGS.push({ ...b });
  storeBump();
}
function deleteBooking(id) {
  const idx = BOOKINGS.findIndex(b => b.id === id);
  if (idx >= 0) BOOKINGS.splice(idx, 1);
  storeBump();
}
function upsertRoom(r) {
  const idx = ROOMS.findIndex(x => x.id === r.id);
  if (idx >= 0) ROOMS[idx] = { ...r };
  else ROOMS.push({ ...r });
  storeBump();
}
function deleteRoom(id) {
  const idx = ROOMS.findIndex(r => r.id === id);
  if (idx >= 0) ROOMS.splice(idx, 1);
  // Cascade: bookings on that room
  for (let i = BOOKINGS.length - 1; i >= 0; i--) {
    if (BOOKINGS[i].roomId === id) BOOKINGS.splice(i, 1);
  }
  storeBump();
}

// Mutate house-level config — apply individual keys, lists are mutated in place
function setHouseField(key, value) {
  HOUSE_CONFIG[key] = value;
  storeBump();
}
function addToHouseList(listKey, value) {
  value = (value || '').trim();
  if (!value) return;
  const list = HOUSE_CONFIG[listKey];
  if (!list || list.includes(value)) return;
  list.push(value);
  storeBump();
}
function removeFromHouseList(listKey, value) {
  const list = HOUSE_CONFIG[listKey];
  if (!list) return;
  const idx = list.indexOf(value);
  if (idx >= 0) list.splice(idx, 1);
  storeBump();
}

Object.assign(window, {
  ROOMS, BOOKINGS, MY_BOOKINGS, TODAY, HOUSE_CONFIG,
  storeBump, useStoreSubscribe,
  getRoom, getBooking,
  upsertBooking, deleteBooking, upsertRoom, deleteRoom,
  setHouseField, addToHouseList, removeFromHouseList,
});
