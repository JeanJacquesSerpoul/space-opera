import type { ClassId, Encounter, Item, Mission, Slot, SpeciesId, Stat, Text } from './types';

/**
 * Contenu du jeu : classes, espèces, missions, rencontres et équipement.
 * Univers original, dans l'esprit des jeux de rôle de science-fiction sur table.
 */

export const STATS: Stat[] = ['combat', 'tech', 'mystic', 'social'];

/** Emplacement d'équipement qui améliore chaque caractéristique. */
export const STAT_SLOT: Record<Stat, Slot> = { combat: 'weapon', tech: 'tool', mystic: 'focus', social: 'kit' };

export interface ClassDef {
  stats: Record<Stat, number>;
  hp: number;
  /** Symbole affiché sur le pion. */
  glyph: string;
}

export const CLASS_IDS: ClassId[] = ['soldier', 'mystic', 'technomancer', 'agent', 'mechanic', 'diplomat'];

// Pouvoirs (appliqués par le moteur) :
// Soldat – Blindage : chaque blessure est réduite de 1.
// Mystique – Guérison : se reposer soigne entièrement, même hors d'une station.
// Technomancien – Surcharge : relance une fois un jet de Tech raté.
// Agent – Infiltration : +1 saut par tour.
// Mécano – Atelier : l'équipement coûte 2 crédits de moins.
// Diplomate – Réseau : +3 crédits à chaque mission réussie.
export const CLASSES: Record<ClassId, ClassDef> = {
  soldier: { stats: { combat: 5, tech: 1, mystic: 0, social: 1 }, hp: 16, glyph: '⚔' },
  mystic: { stats: { combat: 1, tech: 1, mystic: 4, social: 2 }, hp: 12, glyph: '✶' },
  technomancer: { stats: { combat: 0, tech: 3, mystic: 2, social: 1 }, hp: 11, glyph: '⌬' },
  agent: { stats: { combat: 2, tech: 3, mystic: 1, social: 2 }, hp: 12, glyph: '◈' },
  mechanic: { stats: { combat: 1, tech: 3, mystic: 0, social: 1 }, hp: 14, glyph: '⚙' },
  diplomat: { stats: { combat: 0, tech: 1, mystic: 1, social: 4 }, hp: 11, glyph: '❖' },
};

export interface SpeciesDef {
  stats: Partial<Record<Stat, number>>;
  hp: number;
  credits: number;
  resolve: number;
}

export const SPECIES_IDS: SpeciesId[] = ['human', 'android', 'vorn', 'lumian'];

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  /** Humains : polyvalents et commerçants. */
  human: { stats: { social: 1 }, hp: 0, credits: 3, resolve: 0 },
  /** Androïdes : esprits logiques au châssis solide. */
  android: { stats: { tech: 1 }, hp: 1, credits: 0, resolve: 0 },
  /** Vorns : reptiliens guerriers à la peau d'écailles. */
  vorn: { stats: { combat: 1 }, hp: 2, credits: 0, resolve: 0 },
  /** Lumiens : êtres de lumière sensibles au Vide. */
  lumian: { stats: { mystic: 1 }, hp: 0, credits: 0, resolve: 1 },
};

const m = (id: number, fr: string, en: string, stats: Stat[], tier: Mission['tier'], where: Mission['where']): Mission => ({
  id,
  name: { fr, en },
  stats,
  tier,
  where,
});

export const MISSIONS: Mission[] = [
  m(1, 'Pirates sur la route commerciale', 'Pirates on the trade lane', ['combat'], 1, 'planet'),
  m(2, 'Réparer le relais de communication', 'Repair the comm relay', ['tech'], 1, 'planet'),
  m(3, 'Négocier un cessez-le-feu', 'Broker a ceasefire', ['social'], 2, 'planet'),
  m(4, 'Purifier le temple englouti', 'Cleanse the sunken temple', ['mystic'], 2, 'planet'),
  m(5, 'Traquer la bête des dunes', 'Hunt the dune beast', ['combat'], 2, 'planet'),
  m(6, "Pirater l'IA du gouverneur", "Hack the governor's AI", ['tech'], 2, 'planet'),
  m(7, 'Ambassade auprès des Ondins', 'Embassy to the tide-folk', ['social'], 1, 'planet'),
  m(8, 'Consulter l’oracle des sables', 'Consult the sand oracle', ['mystic'], 1, 'planet'),
  m(9, 'Sauvetage minier', 'Mining rescue', ['combat', 'tech'], 1, 'planet'),
  m(10, 'Révolte dans la colonie', 'Colony uprising', ['social', 'combat'], 2, 'planet'),
  m(11, 'Le procès du siècle', 'Trial of the century', ['social'], 3, 'planet'),
  m(12, 'Le cœur de la forge-monde', 'Heart of the forge-world', ['tech'], 3, 'planet'),
  m(13, 'Le dragon de cristal', 'The crystal dragon', ['combat'], 3, 'planet'),
  m(14, "Le rituel de l'éclipse", 'The eclipse ritual', ['mystic'], 3, 'planet'),
  m(15, 'Gala diplomatique', 'Diplomatic gala', ['social'], 1, 'planet'),
  m(16, 'Épidémie xénobiologique', 'Xenobiological outbreak', ['tech', 'mystic'], 2, 'planet'),
  m(17, 'Épave hantée', 'Haunted wreck', ['mystic'], 1, 'derelict'),
  m(18, 'Récupérer la boîte noire', 'Recover the black box', ['tech'], 1, 'derelict'),
  m(19, 'Nid de xéno-araignées', 'Xeno-spider nest', ['combat'], 2, 'derelict'),
  m(20, 'Le coffre-fort du croiseur', "The cruiser's vault", ['tech'], 3, 'derelict'),
  m(21, 'Équipage en stase', 'Crew in stasis', ['tech', 'mystic'], 2, 'derelict'),
  m(22, 'Le capitaine fantôme', 'The ghost captain', ['mystic', 'social'], 3, 'derelict'),
  m(23, 'Drones de défense', 'Defense drones', ['combat'], 1, 'derelict'),
  m(24, 'Cartographier la tempête', 'Chart the storm', ['tech'], 1, 'nebula'),
  m(25, 'Murmures du Vide', 'Whispers of the Void', ['mystic'], 2, 'nebula'),
  m(26, 'Embuscade dans la brume', 'Ambush in the mist', ['combat'], 2, 'nebula'),
  m(27, 'Contrebandiers de la nébuleuse', 'Nebula smugglers', ['social'], 2, 'nebula'),
  m(28, 'Le phare oublié', 'The forgotten beacon', ['tech', 'social'], 1, 'nebula'),
  m(29, "L'entité stellaire", 'The stellar entity', ['mystic'], 3, 'nebula'),
  m(30, 'La flotte rebelle', 'The rebel fleet', ['social', 'combat'], 3, 'nebula'),
];

/** Mission finale, révélée lors de la deuxième crise. */
export const BOSS: Mission = m(
  99,
  'Le Vaisseau-Ruche du Fléau',
  'The Blight Hive-Ship',
  ['combat', 'mystic', 'tech'],
  4,
  'nebula',
);

const e = (
  id: number,
  fr: string,
  en: string,
  stat: Stat,
  dc: number,
  success: Encounter['success'],
  failure: Encounter['failure'],
): Encounter => ({ id, name: { fr, en }, stat, dc, success, failure });

export const ENCOUNTERS: Encounter[] = [
  e(1, 'Signal de détresse', 'Distress signal', 'social', 12, { renown: 2, credits: 2 }, { hp: -2 }),
  e(2, 'Gisement de minerai rare', 'Rare ore deposit', 'tech', 11, { credits: 5 }, {}),
  e(3, 'Créature affamée', 'Hungry creature', 'combat', 13, { renown: 2, xp: 1 }, { hp: -4 }),
  e(4, 'Ruines anciennes', 'Ancient ruins', 'mystic', 13, { renown: 1, xp: 2 }, { hp: -2 }),
  e(5, 'Marchand itinérant', 'Wandering trader', 'social', 10, { item: true }, { credits: -2 }),
  e(6, "Champ d'astéroïdes", 'Asteroid field', 'tech', 13, { credits: 3, xp: 1 }, { hp: -4 }),
  e(7, 'Anomalie temporelle', 'Time anomaly', 'mystic', 14, { renown: 3 }, { hp: -3 }),
  e(8, 'Pillards', 'Raiders', 'combat', 14, { credits: 4, renown: 1 }, { hp: -5, credits: -2 }),
  e(9, 'Cache de contrebandiers', "Smugglers' cache", 'tech', 12, { item: true }, { hp: -3 }),
  e(10, 'Colons reconnaissants', 'Grateful settlers', 'social', 11, { renown: 1, resolve: 1 }, {}),
  e(11, 'Vision prophétique', 'Prophetic vision', 'mystic', 12, { xp: 2 }, { hp: -2 }),
  e(12, "Duel d'honneur", 'Duel of honour', 'combat', 12, { renown: 3 }, { hp: -3 }),
  e(13, 'Sonde perdue', 'Lost probe', 'tech', 10, { credits: 3, xp: 1 }, {}),
  e(14, 'Spores psychiques', 'Psychic spores', 'mystic', 13, { hp: 4, resolve: 1 }, { hp: -3 }),
  e(15, 'Enchères clandestines', 'Black-market auction', 'social', 14, { item: true, renown: 1 }, { credits: -3 }),
  e(16, 'Tempête solaire', 'Solar storm', 'tech', 15, { renown: 2, xp: 2 }, { hp: -5 }),
];

interface ItemTemplate {
  fr: string;
  en: string;
  slot: Slot;
  bonus: number;
  cost: number;
  copies: number;
}

const ITEM_TEMPLATES: ItemTemplate[] = [
  { fr: 'Pistolet laser', en: 'Laser pistol', slot: 'weapon', bonus: 1, cost: 3, copies: 2 },
  { fr: 'Fusil à plasma', en: 'Plasma rifle', slot: 'weapon', bonus: 2, cost: 6, copies: 2 },
  { fr: 'Lame à phase', en: 'Phase blade', slot: 'weapon', bonus: 3, cost: 10, copies: 1 },
  { fr: 'Datapad', en: 'Datapad', slot: 'tool', bonus: 1, cost: 3, copies: 2 },
  { fr: 'Kit de piratage', en: 'Hacking kit', slot: 'tool', bonus: 2, cost: 6, copies: 2 },
  { fr: 'Cyberdeck quantique', en: 'Quantum cyberdeck', slot: 'tool', bonus: 3, cost: 10, copies: 1 },
  { fr: 'Cristal focal', en: 'Focus crystal', slot: 'focus', bonus: 1, cost: 3, copies: 2 },
  { fr: 'Amulette stellaire', en: 'Star amulet', slot: 'focus', bonus: 2, cost: 6, copies: 2 },
  { fr: 'Reliquaire du Vide', en: 'Void reliquary', slot: 'focus', bonus: 3, cost: 10, copies: 1 },
  { fr: 'Traducteur universel', en: 'Universal translator', slot: 'kit', bonus: 1, cost: 3, copies: 2 },
  { fr: "Tenue d'apparat", en: 'Formal attire', slot: 'kit', bonus: 2, cost: 6, copies: 2 },
  { fr: 'Sceau du Conseil', en: 'Council seal', slot: 'kit', bonus: 3, cost: 10, copies: 1 },
  { fr: 'Combinaison renforcée', en: 'Reinforced suit', slot: 'armor', bonus: 4, cost: 4, copies: 2 },
  { fr: 'Armure énergétique', en: 'Powered armor', slot: 'armor', bonus: 8, cost: 9, copies: 1 },
  { fr: 'Propulseur ionique', en: 'Ion thruster', slot: 'engine', bonus: 1, cost: 6, copies: 2 },
];

export const ITEMS: Item[] = ITEM_TEMPLATES.flatMap((t) => Array.from({ length: t.copies }, () => t)).map((t, i) => ({
  id: i + 1,
  name: { fr: t.fr, en: t.en },
  slot: t.slot,
  bonus: t.bonus,
  cost: t.cost,
}));

export const MISSION_BY_ID: Record<number, Mission> = Object.fromEntries([...MISSIONS, BOSS].map((x) => [x.id, x]));
export const ENCOUNTER_BY_ID: Record<number, Encounter> = Object.fromEntries(ENCOUNTERS.map((x) => [x.id, x]));
export const ITEM_BY_ID: Record<number, Item> = Object.fromEntries(ITEMS.map((x) => [x.id, x]));

export const textOf = (t: Text, lang: 'fr' | 'en') => t[lang];
