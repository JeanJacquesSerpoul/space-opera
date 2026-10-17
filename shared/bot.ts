import { CLASSES, ENCOUNTER_BY_ID, ENCOUNTERS, ITEM_BY_ID, MISSION_BY_ID, STAT_SLOT, STATS } from './data';
import {
  BOOST,
  CREDITS_PER_POINT,
  DC,
  DIPLOMAT_CREDITS,
  FIELD_REST,
  MISSION_REWARD,
  checkChance,
  heroSpeed,
  itemCost,
  jumps,
  maxHp,
  maxResolve,
  missionsAt,
  reachable,
} from './engine';
import { SYSTEM_BY_ID } from './sector';
import type { Action, BotLevel, GameState, Hero, Outcome, Stat } from './types';

export const BOT_LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];

const levelOf = (h: Hero): BotLevel => h.level ?? 'normal';

/** Hasard déterministe tiré de l'état de la partie (l'IA reste une fonction pure). */
function chance(s: GameState, salt: number): number {
  let x = (s.rng ^ Math.imul(s.eventSeq + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Coût estimé d'une blessure : léger tant que le héros tient debout, lourd s'il tombe. */
function damageCost(h: Hero, amount: number): number {
  const dmg = h.classId === 'soldier' ? Math.max(1, amount - 1) : amount;
  if (dmg >= h.hp) return 4 + Math.min(2, h.renown) + h.credits / 2 / CREDITS_PER_POINT + 1;
  return dmg * 0.25 * (1 + dmg / h.hp);
}

const resolveValue = (h: Hero) => (levelOf(h) === 'hard' ? 1.1 : 1.4);

/** Valeur espérée d'une tentative de mission. */
export function missionValue(h: Hero, missionId: number, boost: boolean): number {
  const mission = MISSION_BY_ID[missionId];
  const r = MISSION_REWARD[mission.tier];
  const p = checkChance(h, mission.stats, DC[mission.tier], boost);
  const credits = r.credits + (h.classId === 'diplomat' ? DIPLOMAT_CREDITS : 0);
  const threatRelief = mission.tier === 4 ? 2 : mission.tier === 3 ? 0.5 : 0;
  const gain = r.renown + (credits / CREDITS_PER_POINT) * 1.5 + r.xp * 0.8 + threatRelief + 0.05 * 2;
  const loss = damageCost(h, r.damage) + 0.6 - 0.8;
  return p * gain - (1 - p) * loss - (boost ? resolveValue(h) : 0);
}

function outcomeValue(h: Hero, o: Outcome): number {
  let v = (o.renown ?? 0) + ((o.credits ?? 0) / CREDITS_PER_POINT) * 1.5 + (o.xp ?? 0) * 0.8;
  v += (o.resolve ?? 0) * 0.8 + (o.item ? 2 : 0);
  if (o.hp && o.hp > 0) v += Math.min(o.hp, maxHp(h) - h.hp) * 0.25;
  if (o.hp && o.hp < 0) v -= damageCost(h, -o.hp);
  return v;
}

/** Valeur espérée d'une exploration, d'après les rencontres encore dans la pioche. */
export function exploreValue(s: GameState, h: Hero, system: string, boost: boolean): number {
  const pool = s.encounterDeck.length ? s.encounterDeck.map((id) => ENCOUNTER_BY_ID[id]) : ENCOUNTERS;
  let v = 0;
  for (const e of pool) {
    const p = checkChance(h, [e.stat], e.dc, boost);
    v += p * outcomeValue(h, e.success) + (1 - p) * outcomeValue(h, e.failure);
  }
  v /= pool.length;
  if (!s.explored.includes(system)) v += 1;
  return v - (boost ? resolveValue(h) : 0);
}

function restValue(h: Hero, system: string): number {
  const station = SYSTEM_BY_ID[system].kind === 'station';
  const missing = maxHp(h) - h.hp;
  const healed = station || h.classId === 'mystic' ? missing : Math.min(FIELD_REST, missing);
  const urgency = 1 + missing / maxHp(h);
  return healed * 0.22 * urgency + (station ? (maxResolve(h) - h.resolve) * 0.6 : 0);
}

/** Intérêt d'un objet pour ce héros (0 s'il n'améliore rien). */
export function itemValue(h: Hero, itemId: number): number {
  const item = ITEM_BY_ID[itemId];
  const current = h.gear[item.slot] ? ITEM_BY_ID[h.gear[item.slot]!].bonus : 0;
  const delta = item.bonus - current;
  if (delta <= 0) return 0;
  if (item.slot === 'armor') return delta * 0.35;
  if (item.slot === 'engine') return 2;
  const stat = STATS.find((x) => STAT_SLOT[x] === item.slot) as Stat;
  const base = CLASSES[h.classId].stats[stat];
  const weight = base >= 3 ? 1.6 : base >= 2 ? 1.1 : base >= 1 ? 0.6 : 0.3;
  return delta * weight * BOOST * 0.35;
}

function bestPurchase(s: GameState, h: Hero): number | null {
  let best: { index: number; value: number } | null = null;
  s.market.forEach((itemId, index) => {
    if (itemId === null || itemCost(h, itemId) > h.credits) return;
    const value = itemValue(h, itemId) - itemCost(h, itemId) * 0.18;
    if (value > 0.4 && (!best || value > best.value)) best = { index, value };
  });
  return best ? (best as { index: number }).index : null;
}

/** Attrait d'une position pour les tours suivants : missions proches, station si blessé. */
function futureValue(s: GameState, h: Hero, at: string): number {
  const speed = heroSpeed(h);
  let best = 0;
  for (const b of s.board) {
    if (b.system === at) continue;
    const turns = Math.max(1, Math.ceil(jumps(at, b.system) / speed));
    best = Math.max(best, missionValue(h, b.missionId, h.resolve > 0) * 0.7 ** turns);
  }
  if (h.hp < maxHp(h) * 0.5 && SYSTEM_BY_ID[at].kind === 'station') best = Math.max(best, 2);
  return best;
}

interface Choice {
  score: number;
  dest: string;
  action: Action;
}

export function botAction(s: GameState): Action {
  const seat = s.current;
  const h = s.players[seat];
  const level = levelOf(h);

  if (SYSTEM_BY_ID[h.pos].kind === 'station' && level !== 'easy') {
    const index = bestPurchase(s, h);
    if (index !== null) return { type: 'buy', index };
  }
  if (SYSTEM_BY_ID[h.pos].kind === 'station' && level === 'easy') {
    const index = s.market.findIndex((id) => id !== null && itemCost(h, id) <= h.credits && itemValue(h, id) > 1);
    if (index >= 0 && chance(s, 3) < 0.6) return { type: 'buy', index };
  }

  const noise = level === 'easy' ? 3 : level === 'normal' ? 0.8 : 0;
  const canBoost = h.resolve > 0 && level !== 'easy';
  let best: Choice | null = null;
  let salt = 0;
  const consider = (dest: string, action: Action, score: number) => {
    salt += 1;
    const total = score + (chance(s, salt) - 0.5) * noise;
    if (!best || total > best.score) best = { score: total, dest, action };
  };

  for (const [dest, dist] of reachable(s, seat)) {
    const future = futureValue(s, h, dest) * 0.5 - dist * 0.05;
    for (const missionId of missionsAt(s, dest)) {
      consider(dest, { type: 'mission', missionId }, missionValue(h, missionId, false) + future);
      if (canBoost) consider(dest, { type: 'mission', missionId, boost: true }, missionValue(h, missionId, true) + future);
    }
    if (SYSTEM_BY_ID[dest].kind !== 'station') {
      consider(dest, { type: 'explore' }, exploreValue(s, h, dest, false) + future);
      if (canBoost && level === 'hard') consider(dest, { type: 'explore', boost: true }, exploreValue(s, h, dest, true) + future);
    }
    consider(dest, { type: 'rest' }, restValue(h, dest) + future);
    consider(dest, { type: 'wait' }, future - 0.3);
  }

  const choice = best as Choice | null;
  if (!choice) return { type: 'wait' };
  if (choice.dest !== h.pos) return { type: 'move', to: choice.dest };
  return choice.action;
}
