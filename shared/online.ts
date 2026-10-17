import { GameError } from './engine';
import type { Action, GameState, HeroConfig } from './types';

/**
 * Parties en ligne : un « salon » relie un hôte et des invités à une partie.
 * Le même protocole sert au serveur (WebSocket) et au mode pair-à-pair (WebRTC).
 */

/** Qui contrôle un siège : l'hôte (siège 0), un invité à distance, ou l'ordinateur. */
export type SeatKind = 'host' | 'remote' | 'bot';

export interface SeatInfo {
  seat: number;
  name: string;
  kind: SeatKind;
  /** Un invité a pris ce siège (toujours vrai pour l'hôte et les ordinateurs). */
  claimed: boolean;
  /** La personne qui contrôle ce siège est connectée en ce moment. */
  connected: boolean;
}

/** Identité d'un appareil dans un salon, gardée localement pour pouvoir revenir. */
export interface RoomIdentity {
  code: string;
  token: string;
  seat: number;
  role: 'host' | 'guest';
  /** Partie locale de l'hôte (mode pair-à-pair). */
  gameId?: number;
  /** Dernière utilisation (ms), pour lister les salons du plus récent au plus ancien. */
  at?: number;
}

/** Messages du serveur (ou de l'hôte) vers les appareils du salon. */
export type RoomEvent =
  | { t: 'room'; code: string; state: GameState; seats: SeatInfo[] }
  | { t: 'state'; state: GameState; seats: SeatInfo[] }
  | { t: 'seats'; seats: SeatInfo[] }
  | { t: 'error'; code: string; message: string };

/** Requêtes d'un invité vers l'hôte en pair-à-pair (chaque requête attend une réponse de même `id`). */
export type PeerRequest =
  | { t: 'hello'; id: number; token?: string }
  | { t: 'join'; id: number; seat: number; name: string; token?: string }
  | { t: 'act'; id: number; token: string; seat: number; action: Action };

/** Réponses de l'hôte, en plus des événements diffusés à tous. */
export type PeerReply =
  | RoomEvent
  | { t: 'ok'; id: number; state: GameState; seats: SeatInfo[]; token?: string; seat?: number }
  | { t: 'fail'; id: number; code: string; message: string };

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  // getRandomValues fonctionne aussi hors HTTPS (réseau local), contrairement à randomUUID
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Code de salon court et lisible (sans 0/O ni 1/I/L). */
export function makeRoomCode(): string {
  return [...randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function isRoomCode(code: string): boolean {
  return /^[A-Z2-9]{6}$/.test(code);
}

/** Jeton secret d'un siège (preuve qu'on a le droit d'y jouer). */
export function makeToken(): string {
  return [...randomBytes(16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** En ligne : le premier héros est celui de l'hôte, les autres héros humains attendent des invités. */
export function seatKinds(players: Pick<HeroConfig, 'isBot'>[]): SeatKind[] {
  return players.map((p, i) => (p.isBot ? 'bot' : i === 0 ? 'host' : 'remote'));
}

export function cleanName(name: unknown, fallback: string): string {
  return (
    String(name ?? '')
      .trim()
      .slice(0, 20) || fallback
  );
}

/** Ce que le serveur (ou l'hôte) garde d'un salon, en plus de la partie elle-même. */
export interface RoomMeta {
  code: string;
  /** Pour chaque siège : qui le contrôle et son jeton secret (null tant qu'il est libre, et pour l'ordinateur). */
  seats: { kind: SeatKind; token: string | null }[];
}

export function newRoom(players: Pick<HeroConfig, 'isBot'>[]): { meta: RoomMeta; hostToken: string } {
  if (players[0]?.isBot) throw new GameError('online', 'L’hôte du salon doit être un joueur humain.');
  const hostToken = makeToken();
  const seats = seatKinds(players).map((kind) => ({ kind, token: kind === 'host' ? hostToken : null }));
  return { meta: { code: makeRoomCode(), seats }, hostToken };
}

/** Siège contrôlé par ce jeton (-1 si aucun). */
export function seatOfToken(meta: RoomMeta, token: string | null | undefined): number {
  return token ? meta.seats.findIndex((s) => s.token === token) : -1;
}

/** Vérifie que le jeton autorise à jouer pour ce siège. */
export function authorize(meta: RoomMeta, token: string, seat: number) {
  if (!token || meta.seats[seat]?.token !== token) throw new GameError('badToken', 'Vous ne contrôlez pas ce héros.');
}

/**
 * Un invité prend (ou reprend, avec son jeton) un siège libre et donne son nom au héros.
 * Renvoie le salon et la partie mis à jour, sans modifier ceux reçus.
 */
export function joinSeat(
  meta: RoomMeta,
  state: GameState,
  seat: number,
  name: string,
  token?: string,
): { meta: RoomMeta; state: GameState; token: string } {
  const s = meta.seats[seat];
  if (s?.kind !== 'remote') throw new GameError('seatTaken', 'Cette place n’est pas disponible.');
  if (s.token && s.token !== token) throw new GameError('seatTaken', 'Cette place est déjà prise.');
  // un appareil ne garde qu'une place : il quitte l'ancienne s'il change
  const mine = token ?? makeToken();
  const seats = meta.seats.map((x, i) => (i === seat ? { ...x, token: mine } : x.token === mine ? { ...x, token: null } : x));
  const players = state.players.map((p, i) => (i === seat ? { ...p, name: cleanName(name, p.name) } : p));
  return { meta: { ...meta, seats }, state: { ...state, players }, token: mine };
}

export function seatInfos(meta: RoomMeta, state: GameState, connected: Set<number>): SeatInfo[] {
  return meta.seats.map((s, seat) => ({
    seat,
    name: state.players[seat].name,
    kind: s.kind,
    claimed: s.kind !== 'remote' || s.token !== null,
    connected: s.kind === 'bot' || connected.has(seat),
  }));
}
