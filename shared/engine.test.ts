import { describe, expect, it } from 'vitest';
import { botAction } from './bot';
import { BOSS, CLASS_IDS, ITEM_BY_ID, MISSION_BY_ID, SPECIES_IDS } from './data';
import {
  BOARD_SIZE,
  DC,
  GameError,
  MAX_THREAT,
  applyAction,
  checkChance,
  createGame,
  heroLevel,
  heroSpeed,
  heroUntouched,
  maxHp,
  reachable,
  rebuildHero,
  rollChance,
  statValue,
} from './engine';
import { HOME, LANES, NEIGHBORS, SYSTEMS, SYSTEM_BY_ID } from './sector';
import type { BotLevel, GameState, HeroConfig, PlayerColor } from './types';

const COLORS: PlayerColor[] = ['cyan', 'magenta', 'lime', 'amber', 'violet'];

function heroes(n: number, bot = false, level: BotLevel = 'normal'): HeroConfig[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Héros ${i + 1}`,
    isBot: bot,
    color: COLORS[i],
    classId: CLASS_IDS[i % CLASS_IDS.length],
    speciesId: SPECIES_IDS[i % SPECIES_IDS.length],
    level,
  }));
}

/** Joue une partie entière entre ordinateurs. */
function simulate(seed: number, n: number, level: BotLevel = 'normal'): { state: GameState; actions: number } {
  let s = createGame(heroes(n, true, level), seed);
  let actions = 0;
  while (s.phase !== 'finished') {
    s = applyAction(s, s.current, botAction(s));
    actions += 1;
    if (actions > 5000) throw new Error('partie sans fin');
  }
  return { state: s, actions };
}

describe('secteur', () => {
  it('est connexe, sans couloir en double', () => {
    const seen = new Set([HOME]);
    const queue = [HOME];
    while (queue.length) for (const n of NEIGHBORS[queue.shift()!]) if (!seen.has(n) && seen.add(n)) queue.push(n);
    expect(seen.size).toBe(SYSTEMS.length);
    const keys = LANES.map((l) => [l.a, l.b].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    for (const l of LANES) expect(SYSTEM_BY_ID[l.a] && SYSTEM_BY_ID[l.b]).toBeTruthy();
  });

  it('offre assez de systèmes pour chaque type de mission', () => {
    for (const kind of ['planet', 'derelict', 'nebula'] as const)
      expect(SYSTEMS.filter((x) => x.kind === kind).length).toBeGreaterThan(2);
  });
});

describe('création', () => {
  it('place les héros au Nexus avec leurs points de vie et 5 missions', () => {
    const s = createGame(heroes(3), 42);
    expect(s.board).toHaveLength(BOARD_SIZE);
    expect(new Set(s.board.map((b) => b.system)).size).toBe(BOARD_SIZE);
    for (const b of s.board) expect(SYSTEM_BY_ID[b.system].kind).toBe(MISSION_BY_ID[b.missionId].where);
    for (const h of s.players) {
      expect(h.pos).toBe(HOME);
      expect(h.hp).toBe(maxHp(h));
    }
    expect(s.market.every((x) => x !== null)).toBe(true);
  });

  it('refuse deux héros de la même couleur', () => {
    const cfg = heroes(2);
    cfg[1].color = cfg[0].color;
    expect(() => createGame(cfg)).toThrow(GameError);
  });

  it('est déterministe pour une même graine', () => {
    expect(createGame(heroes(2), 7)).toEqual(createGame(heroes(2), 7));
  });
});

describe('fiche du héros', () => {
  it('additionne classe, espèce, niveau et équipement', () => {
    const s = createGame([{ name: 'A', isBot: false, color: 'cyan', classId: 'soldier', speciesId: 'vorn' }], 1);
    const h = s.players[0];
    expect(statValue(h, 'combat')).toBe(6);
    expect(maxHp(h)).toBe(18);
    h.gear.weapon = Object.values(ITEM_BY_ID).find((i) => i.slot === 'weapon' && i.bonus === 2)!.id;
    h.xp = 7;
    expect(heroLevel(h)).toBe(3);
    expect(statValue(h, 'combat')).toBe(10);
  });

  it("donne un saut de plus à l'Agent", () => {
    const s = createGame(heroes(4), 1);
    expect(heroSpeed(s.players[3])).toBe(3);
    expect(heroSpeed(s.players[0])).toBe(2);
  });

  it('calcule les chances de réussite (1 et 20 naturels)', () => {
    expect(rollChance(0, 30)).toBe(0.05);
    expect(rollChance(30, 10)).toBe(0.95);
    expect(rollChance(5, 15)).toBe(0.55);
    const s = createGame(heroes(3), 1);
    const techno = s.players[2];
    expect(checkChance(techno, ['tech'], DC[2])).toBeGreaterThan(rollChance(statValue(techno, 'tech'), DC[2]));
  });
});

describe('déplacements', () => {
  it('limite les sauts à la vitesse du héros et arrête dans les nébuleuses', () => {
    let s = createGame(heroes(1), 3);
    const reach = reachable(s, 0);
    expect(Math.max(...reach.values())).toBeLessThanOrEqual(2);
    expect(reach.get('veil')).toBe(1);
    // au-delà du Voile d'Opale (nébuleuse), Kepler-Noir n'est accessible que par Thalassa ou Aurélia
    s = applyAction(s, 0, { type: 'move', to: 'veil' });
    expect(s.movesLeft).toBe(0);
    expect(() => applyAction(s, 0, { type: 'move', to: 'kepler' })).toThrow(GameError);
  });

  it('se déplace puis agit, ce qui passe au héros suivant', () => {
    let s = createGame(heroes(2), 5);
    s = applyAction(s, 0, { type: 'move', to: 'ferrum' });
    expect(s.current).toBe(0);
    s = applyAction(s, 0, { type: 'explore' });
    expect(s.current).toBe(1);
    expect(s.explored).toContain('ferrum');
    expect(() => applyAction(s, 0, { type: 'wait' })).toThrow(GameError);
  });
});

describe('missions, achats et repos', () => {
  it('résout une mission : réussite (renommée) ou échec (blessure, menace)', () => {
    let wins = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = createGame(heroes(1), seed);
      const target = s.board[0];
      s.players[0].pos = target.system;
      const next = applyAction(s, 0, { type: 'mission', missionId: target.missionId });
      const ev = next.events.find((e) => e.kind === 'mission')!;
      if (ev.roll!.success) {
        wins += 1;
        expect(next.players[0].renown).toBeGreaterThan(0);
        expect(next.board.some((b) => b.missionId === target.missionId)).toBe(false);
        expect(next.board).toHaveLength(BOARD_SIZE);
      } else {
        expect(next.threat).toBeGreaterThanOrEqual(1);
        expect(next.players[0].missions).toHaveLength(0);
      }
    }
    expect(wins).toBeGreaterThan(5);
    expect(wins).toBeLessThan(40);
  });

  it('dépense un point de Résolution pour +4', () => {
    const s = createGame(heroes(1), 9);
    const target = s.board[0];
    s.players[0].pos = target.system;
    const next = applyAction(s, 0, { type: 'mission', missionId: target.missionId, boost: true });
    expect(next.players[0].resolve).toBe(s.players[0].resolve - 1);
    expect(next.events.find((e) => e.kind === 'mission')!.roll!.boost).toBe(true);
    s.players[0].resolve = 0;
    expect(() => applyAction(s, 0, { type: 'mission', missionId: target.missionId, boost: true })).toThrow(GameError);
  });

  it("achète de l'équipement en station sans finir le tour", () => {
    const s = createGame(heroes(1), 11);
    s.players[0].credits = 50;
    const itemId = s.market[0]!;
    const next = applyAction(s, 0, { type: 'buy', index: 0 });
    expect(next.players[0].gear[ITEM_BY_ID[itemId].slot]).toBe(itemId);
    expect(next.market[0]).not.toBeNull();
    expect(next.current).toBe(0);
    s.players[0].pos = 'ferrum';
    expect(() => applyAction(s, 0, { type: 'buy', index: 0 })).toThrow(GameError);
  });

  it('soigne entièrement en station et recharge la Résolution', () => {
    const s = createGame(heroes(2), 2);
    s.players[0].hp = 3;
    s.players[0].resolve = 0;
    const next = applyAction(s, 0, { type: 'rest' });
    expect(next.players[0].hp).toBe(maxHp(next.players[0]));
    expect(next.players[0].resolve).toBe(3);
  });

  it('évacue un héros à 0 PV vers une station', () => {
    let s = createGame(heroes(1), 4);
    const target = s.board.find((b) => MISSION_BY_ID[b.missionId].tier >= 2) ?? s.board[0];
    for (let i = 0; i < 30; i++) {
      s.players[0].pos = target.system;
      s.players[0].hp = 1;
      s.current = 0;
      const next = applyAction(s, 0, { type: 'mission', missionId: target.missionId });
      if (next.events.some((e) => e.kind === 'ko')) {
        const h = next.players[0];
        expect(SYSTEM_BY_ID[h.pos].kind).toBe('station');
        expect(h.hp).toBe(maxHp(h));
        expect(h.kos).toBe(1);
        return;
      }
      s = { ...s, rng: s.rng + 17 };
    }
    throw new Error('aucun échec en 30 essais');
  });
});

describe('menace et fin de partie', () => {
  it('révèle le Vaisseau-Ruche à la deuxième crise', () => {
    let s = createGame(heroes(1), 8);
    while (s.threat < 10 && s.phase === 'playing') s = applyAction(s, 0, { type: 'wait' });
    expect(s.crises).toEqual([5, 10]);
    expect(s.board.some((b) => b.missionId === BOSS.id)).toBe(true);
  });

  it('termine la partie quand la menace est au maximum', () => {
    let s = createGame(heroes(2), 8);
    while (s.phase === 'playing') s = applyAction(s, s.current, { type: s.current === 0 ? 'rest' : 'wait' });
    expect(s.threat).toBeGreaterThanOrEqual(MAX_THREAT);
    expect(s.results).toHaveLength(2);
  });

  it('va au bout de parties entre ordinateurs, à tous les niveaux', () => {
    for (const [seed, n, level] of [
      [1, 2, 'easy'],
      [2, 3, 'normal'],
      [3, 4, 'hard'],
      [4, 5, 'normal'],
      [5, 1, 'hard'],
    ] as const) {
      const { state } = simulate(seed, n, level);
      expect(state.results).toHaveLength(n);
      const ranks = state.results!.map((r) => r.rank);
      expect(ranks).toContain(1);
      for (const r of state.results!) expect(r.total).toBe(r.renown + r.creditPoints + r.legendBonus);
      expect(state.players.some((p) => p.missions.length > 0)).toBe(true);
    }
  });
});

describe('héros d’un invité', () => {
  it('change de classe et d’espèce tant qu’il n’a pas joué, sans toucher au reste de la partie', () => {
    const s = createGame(heroes(2), 42);
    expect(heroUntouched(s, 1)).toBe(true);
    const next = rebuildHero(s, 1, { classId: 'soldier', speciesId: 'vorn' });
    const h = next.players[1];
    expect([h.classId, h.speciesId, h.name, h.color]).toEqual(['soldier', 'vorn', s.players[1].name, s.players[1].color]);
    expect(h.hp).toBe(maxHp(h));
    expect(h.hp).toBe(18); // Soldat 16 + Vorn 2
    expect(next.rng).toBe(s.rng);
    expect(next.board).toEqual(s.board);
    expect(s.players[1].classId).not.toBe('soldier'); // état reçu intact

    // une fois qu'il a joué, sa classe est fixée
    const played = applyAction(applyAction(s, 0, { type: 'wait' }), 1, { type: 'wait' });
    expect(heroUntouched(played, 1)).toBe(false);
    expect(() => rebuildHero(played, 1, { classId: 'soldier', speciesId: 'vorn' })).toThrow(GameError);
  });
});
