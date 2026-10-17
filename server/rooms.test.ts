import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { RoomEvent, SeatInfo } from '../shared/online';
import type { GameState } from '../shared/types';

// base en mémoire (vitest.config.ts) et ordinateurs rapides, avant de charger le serveur
process.env.ROOM_BOT_DELAY = '5';

let base = '';
let close = () => {};

beforeAll(async () => {
  const { createServer } = await import('./app');
  const srv = createServer();
  await new Promise<void>((done) => srv.server.listen(0, '127.0.0.1', done));
  base = `127.0.0.1:${(srv.server.address() as AddressInfo).port}`;
  close = srv.close;
});
afterAll(() => close());

async function post<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`http://${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

/** Ouvre le WebSocket d'un salon et garde les événements reçus. */
function listen(code: string, token?: string) {
  const events: RoomEvent[] = [];
  const ws = new WebSocket(`ws://${base}/ws?room=${code}${token ? `&token=${token}` : ''}`);
  ws.on('message', (data) => events.push(JSON.parse(String(data)) as RoomEvent));
  const opened = new Promise<void>((done) => ws.on('open', () => done()));
  const until = async (pred: (e: RoomEvent) => boolean) => {
    for (let i = 0; i < 300; i++) {
      const found = events.find(pred);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('événement attendu non reçu');
  };
  return { ws, events, opened, until };
}

type Created = { id: number; state: GameState; room: { code: string; token: string; seat: number } };
type Joined = { token: string; seat: number; state: GameState; seats: SeatInfo[] };

const hero = (name: string, isBot: boolean, color: string) => ({ name, isBot, color, classId: 'soldier', speciesId: 'human' });

describe('salons en ligne', () => {
  it('crée un salon, accueille un invité et diffuse les coups en direct', async () => {
    const created = await post<Created>('/api/games', {
      online: true,
      players: [hero('Ada', false, 'cyan'), hero('Invité', false, 'magenta')],
    });
    expect(created.status).toBe(201);
    const { id, room } = created.body;
    const { code, token: hostToken } = room;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    const info = (await (await fetch(`http://${base}/api/rooms/${code}`)).json()) as { gameId: number; seats: SeatInfo[] };
    expect(info.gameId).toBe(id);
    expect(info.seats.map((s) => [s.kind, s.claimed])).toEqual([
      ['host', true],
      ['remote', false],
    ]);
    // la liste des parties signale le salon
    const list = (await (await fetch(`http://${base}/api/games`)).json()) as { id: number; room: string | null }[];
    expect(list.find((g) => g.id === id)?.room).toBe(code);

    // une partie en ligne ne se joue pas par l'API locale
    const local = await post<{ code: string }>(`/api/games/${id}/actions`, { seat: 0, action: { type: 'wait' } });
    expect(local.body.code).toBe('online');

    const host = listen(code, hostToken);
    await host.opened;
    await host.until((e) => e.t === 'room');

    const joined = await post<Joined>(`/api/rooms/${code}/join`, { seat: 1, name: 'Grace' });
    expect(joined.status).toBe(200);
    expect(joined.body.state.players[1].name).toBe('Grace');
    // l'hôte voit arriver l'invité
    await host.until((e) => e.t === 'state' && e.state.players[1].name === 'Grace');
    // la place est prise : un autre appareil ne peut plus la prendre, ni la place de l'hôte
    expect((await post<{ code: string }>(`/api/rooms/${code}/join`, { seat: 1, name: 'Intrus' })).body.code).toBe('seatTaken');
    expect((await post<{ code: string }>(`/api/rooms/${code}/join`, { seat: 0, name: 'Intrus' })).body.code).toBe('seatTaken');

    // un jeton ne permet de jouer que pour son siège
    const wrong = await post<{ code: string }>(`/api/rooms/${code}/actions`, {
      token: joined.body.token,
      seat: 0,
      action: { type: 'wait' },
    });
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe('badToken');

    // l'hôte finit son tour : l'invité reçoit le nouvel état, c'est à lui
    const guest = listen(code, joined.body.token);
    await guest.opened;
    const before = joined.body.state.eventSeq;
    const ok = await post<{ state: GameState }>(`/api/rooms/${code}/actions`, {
      token: hostToken,
      seat: 0,
      action: { type: 'wait' },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.state.current).toBe(1);
    const pushed = await guest.until((e) => e.t === 'state' && e.state.eventSeq > before);
    expect(pushed.t === 'state' && pushed.state.current).toBe(1);
    // présence : les deux appareils sont connectés
    expect(pushed.t === 'state' && pushed.seats.every((s) => s.connected)).toBe(true);

    // l'invité joue à son tour, l'hôte le voit
    const mine = await post<{ state: GameState }>(`/api/rooms/${code}/actions`, {
      token: joined.body.token,
      seat: 1,
      action: { type: 'rest' },
    });
    expect(mine.status).toBe(200);
    await host.until((e) => e.t === 'state' && e.state.eventSeq === mine.body.state.eventSeq);

    // le départ d'un appareil est signalé aux autres
    guest.ws.close();
    await host.until((e) => e.t === 'seats' && !e.seats[1].connected);
    host.ws.close();
  });

  it('fait jouer les ordinateurs du salon côté serveur', async () => {
    const created = await post<Created>('/api/games', {
      online: true,
      players: [hero('Ada', false, 'cyan'), hero('Robot', true, 'magenta'), hero('Bip', true, 'lime')],
    });
    const { code, token } = created.body.room;
    const host = listen(code, token);
    await host.opened;
    await post(`/api/rooms/${code}/actions`, { token, seat: 0, action: { type: 'wait' } });
    // les ordinateurs jouent leur tour sans que personne ne le demande, puis la main revient à l'hôte
    await host.until((e) => e.t === 'state' && e.state.round === 2 && e.state.current === 0);
    // l'hôte ne peut pas jouer à la place d'un ordinateur
    expect(
      (await post<{ code: string }>(`/api/rooms/${code}/actions`, { token, seat: 1, action: { type: 'wait' } })).status,
    ).toBe(403);
    host.ws.close();
  });

  it('refuse un salon inconnu et un hôte ordinateur', async () => {
    expect((await fetch(`http://${base}/api/rooms/ZZZZZZ`)).status).toBe(404);
    const res = await post<{ code: string }>('/api/games', {
      online: true,
      players: [hero('Robot', true, 'cyan'), hero('Ada', false, 'magenta')],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('online');
  });

  it('ferme le salon quand la partie est supprimée', async () => {
    const created = await post<Created>('/api/games', {
      online: true,
      players: [hero('Ada', false, 'cyan'), hero('Invité', false, 'magenta')],
    });
    const { code, token } = created.body.room;
    const host = listen(code, token);
    await host.opened;
    await fetch(`http://${base}/api/games/${created.body.id}`, { method: 'DELETE' });
    await host.until((e) => e.t === 'error' && e.code === 'roomNotFound');
    expect((await fetch(`http://${base}/api/rooms/${code}`)).status).toBe(404);
  });
});
