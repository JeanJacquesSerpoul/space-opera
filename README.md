# 🚀 Space Opera — Les Éclaireurs du Vide

Jeu de plateau d'aventure spatiale inspiré des jeux de rôle de science-fiction sur table (dans l'esprit de
*Starfinder*) : chaque joueur incarne un héros (classe + espèce), parcourt un secteur de 26 systèmes, tente des
missions en lançant le **d20** contre un degré de difficulté et gagne renommée, crédits, équipement et niveaux —
pendant que la menace du **Fléau** grandit. Univers, noms et règles sont originaux.

L'interface existe en **français et en anglais** (langue du navigateur par défaut, modifiable dans les réglages).

Même socle technique que *Rois du Rail* :

- **React 19 + TypeScript + Vite**, animations avec **Motion**, zoom/pan tactile avec **react-zoom-pan-pinch**
- **Serveur Express** qui fait autorité sur les règles (moteur pur et déterministe partagé dans `shared/`)
- **SQLite** (module natif `node:sqlite`) : parties, coups joués, Panthéon des héros
- Pensé **mobile d'abord**, installable en **PWA** (service worker généré au build), jeu à plusieurs sur un même
  appareil et adversaires IA (facile, normal, difficile)
- Version **hors ligne** (`VITE_OFFLINE=1`) où le moteur et l'IA tournent dans le navigateur (`localStorage`)
- **Parties en ligne par salons** : l'hôte partage un lien (`#/salon/CODE`), chaque invité choisit un héros libre
  et joue depuis son appareil (une place par appareil, jeton secret par place). Avec le serveur : coups par l'API
  `/api/rooms/:code`, mises à jour en direct par WebSocket (`/ws`), ordinateurs joués par le serveur. Hors ligne :
  pair-à-pair WebRTC (PeerJS), la partie tourne chez l'hôte qui valide les coups
- **Vitest**, **Playwright** (mobile et ordinateur), **Biome**, CI et déploiement GitHub Pages

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
| `npm test` | tests du moteur (dont des parties complètes entre IA) et de l'API |
| `npm run simulate -- 300 4` | équilibrage : victoires par classe sur des parties simulées (`LEVEL=hard` pour un seul niveau) |
| `npm run typecheck` | vérification TypeScript |
| `npm run build:pages` | build statique hors ligne pour GitHub Pages |
| `npm run test:e2e` | tests de bout en bout Playwright |
| `npm run lint` / `npm run format` | Biome |

## Structure

```
shared/   moteur de jeu pur (règles, IA, données, secteur, i18n) – utilisé par le serveur et le client
server/   API Express + base SQLite (data/space-opera.db, chemin modifiable via DB_PATH)
src/      interface React (carte stellaire SVG, fiche de héros, dé animé)
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
- **Fléau** : +1 menace par tour de table ; crises à 5, 10, 15 (le Vaisseau-Ruche, DD 22, apparaît à 10).
- **Fin** : un héros à 40 de renommée ou menace à 18. Score = renommée + crédits ÷ 5 + 5 points de Légende
  (le plus de missions).
