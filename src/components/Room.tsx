import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CLASSES } from '../../shared/data';
import type { MessageKey } from '../../shared/i18n';
import type { SeatInfo } from '../../shared/online';
import { errorText, useT } from '../lib/i18n';
import { type RoomClient, openRoom, roomLink } from '../lib/online';
import { saveName, savedName } from '../lib/prefs';
import { PLAYER_FILL } from '../lib/theme';
import { Starfield } from './Brand';
import { Dialog } from './Dialog';
import { Game } from './Game';

/** Suit les changements d'un salon (partie, places, connexion) pour re-dessiner. */
export function useRoom(room: RoomClient) {
  return useSyncExternalStore(
    (fn) => room.subscribe(fn),
    () => `${room.state.eventSeq}|${room.link}|${room.fatal}|${room.me?.seat}|${JSON.stringify(room.seats)}`,
  );
}

interface ScreenProps {
  onExit: () => void;
  onNewGame: () => void;
  onRules: () => void;
  onSettings: () => void;
}

/** Écran d'un salon (#/salon/CODE) : connexion, choix de sa place, puis la partie. */
export function RoomScreen({ code, ...props }: ScreenProps & { code: string }) {
  const { t } = useT();
  const [room, setRoom] = useState<RoomClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: connexion liée au code et aux nouvelles tentatives, pas à la langue
  useEffect(() => {
    let alive = true;
    let opened: RoomClient | null = null;
    setError(null);
    openRoom(code)
      .then((r) => {
        opened = r;
        if (alive) setRoom(r);
        else r.close();
      })
      .catch((e) => alive && setError(errorText(e, t)));
    return () => {
      alive = false;
      opened?.close();
    };
  }, [code, attempt]);

  if (!room) {
    return (
      <div className="screen loading">
        <p>{error ?? t('room.connecting', { code })}</p>
        {error && (
          <div className="home-actions">
            <button type="button" className="btn primary" onClick={() => setAttempt((n) => n + 1)}>
              {t('room.retry')}
            </button>
            <button type="button" className="btn" onClick={props.onExit}>
              {t('setup.back')}
            </button>
          </div>
        )}
      </div>
    );
  }
  return <RoomView room={room} {...props} />;
}

function RoomView({ room, ...props }: ScreenProps & { room: RoomClient }) {
  const { t } = useT();
  useRoom(room);
  if (room.fatal) {
    return (
      <div className="screen loading">
        <p>{t(`error.${room.fatal}` as MessageKey)}</p>
        <button type="button" className="btn" onClick={props.onExit}>
          {t('setup.back')}
        </button>
      </div>
    );
  }
  if (!room.me) return <JoinRoom room={room} onExit={props.onExit} />;
  return <Game id={room.gameId ?? 0} room={room} {...props} />;
}

/** Un invité arrive par le lien : il choisit un héros libre et donne son nom. */
function JoinRoom({ room, onExit }: { room: RoomClient; onExit: () => void }) {
  const { t } = useT();
  const free = room.seats.filter((s) => s.kind === 'remote' && !s.claimed);
  const [seat, setSeat] = useState<number | null>(free[0]?.seat ?? null);
  const [name, setName] = useState(() => savedName(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = room.seats.find((s) => s.kind === 'host');
  const open = room.state.phase !== 'finished' && free.length > 0;

  // la place choisie vient d'être prise par quelqu'un d'autre
  useEffect(() => {
    if (seat !== null && !free.some((s) => s.seat === seat)) setSeat(free[0]?.seat ?? null);
  }, [free, seat]);

  const join = async () => {
    if (seat === null) return;
    setBusy(true);
    setError(null);
    try {
      if (name.trim()) saveName(name.trim());
      await room.join(seat, name.trim() || room.state.players[seat].name);
    } catch (e) {
      setError(errorText(e, t));
      setBusy(false);
    }
  };

  return (
    <div className="screen setup join">
      <Starfield />
      <header className="setup-head">
        <button type="button" className="btn ghost" onClick={onExit}>
          ← {t('setup.back')}
        </button>
        <h1>{t('room.joinTitle')}</h1>
        <span />
      </header>
      <motion.div className="panel-card join-card" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <span className="room-code">{room.code}</span>
        <p>{t('room.joinIntro', { host: host?.name ?? '?' })}</p>
        <small className="muted">{t('room.joinInfo', { n: room.seats.length, round: room.state.round })}</small>
      </motion.div>

      {room.lostSeat && <p className="error center">{t('room.lostSeat')}</p>}
      {room.state.phase === 'finished' ? (
        <p className="muted center">{t('room.finished')}</p>
      ) : free.length === 0 ? (
        <p className="muted center">{t('room.full')}</p>
      ) : (
        <div className="panel-card join-form">
          <fieldset className="seat-list">
            <legend>{t('room.chooseSeat')}</legend>
            {room.seats.map((s) => (
              <SeatRow
                key={s.seat}
                room={room}
                seat={s}
                selectable={free.includes(s)}
                selected={seat === s.seat}
                onPick={setSeat}
              />
            ))}
          </fieldset>
          <label className="field">
            <span>{t('room.yourName')}</span>
            <input
              className="name-input"
              value={name}
              maxLength={20}
              placeholder={seat !== null ? room.state.players[seat].name : ''}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
      )}
      {error && <p className="error center">{error}</p>}
      {open && (
        <div className="setup-foot">
          <span />
          <button type="button" className="btn primary big" disabled={busy || seat === null} onClick={join}>
            {t('room.join')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Place d'invité que l'hôte peut confier à l'ordinateur : jamais prise, ou invité parti. */
export const canGiveToBot = (room: RoomClient, seat: SeatInfo | undefined) =>
  room.role === 'host' && seat?.kind === 'remote' && !seat.connected && room.state.phase !== 'finished';

/** L'hôte confie une place à l'ordinateur (après confirmation) pour que la partie continue. */
export function ToBotButton({ room, seat, className = '' }: { room: RoomClient; seat: number; className?: string }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const name = room.state.players[seat].name;
  const give = async () => {
    if (!confirm(t('room.toBotConfirm', { name }))) return;
    setBusy(true);
    try {
      await room.giveToBot(seat);
    } catch (e) {
      alert(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      className={`btn small ${className}`}
      disabled={busy}
      onClick={give}
      aria-label={`${t('room.toBot')} : ${name}`}
    >
      🤖 {t('room.toBot')}
    </button>
  );
}

function SeatRow({
  room,
  seat,
  selectable,
  selected,
  onPick,
}: {
  room: RoomClient;
  seat: SeatInfo;
  selectable?: boolean;
  selected?: boolean;
  onPick?: (seat: number) => void;
}) {
  const { t } = useT();
  const hero = room.state.players[seat.seat];
  const mine = room.me?.seat === seat.seat;
  const role =
    seat.kind === 'bot'
      ? t('room.seatBot')
      : seat.kind === 'host'
        ? t('room.seatHost')
        : seat.claimed
          ? t('room.seatGuest')
          : t('room.seatFree');
  const presence = seat.connected ? t('room.connected') : t('room.away');
  const content = (
    <>
      <span className="hero-glyph">{CLASSES[hero.classId].glyph}</span>
      <span className="seat-text">
        <b>
          {seat.kind === 'remote' && !seat.claimed ? t('room.freeName') : seat.name}
          {mine && ` ${t('room.you')}`}
        </b>
        <small>
          {t(`class.${hero.classId}` as MessageKey)} · {role}
        </small>
      </span>
      <span role="img" className={`presence ${seat.connected ? 'on' : ''}`} title={presence} aria-label={presence} />
    </>
  );
  const style = { '--c': PLAYER_FILL[hero.color] } as React.CSSProperties;
  if (!onPick)
    return (
      <li className={`seat-row ${mine ? 'mine' : ''}`} style={style}>
        {content}
        {canGiveToBot(room, seat) && <ToBotButton room={room} seat={seat.seat} />}
      </li>
    );
  return (
    <button
      type="button"
      className={`seat-row ${selected ? 'on' : ''}`}
      style={style}
      disabled={!selectable}
      aria-pressed={selected}
      onClick={() => onPick(seat.seat)}
    >
      {content}
    </button>
  );
}

/** Bouton de la barre du haut : appareils connectés, et fenêtre du salon. */
export function RoomButton({ room }: { room: RoomClient }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  useRoom(room);
  const humans = room.seats.filter((s) => s.kind !== 'bot');
  const here = humans.filter((s) => s.connected).length;
  const waiting = room.seats.some((s) => s.kind === 'remote' && !s.claimed);
  return (
    <>
      <button
        type="button"
        className={`btn ghost small room-btn ${room.link} ${waiting ? 'waiting' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={t('room.title')}
        title={`${t('room.title')} ${room.code} · ${t(`room.link.${room.link}`)}`}
      >
        <span aria-hidden>👥</span>
        <span>
          {here}/{humans.length}
        </span>
      </button>
      {/* hors de la barre du haut, pour couvrir tout l'écran */}
      {createPortal(
        <AnimatePresence>{open && <RoomSheet key="room" room={room} onClose={() => setOpen(false)} />}</AnimatePresence>,
        document.body,
      )}
    </>
  );
}

export function RoomSheet({ room, onClose }: { room: RoomClient; onClose: () => void }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  useRoom(room);
  const link = roomLink(room.code);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t('room.copyManual'), link);
    }
  };
  const share = () =>
    navigator.share?.({ title: t('brand.full'), text: t('room.shareText', { code: room.code }), url: link }).catch(() => {});

  return (
    <Dialog title={t('room.title')} onClose={onClose} className="room-sheet">
      <p className={`link-status ${room.link}`}>{t(`room.link.${room.link}`)}</p>
      <div className="room-sheet-code">
        <span className="muted small">{t('room.code')}</span>
        <b className="room-code">{room.code}</b>
      </div>
      <div className="room-sheet-link">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={t('room.link')} />
        <button type="button" className="btn primary small" onClick={copy}>
          {copied ? t('room.copied') : t('room.copy')}
        </button>
        {typeof navigator.share === 'function' && (
          <button type="button" className="btn small" onClick={share}>
            {t('room.share')}
          </button>
        )}
      </div>
      <p className="muted small">{room.drivesBots ? t('room.hintPeer') : t('room.hint')}</p>
      {room.seats.some((s) => canGiveToBot(room, s)) && <p className="muted small">{t('room.toBotHint')}</p>}
      <ul className="seat-list">
        {room.seats.map((s) => (
          <SeatRow key={s.seat} room={room} seat={s} />
        ))}
      </ul>
    </Dialog>
  );
}
