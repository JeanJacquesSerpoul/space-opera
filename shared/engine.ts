import {
  BOSS,
  CLASSES,
  ENCOUNTER_BY_ID,
  ENCOUNTERS,
  ITEM_BY_ID,
  ITEMS,
  MISSION_BY_ID,
  MISSIONS,
  SPECIES,
  STAT_SLOT,
} from './data';
import { HOME, NEIGHBORS, SYSTEM_BY_ID, SYSTEMS } from './sector';
import type { Action, GameEvent, GameState, Hero, HeroConfig, Outcome, PlayerResult, Roll, Stat, Tier } from './types';

// ---------------------------------------------------------------- constantes des règles

/** La partie s'arrête à la fin du tour de table où la menace atteint ce niveau… */
export const MAX_THREAT = 18;
/** … ou dès qu'un héros atteint cette renommée (en fin de tour de table). */
export const RENOWN_GOAL = 40;
/** Crises : raid du Fléau à ces niveaux de menace (la deuxième révèle le Vaisseau-Ruche). */
export const CRISES = [5, 10, 15];
export const CRISIS_DAMAGE: Record<number, number> = { 5: 2, 10: 3, 15: 4 };
export const BOARD_SIZE = 5;
export const MARKET_SIZE = 4;
export const DC: Record<Tier, number> = { 1: 12, 2: 15, 3: 18, 4: 22 };
/** Bonus d'un point de Résolution dépensé sur un jet. */
export const BOOST = 4;
export const LEVEL_XP = [0, 3, 7, 12, 18];
export const BASE_SPEED = 2;
export const BASE_RESOLVE = 3;
export const START_CREDITS = 6;
/** Soins d'un repos hors station. */
export const FIELD_REST = 4;
export const LEGEND_BONUS = 5;
/** Crédits supplémentaires du Diplomate par mission réussie. */
export const DIPLOMAT_CREDITS = 3;
/** Crédits échangés contre 1 point de renommée en fin de partie. */
export const CREDITS_PER_POINT = 5;

export const MISSION_REWARD: Record<Tier, { renown: number; credits: number; xp: number; damage: number }> = {
  1: { renown: 3, credits: 3, xp: 1, damage: 3 },
  2: { renown: 5, credits: 5, xp: 2, damage: 5 },
  3: { renown: 8, credits: 7, xp: 3, damage: 7 },
  4: { renown: 15, credits: 10, xp: 4, damage: 8 },
};

/** Codes d'erreur : le message affiché est traduit côté interface (clé `error.<code>`). */
export type ErrorCode =
  | 'players'
  | 'colors'
  | 'finished'
  | 'notYourTurn'
  | 'unreachable'
  | 'noMission'
  | 'noResolve'
  | 'cantExplore'
  | 'notStation'
  | 'noItem'
  | 'noCredits'
  | 'unknownAction'
  | 'botSeat'
  | 'notFound'
  // salons en ligne
  | 'online'
  | 'roomNotFound'
  | 'seatTaken'
  | 'badToken'
  | 'notHost'
  | 'seatPresent'
  | 'heroLocked';

export class GameError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: ErrorCode, msg: string): never {
  throw new GameError(code, msg);
}

// ---------------------------------------------------------------- aléatoire

function random(s: GameState): number {
  // mulberry32 : générateur déterministe, l'état est stocké dans la partie
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(s: GameState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const d20 = (s: GameState) => 1 + Math.floor(random(s) * 20);

// ---------------------------------------------------------------- fiche du héros

export function heroLevel(h: Pick<Hero, 'xp'>): number {
  return LEVEL_XP.filter((x) => h.xp >= x).length;
}

const gearBonus = (h: Hero, slot: keyof Hero['gear']) => (h.gear[slot] ? ITEM_BY_ID[h.gear[slot]].bonus : 0);

export function maxHp(h: Hero): number {
  return CLASSES[h.classId].hp + SPECIES[h.speciesId].hp + gearBonus(h, 'armor') + 2 * (heroLevel(h) - 1);
}

export function maxResolve(h: HeroConfig): number {
  return BASE_RESOLVE + SPECIES[h.speciesId].resolve;
}

export function heroSpeed(h: Hero): number {
  return BASE_SPEED + (h.classId === 'agent' ? 1 : 0) + gearBonus(h, 'engine');
}

/** Valeur d'une caractéristique : classe + espèce + équipement + niveau. */
export function statValue(h: Hero, stat: Stat): number {
  return (
    CLASSES[h.classId].stats[stat] + (SPECIES[h.speciesId].stats[stat] ?? 0) + gearBonus(h, STAT_SLOT[stat]) + heroLevel(h) - 1
  );
}

export function bestStat(h: Hero, stats: Stat[]): { stat: Stat; value: number } {
  return stats.map((stat) => ({ stat, value: statValue(h, stat) })).reduce((a, b) => (b.value > a.value ? b : a));
}

/** Probabilité de réussir un jet (1 naturel : échec, 20 naturel : réussite). */
export function rollChance(bonus: number, dc: number): number {
  return Math.min(19, Math.max(1, 21 - (dc - bonus))) / 20;
}

/** Chance de réussite d'un héros, en tenant compte des pouvoirs et de la Résolution. */
export function checkChance(h: Hero, stats: Stat[], dc: number, boost = false): number {
  const { stat, value } = bestStat(h, stats);
  const p = rollChance(value + (boost ? BOOST : 0), dc);
  return h.classId === 'technomancer' && stat === 'tech' ? 1 - (1 - p) ** 2 : p;
}

export function itemCost(h: Hero, itemId: number): number {
  const base = ITEM_BY_ID[itemId].cost;
  return h.classId === 'mechanic' ? Math.max(1, base - 2) : base;
}

// ---------------------------------------------------------------- plateau

/** Systèmes accessibles ce tour : distance en sauts (les nébuleuses arrêtent le déplacement). */
export function reachable(s: GameState, seat: number, budget = s.movesLeft): Map<string, number> {
  const start = s.players[seat].pos;
  const dist = new Map<string, number>([[start, 0]]);
  let frontier = [start];
  for (let d = 1; d <= budget; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      if (id !== start && SYSTEM_BY_ID[id].kind === 'nebula') continue;
      for (const n of NEIGHBORS[id]) {
        if (dist.has(n)) continue;
        dist.set(n, d);
        next.push(n);
      }
    }
    frontier = next;
  }
  return dist;
}

/** Nombre de sauts entre deux systèmes, sans limite (les nébuleuses ralentissent : +1). */
export function jumps(from: string, to: string): number {
  const dist = new Map<string, number>([[from, 0]]);
  const done = new Set<string>();
  while (true) {
    let cur: string | null = null;
    for (const [id, d] of dist) if (!done.has(id) && (cur === null || d < dist.get(cur)!)) cur = id;
    if (cur === null) return Number.POSITIVE_INFINITY;
    if (cur === to) return dist.get(cur)!;
    done.add(cur);
    for (const n of NEIGHBORS[cur]) {
      const d = dist.get(cur)! + 1 + (SYSTEM_BY_ID[n].kind === 'nebula' ? 1 : 0);
      if (!dist.has(n) || d < dist.get(n)!) dist.set(n, d);
    }
  }
}

export function missionsAt(s: GameState, system: string): number[] {
  return s.board.filter((b) => b.system === system).map((b) => b.missionId);
}

function placeMission(s: GameState, missionId: number) {
  const mission = MISSION_BY_ID[missionId];
  const taken = new Set(s.board.map((b) => b.system));
  let spots = SYSTEMS.filter((x) => x.kind === mission.where && !taken.has(x.id));
  if (spots.length === 0) spots = SYSTEMS.filter((x) => x.kind !== 'station' && !taken.has(x.id));
  if (spots.length === 0) return;
  const system = spots[Math.floor(random(s) * spots.length)].id;
  s.board.push({ missionId, system });
}

function refillBoard(s: GameState) {
  while (s.board.length < BOARD_SIZE && s.missionDeck.length > 0) placeMission(s, s.missionDeck.shift()!);
}

function refillMarket(s: GameState) {
  for (let i = 0; i < MARKET_SIZE; i++) if (s.market[i] === null) s.market[i] = s.itemDeck.shift() ?? null;
}

function pushEvent(s: GameState, e: Omit<GameEvent, 'seq'>) {
  s.eventSeq += 1;
  s.events.push({ ...e, seq: s.eventSeq });
  if (s.events.length > 120) s.events.splice(0, s.events.length - 120);
}

// ---------------------------------------------------------------- création

/** Héros tout juste arrivé à la station de départ. */
function newHero(c: HeroConfig): Hero {
  const h: Hero = {
    ...c,
    pos: HOME,
    hp: 0,
    resolve: maxResolve(c),
    credits: START_CREDITS + SPECIES[c.speciesId].credits,
    renown: 0,
    xp: 0,
    gear: {},
    missions: [],
    kos: 0,
  };
  h.hp = maxHp(h);
  return h;
}

/** Ce héros n'a encore rien fait : on peut encore changer sa classe et son espèce. */
export function heroUntouched(s: GameState, seat: number): boolean {
  return s.round === 1 && !!s.players[seat] && !s.events.some((e) => e.seat === seat);
}

/**
 * Change la classe et l'espèce d'un héros qui n'a pas encore joué (invité d'un salon) :
 * il est reconstruit comme au début de la partie. Renvoie un nouvel état.
 */
export function rebuildHero(state: GameState, seat: number, patch: Pick<HeroConfig, 'classId' | 'speciesId'>): GameState {
  if (!CLASSES[patch.classId] || !SPECIES[patch.speciesId]) fail('unknownAction', 'Classe ou espèce inconnue.');
  if (!heroUntouched(state, seat)) fail('heroLocked', 'Ce héros a déjà joué : sa classe ne change plus.');
  const players = state.players.map((h, i) => (i === seat ? { ...newHero({ ...h, ...patch }), pos: h.pos } : h));
  return { ...state, players };
}

export function createGame(configs: HeroConfig[], seed = Date.now()): GameState {
  if (configs.length < 1 || configs.length > 5) fail('players', 'Il faut entre 1 et 5 héros.');
  if (new Set(configs.map((c) => c.color)).size !== configs.length) fail('colors', 'Chaque héros doit avoir sa couleur.');
  const s: GameState = {
    version: 1,
    rng: seed | 0,
    phase: 'playing',
    players: [],
    current: 0,
    round: 1,
    movesLeft: 0,
    threat: 0,
    crises: [],
    board: [],
    missionDeck: [],
    market: Array(MARKET_SIZE).fill(null),
    itemDeck: [],
    encounterDeck: [],
    encounterDiscard: [],
    explored: [HOME],
    events: [],
    eventSeq: 0,
    results: null,
  };
  s.players = configs.map(newHero);
  // les missions de rang 3 arrivent plutôt en seconde moitié de partie
  const easy = shuffle(
    s,
    MISSIONS.filter((x) => x.tier < 3).map((x) => x.id),
  );
  const hard = shuffle(
    s,
    MISSIONS.filter((x) => x.tier === 3).map((x) => x.id),
  );
  s.missionDeck = [...easy.slice(0, 8), ...shuffle(s, [...easy.slice(8), ...hard])];
  s.itemDeck = shuffle(
    s,
    ITEMS.map((x) => x.id),
  );
  s.encounterDeck = shuffle(
    s,
    ENCOUNTERS.map((x) => x.id),
  );
  refillBoard(s);
  refillMarket(s);
  s.movesLeft = heroSpeed(s.players[0]);
  return s;
}

// ---------------------------------------------------------------- effets

function resolveCheck(s: GameState, h: Hero, stats: Stat[], dc: number, boost: boolean): Roll {
  const { stat, value } = bestStat(h, stats);
  const bonus = value + (boost ? BOOST : 0);
  const ok = (d: number) => d === 20 || (d !== 1 && d + bonus >= dc);
  let die = d20(s);
  let reroll: number | undefined;
  if (!ok(die) && h.classId === 'technomancer' && stat === 'tech') {
    reroll = die;
    die = d20(s);
  }
  return { stat, d20: die, bonus, dc, success: ok(die), crit: die === 20, boost, ...(reroll ? { reroll } : {}) };
}

function nearestStation(from: string): string {
  return SYSTEMS.filter((x) => x.kind === 'station')
    .map((x) => ({ id: x.id, d: jumps(from, x.id) }))
    .reduce((a, b) => (b.d < a.d ? b : a)).id;
}

/** Blessure : le Soldat la réduit de 1 ; à 0 PV le héros est évacué vers la station la plus proche. */
function hurt(s: GameState, seat: number, amount: number) {
  const h = s.players[seat];
  const dmg = h.classId === 'soldier' ? Math.max(1, amount - 1) : amount;
  h.hp -= dmg;
  if (h.hp > 0) return;
  const lost = Math.min(2, h.renown);
  h.pos = nearestStation(h.pos);
  h.hp = maxHp(h);
  h.credits = Math.floor(h.credits / 2);
  h.renown -= lost;
  h.kos += 1;
  s.threat += 1;
  pushEvent(s, { seat, kind: 'ko', system: h.pos, amount: lost });
}

function heal(h: Hero, amount: number) {
  h.hp = Math.min(maxHp(h), h.hp + amount);
}

function gainXp(s: GameState, seat: number, amount: number) {
  const h = s.players[seat];
  const before = heroLevel(h);
  h.xp += amount;
  const after = heroLevel(h);
  if (after > before) {
    heal(h, 2 * (after - before));
    pushEvent(s, { seat, kind: 'levelUp', amount: after });
  }
}

function equip(s: GameState, seat: number, itemId: number) {
  const h = s.players[seat];
  const item = ITEM_BY_ID[itemId];
  const old = h.gear[item.slot];
  const hpBefore = maxHp(h);
  h.gear[item.slot] = itemId;
  // l'ancien objet retourne sous la pioche d'équipement
  if (old) s.itemDeck.push(old);
  if (item.slot === 'armor') h.hp = Math.max(1, h.hp + maxHp(h) - hpBefore);
}

function applyOutcome(s: GameState, seat: number, o: Outcome) {
  const h = s.players[seat];
  if (o.renown) h.renown = Math.max(0, h.renown + o.renown);
  if (o.credits) h.credits = Math.max(0, h.credits + o.credits);
  if (o.resolve) h.resolve = Math.max(0, Math.min(maxResolve(h), h.resolve + o.resolve));
  if (o.item) {
    const itemId = s.itemDeck.shift();
    if (itemId !== undefined) {
      equip(s, seat, itemId);
      pushEvent(s, { seat, kind: 'loot', itemId });
    }
  }
  if (o.xp) gainXp(s, seat, o.xp);
  if (o.hp && o.hp > 0) heal(h, o.hp);
  if (o.hp && o.hp < 0) hurt(s, seat, -o.hp);
}

// ---------------------------------------------------------------- score final

export function computeResults(s: GameState): PlayerResult[] {
  const maxMissions = Math.max(...s.players.map((p) => p.missions.length));
  const raw = s.players.map((p, seat) => {
    const creditPoints = Math.floor(p.credits / CREDITS_PER_POINT);
    const legendBonus = maxMissions > 0 && p.missions.length === maxMissions ? LEGEND_BONUS : 0;
    return {
      seat,
      renown: p.renown,
      creditPoints,
      missions: p.missions.length,
      legendBonus,
      total: p.renown + creditPoints + legendBonus,
      rank: 0,
    };
  });
  const key = (r: PlayerResult) => [r.total, r.missions, r.renown];
  const sorted = [...raw].sort((x, y) => {
    const a = key(x);
    const b = key(y);
    return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
  });
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1];
    r.rank = prev && key(prev).every((v, k) => v === key(r)[k]) ? prev.rank : i + 1;
  });
  return raw;
}

// ---------------------------------------------------------------- déroulement

function finish(s: GameState) {
  s.phase = 'finished';
  s.movesLeft = 0;
  s.results = computeResults(s);
  const winner = s.results.find((r) => r.rank === 1)!;
  pushEvent(s, { seat: winner.seat, kind: 'end' });
}

/** Fin du tour de table : la menace monte, les crises frappent, la partie peut s'arrêter. */
function endRound(s: GameState) {
  s.threat += 1;
  pushEvent(s, { seat: 0, kind: 'round', amount: s.threat });
  for (const level of CRISES) {
    if (s.threat < level || s.crises.includes(level)) continue;
    s.crises.push(level);
    pushEvent(s, { seat: 0, kind: 'crisis', amount: CRISIS_DAMAGE[level] });
    s.players.forEach((h, seat) => {
      if (SYSTEM_BY_ID[h.pos].kind !== 'station') hurt(s, seat, CRISIS_DAMAGE[level]);
    });
    if (level === CRISES[1]) {
      placeMission(s, BOSS.id);
      const spot = s.board.find((b) => b.missionId === BOSS.id);
      if (spot) pushEvent(s, { seat: 0, kind: 'boss', missionId: BOSS.id, system: spot.system });
    }
  }
  if (s.threat >= MAX_THREAT || s.players.some((p) => p.renown >= RENOWN_GOAL)) return finish(s);
  s.round += 1;
}

function endTurn(s: GameState) {
  s.current = (s.current + 1) % s.players.length;
  if (s.current === 0) endRound(s);
  if (s.phase === 'playing') s.movesLeft = heroSpeed(s.players[s.current]);
}

export function applyAction(state: GameState, seat: number, action: Action): GameState {
  if (state.phase === 'finished') fail('finished', 'La partie est terminée.');
  if (seat !== state.current) fail('notYourTurn', "Ce n'est pas votre tour.");
  const s: GameState = structuredClone(state);
  const h = s.players[seat];
  const here = SYSTEM_BY_ID[h.pos];

  switch (action.type) {
    case 'move': {
      const d = reachable(s, seat).get(action.to);
      if (!d) fail('unreachable', 'Système hors de portée.');
      h.pos = action.to;
      s.movesLeft -= d;
      // entrer dans une nébuleuse met fin au déplacement
      if (SYSTEM_BY_ID[action.to].kind === 'nebula') s.movesLeft = 0;
      pushEvent(s, { seat, kind: 'move', system: action.to, amount: d });
      return s;
    }

    case 'buy': {
      if (here.kind !== 'station') fail('notStation', 'Il faut être dans une station.');
      const itemId = s.market[action.index];
      if (itemId === null || itemId === undefined) fail('noItem', "Pas d'objet à cet emplacement.");
      const cost = itemCost(h, itemId);
      if (h.credits < cost) fail('noCredits', 'Crédits insuffisants.');
      h.credits -= cost;
      s.market[action.index] = null;
      equip(s, seat, itemId);
      refillMarket(s);
      pushEvent(s, { seat, kind: 'buy', itemId, amount: cost });
      // acheter ne termine pas le tour
      return s;
    }

    case 'mission': {
      if (!missionsAt(s, h.pos).includes(action.missionId)) fail('noMission', 'Aucune mission de ce nom ici.');
      if (action.boost && h.resolve <= 0) fail('noResolve', 'Plus de points de Résolution.');
      if (action.boost) h.resolve -= 1;
      const mission = MISSION_BY_ID[action.missionId];
      const reward = MISSION_REWARD[mission.tier];
      const roll = resolveCheck(s, h, mission.stats, DC[mission.tier], !!action.boost);
      pushEvent(s, { seat, kind: 'mission', missionId: mission.id, system: h.pos, roll });
      if (roll.success) {
        s.board = s.board.filter((b) => b.missionId !== mission.id);
        h.missions.push(mission.id);
        h.renown += reward.renown + (roll.crit ? 2 : 0);
        h.credits += reward.credits + (h.classId === 'diplomat' ? DIPLOMAT_CREDITS : 0);
        if (mission.tier === 3) s.threat = Math.max(0, s.threat - 1);
        if (mission.tier === 4) s.threat = Math.max(0, s.threat - 5);
        gainXp(s, seat, reward.xp);
        refillBoard(s);
      } else {
        s.threat += 1;
        gainXp(s, seat, 1);
        hurt(s, seat, reward.damage);
      }
      break;
    }

    case 'explore': {
      if (here.kind === 'station') fail('cantExplore', 'Rien à explorer dans une station.');
      if (action.boost && h.resolve <= 0) fail('noResolve', 'Plus de points de Résolution.');
      if (action.boost) h.resolve -= 1;
      if (!s.explored.includes(h.pos)) {
        s.explored.push(h.pos);
        h.renown += 1;
        pushEvent(s, { seat, kind: 'discovery', system: h.pos, amount: 1 });
      }
      if (s.encounterDeck.length === 0) {
        s.encounterDeck = shuffle(s, s.encounterDiscard);
        s.encounterDiscard = [];
      }
      const encounter = ENCOUNTER_BY_ID[s.encounterDeck.shift()!];
      s.encounterDiscard.push(encounter.id);
      const roll = resolveCheck(s, h, [encounter.stat], encounter.dc, !!action.boost);
      pushEvent(s, { seat, kind: 'explore', encounterId: encounter.id, system: h.pos, roll });
      applyOutcome(s, seat, roll.success ? encounter.success : encounter.failure);
      break;
    }

    case 'rest': {
      const before = h.hp;
      if (here.kind === 'station') {
        h.hp = maxHp(h);
        h.resolve = maxResolve(h);
      } else heal(h, h.classId === 'mystic' ? maxHp(h) : FIELD_REST);
      pushEvent(s, { seat, kind: 'rest', amount: h.hp - before, system: h.pos });
      break;
    }

    case 'wait':
      pushEvent(s, { seat, kind: 'wait' });
      break;

    default:
      fail('unknownAction', 'Action inconnue.');
  }
  endTurn(s);
  return s;
}
