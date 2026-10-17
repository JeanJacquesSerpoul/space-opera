import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { RoomMeta } from '../shared/online';
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

  CREATE TABLE IF NOT EXISTS rooms (
    code        TEXT PRIMARY KEY,
    game_id     INTEGER NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
    seats_json  TEXT NOT NULL
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
    .prepare(
      `SELECT g.id, g.status, g.state_json, g.created_at, g.updated_at, r.code AS room
         FROM games g LEFT JOIN rooms r ON r.game_id = g.id
        ORDER BY g.updated_at DESC, g.id DESC LIMIT 30`,
    )
    .all() as { id: number; status: string; state_json: string; created_at: string; updated_at: string; room: string | null }[];
  const players = db.prepare(
    'SELECT seat, name, is_bot, color, class_id, score, rank FROM game_players WHERE game_id = ? ORDER BY seat',
  );
  return games.map((g) => ({
    id: g.id,
    status: g.status,
    round: (JSON.parse(g.state_json) as GameState).round,
    room: g.room,
    created_at: g.created_at,
    updated_at: g.updated_at,
    players: players.all(g.id) as unknown as PlayerRow[],
  }));
}

/** Parties terminées où ce joueur avait un héros (fiche de joueur). */
export function finishedGamesOf(name: string): { id: number; date: string; state: GameState }[] {
  const rows = db
    .prepare(
      `SELECT g.id, g.state_json, g.updated_at FROM games g
        WHERE g.status = 'finished' AND EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id = g.id AND gp.name = ?)
        ORDER BY g.updated_at`,
    )
    .all(name) as { id: number; state_json: string; updated_at: string }[];
  return rows.map((g) => ({ id: g.id, date: g.updated_at, state: JSON.parse(g.state_json) as GameState }));
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

// ——— salons en ligne ———

export function insertRoom(gameId: number, meta: RoomMeta) {
  db.prepare('INSERT INTO rooms (code, game_id, seats_json) VALUES (?, ?, ?)').run(meta.code, gameId, JSON.stringify(meta.seats));
}

export function getRoom(code: string): { gameId: number; meta: RoomMeta } | null {
  const row = db.prepare('SELECT game_id, seats_json FROM rooms WHERE code = ?').get(code) as
    | { game_id: number; seats_json: string }
    | undefined;
  return row ? { gameId: row.game_id, meta: { code, seats: JSON.parse(row.seats_json) } } : null;
}

export function roomOfGame(gameId: number): string | null {
  const row = db.prepare('SELECT code FROM rooms WHERE game_id = ?').get(gameId) as { code: string } | undefined;
  return row?.code ?? null;
}

/** Un invité a pris sa place (ou l'ordinateur la reprend) : on garde son jeton, le nom et le contrôle du héros. */
export function saveSeats(gameId: number, meta: RoomMeta, state: GameState) {
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE rooms SET seats_json = ? WHERE game_id = ?').run(JSON.stringify(meta.seats), gameId);
    db.prepare('UPDATE games SET state_json = ? WHERE id = ?').run(JSON.stringify(state), gameId);
    const upd = db.prepare('UPDATE game_players SET name = ?, is_bot = ? WHERE game_id = ? AND seat = ?');
    for (const [seat, p] of state.players.entries()) upd.run(p.name, p.isBot ? 1 : 0, gameId, seat);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
