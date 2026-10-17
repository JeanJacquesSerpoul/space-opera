import { BOT_LEVELS, botAction } from '../../shared/bot';
import { GameError, applyAction, createGame } from '../../shared/engine';
import { type RoomMeta, newRoom } from '../../shared/online';
import { playerProfile } from '../../shared/stats';
import type { Action, GameState, HeroConfig } from '../../shared/types';
import type { GameSummary, LeaderRow } from './api';

/**
 * Version « hors ligne » de l'API, utilisée pour la démo statique (GitHub Pages) :
 * le moteur tourne dans le navigateur et les parties sont gardées dans localStorage.
 */

const KEY = 'so.games.v1';

interface StoredGame {
  state: GameState;
  created_at: string;
  updated_at: string;
  /** Salon pair-à-pair dont ce navigateur est l'hôte. */
  room?: RoomMeta;
}

interface Store {
  nextId: number;
  games: Record<number, StoredGame>;
}

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* stockage indisponible ou corrompu : on repart de zéro */
  }
  return { nextId: 1, games: {} };
}

function save(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* navigation privée : la partie reste en mémoire le temps de la session */
  }
}

let memory: Store | null = null;
const store = () => (memory ??= load());

function getStored(id: number): StoredGame {
  const g = store().games[id];
  if (!g) throw new GameError('notFound', 'Partie introuvable.');
  return g;
}

function update(id: number, state: GameState) {
  const g = getStored(id);
  g.state = state;
  g.updated_at = now();
  save(store());
  return { id, state };
}

function summary(id: number, g: StoredGame): GameSummary {
  return {
    id,
    status: g.state.phase,
    round: g.state.round,
    room: g.room?.code ?? null,
    created_at: g.created_at,
    updated_at: g.updated_at,
    players: g.state.players.map((p, seat) => {
      const r = g.state.results?.find((x) => x.seat === seat);
      return {
        seat,
        name: p.name,
        is_bot: p.isBot ? 1 : 0,
        color: p.color,
        class_id: p.classId,
        score: r?.total ?? null,
        rank: r?.rank ?? null,
      };
    }),
  };
}

function newGame(players: HeroConfig[]) {
  const configs = players.map((p, i) => ({
    ...p,
    name: p.name.trim().slice(0, 20) || `Héros ${i + 1}`,
    level: p.level && BOT_LEVELS.includes(p.level) ? p.level : 'normal',
  }));
  const state = createGame(configs, Math.floor(Math.random() * 2 ** 31));
  const s = store();
  const id = s.nextId++;
  s.games[id] = { state, created_at: now(), updated_at: now() };
  save(s);
  return { id, state };
}

// Les appels restent asynchrones pour garder la même interface que l'API HTTP.
const wrap = <T>(fn: () => T): Promise<T> => {
  try {
    return Promise.resolve(fn());
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
};

export const localApi = {
  listGames: () =>
    wrap(() =>
      Object.entries(store().games)
        .map(([id, g]) => summary(Number(id), g))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
        .slice(0, 30),
    ),

  createGame: (players: HeroConfig[]) => wrap(() => newGame(players)),

  /** Partie en ligne dont ce navigateur sera l'hôte (pair-à-pair). */
  createRoom: (players: HeroConfig[]) =>
    wrap(() => {
      // valide le salon avant de créer la partie (hôte humain)
      const { meta, hostToken } = newRoom(players);
      const { id, state } = newGame(players);
      getStored(id).room = meta;
      save(store());
      return { id, state, meta, hostToken };
    }),

  room: (id: number) => {
    const g = getStored(id);
    if (!g.room) throw new GameError('roomNotFound', 'Salon introuvable.');
    return { state: g.state, meta: g.room };
  },

  saveRoom: (id: number, meta: RoomMeta, state: GameState) => {
    getStored(id).room = meta;
    update(id, state);
  },

  /** Coup d'un joueur du salon (le jeton a déjà été vérifié par l'hôte). */
  actRoom: (id: number, seat: number, action: Action) => update(id, applyAction(getStored(id).state, seat, action)),

  getGame: (id: number) => wrap(() => ({ id, state: getStored(id).state })),

  deleteGame: (id: number) =>
    wrap(() => {
      delete store().games[id];
      save(store());
    }),

  act: (id: number, seat: number, action: Action) =>
    wrap(() => {
      const { state, room } = getStored(id);
      if (room) throw new GameError('online', 'Cette partie se joue en ligne, depuis son salon.');
      if (state.players[seat]?.isBot) throw new GameError('botSeat', 'Ce héros est contrôlé par l’ordinateur.');
      return update(id, applyAction(state, seat, action));
    }),

  bot: (id: number) =>
    wrap(() => {
      const state = getStored(id).state;
      if (state.phase === 'finished' || !state.players[state.current].isBot) return { id, state };
      return update(id, applyAction(state, state.current, botAction(state)));
    }),

  player: (name: string) =>
    wrap(() => {
      const games = Object.entries(store().games)
        .filter(([, g]) => g.state.phase === 'finished')
        .map(([id, g]) => ({ id: Number(id), date: g.updated_at, state: g.state }));
      const profile = playerProfile(name, games);
      if (!profile) throw new GameError('notFound', 'Joueur introuvable.');
      return profile;
    }),

  stats: () =>
    wrap(() => {
      const rows = new Map<string, LeaderRow & { total: number }>();
      for (const g of Object.values(store().games)) {
        if (g.state.phase !== 'finished' || !g.state.results) continue;
        for (const r of g.state.results) {
          const p = g.state.players[r.seat];
          const row = rows.get(p.name) ?? {
            name: p.name,
            is_bot: 0,
            games: 0,
            wins: 0,
            avg_score: 0,
            best_score: Number.NEGATIVE_INFINITY,
            missions: 0,
            total: 0,
          };
          row.is_bot = Math.max(row.is_bot, p.isBot ? 1 : 0);
          row.games += 1;
          row.wins += r.rank === 1 ? 1 : 0;
          row.total += r.total;
          row.best_score = Math.max(row.best_score, r.total);
          row.missions += r.missions;
          rows.set(p.name, row);
        }
      }
      return [...rows.values()]
        .map(({ total, ...row }) => ({ ...row, avg_score: Math.round((10 * total) / row.games) / 10 }))
        .sort((a, b) => b.wins - a.wins || b.avg_score - a.avg_score)
        .slice(0, 50);
    }),
};
