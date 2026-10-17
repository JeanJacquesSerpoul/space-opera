import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { BOT_LEVELS, botAction } from '../shared/bot';
import { CLASS_IDS, SPECIES_IDS } from '../shared/data';
import { GameError, applyAction, createGame } from '../shared/engine';
import { type RoomEvent, type RoomMeta, authorize, joinSeat, newRoom, seatInfos, seatOfToken, seatToBot } from '../shared/online';
import type { Action, GameState, HeroConfig, PlayerColor } from '../shared/types';
import {
  deleteGame,
  getGame,
  getRoom,
  insertGame,
  insertRoom,
  leaderboard,
  listGames,
  roomOfGame,
  saveMove,
  saveSeats,
} from './db';

const PLAYER_COLORS: PlayerColor[] = ['cyan', 'magenta', 'lime', 'amber', 'violet'];
/** Pause entre deux actions d'un ordinateur dans un salon, pour que chacun suive (plus longue après un jet de dé). */
const ROOM_BOT_DELAY = Number(process.env.ROOM_BOT_DELAY ?? 900);

/** Vérifie et normalise l'équipage envoyé par le client. */
function parseHeroes(body: unknown): HeroConfig[] {
  const list = Array.isArray(body) ? body : [];
  if (list.length < 1 || list.length > 5) throw new GameError('players', 'Il faut entre 1 et 5 héros.');
  return list.map((raw, i) => {
    const p = (raw ?? {}) as Partial<HeroConfig>;
    return {
      name:
        String(p.name ?? '')
          .trim()
          .slice(0, 20) || `Héros ${i + 1}`,
      isBot: !!p.isBot,
      color: PLAYER_COLORS.includes(p.color as PlayerColor) ? (p.color as PlayerColor) : PLAYER_COLORS[i],
      classId: CLASS_IDS.includes(p.classId!) ? p.classId! : CLASS_IDS[i % CLASS_IDS.length],
      speciesId: SPECIES_IDS.includes(p.speciesId!) ? p.speciesId! : 'human',
      level: p.level && BOT_LEVELS.includes(p.level) ? p.level : 'normal',
    };
  });
}

const gameId = (req: Request) => Number(req.params.id);

interface Client {
  ws: WebSocket;
  /** Siège contrôlé par cet appareil (-1 : simple spectateur). */
  seat: number;
  token?: string;
}

/**
 * Application Express et serveur HTTP : l'API REST des parties, les salons en ligne
 * et leurs mises à jour en direct (WebSocket sur /ws) ; en production, l'interface construite.
 */
export function createServer() {
  const app = express();
  app.use(express.json());
  const server = createHttpServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // ——— salons : appareils connectés et ordinateurs joués par le serveur ———
  const clients = new Map<number, Set<Client>>();
  const botTimers = new Map<number, ReturnType<typeof setTimeout>>();

  const connectedSeats = (id: number) => new Set([...(clients.get(id) ?? [])].map((c) => c.seat));
  const seatsOf = (id: number, meta: RoomMeta, state: GameState) => seatInfos(meta, state, connectedSeats(id));

  function broadcast(id: number, event: RoomEvent) {
    const data = JSON.stringify(event);
    for (const c of clients.get(id) ?? []) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
  }

  function publish(id: number, meta: RoomMeta, state: GameState) {
    broadcast(id, { t: 'state', state, seats: seatsOf(id, meta, state) });
  }

  /** Dans un salon, le serveur fait jouer les ordinateurs, une action à la fois. */
  function scheduleBots(id: number, meta: RoomMeta) {
    if (botTimers.has(id)) return;
    const state = getGame(id);
    if (!state || state.phase === 'finished' || !state.players[state.current].isBot) return;
    // laisse aux appareils le temps de montrer le dernier jet de dé
    const rolled = state.events.at(-1)?.roll;
    const timer = setTimeout(
      () => {
        botTimers.delete(id);
        const s = getGame(id);
        if (!s || s.phase === 'finished' || !s.players[s.current].isBot) return;
        try {
          const seat = s.current;
          const action = botAction(s);
          const next = applyAction(s, seat, action);
          saveMove(id, seat, action, next);
          publish(id, meta, next);
          scheduleBots(id, meta);
        } catch (e) {
          console.error('Ordinateur bloqué', id, e);
        }
      },
      rolled ? ROOM_BOT_DELAY * 2.2 : ROOM_BOT_DELAY,
    );
    botTimers.set(id, timer);
  }

  function roomOr404(code: string) {
    const room = getRoom(String(code).toUpperCase());
    const state = room && getGame(room.gameId);
    if (!room || !state) throw new GameError('roomNotFound', 'Salon introuvable.');
    return { ...room, state };
  }

  // ——— parties ———

  app.get('/api/games', (_req, res) => {
    res.json(listGames());
  });

  app.post('/api/games', (req, res) => {
    const heroes = parseHeroes(req.body?.players);
    const online = !!req.body?.online;
    // valide le salon avant de créer la partie (hôte humain)
    const room = online ? newRoom(heroes) : null;
    const state = createGame(heroes, Math.floor(Math.random() * 2 ** 31));
    const id = insertGame(state);
    if (!room) {
      res.status(201).json({ id, state });
      return;
    }
    insertRoom(id, room.meta);
    scheduleBots(id, room.meta);
    res.status(201).json({ id, state, room: { code: room.meta.code, token: room.hostToken, seat: 0 } });
  });

  app.get('/api/games/:id', (req, res) => {
    const state = getGame(gameId(req));
    if (!state) throw new GameError('notFound', 'Partie introuvable.');
    res.json({ id: gameId(req), state, room: roomOfGame(gameId(req)) });
  });

  app.delete('/api/games/:id', (req, res) => {
    const id = gameId(req);
    const code = roomOfGame(id);
    deleteGame(id);
    if (code) {
      broadcast(id, { t: 'error', code: 'roomNotFound', message: 'Salon fermé.' });
      for (const c of clients.get(id) ?? []) c.ws.close();
      clients.delete(id);
    }
    res.status(204).end();
  });

  /** Action d'un joueur humain (partie sur un seul appareil). */
  app.post('/api/games/:id/actions', (req, res) => {
    const id = gameId(req);
    const state = getGame(id);
    if (!state) throw new GameError('notFound', 'Partie introuvable.');
    if (roomOfGame(id)) throw new GameError('online', 'Cette partie se joue en ligne, depuis son salon.');
    const seat = Number(req.body?.seat);
    if (state.players[seat]?.isBot) throw new GameError('botSeat', 'Ce héros est contrôlé par l’ordinateur.');
    const action = req.body?.action as Action;
    const next = applyAction(state, seat, action);
    saveMove(id, seat, action, next);
    res.json({ id, state: next });
  });

  /** Fait jouer une action à l'ordinateur dont c'est le tour (dans un salon, le serveur s'en charge). */
  app.post('/api/games/:id/bot', (req, res) => {
    const id = gameId(req);
    const state = getGame(id);
    if (!state) throw new GameError('notFound', 'Partie introuvable.');
    if (roomOfGame(id)) throw new GameError('online', 'Cette partie se joue en ligne, depuis son salon.');
    if (state.phase === 'finished' || !state.players[state.current].isBot) {
      res.json({ id, state });
      return;
    }
    const action = botAction(state);
    const next = applyAction(state, state.current, action);
    saveMove(id, state.current, action, next);
    res.json({ id, state: next });
  });

  // ——— salons ———

  app.get('/api/rooms/:code', (req, res) => {
    const { gameId: id, meta, state } = roomOr404(String(req.params.code));
    scheduleBots(id, meta);
    res.json({ code: meta.code, gameId: id, state, seats: seatsOf(id, meta, state) });
  });

  /** Un invité prend une place libre (ou la reprend avec son jeton). */
  app.post('/api/rooms/:code/join', (req, res) => {
    const room = roomOr404(String(req.params.code));
    const { seat, name, token } = (req.body ?? {}) as { seat: number; name: string; token?: string };
    const joined = joinSeat(room.meta, room.state, Number(seat), name, token || undefined);
    saveSeats(room.gameId, joined.meta, joined.state);
    for (const c of clients.get(room.gameId) ?? []) c.seat = seatOfToken(joined.meta, c.token);
    publish(room.gameId, joined.meta, joined.state);
    res.json({
      token: joined.token,
      seat: Number(seat),
      state: joined.state,
      seats: seatsOf(room.gameId, joined.meta, joined.state),
    });
  });

  /** L'hôte confie à l'ordinateur une place d'invité libre ou abandonnée : le serveur la fait jouer. */
  app.post('/api/rooms/:code/bot-seat', (req, res) => {
    const room = roomOr404(String(req.params.code));
    const { token, seat } = (req.body ?? {}) as { token: string; seat: number };
    const next = seatToBot(room.meta, room.state, token, Number(seat), connectedSeats(room.gameId));
    saveSeats(room.gameId, next.meta, next.state);
    for (const c of clients.get(room.gameId) ?? []) c.seat = seatOfToken(next.meta, c.token);
    publish(room.gameId, next.meta, next.state);
    scheduleBots(room.gameId, next.meta);
    res.json({ state: next.state, seats: seatsOf(room.gameId, next.meta, next.state) });
  });

  /** Coup d'un joueur du salon : le jeton prouve qu'il contrôle ce siège ; le moteur valide le coup. */
  app.post('/api/rooms/:code/actions', (req, res) => {
    const { gameId: id, meta, state } = roomOr404(String(req.params.code));
    const { token, seat, action } = (req.body ?? {}) as { token: string; seat: number; action: Action };
    authorize(meta, token, seat);
    const next = applyAction(state, seat, action);
    saveMove(id, seat, action, next);
    publish(id, meta, next);
    scheduleBots(id, meta);
    res.json({ state: next, seats: seatsOf(id, meta, next) });
  });

  app.get('/api/stats', (_req, res) => {
    res.json(leaderboard());
  });

  // production : sert l'interface construite par Vite
  const dist = resolve('dist');
  if (process.env.NODE_ENV === 'production' && existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof GameError) {
      const status =
        err.code === 'notFound' || err.code === 'roomNotFound'
          ? 404
          : err.code === 'badToken' || err.code === 'notHost'
            ? 403
            : 400;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  });

  // ——— WebSocket : /ws?room=CODE&token=JETON ———
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/ws') return void socket.destroy();
    const code = (url.searchParams.get('room') ?? '').toUpperCase();
    const room = getRoom(code);
    if (!room) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      return void socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const token = url.searchParams.get('token') ?? undefined;
      const client: Client = { ws, seat: seatOfToken(room.meta, token), token };
      const set = clients.get(room.gameId) ?? new Set<Client>();
      set.add(client);
      clients.set(room.gameId, set);

      // état actuel (le salon a pu changer depuis la poignée de main)
      const fresh = getRoom(code);
      const state = getGame(room.gameId);
      if (!fresh || !state) return void ws.close();
      client.seat = seatOfToken(fresh.meta, token);
      ws.send(JSON.stringify({ t: 'room', code, state, seats: seatsOf(room.gameId, fresh.meta, state) } satisfies RoomEvent));
      broadcast(room.gameId, { t: 'seats', seats: seatsOf(room.gameId, fresh.meta, state) });
      scheduleBots(room.gameId, fresh.meta);

      // connexions mortes (téléphone en veille, réseau coupé) : ping toutes les 30 s
      let alive = true;
      ws.on('pong', () => {
        alive = true;
      });
      const ping = setInterval(() => {
        if (!alive) return void ws.terminate();
        alive = false;
        ws.ping();
      }, 30_000);

      ws.on('close', () => {
        clearInterval(ping);
        set.delete(client);
        if (set.size === 0) clients.delete(room.gameId);
        const r = getRoom(code);
        const s = getGame(room.gameId);
        if (r && s) broadcast(room.gameId, { t: 'seats', seats: seatsOf(room.gameId, r.meta, s) });
      });
    });
  });

  return {
    app,
    server,
    close() {
      for (const timer of botTimers.values()) clearTimeout(timer);
      botTimers.clear();
      for (const c of wss.clients) c.terminate();
      wss.close();
      server.close();
    },
  };
}
