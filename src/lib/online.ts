import type { DataConnection, Peer } from 'peerjs';
import {
  type HeroChoice,
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
  seatToBot,
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
  /** L'hôte a confié la place de cet invité à l'ordinateur. */
  lostSeat: boolean;
  /** Invité : prend une place, avec le nom (et éventuellement la classe et l'espèce) de son héros. */
  join(seat: number, name: string, hero?: HeroChoice): Promise<void>;
  act(action: Action): Promise<void>;
  bot(): Promise<void>;
  /** Hôte seulement : une place d'invité libre ou abandonnée est désormais jouée par l'ordinateur. */
  giveToBot(seat: number): Promise<void>;
  /** Prévenu à chaque changement (partie, places, connexion). */
  subscribe(fn: () => void): () => void;
  close(): void;
}

// ——— identités gardées dans le navigateur (pour revenir dans son salon) ———
//
// Un appareil peut tenir plusieurs places d'un même salon (un onglet hôte, un onglet invité…).
// Chaque onglet réserve l'identité qu'il utilise (verrou du navigateur) : un deuxième onglet
// ne reprend pas la place du premier, il prend une autre identité connue ou arrive comme invité.

const IDS_KEY = 'so.rooms.v2';
const OLD_IDS_KEY = 'so.rooms.v1';

function loadIds(): Record<string, RoomIdentity[]> {
  try {
    const raw = localStorage.getItem(IDS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, RoomIdentity[]>;
    // ancienne version : une seule identité par salon
    const old = JSON.parse(localStorage.getItem(OLD_IDS_KEY) ?? '{}') as Record<string, RoomIdentity>;
    return Object.fromEntries(Object.entries(old).map(([code, id]) => [code, [id]]));
  } catch {
    return {};
  }
}

function storeIds(ids: Record<string, RoomIdentity[]>) {
  try {
    localStorage.setItem(IDS_KEY, JSON.stringify(ids));
  } catch {
    /* navigation privée : l'identité reste valable le temps de la page */
  }
}

/** Identités de cet appareil dans un salon, de la plus récente à la plus ancienne. */
export function identitiesOf(code: string): RoomIdentity[] {
  return [...(loadIds()[code] ?? [])].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

/** Salons connus de cet appareil (créés ou rejoints), du plus récent au plus ancien. */
export function listRooms(): { code: string; ids: RoomIdentity[]; at: number }[] {
  return Object.keys(loadIds())
    .map((code) => {
      const ids = identitiesOf(code);
      return { code, ids, at: ids[0]?.at ?? 0 };
    })
    .filter((r) => r.ids.length > 0)
    .sort((a, b) => b.at - a.at);
}

/** Oublie une identité (par son jeton), ou toutes celles du salon. */
export function forgetIdentity(code: string, token?: string) {
  const ids = loadIds();
  const rest = token ? (ids[code] ?? []).filter((id) => id.token !== token) : [];
  if (rest.length) ids[code] = rest;
  else delete ids[code];
  storeIds(ids);
}

function saveIdentity(id: RoomIdentity) {
  const ids = loadIds();
  ids[id.code] = [...(ids[id.code] ?? []).filter((x) => x.token !== id.token), { ...id, at: Date.now() }];
  storeIds(ids);
}

// ——— réservation d'une identité par onglet ———

interface Claim {
  release: () => void;
  /** Écrans de cet onglet qui utilisent l'identité. */
  count: number;
  timer?: ReturnType<typeof setTimeout>;
}
/** Identités réservées par cet onglet (par jeton). */
const claims = new Map<string, Claim>();
/** Demandes de réservation en cours (deux écrans peuvent la demander en même temps). */
const pending = new Map<string, Promise<boolean>>();
/** Repli sans Web Locks (page servie en http sur le réseau local) : on demande aux autres onglets. */
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('so.rooms') : null;
const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
type ClaimMsg = { t: 'who'; token: string; ask: string } | { t: 'mine'; ask: string };
if (channel && !locks) {
  channel.onmessage = (e: MessageEvent<ClaimMsg>) => {
    if (e.data.t === 'who' && claims.has(e.data.token)) channel.postMessage({ t: 'mine', ask: e.data.ask } satisfies ClaimMsg);
  };
}

/** Demande l'identité pour cet onglet ; faux si un autre onglet la tient. */
async function acquire(token: string): Promise<boolean> {
  if (locks) {
    return new Promise<boolean>((resolve) => {
      locks
        .request(`so.room.${token}`, { ifAvailable: true }, (lock) => {
          if (!lock) return resolve(false);
          // le verrou dure tant que la promesse n'est pas résolue (ou que l'onglet est ouvert)
          return new Promise<void>((release) => {
            claims.set(token, { release, count: 0 });
            resolve(true);
          });
        })
        .catch(() => {
          claims.set(token, { release: () => {}, count: 0 });
          resolve(true);
        });
    });
  }
  if (channel) {
    const ask = Math.random().toString(36).slice(2);
    const taken = await new Promise<boolean>((resolve) => {
      const onReply = (e: MessageEvent<ClaimMsg>) => {
        if (e.data.t === 'mine' && e.data.ask === ask) done(true);
      };
      const done = (v: boolean) => {
        channel.removeEventListener('message', onReply);
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => done(false), 250);
      channel.addEventListener('message', onReply);
      channel.postMessage({ t: 'who', token, ask } satisfies ClaimMsg);
    });
    if (taken) return false;
  }
  claims.set(token, { release: () => {}, count: 0 });
  return true;
}

/** Réserve une identité pour un écran de cet onglet ; faux si un autre onglet l'utilise déjà. */
async function claim(token: string): Promise<boolean> {
  if (!claims.has(token)) {
    let request = pending.get(token);
    if (!request) {
      request = acquire(token);
      pending.set(token, request);
      void request.finally(() => pending.delete(token));
    }
    if (!(await request)) return false;
  }
  const held = claims.get(token);
  if (!held) return claim(token); // libérée entre-temps : on redemande
  held.count += 1;
  if (held.timer) clearTimeout(held.timer);
  held.timer = undefined;
  return true;
}

/** Libère l'identité un peu plus tard : l'écran peut la reprendre aussitôt (double montage de React). */
function release(token: string) {
  const held = claims.get(token);
  if (!held) return;
  held.count = Math.max(0, held.count - 1);
  if (held.count > 0 || held.timer) return;
  held.timer = setTimeout(() => {
    if (held.count > 0) return;
    claims.delete(token);
    held.release();
  }, 1500);
}

/** Première identité connue de ce salon que personne d'autre n'utilise sur cet appareil. */
async function pickIdentity(code: string): Promise<RoomIdentity | null> {
  for (const id of identitiesOf(code)) if (await claim(id.token)) return id;
  return null;
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
    saveIdentity({ code: meta.code, token: hostToken, seat: 0, role: 'host', gameId: id, name: players[0].name });
    return meta.code;
  }
  const r = await call<{ id: number; room: { code: string; token: string; seat: number } }>('/api/games', {
    method: 'POST',
    body: JSON.stringify({ players, online: true }),
  });
  saveIdentity({ code: r.room.code, token: r.room.token, seat: 0, role: 'host', gameId: r.id, name: players[0].name });
  return r.room.code;
}

export async function openRoom(code: string): Promise<RoomClient> {
  const me = await pickIdentity(code);
  try {
    if (!OFFLINE) return await openServerRoom(code, me);
    if (me?.role === 'host' && me.gameId !== undefined) return await openPeerHost(code, me);
  } catch (e) {
    // le salon n'a pas pu s'ouvrir : l'identité redevient libre
    if (me) release(me.token);
    throw e;
  }
  // hôte sans partie locale (créée sur un autre appareil) : on arrive comme invité
  if (me && me.role !== 'guest') release(me.token);
  // en cas d'échec, le salon refermé libère lui-même l'identité
  return openPeerGuest(code, me?.role === 'guest' ? me : null);
}

/** Base commune : état, abonnés, et mise à jour sans revenir en arrière. */
abstract class BaseRoom {
  me: RoomIdentity | null;
  state!: GameState;
  seats: SeatInfo[] = [];
  gameId: number | null = null;
  link: LinkStatus = 'connecting';
  fatal: string | null = null;
  lostSeat = false;
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

  /** Change l'identité de cet onglet dans le salon (réservée pour lui, l'ancienne est libérée). */
  protected setMe(me: RoomIdentity | null) {
    if (this.me?.token !== me?.token) {
      if (this.me) release(this.me.token);
      if (me) void claim(me.token);
    }
    this.me = me;
  }

  private released = false;

  protected releaseMe() {
    if (this.me && !this.released) release(this.me.token);
    this.released = true;
  }

  protected emit() {
    for (const fn of this.listeners) fn();
  }

  /** Les messages peuvent se croiser : on ignore un état plus ancien que celui affiché. */
  protected setState(state: GameState, seats?: SeatInfo[]) {
    if (!this.state || state.eventSeq >= this.state.eventSeq) this.state = state;
    if (seats) this.setSeats(seats);
    this.emit();
  }

  /** Places du salon : un invité dont la place a été confiée à l'ordinateur la perd. */
  setSeats(seats: SeatInfo[]) {
    this.seats = seats;
    const mine = this.me?.role === 'guest' ? seats[this.me.seat] : undefined;
    if (mine && mine.kind !== 'remote') {
      forgetIdentity(this.code, this.me?.token);
      this.setMe(null);
      this.lostSeat = true;
    }
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
        this.setSeats(e.seats);
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

  async join(seat: number, name: string, hero?: HeroChoice) {
    const r = await call<{ token: string; seat: number; state: GameState; seats: SeatInfo[] }>(`/api/rooms/${this.code}/join`, {
      method: 'POST',
      body: JSON.stringify({ seat, name, ...hero, token: this.me?.role === 'guest' ? this.me.token : undefined }),
    });
    this.setMe({ code: this.code, token: r.token, seat: r.seat, role: 'guest', name: r.state.players[r.seat].name });
    saveIdentity(this.me!);
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

  async giveToBot(seat: number) {
    if (this.me?.role !== 'host') throw failure('notHost');
    const r = await call<{ state: GameState; seats: SeatInfo[] }>(`/api/rooms/${this.code}/bot-seat`, {
      method: 'POST',
      body: JSON.stringify({ token: this.me.token, seat }),
    });
    this.setState(r.state, r.seats);
  }

  close() {
    this.closed = true;
    this.releaseMe();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
  }
}

async function openServerRoom(code: string, me: RoomIdentity | null): Promise<RoomClient> {
  const r = await call<{ gameId: number; state: GameState; seats: SeatInfo[] }>(`/api/rooms/${code}`);
  const room = new ServerRoom(code, me);
  room.gameId = r.gameId;
  room.state = r.state;
  room.setSeats(r.seats);
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

  private connected() {
    return new Set([0, ...[...this.conns.values()].map((c) => c.seat)]);
  }

  private refreshSeats() {
    this.seats = seatInfos(this.meta, this.state, this.connected());
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
        const joined = joinSeat(this.meta, this.state, req.seat, req.name, req.token, req.hero);
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

  async giveToBot(seat: number) {
    const next = seatToBot(this.meta, this.state, this.me!.token, seat, this.connected());
    this.meta = next.meta;
    this.state = next.state;
    localApi.saveRoom(this.gameId!, this.meta, this.state);
    // un ancien invité encore relié (sans place) n'est plus compté comme présent
    for (const info of this.conns.values()) if (info.seat === seat) info.seat = -1;
    this.broadcast();
  }

  close() {
    this.closed = true;
    this.releaseMe();
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
              if (this.me && r.seat !== this.me.seat) {
                // place reprise par l'ordinateur pendant l'absence de cet invité
                if (r.seats[this.me.seat]?.kind === 'bot') this.lostSeat = true;
                forgetIdentity(this.code, this.me.token);
                this.setMe(null);
              }
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
      this.setSeats(msg.seats);
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

  async join(seat: number, name: string, hero?: HeroChoice) {
    const r = await this.request({ t: 'join', id: 0, seat, name, token: this.me?.token, hero });
    this.setMe({ code: this.code, token: r.token!, seat, role: 'guest', name: r.state.players[seat].name });
    saveIdentity(this.me!);
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

  async giveToBot() {
    throw failure('notHost');
  }

  close() {
    this.closed = true;
    this.releaseMe();
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
