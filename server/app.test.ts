import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '../shared/types';
import { createServer } from './app';

// base en mémoire : voir vitest.config.ts (DB_PATH=:memory:)
let srv: ReturnType<typeof createServer>;
let base = '';

beforeAll(async () => {
  srv = createServer();
  await new Promise<void>((r) => srv.server.listen(0, r));
  base = `http://localhost:${(srv.server.address() as AddressInfo).port}`;
});

afterAll(() => {
  srv.close();
});

const post = (path: string, body?: unknown) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });

describe('API', () => {
  it('crée une partie, refuse un coup hors tour et fait jouer l’ordinateur jusqu’au bout', async () => {
    const res = await post('/api/games', {
      players: [
        { name: 'Ada', isBot: false, color: 'cyan', classId: 'soldier', speciesId: 'vorn' },
        { name: 'Robo', isBot: true, color: 'magenta', classId: 'mystic', speciesId: 'lumian', level: 'hard' },
      ],
    });
    expect(res.status).toBe(201);
    const { id, state } = (await res.json()) as { id: number; state: GameState };
    expect(state.players[0].classId).toBe('soldier');

    const wrong = await post(`/api/games/${id}/actions`, { seat: 1, action: { type: 'wait' } });
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { code: string }).code).toBe('botSeat');

    let s = state;
    for (let i = 0; i < 2000 && s.phase === 'playing'; i++) {
      const r = s.players[s.current].isBot
        ? await post(`/api/games/${id}/bot`)
        : await post(`/api/games/${id}/actions`, { seat: s.current, action: { type: 'rest' } });
      s = ((await r.json()) as { state: GameState }).state;
    }
    expect(s.phase).toBe('finished');

    const list = (await (await fetch(`${base}/api/games`)).json()) as { id: number; players: { score: number | null }[] }[];
    expect(list.find((g) => g.id === id)!.players.every((p) => p.score !== null)).toBe(true);
    const stats = (await (await fetch(`${base}/api/stats`)).json()) as { name: string }[];
    expect(stats.map((r) => r.name)).toContain('Robo');

    // fiche de joueur
    const profile = (await (await fetch(`${base}/api/players/Robo`)).json()) as { games: number; classes: { classId: string }[] };
    expect(profile.games).toBeGreaterThanOrEqual(1);
    expect(profile.classes[0].classId).toBe('mystic');
    expect((await fetch(`${base}/api/players/Personne`)).status).toBe(404);
  });

  it('renvoie 404 pour une partie inconnue', async () => {
    const res = await fetch(`${base}/api/games/9999`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe('notFound');
  });
});
