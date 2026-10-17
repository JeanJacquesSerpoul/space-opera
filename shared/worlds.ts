import type { Outcome, Stat, Text } from './types';

/**
 * Les mondes du secteur : chaque système (hors stations) a son biome, sa description,
 * parfois un danger à l'arrivée, et deux activités qui lui sont propres.
 * Les planètes accueillent des avant-postes : leur propriétaire en tire des revenus
 * et le bonus du monde.
 */

export type Biome =
  | 'ice'
  | 'dark'
  | 'jungle'
  | 'volcanic'
  | 'garden'
  | 'ocean'
  | 'desert'
  | 'fungal'
  | 'mining'
  | 'industrial'
  | 'city'
  | 'sanctuary'
  | 'gas'
  | 'archipelago'
  | 'war'
  | 'wreck'
  | 'nebula';

/** Bonus d'un avant-poste pour son propriétaire. */
export type Perk =
  /** Se reposer ici soigne et recharge comme en station. */
  | 'heal'
  /** Le marché du secteur est accessible ici. */
  | 'market'
  /** +1 crédit à chaque tour de table. */
  | 'credits'
  /** +1 XP à chaque tour de table. */
  | 'xp'
  /** +1 Résolution à chaque tour de table. */
  | 'recharge';

export interface Activity {
  /** Identifiant unique : `<monde>.<0|1>`. */
  id: string;
  name: Text;
  stat: Stat;
  dc: number;
  success: Outcome;
  failure: Outcome;
}

export interface World {
  biome: Biome;
  desc: Text;
  /** Blessure à l'arrivée, évitée par une armure. */
  hazard?: number;
  /** Planète habitable : bonus de l'avant-poste (absent pour les épaves et nébuleuses). */
  perk?: Perk;
  activities: [Activity, Activity];
}

type Act = [fr: string, en: string, stat: Stat, dc: number, success: Outcome, failure: Outcome];

function world(
  id: string,
  biome: Biome,
  desc: [string, string],
  acts: [Act, Act],
  extra: { hazard?: number; perk?: Perk } = {},
): [string, World] {
  const activities = acts.map(([fr, en, stat, dc, success, failure], i) => ({
    id: `${id}.${i}`,
    name: { fr, en },
    stat,
    dc,
    success,
    failure,
  })) as [Activity, Activity];
  return [id, { biome, desc: { fr: desc[0], en: desc[1] }, activities, ...extra }];
}

export const WORLDS: Record<string, World> = Object.fromEntries([
  // ——— planètes habitables ———
  world(
    'glacia',
    'ice',
    [
      'Un monde de glace bleue où le vent hurle sous des aurores éternelles.',
      'A world of blue ice where wind howls under endless auroras.',
    ],
    [
      ['Forage des glaces profondes', 'Deep-ice drilling', 'tech', 12, { credits: 4, xp: 1 }, { hp: -2 }],
      ['Traque du mammouth des neiges', 'Snow-mammoth hunt', 'combat', 13, { renown: 2, hp: 2 }, { hp: -3 }],
    ],
    { hazard: 1, perk: 'xp' },
  ),
  world(
    'kepler',
    'dark',
    [
      'Une planète sans soleil, couverte des archives d’une civilisation éteinte.',
      'A sunless planet covered in the archives of a dead civilisation.',
    ],
    [
      ['Déchiffrer les archives noires', 'Decipher the black archives', 'tech', 14, { xp: 2, renown: 1 }, {}],
      ['Écouter l’étoile morte', 'Listen to the dead star', 'mystic', 13, { resolve: 1, xp: 1 }, { hp: -2 }],
    ],
    { perk: 'xp' },
  ),
  world(
    'hydra',
    'jungle',
    [
      'Une jungle à trois étages où chaque fleur peut soigner… ou dévorer.',
      'A three-layered jungle where every flower may heal… or devour.',
    ],
    [
      ['Cueillette de plantes médicinales', 'Gather healing herbs', 'mystic', 11, { hp: 5 }, {}],
      ['Chasse au grand prédateur', 'Hunt the apex predator', 'combat', 14, { renown: 2, credits: 3 }, { hp: -4 }],
    ],
    { perk: 'heal' },
  ),
  world(
    'pyros',
    'volcanic',
    [
      'Rivières de lave et forges géantes : l’air brûle les poumons des imprudents.',
      'Lava rivers and giant forges: the air burns careless lungs.',
    ],
    [
      ['Forger dans la lave', 'Forge in the lava', 'tech', 14, { item: true }, { hp: -3 }],
      ['Récolter l’obsidienne', 'Harvest obsidian', 'combat', 12, { credits: 4 }, { hp: -3 }],
    ],
    { hazard: 2, perk: 'market' },
  ),
  world(
    'aurelia',
    'garden',
    [
      'Le jardin des grandes familles : intrigues, bals et serres suspendues.',
      'The garden of the great houses: intrigue, balls and hanging greenhouses.',
    ],
    [
      ['Bal de la cour', 'Court ball', 'social', 13, { renown: 2, credits: 2 }, { credits: -2 }],
      ['Jardins suspendus', 'Hanging gardens', 'mystic', 11, { resolve: 1, hp: 3 }, {}],
    ],
    { perk: 'heal' },
  ),
  world(
    'thalassa',
    'ocean',
    [
      'Un océan sans rivage, peuplé de cités flottantes et de léviathans.',
      'A shoreless ocean of floating cities and leviathans.',
    ],
    [
      ['Pêche aux perles', 'Pearl diving', 'social', 11, { credits: 4 }, {}],
      ['Plongée dans les abysses', 'Abyssal dive', 'combat', 14, { item: true, renown: 1 }, { hp: -4 }],
    ],
    { perk: 'credits' },
  ),
  world(
    'dune',
    'desert',
    [
      'Des dunes chantantes, des caravanes et des vers longs comme des croiseurs.',
      'Singing dunes, caravans and worms as long as cruisers.',
    ],
    [
      ['Caravane des sables', 'Sand caravan', 'social', 12, { credits: 5 }, { credits: -2 }],
      ['Affronter le ver des sables', 'Face the sandworm', 'combat', 15, { renown: 3, xp: 1 }, { hp: -5 }],
    ],
    { hazard: 1, perk: 'credits' },
  ),
  world(
    'orchis',
    'fungal',
    ['Une forêt de champignons géants reliés par une conscience unique.', 'A forest of giant fungi linked by a single mind.'],
    [
      ['Méditation des spores', 'Spore meditation', 'mystic', 12, { resolve: 2 }, { hp: -2 }],
      ['Négocier avec la ruche-mère', 'Parley with the mother-hive', 'social', 14, { renown: 2, xp: 1 }, { hp: -3 }],
    ],
    { perk: 'recharge' },
  ),
  world(
    'tycho',
    'mining',
    [
      'Une lune creusée de mines, où chaque contrat vaut son poids d’or.',
      'A moon riddled with mines, where every contract is worth its weight in gold.',
    ],
    [
      ['Contrat minier', 'Mining contract', 'tech', 11, { credits: 5 }, { hp: -2 }],
      ['Arbitrer la grève', 'Settle the strike', 'social', 13, { renown: 2, resolve: 1 }, { credits: -2 }],
    ],
    { perk: 'credits' },
  ),
  world(
    'ferrum',
    'industrial',
    [
      'Usines à perte de vue : ici, tout se répare, tout se vend, tout se bat.',
      'Factories as far as the eye can see: everything is fixed, sold and fought over.',
    ],
    [
      ['Atelier de réparation', 'Repair shop', 'tech', 12, { hp: 4, xp: 1 }, {}],
      ['Arène des machines', 'Machine arena', 'combat', 13, { credits: 4, renown: 1 }, { hp: -4 }],
    ],
    { perk: 'market' },
  ),
  world(
    'vespera',
    'city',
    [
      'Une ville-planète au crépuscule éternel, capitale des marchés gris.',
      'A city-world in endless twilight, capital of the grey markets.',
    ],
    [
      ['Marché nocturne', 'Night market', 'social', 12, { item: true }, { credits: -2 }],
      ['Filature dans les ruelles', 'Alley tailing', 'tech', 13, { credits: 3, xp: 2 }, { hp: -2 }],
    ],
    { perk: 'market' },
  ),
  world(
    'solace',
    'sanctuary',
    [
      'Un monde-sanctuaire où les réfugiés du Fléau trouvent la paix.',
      'A sanctuary world where refugees from the Blight find peace.',
    ],
    [
      ['Pèlerinage', 'Pilgrimage', 'mystic', 11, { resolve: 1, renown: 1 }, {}],
      ['Soigner les réfugiés', 'Tend the refugees', 'social', 12, { renown: 2 }, { hp: -1 }],
    ],
    { perk: 'heal' },
  ),
  world(
    'zenith',
    'gas',
    ['Une géante gazeuse et ses cités suspendues dans les nuages.', 'A gas giant and its cities hanging in the clouds.'],
    [
      ['Course dans les nuages', 'Cloud race', 'tech', 14, { renown: 2, credits: 3 }, { hp: -4 }],
      ['Pirates des nuées', 'Cloud pirates', 'combat', 13, { credits: 4, xp: 1 }, { hp: -4 }],
    ],
    { hazard: 1, perk: 'xp' },
  ),
  world(
    'ulmo',
    'archipelago',
    [
      'Mille îles reliées par les marées, où chante le peuple de l’écume.',
      'A thousand tide-linked islands where the foam-folk sing.',
    ],
    [
      ['Chant des marées', 'Song of the tides', 'mystic', 13, { xp: 2, resolve: 1 }, { hp: -2 }],
      ['Commerce des îles', 'Island trade', 'social', 11, { credits: 4 }, {}],
    ],
    { perk: 'recharge' },
  ),
  world(
    'marath',
    'war',
    ['Une planète déchirée par une guerre sans fin entre deux clans.', 'A planet torn by an endless war between two clans.'],
    [
      ['Entraîner les milices', 'Train the militias', 'combat', 12, { xp: 2 }, { hp: -2 }],
      ['Pourparlers de paix', 'Peace talks', 'social', 15, { renown: 3, credits: 2 }, { hp: -3 }],
    ],
    { hazard: 1, perk: 'xp' },
  ),

  // ——— épaves (inhabitables) ———
  world(
    'ark',
    'wreck',
    [
      'Un vaisseau-colonie à la dérive, ses dormeurs toujours en cryogénie.',
      'A drifting colony ship, its sleepers still in cryo.',
    ],
    [
      ['Réveiller les dormeurs', 'Wake the sleepers', 'mystic', 14, { renown: 2, xp: 1 }, { hp: -3 }],
      ['Récupérer les données de bord', 'Recover the ship logs', 'tech', 12, { xp: 2 }, {}],
    ],
  ),
  world(
    'wreck',
    'wreck',
    [
      'La carcasse de l’Infatigable, éventrée lors de la première crise.',
      'The hulk of the Tireless, gutted during the first crisis.',
    ],
    [
      ['Piller les soutes', 'Loot the holds', 'combat', 12, { item: true }, { hp: -3 }],
      ['Relancer le réacteur', 'Restart the reactor', 'tech', 13, { credits: 4 }, { hp: -3 }],
    ],
  ),
  world(
    'forge',
    'wreck',
    ['Une forge orbitale abandonnée, gardée par ses drones.', 'An abandoned orbital forge, guarded by its drones.'],
    [
      ['Rallumer la forge', 'Rekindle the forge', 'tech', 14, { item: true }, { hp: -3 }],
      ['Affronter les drones gardiens', 'Fight the guardian drones', 'combat', 13, { renown: 2, credits: 2 }, { hp: -4 }],
    ],
  ),
  world(
    'graveyard',
    'wreck',
    ['Des milliers d’épaves en orbite : un paradis pour ferrailleurs.', 'Thousands of wrecks in orbit: a scavenger’s paradise.'],
    [
      ['Ferrailler', 'Scavenge', 'tech', 11, { credits: 4 }, {}],
      ['Les fantômes du cimetière', 'Ghosts of the graveyard', 'mystic', 14, { renown: 2, resolve: 1 }, { hp: -3 }],
    ],
  ),

  // ——— nébuleuses (inhabitables) ———
  world(
    'shroud',
    'nebula',
    ['Un voile de gaz sombre où murmurent des voix venues du Vide.', 'A dark gas veil where voices from the Void whisper.'],
    [
      ['Écouter les murmures', 'Listen to the whispers', 'mystic', 13, { xp: 2 }, { hp: -2 }],
      ['Cartographier le Linceul', 'Chart the Shroud', 'tech', 14, { renown: 2 }, {}],
    ],
  ),
  world(
    'veil',
    'nebula',
    ['Une nébuleuse irisée dont la lumière apaise les esprits.', 'An iridescent nebula whose light soothes the mind.'],
    [
      ['Cueillir la lumière opale', 'Gather opal light', 'mystic', 12, { resolve: 1, hp: 3 }, {}],
      ['Contrebande opaline', 'Opal smuggling', 'social', 13, { credits: 5 }, { credits: -2 }],
    ],
  ),
  world(
    'mist',
    'nebula',
    ['Des brumes froides où rôdent les spectres de Kor.', 'Cold mists where the wraiths of Kor prowl.'],
    [
      ['Chasser le spectre de Kor', 'Hunt the wraith of Kor', 'combat', 14, { renown: 2, xp: 1 }, { hp: -4 }],
      ['Sonder les brumes', 'Probe the mists', 'tech', 12, { xp: 1, credits: 2 }, { hp: -2 }],
    ],
  ),
  world(
    'maw',
    'nebula',
    ['Le cœur du Fléau : un tourbillon qui avale la lumière.', 'The heart of the Blight: a vortex that swallows light.'],
    [
      ['Frôler la Gueule', 'Skim the Maw', 'tech', 16, { renown: 4 }, { hp: -6 }],
      ['Rite du Vide', 'Void rite', 'mystic', 15, { xp: 2, resolve: 1 }, { hp: -4 }],
    ],
    { hazard: 2 },
  ),
]);

export const ACTIVITY_BY_ID: Record<string, Activity> = Object.fromEntries(
  Object.values(WORLDS).flatMap((w) => w.activities.map((a) => [a.id, a])),
);

export const BIOME_ICON: Record<Biome, string> = {
  ice: '❄',
  dark: '🌑',
  jungle: '🌿',
  volcanic: '🌋',
  garden: '🌸',
  ocean: '🌊',
  desert: '🏜',
  fungal: '🍄',
  mining: '⛏',
  industrial: '🏭',
  city: '🌆',
  sanctuary: '🕊',
  gas: '🪐',
  archipelago: '🏝',
  war: '💥',
  wreck: '🛸',
  nebula: '☁',
};

/** Coût de fondation (niveau 1) puis d'amélioration (niveaux 2 et 3) d'un avant-poste. */
export const OUTPOST_COST: Record<1 | 2 | 3, number> = { 1: 6, 2: 6, 3: 8 };
/** Renommée gagnée à la fondation, puis à chaque amélioration. */
export const OUTPOST_RENOWN: Record<1 | 2 | 3, number> = { 1: 1, 2: 1, 3: 2 };
export const OUTPOST_MAX = 3;
