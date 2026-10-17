/** Les quatre caractéristiques testées aux dés (jet de d20 + valeur ≥ difficulté). */
export type Stat = 'combat' | 'tech' | 'mystic' | 'social';
export type ClassId = 'soldier' | 'mystic' | 'technomancer' | 'agent' | 'mechanic' | 'diplomat';
export type SpeciesId = 'human' | 'android' | 'vorn' | 'lumian';
export type PlayerColor = 'cyan' | 'magenta' | 'lime' | 'amber' | 'violet';
export type BotLevel = 'easy' | 'normal' | 'hard';
export type SystemKind = 'station' | 'planet' | 'derelict' | 'nebula';
/** Emplacements d'équipement : un seul objet par emplacement. */
export type Slot = 'weapon' | 'tool' | 'focus' | 'kit' | 'armor' | 'engine';
export type Tier = 1 | 2 | 3 | 4;

/** Texte affiché dans les deux langues de l'interface. */
export interface Text {
  fr: string;
  en: string;
}

export interface StarSystem {
  id: string;
  name: Text;
  kind: SystemKind;
  x: number;
  y: number;
  /** Position de l'étiquette par rapport au point. */
  label: 'n' | 's' | 'e' | 'w';
}

export interface Lane {
  a: string;
  b: string;
}

export interface Mission {
  id: number;
  name: Text;
  /** Caractéristiques possibles : le héros utilise la meilleure. */
  stats: Stat[];
  tier: Tier;
  /** Type de système où la mission apparaît. */
  where: Exclude<SystemKind, 'station'>;
}

export interface Item {
  id: number;
  name: Text;
  slot: Slot;
  /** Bonus à la caractéristique, points de vie (armure) ou sauts (moteur). */
  bonus: number;
  cost: number;
}

/** Gains (valeurs positives) ou pertes (négatives) d'une rencontre d'exploration. */
export interface Outcome {
  renown?: number;
  credits?: number;
  xp?: number;
  hp?: number;
  resolve?: number;
  /** Le héros reçoit gratuitement l'objet du dessus de la pioche d'équipement. */
  item?: boolean;
}

export interface Encounter {
  id: number;
  name: Text;
  stat: Stat;
  dc: number;
  success: Outcome;
  failure: Outcome;
}

export interface HeroConfig {
  name: string;
  isBot: boolean;
  color: PlayerColor;
  classId: ClassId;
  speciesId: SpeciesId;
  /** Niveau de l'ordinateur. */
  level?: BotLevel;
}

export interface Hero extends HeroConfig {
  pos: string;
  hp: number;
  /** Points de Résolution : +4 à un jet, rechargés en se reposant dans une station. */
  resolve: number;
  credits: number;
  /** Renommée : les points de victoire. */
  renown: number;
  xp: number;
  gear: Partial<Record<Slot, number>>;
  missions: number[];
  kos: number;
  /** Activités de monde déjà réussies (la première réussite rapporte 1 renommée). */
  found: string[];
}

/** Avant-poste d'un héros sur une planète (un seul propriétaire par planète). */
export interface Outpost {
  seat: number;
  level: 1 | 2 | 3;
}

export interface ActiveMission {
  missionId: number;
  system: string;
}

export type Action =
  | { type: 'move'; to: string }
  | { type: 'mission'; missionId: number; boost?: boolean }
  | { type: 'explore'; boost?: boolean }
  | { type: 'buy'; index: number }
  | { type: 'rest' }
  | { type: 'wait' }
  /** Activité propre au monde où se trouve le héros. */
  | { type: 'activity'; index: 0 | 1; boost?: boolean }
  /** Fonder un avant-poste sur la planète, ou améliorer le sien. */
  | { type: 'settle' };

export interface Roll {
  stat: Stat;
  d20: number;
  bonus: number;
  dc: number;
  success: boolean;
  crit: boolean;
  boost: boolean;
  /** Premier dé, quand le Technomancien relance un jet de Tech raté. */
  reroll?: number;
}

export interface GameEvent {
  seq: number;
  seat: number;
  kind:
    | 'move'
    | 'mission'
    | 'explore'
    | 'discovery'
    | 'buy'
    | 'rest'
    | 'wait'
    | 'ko'
    | 'levelUp'
    | 'loot'
    | 'round'
    | 'crisis'
    | 'boss'
    | 'end'
    | 'activity'
    | 'settle'
    | 'income'
    | 'hazard';
  roll?: Roll;
  missionId?: number;
  encounterId?: number;
  activityId?: string;
  itemId?: number;
  system?: string;
  /** Valeur associée : soins, dégâts, niveau, menace… */
  amount?: number;
}

export interface PlayerResult {
  seat: number;
  renown: number;
  creditPoints: number;
  missions: number;
  legendBonus: number;
  total: number;
  rank: number;
}

export interface GameState {
  version: 1;
  rng: number;
  phase: 'playing' | 'finished';
  players: Hero[];
  current: number;
  round: number;
  /** Sauts encore possibles pendant le tour du joueur courant. */
  movesLeft: number;
  /** Menace galactique : la partie s'arrête quand elle atteint son maximum. */
  threat: number;
  crises: number[];
  board: ActiveMission[];
  missionDeck: number[];
  market: (number | null)[];
  itemDeck: number[];
  encounterDeck: number[];
  encounterDiscard: number[];
  explored: string[];
  /** Avant-postes, par planète. */
  outposts: Record<string, Outpost>;
  events: GameEvent[];
  eventSeq: number;
  results: PlayerResult[] | null;
}
