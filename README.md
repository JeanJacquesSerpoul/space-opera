# 🚀 Space Opera — Les Éclaireurs du Vide

Jeu de plateau d'aventure spatiale inspiré des jeux de rôle de science-fiction sur table (dans l'esprit de
*Starfinder*) : chaque joueur incarne un héros (classe + espèce), parcourt un secteur de 26 systèmes, tente des
missions en lançant le **d20** contre un degré de difficulté et gagne renommée, crédits, équipement et niveaux —
pendant que la menace du **Fléau** grandit. Univers, noms et règles sont originaux.

L'interface existe en **français et en anglais** (langue du navigateur par défaut, modifiable dans les réglages).

**Démo hors ligne** (sans serveur, parties gardées dans le navigateur) : https://jeanjacquesserpoul.github.io/space-opera/

Même socle technique que *Rois du Rail* :

- **React 19 + TypeScript + Vite**, animations avec **Motion**, zoom/pan tactile avec **react-zoom-pan-pinch**
- **Serveur Express** qui fait autorité sur les règles (moteur pur et déterministe partagé dans `shared/`)
- **SQLite** (module natif `node:sqlite`) : parties, coups joués, Panthéon des héros
- Pensé **mobile d'abord**, installable en **PWA** (service worker généré au build), jeu à plusieurs sur un même
  appareil et adversaires IA (facile, normal, difficile)
- Version **hors ligne** (`VITE_OFFLINE=1`) où le moteur et l'IA tournent dans le navigateur (`localStorage`)
- **Parties en ligne par salons** (voir plus bas), avec le serveur (WebSocket) ou en pair-à-pair (PeerJS)
- Effets sonores synthétisés (Web Audio, aucun fichier audio), coupables dans les réglages
- **Vitest**, **Playwright** (mobile, ordinateur et en ligne à deux joueurs), **Biome**, CI et déploiement GitHub Pages

## Découvrir le jeu

- **Présentation animée** en motion design (8 chapitres, sous-titres, voix off du navigateur), jouée à la première
  visite puis depuis l'accueil (« 🎬 Découvrir le jeu »)
- **Partie guidée** (« 🧭 Partie guidée ») : une vraie partie contre un ordinateur facile, commentée pas à pas
- **Règles** complètes dans « ? », chance de réussite affichée sur chaque mission
- **Panthéon des héros** et **fiche de joueur** (parties, victoires, classes jouées, courbe des derniers scores)
- Sur téléphone, carte plein écran et tiroir à onglets **Actions / Héros / Équipage / Journal**

## Jouer en ligne

- L'hôte choisit « En ligne » en constituant l'équipage : les héros « Invité » attendent ses amis. Il partage le lien
  (`#/salon/CODE`) ou le code à 6 caractères (champ « Rejoindre » de l'accueil).
- Chaque invité choisit un héros libre, son nom, et peut changer sa classe et son espèce tant que le héros n'a pas
  joué. Une place par appareil, prouvée par un jeton secret ; chaque onglet garde sa propre place.
- Pendant la partie : alerte « à vous de jouer » (son, vibration, titre d'onglet, notification système sur demande),
  réactions rapides (👍 👏 😂 😱 🎲 GG), présence de chacun, et l'hôte peut confier à l'ordinateur la place d'un
  invité qui ne vient pas ou qui est parti.
- « Mes salons » à l'accueil : revenir dans un salon déjà joué sur l'appareil, ou l'oublier.
- **Avec le serveur** : coups par l'API (`/api/rooms/:code`, `/join`, `/actions`, `/bot-seat`, `/react`), mises à jour
  en direct par WebSocket (`/ws`), ordinateurs joués par le serveur.
- **Hors ligne** (démo GitHub Pages) : pair-à-pair WebRTC (PeerJS) ; la partie tourne chez l'hôte, qui valide les coups
  et fait jouer les ordinateurs : il doit garder la page ouverte.

## Démarrer

```bash
npm install
npm run dev
```

Ouvrir http://localhost:5173. Production : `npm run build` puis `npm start` (port `PORT`, 3001 par défaut).

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | API (port 3001, `API_PORT`) + Vite (port 5173) |
| `npm test` | tests du moteur (dont des parties complètes entre IA), des statistiques, de l'API et des salons |
| `npm run simulate -- 300 4` | équilibrage : victoires par classe sur des parties simulées (`LEVEL=hard` pour un seul niveau) |
| `npm run typecheck` | vérification TypeScript |
| `npm run build:pages` | build statique hors ligne pour GitHub Pages |
| `npm run test:e2e` | tests de bout en bout Playwright (hors ligne mobile et ordinateur, en ligne à deux joueurs) |
| `npm run lint` / `npm run format` | Biome |

## Structure

```
shared/   moteur de jeu pur (règles, IA, données, secteur, mondes, salons, statistiques, i18n) – serveur et client
server/   API Express + WebSocket des salons + base SQLite (data/space-opera.db, chemin modifiable via DB_PATH)
src/      interface React (carte stellaire SVG, fiche de héros, dé animé, salons, présentation, partie guidée)
e2e/      scénarios Playwright
scripts/  simulation d'équilibrage
```

## Règles

- **Tour** : jusqu'à 2 sauts (Agent +1, propulseur +1) le long des couloirs ; entrer dans une nébuleuse arrête le
  déplacement. En station, achats libres. Puis une action : **mission**, **exploration**, **repos** ou fin du tour.
- **Jets** : d20 + caractéristique (classe + espèce + équipement + niveau − 1) ≥ DD. 20 naturel : réussite
  (+2 renommée), 1 naturel : échec. **Résolution** : +4 au jet, rechargée en se reposant en station.
- **Missions** : rang 1 (DD 12, +3), rang 2 (DD 15, +5), rang 3 (DD 18, +8, menace −1). Échec : blessure et menace +1.
- **Classes** : Soldat (blindage), Mystique (soins), Technomancien (relance en Tech), Agent (+1 saut),
  Mécano (équipement −2 crédits), Diplomate (+3 crédits par mission). **Espèces** : Humain, Androïde, Vorn, Lumien.
- **Mondes** : chaque système hors station a son biome, parfois un danger à l'arrivée (évité par une armure) et
  deux activités propres (jet de d20, +1 renommée à la première réussite). Sur une planète libre, fondez un
  **avant-poste** (6 cr, +1 renommée) puis améliorez-le jusqu'au niveau 3 (6 puis 8 cr, +1 puis +2 renommée), sans
  finir le tour : il rapporte son niveau en crédits par tour de table, abrite son propriétaire des crises et donne le
  bonus du monde (infirmerie, comptoir, gisement, académie ou retraite). Une planète n'a qu'un propriétaire.
- **Fléau** : +1 menace par tour de table ; crises à 5, 10, 15 (le Vaisseau-Ruche, DD 22, apparaît à 10).
- **Fin** : un héros à 40 de renommée ou menace à 18. Score = renommée + crédits ÷ 5 + 5 points de Légende
  (le plus de missions).
