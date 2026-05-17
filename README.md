# 🏡 Le Clos Bon Accueil — Réservation Épeaux

> Application web de gestion des séjours pour une maison familiale à chambres multiples.  
> Famille et amis consultent les disponibilités et réservent en autonomie.  
> Le propriétaire pilote l'ensemble depuis un espace d'administration dédié.

**Pas de paiement en ligne.** Le tarif affiché est purement indicatif — le règlement (ou la gratuité) se fait de la main à la main, à l'arrivée.

---

## ✨ Fonctionnalités

### Côté invités (famille & amis)

| Écran | Ce qu'il fait |
|---|---|
| **Accueil** | Salutation personnalisée, mot du jour, message d'accueil du propriétaire, qui est là cette semaine, chambres en vedette |
| **Liste des chambres** | 12 chambres avec filtres : libres ce soir, famille, par aile, par étage |
| **Fiche chambre** | Photo déposable, description, couchage, capacité, surface, équipements, linge fourni, prochains séjours |
| **Calendrier** | Vue timeline horizontale style Airbnb, une semaine à la fois, navigation avant/arrière |
| **Tunnel de réservation** | 4 étapes guidées : dates → chambre → invités & message → récapitulatif → confirmation |
| **Mes séjours** | Réservations à venir (modifier / annuler) et historique des séjours passés |

Le prix indicatif est calculé selon la formule : `nuits × personnes × tarif/personne/nuit`.

### Côté administrateur

| Écran | Ce qu'il fait |
|---|---|
| **Tableau de bord** | KPIs clés, prochaines arrivées, actions rapides |
| **Réservations** | Liste complète avec filtres (À venir / Passées / Toutes), recherche par nom ou chambre, groupées par mois |
| **Édition réservation** | Créer, modifier, supprimer — avec détection automatique de conflit de dates |
| **Lieu › Chambres** | CRUD complet des chambres avec suppression en cascade des réservations liées |
| **Lieu › Maison** | Identité de la maison, listes de configuration (parties, équipements proposés, linge proposé) |
| **Photos déposables** | Glisser-déposer une image sur n'importe quelle chambre ; persistance locale via sidecar |

### Responsive

| Contexte | Comportement |
|---|---|
| **Mobile** `< 640 px` | Plein écran, barre d'onglets en bas, safe-area iOS respectée |
| **Tablette** `640–1024 px` | Sidebar collapsée à 72 px (icônes seules) |
| **Desktop** `≥ 1024 px` | Sidebar complète 240 px avec labels, contenu centré à 920 px max |

---

## 🎨 Direction artistique

Esthétique **éditoriale cottage** — crème chaud, brun encre, terracotta et sauge. Labels en capitales espacées, filets fins, italiques pour la voix, papier crème pour les cartes.

| Token | Valeur | Usage |
|---|---|---|
| `--bg` | `#F5EFE5` | Fond général (crème chaud) |
| `--paper` | `#FBF7F0` | Cartes et surfaces |
| `--ink` | `#2A2218` | Texte principal (brun très foncé) |
| `--muted` | `#8A7D6B` | Texte secondaire |
| `--terracotta` | `#B05A3C` | Accent principal |
| `--sage` | `#7B8B6F` | Accent secondaire |
| `--serif` | *Cormorant Garamond* | Titres, voix éditoriale |
| `--sans` | *DM Sans* | Interface, corps de texte |
| `--mono` | *JetBrains Mono* | Labels techniques, étiquettes |

---

## 🏗️ Architecture

Application **React + Babel standalone** — zéro outil de build, un seul point d'entrée HTML.

```
index.html              ← Point d'entrée ; monte <App /> dans #root
styles.css              ← Tokens design (couleurs, typo, espacements) + responsive
data.jsx                ← Données statiques (ROOMS, BOOKINGS, HOUSE_CONFIG) + store pub/sub
ui.jsx                  ← Primitives partagées : TopBar, TabBar, SidebarNav,
                          RoomCard, ConfirmDialog, Toast, icônes…
screens-main.jsx        ← Accueil, Liste des chambres, Fiche chambre
screens-flow.jsx        ← Calendrier, Tunnel de réservation, Mes séjours
screens-admin.jsx       ← Dashboard, Réservations admin, Lieu (Chambres / Maison)
app.jsx                 ← Routeur stack + composition des layouts
tweaks-panel.jsx        ← Panneau de personnalisation en direct
image-slot.js           ← Web component natif pour les photos déposables
```

### Routage

Routeur stack maison (`push` / `pop` / `reset`). Pas de React Router — simple et suffisant pour cette navigation linéaire.

### Données & état

`ROOMS`, `BOOKINGS` et `HOUSE_CONFIG` vivent en mémoire et sont mutés en place. Un système pub/sub léger (`storeBump` / `useStoreSubscribe`) déclenche le re-render des composants abonnés.

> ⚠️ **À brancher sur un vrai backend** avant toute mise en production — les données ne persistent pas au rechargement.

### Web component `<image-slot>`

Composant natif (sans framework) qui gère le glisser-déposer, le recadrage interactif (pan + zoom en mode cover), la compression WebP via Canvas, et la persistance dans un sidecar JSON. Compatible avec les slots sans identifiant (session uniquement) et avec les slots identifiés (sidecar persistant).

---

## 🚀 Lancement

Aucune dépendance, aucun build.

```bash
# Option 1 — Python
python3 -m http.server 8080

# Option 2 — Node
npx serve .

# Option 3 — ouvrir directement
open index.html
```

Puis ouvrir [http://localhost:8080](http://localhost:8080).

---

## 🛠️ Personnalisation (panneau Tweaks)

Un panneau flottant (⚙️) permet d'ajuster l'application en direct, sans rechargement :

- **Mode** — Utilisateur / Administrateur
- **Couleur d'accent** — terracotta, sauge, ambre…
- **Couleur de fond** — crème, blanc, mode nuit
- **Police d'affichage** — DM Sans, Cormorant Garamond, système
- **Prénom de l'utilisateur** connecté (affiché sur l'écran d'accueil)

---

## 📦 Stack technique

| Brique | Version | Intégration |
|---|---|---|
| React | 18.3.1 | UMD via CDN (unpkg), pinné avec SRI |
| Babel Standalone | 7.29.0 | Transformation JSX dans le navigateur |
| DM Sans | — | Google Fonts |
| Cormorant Garamond | — | Google Fonts |
| JetBrains Mono | — | Google Fonts |
| `<image-slot>` | — | Web component natif, inclus localement |

**Aucune dépendance NPM. Aucun outil de build.** Un dossier, un `index.html`, c'est tout.

---

## 📝 Limites connues & TODO

- **Pas de backend** — toutes les données sont en mémoire et se réinitialisent au rechargement
- **Pas d'authentification réelle** — le mode admin est un simple toggle dans le panneau Tweaks
- **Photos** — persistées localement via le web component, pas d'upload vers un stockage distant
- **Notifications email / SMS** — mentionnées dans l'UI mais non implémentées
- **Identité de la maison** — modifiable côté admin mais le changement ne se propage pas encore à tous les composants de l'UI
- **Babel standalone en production** — préférable de pré-compiler le JSX pour améliorer les performances au chargement

---

## 🗂️ Structure des fichiers

```
le-clos-bon-accueil/
├── index.html            ← Unique point d'entrée
├── styles.css            ← Système de design complet
├── image-slot.js         ← Web component photos
├── data.jsx              ← Store de données
├── ui.jsx                ← Composants UI partagés
├── screens-main.jsx      ← Écrans invités principaux
├── screens-flow.jsx      ← Calendrier & réservation
├── screens-admin.jsx     ← Interface administrateur
├── app.jsx               ← Composition & routage
└── tweaks-panel.jsx      ← Panneau de personnalisation
```
