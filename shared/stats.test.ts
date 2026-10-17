import { describe, expect, it } from 'vitest';
import { botAction } from './bot';
import { applyAction, createGame } from './engine';
import { playerProfile } from './stats';
import type { GameState, HeroConfig } from './types';

const crew = (first: HeroConfig['classId']): HeroConfig[] => [
  { name: 'Ada', isBot: true, color: 'cyan', classId: first, speciesId: 'human', level: 'hard' },
  { name: 'Robo', isBot: true, color: 'magenta', classId: 'mystic', speciesId: 'lumian', level: 'easy' },
];

/** Partie complète entre ordinateurs. */
function play(configs: HeroConfig[], seed: number): GameState {
  let s = createGame(configs, seed);
  for (let i = 0; i < 5000 && s.phase === 'playing'; i++) s = applyAction(s, s.current, botAction(s));
  return s;
}

describe('fiche de joueur', () => {
  it('résume les parties terminées d’un joueur', () => {
    const games = [
      { id: 1, date: '2026-10-01 10:00:00', state: play(crew('soldier'), 1) },
      { id: 2, date: '2026-10-02 10:00:00', state: play(crew('soldier'), 2) },
      { id: 3, date: '2026-10-03 10:00:00', state: play(crew('agent'), 3) },
    ];
    // une partie en cours ne compte pas
    games.push({ id: 4, date: '2026-10-04 10:00:00', state: createGame(crew('agent'), 4) });
    const p = playerProfile('Ada', games)!;
    expect(p.games).toBe(3);
    expect(p.isBot).toBe(true);
    expect(p.history.map((h) => h.gameId)).toEqual([1, 2, 3]);
    expect(p.classes[0]).toMatchObject({ classId: 'soldier', games: 2 });
    expect(p.classes.find((c) => c.classId === 'agent')?.games).toBe(1);
    expect(p.species).toEqual([{ speciesId: 'human', games: 3 }]);
    const scores = p.history.map((h) => h.score);
    expect(p.bestScore).toBe(Math.max(...scores));
    expect(p.avgScore).toBeCloseTo(scores.reduce((a, b) => a + b, 0) / 3, 1);
    expect(p.wins).toBe(p.history.filter((h) => h.rank === 1).length);
    expect(playerProfile('Inconnu', games)).toBeNull();
  });
});
