# Le Clos Bon Accueil — Réservation Epeaux

Application web de **gestion des chambres** pour une maison familiale à beaucoup de chambres.
Permet à la famille et aux amis de consulter les disponibilités, réserver une chambre,
et donne au propriétaire un espace d'administration pour piloter la maison et les séjours.

> **Pas de paiement en ligne.** Le prix affiché est purement indicatif — le règlement
> (ou la gratuité) se fait de la main à la main, à l'arrivée.

---

## ✨ Fonctionnalités

### Côté invités (famille & amis)
- **Accueil** — salutation, mot du jour, mot d'accueil du propriétaire, qui est là cette semaine, chambres en vedette
- **Liste des chambres** — 12 chambres, filtres (libres ce soir, famille, par aile, par étage)
- **Fiche chambre détaillée** — photo (déposable), description, couchage, capacité, surface, étage, équipements, linge fourni, prochains séjours
- **Calendrier** — vue timeline horizontale style Airbnb, une semaine à la fois, navigation par semaine
- **Tunnel de réservation 4 étapes** — dates → chambre → invités → mot → récapitulatif → confirmation
- **Mes séjours** — réservations à venir (avec actions modifier / annuler) et historique
- **Indication de prix** — total calculé `nuits × personnes × tarif/personne/nuit`

### Côté administrateur
- **Tableau de bord** — KPIs, prochaines arrivées, actions rapides
- **Réservations** — toutes les résas (filtre À venir / Passées / Toutes, recherche par nom ou chambre, groupées par mois)
- **Édition réservation** — créer, modifier, supprimer, avec détection de conflit
- **Lieu** — deux sous-onglets :
  - **Chambres** — créer, modifier, supprimer une chambre (avec gestion en cascade des réservations)
  - **Maison** — identité de la maison, listes de configuration (parties, équipements proposés, linge proposé)
- **Photos déposables** — glisser-déposer une image sur n'importe quelle chambre (persistance locale)

### Responsive
- **Mobile** (`< 640px`) — plein écran, barre d'onglets en bas, safe-area iOS
- **Tablette** (`640–1024px`) — sidebar collapsée à 72 px (icônes seules)
- **Desktop** (`≥ 1024px`) — sidebar complète 240 px avec labels, contenu centré à 920 px

---

## 🎨 Direction artistique

Esthétique **éditoriale cottage** :

| Token | Valeur |
|---|---|
| Fond | `#F5EFE5` (crème chaud) |
| Encre | `#2A2218` (brun très foncé) |
| Accent | `#B05A3C` (terracotta) |
| Secondaire | `#7B8B6F` (sauge) |
| Serif | *Cormorant Garamond* |
| Sans | *DM Sans* |
| Mono | *JetBrains Mono* |

Les labels en capitales espacées, les filets fins, les italiques pour la voix, le papier crème pour les cartes.

---

## 🏗️ Architecture

Application **React + Babel standalone** (sans build), un seul point d'entrée HTML.

```
index.html              ← Point d'entrée, monte <App /> dans #root
styles.css              ← Tokens (couleurs, type, espacements) + responsive
data.jsx                ← Données (chambres, réservations, config maison) + CRUD store
ui.jsx                  ← Primitives partagées (TopBar, TabBar, SidebarNav,
                          RoomCard, ConfirmDialog, Toast, photos…)
screens-main.jsx        ← Accueil, Liste chambres, Fiche chambre
screens-flow.jsx        ← Calendrier, Tunnel de réservation, Mes séjours
screens-admin.jsx       ← Dashboard, Réservations admin, Lieu (Chambres/Maison)
app.jsx                 ← Routeur stack + composition des layouts
tweaks-panel.jsx        ← Framework Tweaks (panneau de personnalisation)
image-slot.js           ← Web component pour les photos déposables
```

### Routage
Routeur stack maison (push/pop/reset). Pas de React Router — simple, suffisant.

### Données
Les listes `ROOMS`, `BOOKINGS`, `HOUSE_CONFIG` sont en mémoire, mutées en place. Un système
de pub/sub (`storeBump` / `useStoreSubscribe`) déclenche le re-render des composants
abonnés. **À brancher sur un vrai backend** pour la mise en production.

---

## 🚀 Lancement

Aucune dépendance, aucun build. Ouvre simplement `index.html` dans un navigateur,
ou sers le dossier avec un serveur statique :

```bash
# Avec Python
python3 -m http.server 8080

# Avec Node
npx serve .
```

Puis va sur http://localhost:8080.

---

## 🛠️ Personnalisation (Tweaks)

Un panneau **Tweaks** flottant permet d'ajuster en direct :
- Mode (Utilisateur / Administrateur)
- Couleur d'accent
- Couleur de fond (incl. mode nuit)
- Police d'affichage
- Prénom de l'utilisateur connecté

---

## 📝 Limites connues / TODO

- Pas de backend — toutes les données sont en mémoire et reset au reload
- Pas d'authentification réelle (le mode admin est un simple toggle)
- Photos chambres persistées via web component local, pas d'upload distant
- Pas de notifications email / SMS (mentionnées dans l'UI mais non implémentées)
- Le mot d'accueil et l'identité de la maison sont mutables côté admin mais ne se
  reflètent pas encore partout dans l'UI

---

## 📦 Stack

- React 18.3.1 (UMD via CDN, pinné)
- Babel Standalone 7.29.0 (transformation JSX dans le navigateur)
- DM Sans, Cormorant Garamond, JetBrains Mono (Google Fonts)
- Composant natif `<image-slot>` pour les photos

Aucune dépendance NPM. Aucun outil de build. Un dossier, un `index.html`, c'est tout.
