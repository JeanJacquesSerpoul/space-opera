import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Action, GameState } from '../shared/types';

// « :memory: » : base temporaire (tests)
const DB_PATH = process.env.DB_PATH === ':memory:' ? ':memory:' : resolve(process.env.DB_PATH ?? 'data/space-opera.db');
if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS games (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    status      TEXT NOT NULL,
    state_json  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS game_players (
    game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    seat        INTEGER NOT NULL,
    name        TEXT NOT NULL,
    is_bot      INTEGER NOT NULL,
    color       TEXT NOT NULL,
    class_id    TEXT NOT NULL,
    species_id  TEXT NOT NULL,
    score       INTEGER,
    rank        INTEGER,
    missions    INTEGER,
    PRIMARY KEY (game_id, seat)
  );

  CREATE TABLE IF NOT EXISTS moves (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    seat        INTEGER NOT NULL,
    action_json TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_moves_game ON moves(game_id);
  CREATE INDEX IF NOT EXISTS idx_players_name ON game_players(name);
`);

export function insertGame(state: GameState): number {
  const res = db.prepare('INSERT INTO games (status, state_json) VALUES (?, ?)').run(state.phase, JSON.stringify(state));
  const id = Number(res.lastInsertRowid);
  const ins = db.prepare(
    'INSERT INTO game_players (game_id, seat, name, is_bot, color, class_id, species_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const [seat, p] of state.players.entries()) ins.run(id, seat, p.name, p.isBot ? 1 : 0, p.color, p.classId, p.speciesId);
  return id;
}

export function getGame(id: number): GameState | null {
  const row = db.prepare('SELECT state_json FROM games WHERE id = ?').get(id) as { state_json: string } | undefined;
  return row ? (JSON.parse(row.state_json) as GameState) : null;
}

/** Enregistre un coup et le nouvel état, et les scores quand la partie se termine. */
export function saveMove(id: number, seat: number, action: Action, state: GameState) {
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO moves (game_id, seat, action_json) VALUES (?, ?, ?)').run(id, seat, JSON.stringify(action));
    db.prepare("UPDATE games SET status = ?, state_json = ?, updated_at = datetime('now') WHERE id = ?").run(
      state.phase,
      JSON.stringify(state),
      id,
    );
    if (state.results) {
      const upd = db.prepare('UPDATE game_players SET score = ?, rank = ?, missions = ? WHERE game_id = ? AND seat = ?');
      for (const r of state.results) upd.run(r.total, r.rank, r.missions, id, r.seat);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function deleteGame(id: number) {
  db.prepare('DELETE FROM games WHERE id = ?').run(id);
}

export interface PlayerRow {
  seat: number;
  name: string;
  is_bot: number;
  color: string;
  class_id: string;
  score: number | null;
  rank: number | null;
}

export function listGames() {
  const games = db
    .prepare('SELECT id, status, state_json, created_at, updated_at FROM games ORDER BY updated_at DESC, id DESC LIMIT 30')
    .all() as { id: number; status: string; state_json: string; created_at: string; updated_at: string }[];
  const players = db.prepare(
    'SELECT seat, name, is_bot, color, class_id, score, rank FROM game_players WHERE game_id = ? ORDER BY seat',
  );
  return games.map((g) => ({
    id: g.id,
    status: g.status,
    round: (JSON.parse(g.state_json) as GameState).round,
    created_at: g.created_at,
    updated_at: g.updated_at,
    players: players.all(g.id) as unknown as PlayerRow[],
  }));
}

export function leaderboard() {
  return db
    .prepare(
      `SELECT name, MAX(is_bot) AS is_bot, COUNT(*) AS games,
              SUM(CASE WHEN rank = 1 THEN 1 ELSE 0 END) AS wins,
              ROUND(AVG(score), 1) AS avg_score, MAX(score) AS best_score,
              SUM(missions) AS missions
       FROM game_players WHERE score IS NOT NULL
       GROUP BY name ORDER BY wins DESC, avg_score DESC LIMIT 50`,
    )
    .all();
}
