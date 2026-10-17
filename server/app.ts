import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BOT_LEVELS, botAction } from '../shared/bot';
import { CLASS_IDS, SPECIES_IDS } from '../shared/data';
import { GameError, applyAction, createGame } from '../shared/engine';
import type { Action, HeroConfig, PlayerColor } from '../shared/types';
import { deleteGame, getGame, insertGame, leaderboard, listGames, saveMove } from './db';

const PLAYER_COLORS: PlayerColor[] = ['cyan', 'magenta', 'lime', 'amber', 'violet'];

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

/** Application Express : l'API REST des parties et, en production, l'interface construite. */
export function createServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/games', (_req, res) => {
    res.json(listGames());
  });

  app.post('/api/games', (req, res) => {
    const state = createGame(parseHeroes(req.body?.players), Math.floor(Math.random() * 2 ** 31));
    const id = insertGame(state);
    res.status(201).json({ id, state });
  });

  app.get('/api/games/:id', (req, res) => {
    const state = getGame(gameId(req));
    if (!state) throw new GameError('notFound', 'Partie introuvable.');
    res.json({ id: gameId(req), state });
  });

  app.delete('/api/games/:id', (req, res) => {
    deleteGame(gameId(req));
    res.status(204).end();
  });

  app.post('/api/games/:id/actions', (req, res) => {
    const id = gameId(req);
    const state = getGame(id);
    if (!state) throw new GameError('notFound', 'Partie introuvable.');
    const seat = Number(req.body?.seat);
    if (state.players[seat]?.isBot) throw new GameError('botSeat', 'Ce héros est contrôlé par l’ordinateur.');
    const action = req.body?.action as Action;
    const next = applyAction(state, seat, action);
    saveMove(id, seat, action, next);
    res.json({ id, state: next });
  });

  /** Fait jouer une action à l'ordinateur dont c'est le tour. */
  app.post('/api/games/:id/bot', (req, res) => {
    const id = gameId(req);
    const state = getGame(id);
    if (!state) throw new GameError('notFound', 'Partie introuvable.');
    if (state.phase === 'finished' || !state.players[state.current].isBot) {
      res.json({ id, state });
      return;
    }
    const action = botAction(state);
    const next = applyAction(state, state.current, action);
    saveMove(id, state.current, action, next);
    res.json({ id, state: next });
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
      res.status(err.code === 'notFound' ? 404 : 400).json({ error: err.message, code: err.code });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Erreur interne du serveur.' });
  });

  return app;
}
