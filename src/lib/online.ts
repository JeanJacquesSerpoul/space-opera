import type { DataConnection, Peer } from 'peerjs';
import {
  type PeerReply,
  type PeerRequest,
  type RoomEvent,
  type RoomIdentity,
  type RoomMeta,
  type SeatInfo,
  authorize,
  joinSeat,
  seatInfos,
  seatOfToken,
} from '../../shared/online';
import type { Action, GameState, HeroConfig } from '../../shared/types';
import { OFFLINE, call } from './api';
import { localApi } from './localApi';

/**
 * Salons en ligne, vus depuis l'interface. Deux transports pour le même jeu :
 * - avec le serveur : coups envoyés à l'API, mises à jour reçues par WebSocket ;
 * - sur la démo statique (GitHub Pages) : pair-à-pair WebRTC (PeerJS), la partie
 *   tourne dans le navigateur de l'hôte, qui valide les coups et fait jouer les ordinateurs.
 */

export type LinkStatus = 'online' | 'connecting' | 'offline';

export interface RoomClient {
  readonly code: string;
  readonly role: 'host' | 'guest';
  /** Ma place dans le salon (null tant que l'invité n'a pas choisi). */
  me: RoomIdentity | null;
  state: GameState;
  seats: SeatInfo[];
  /** Identifiant de la partie quand elle est enregistrée ici (serveur, ou hôte pair-à-pair). */
  gameId: number | null;
  /** Cet appareil fait jouer les ordinateurs (hôte pair-à-pair ; le serveur s'en charge sinon). */
  readonly drivesBots: boolean;
  link: LinkStatus;
  /** Erreur durable (salon fermé, hôte parti…). */
  fatal: string | null;
  join(seat: number, name: string): Promise<void>;
  act(action: Action): Promise<void>;
  bot(): Promise<void>;
  /** Prévenu à chaque changement (partie, places, connexion). */
  subscribe(fn: () => void): () => void;
  close(): void;
}

// ——— identités gardées dans le navigateur (pour revenir dans son salon) ———

const IDS_KEY = 'so.rooms.v1';

function loadIds(): Record<string, RoomIdentity> {
  try {
    return JSON.parse(localStorage.getItem(IDS_KEY) ?? '{}') as Record<string, RoomIdentity>;
  } catch {
    return {};
  }
}

export function identityOf(code: string): RoomIdentity | null {
  return loadIds()[code] ?? null;
}

/** Salons connus de cet appareil (créés ou rejoints), du plus récent au plus ancien. */
export function listIdentities(): RoomIdentity[] {
  return Object.values(loadIds()).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

export function forgetIdentity(code: string) {
  const ids = loadIds();
  delete ids[code];
  try {
    localStorage.setItem(IDS_KEY, JSON.stringify(ids));
  } catch {
    /* stockage indisponible */
  }
}

function saveIdentity(id: RoomIdentity) {
  try {
    localStorage.setItem(IDS_KEY, JSON.stringify({ ...loadIds(), [id.code]: { ...id, at: Date.now() } }));
  } catch {
    /* navigation privée : l'identité reste valable le temps de la page */
  }
}

export function roomLink(code: string): string {
  return `${location.origin}${location.pathname}#/salon/${code}`;
}

function failure(code: string, message = code) {
  return Object.assign(new Error(message), { code });
}

/** Crée une partie en ligne dont cet appareil est l'hôte ; renvoie le code du salon. */
export async function createRoom(players: HeroConfig[]): Promise<string> {
  if (OFFLINE) {
    const { id, meta, hostToken } = await localApi.createRoom(players);
    saveIdentity({ code: meta.code, token: hostToken, seat: 0, role: 'host', gameId: id });
    return meta.code;
  }
  const r = await call<{ id: number; room: { code: string; token: string; seat: number } }>('/api/games', {
    method: 'POST',
    body: JSON.stringify({ players, online: true }),
  });
  saveIdentity({ code: r.room.code, token: r.room.token, seat: 0, role: 'host', gameId: r.id });
  return r.room.code;
}

export function openRoom(code: string): Promise<RoomClient> {
  const me = identityOf(code);
  if (!OFFLINE) return openServerRoom(code, me);
  return me?.role === 'host' && me.gameId !== undefined ? openPeerHost(code, me) : openPeerGuest(code, me);
}

/** Base commune : état, abonnés, et mise à jour sans revenir en arrière. */
abstract class BaseRoom {
  me: RoomIdentity | null;
  state!: GameState;
  seats: SeatInfo[] = [];
  gameId: number | null = null;
  link: LinkStatus = 'connecting';
  fatal: string | null = null;
  protected closed = false;
  private listeners = new Set<() => void>();

  constructor(
    readonly code: string,
    me: RoomIdentity | null,
  ) {
    this.me = me;
  }

  get role(): 'host' | 'guest' {
    return this.me?.role ?? 'guest';
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  protected emit() {
    for (const fn of this.listeners) fn();
  }

  /** Les messages peuvent se croiser : on ignore un état plus ancien que celui affiché. */
  protected setState(state: GameState, seats?: SeatInfo[]) {
    if (!this.state || state.eventSeq >= this.state.eventSeq) this.state = state;
    if (seats) this.seats = seats;
    this.emit();
  }

  protected setLink(link: LinkStatus) {
    if (this.link === link) return;
    this.link = link;
    this.emit();
  }
}

// ——— avec le serveur ———

class ServerRoom extends BaseRoom implements RoomClient {
  readonly drivesBots = false;
  private ws: WebSocket | null = null;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  connect() {
    if (this.closed) return;
    this.ws?.close();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const token = this.me ? `&token=${this.me.token}` : '';
    const ws = new WebSocket(`${proto}://${location.host}/ws?room=${this.code}${token}`);
    this.ws = ws;
    this.setLink('connecting');
    ws.onopen = () => {
      this.retry = 0;
      this.setLink('online');
    };
    ws.onmessage = (msg) => {
      const e = JSON.parse(String(msg.data)) as RoomEvent;
      if (e.t === 'room' || e.t === 'state') this.setState(e.state, e.seats);
      else if (e.t === 'seats') {
        this.seats = e.seats;
        this.emit();
      } else if (e.t === 'error') {
        this.fatal = e.code;
        this.emit();
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws || this.closed || this.fatal) return;
      // reconnexion progressive (réseau mobile, mise en veille…)
      this.setLink('offline');
      this.retry = Math.min(this.retry + 1, 6);
      this.retryTimer = setTimeout(() => this.connect(), 500 * 2 ** this.retry);
    };
  }

  async join(seat: number, name: string) {
    const r = await call<{ token: string; seat: number; state: GameState; seats: SeatInfo[] }>(`/api/rooms/${this.code}/join`, {
      method: 'POST',
      body: JSON.stringify({ seat, name, token: this.me?.role === 'guest' ? this.me.token : undefined }),
    });
    this.me = { code: this.code, token: r.token, seat: r.seat, role: 'guest' };
    saveIdentity(this.me);
    this.setState(r.state, r.seats);
    // nouvelle connexion avec le jeton : les autres voient qu'on est là
    this.connect();
  }

  async act(action: Action) {
    if (!this.me) throw failure('badToken');
    const r = await call<{ state: GameState; seats: SeatInfo[] }>(`/api/rooms/${this.code}/actions`, {
      method: 'POST',
      body: JSON.stringify({ token: this.me.token, seat: this.me.seat, action }),
    });
    this.setState(r.state, r.seats);
  }

  async bot() {
    /* le serveur fait jouer les ordinateurs */
  }

  close() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
  }
}

async function openServerRoom(code: string, me: RoomIdentity | null): Promise<RoomClient> {
  const r = await call<{ gameId: number; state: GameState; seats: SeatInfo[] }>(`/api/rooms/${code}`);
  const room = new ServerRoom(code, me);
  room.gameId = r.gameId;
  room.state = r.state;
  room.seats = r.seats;
  room.connect();
  return room;
}

// ——— pair-à-pair (démo statique) ———

const peerId = (code: string) => `so-space-opera-${code}`;
const PEER_OPTIONS = { debug: 0 } as const;

async function loadPeer(): Promise<typeof Peer> {
  // chargé seulement quand on joue en ligne
  return (await import('peerjs')).Peer;
}

/** L'hôte : la partie est chez lui, il valide les coups des invités et les diffuse. */
class PeerHost extends BaseRoom implements RoomClient {
  readonly drivesBots = true;
  private peer: Peer | null = null;
  private conns = new Map<DataConnection, { seat: number }>();
  private meta: RoomMeta;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string, me: RoomIdentity) {
    super(code, me);
    this.gameId = me.gameId ?? null;
    const { state, meta } = localApi.room(this.gameId!);
    this.meta = meta;
    this.state = state;
    this.refreshSeats();
  }

  private refreshSeats() {
    const connected = new Set([0, ...[...this.conns.values()].map((c) => c.seat)]);
    this.seats = seatInfos(this.meta, this.state, connected);
  }

  private send(conn: DataConnection, msg: PeerReply) {
    if (conn.open) conn.send(msg);
  }

  private broadcast() {
    this.refreshSeats();
    const msg: PeerReply = { t: 'state', state: this.state, seats: this.seats };
    for (const conn of this.conns.keys()) this.send(conn, msg);
    this.emit();
  }

  async start() {
    const PeerClass = await loadPeer();
    if (this.closed) return;
    this.setLink('connecting');
    const peer = new PeerClass(peerId(this.code), PEER_OPTIONS);
    this.peer = peer;
    peer.on('open', () => this.setLink('online'));
    peer.on('disconnected', () => {
      // perte du serveur de signalisation : les invités déjà connectés continuent
      this.setLink('offline');
      if (!this.closed && !peer.destroyed) this.retryTimer = setTimeout(() => peer.reconnect(), 3000);
    });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') return;
      this.setLink('offline');
      // identifiant encore tenu par un ancien onglet, ou réseau coupé : on recommence plus tard
      if (!this.closed && (err.type === 'unavailable-id' || err.type === 'network' || err.type === 'server-error')) {
        peer.destroy();
        this.retryTimer = setTimeout(() => void this.start(), 4000);
      }
    });
    peer.on('connection', (conn) => {
      this.conns.set(conn, { seat: -1 });
      conn.on('data', (data) => this.onRequest(conn, data as PeerRequest));
      conn.on('close', () => {
        this.conns.delete(conn);
        this.broadcast();
      });
      conn.on('error', () => conn.close());
    });
  }

  private onRequest(conn: DataConnection, req: PeerRequest) {
    const info = this.conns.get(conn);
    if (!info) return;
    try {
      if (req.t === 'hello') {
        info.seat = seatOfToken(this.meta, req.token);
        this.refreshSeats();
        this.send(conn, { t: 'ok', id: req.id, state: this.state, seats: this.seats, seat: info.seat });
        this.broadcast();
      } else if (req.t === 'join') {
        const joined = joinSeat(this.meta, this.state, req.seat, req.name, req.token);
        this.meta = joined.meta;
        this.state = joined.state;
        localApi.saveRoom(this.gameId!, this.meta, this.state);
        info.seat = req.seat;
        this.refreshSeats();
        this.send(conn, { t: 'ok', id: req.id, state: this.state, seats: this.seats, token: joined.token, seat: req.seat });
        this.broadcast();
      } else if (req.t === 'act') {
        authorize(this.meta, req.token, req.seat);
        this.state = localApi.actRoom(this.gameId!, req.seat, req.action).state;
        this.refreshSeats();
        this.send(conn, { t: 'ok', id: req.id, state: this.state, seats: this.seats });
        this.broadcast();
      }
    } catch (e) {
      const err = e as Error & { code?: string };
      this.send(conn, { t: 'fail', id: req.id, code: err.code ?? 'unknownAction', message: err.message });
    }
  }

  async join() {
    /* l'hôte a sa place dès la création */
  }

  async act(action: Action) {
    this.state = localApi.actRoom(this.gameId!, this.me!.seat, action).state;
    this.broadcast();
  }

  async bot() {
    this.state = (await localApi.bot(this.gameId!)).state;
    this.broadcast();
  }

  close() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.peer?.destroy();
  }
}

async function openPeerHost(code: string, me: RoomIdentity): Promise<RoomClient> {
  const room = new PeerHost(code, me);
  void room.start();
  return room;
}

/** Un invité : il envoie ses coups à l'hôte et reçoit l'état de la partie. */
class PeerGuest extends BaseRoom implements RoomClient {
  readonly drivesBots = false;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: PeerReply & { t: 'ok' }) => void; reject: (e: Error) => void }>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Se connecte à l'hôte ; la promesse échoue si l'hôte n'est pas joignable. */
  async connect(): Promise<void> {
    const PeerClass = await loadPeer();
    if (this.closed) return;
    this.setLink('connecting');
    this.peer?.destroy();
    const peer = new PeerClass(PEER_OPTIONS);
    this.peer = peer;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(failure('hostOffline')), 15_000);
      const fail = (code: string) => {
        clearTimeout(timeout);
        reject(failure(code));
      };
      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') fail('hostOffline');
        else fail('network');
      });
      peer.on('open', () => {
        const conn = peer.connect(peerId(this.code), { reliable: true, serialization: 'json' });
        this.conn = conn;
        conn.on('data', (data) => this.onReply(data as PeerReply));
        conn.on('close', () => this.lost(conn));
        conn.on('open', () => {
          this.request({ t: 'hello', id: 0, token: this.me?.token })
            .then((r) => {
              clearTimeout(timeout);
              // une ancienne identité qui ne correspond plus à rien (salon recréé) est oubliée
              if (this.me && r.seat !== this.me.seat) this.me = null;
              this.setState(r.state, r.seats);
              this.setLink('online');
              resolve();
            })
            .catch((e: Error & { code?: string }) => fail(e.code ?? 'network'));
        });
      });
    });
  }

  private lost(conn: DataConnection) {
    if (this.conn !== conn || this.closed) return;
    for (const p of this.pending.values()) p.reject(failure('hostOffline'));
    this.pending.clear();
    this.setLink('offline');
    // l'hôte a pu recharger sa page : on réessaie régulièrement
    const again = () => {
      if (this.closed) return;
      this.connect().catch(() => {
        this.setLink('offline');
        this.retryTimer = setTimeout(again, 4000);
      });
    };
    this.retryTimer = setTimeout(again, 2000);
  }

  private onReply(msg: PeerReply) {
    if (msg.t === 'ok' || msg.t === 'fail') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.t === 'ok') p.resolve(msg);
      else p.reject(failure(msg.code, msg.message));
    } else if (msg.t === 'state' || msg.t === 'room') this.setState(msg.state, msg.seats);
    else if (msg.t === 'seats') {
      this.seats = msg.seats;
      this.emit();
    }
  }

  private request(req: PeerRequest): Promise<PeerReply & { t: 'ok' }> {
    const conn = this.conn;
    if (!conn?.open) return Promise.reject(failure('hostOffline'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      conn.send({ ...req, id });
    });
  }

  async join(seat: number, name: string) {
    const r = await this.request({ t: 'join', id: 0, seat, name, token: this.me?.token });
    this.me = { code: this.code, token: r.token!, seat, role: 'guest' };
    saveIdentity(this.me);
    this.setState(r.state, r.seats);
  }

  async act(action: Action) {
    if (!this.me) throw failure('badToken');
    const r = await this.request({ t: 'act', id: 0, token: this.me.token, seat: this.me.seat, action });
    this.setState(r.state, r.seats);
  }

  async bot() {
    /* l'hôte fait jouer les ordinateurs */
  }

  close() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.peer?.destroy();
  }
}

async function openPeerGuest(code: string, me: RoomIdentity | null): Promise<RoomClient> {
  const room = new PeerGuest(code, me?.role === 'guest' ? me : null);
  try {
    await room.connect();
  } catch (e) {
    room.close();
    throw e;
  }
  return room;
}
