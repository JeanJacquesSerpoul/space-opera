import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CRISES, MAX_THREAT, RENOWN_GOAL, reachable } from '../../shared/engine';
import type { MessageKey } from '../../shared/i18n';
import type { Action, GameEvent, GameState } from '../../shared/types';
import { api } from '../lib/api';
import { errorText, formatEvent, useT } from '../lib/i18n';
import type { RoomClient } from '../lib/online';
import { BOT_DELAYS, usePref } from '../lib/prefs';
import { type Sound, playSfx } from '../lib/sfx';
import { useTurnAlert } from '../lib/turnAlert';
import { PLAYER_FILL } from '../lib/theme';
import { Brand } from './Brand';
import { DiceOverlay } from './Dice';
import { Dialog } from './Dialog';
import { EndScreen } from './EndScreen';
import { ActionPanel, CrewBar, HeroSheet, ShopDialog, SystemInfo } from './HeroPanel';
import { ReactButton, ReactionBubbles, RoomButton, ToBotButton, canGiveToBot } from './Room';
import { StarMap } from './StarMap';
import { Coach } from './Tutorial';

/** Événements signalés par une notification. */
const NOTABLE = new Set<GameEvent['kind']>(['levelUp', 'ko', 'crisis', 'boss', 'loot', 'discovery']);

function ThreatTrack({ threat }: { threat: number }) {
  const { t } = useT();
  return (
    <div className="threat" title={t('game.threatHint', { max: MAX_THREAT, crises: CRISES.join(', ') })}>
      <span className="threat-label">☣ {t('game.threat')}</span>
      <div className="threat-track">
        {Array.from({ length: MAX_THREAT }, (_, i) => (
          <i key={i} className={`${i < threat ? 'on' : ''} ${CRISES.includes(i + 1) ? 'crisis' : ''}`} />
        ))}
      </div>
      <span className="threat-val">
        {threat}/{MAX_THREAT}
      </span>
    </div>
  );
}

type SideTab = 'actions' | 'hero' | 'crew' | 'log';
const SIDE_TABS: SideTab[] = ['actions', 'hero', 'crew', 'log'];

/** Journal de bord, du plus récent au plus ancien. */
function LogList({ state }: { state: GameState }) {
  const { t, lang } = useT();
  return (
    <ol className="log-list">
      {[...state.events].reverse().map((e) => (
        <li key={e.seq} style={{ '--c': PLAYER_FILL[state.players[e.seat]?.color ?? 'cyan'] } as React.CSSProperties}>
          {formatEvent(e, state, t, lang)}
        </li>
      ))}
    </ol>
  );
}

export function Game({
  id,
  room,
  onExit,
  onNewGame,
  onRules,
  onSettings,
}: {
  id: number;
  /** Partie en ligne : coups envoyés au salon, une seule place jouée sur cet appareil. */
  room?: RoomClient;
  onExit: () => void;
  onNewGame: () => void;
  onRules: () => void;
  onSettings: () => void;
}) {
  const { t, lang } = useT();
  const mySeat = room?.me?.seat ?? null;
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewSeat, setViewSeat] = useState<number | null>(null);
  const [shop, setShop] = useState(false);
  const [showLog, setShowLog] = useState(false);
  // téléphone : onglet du tiroir du bas, et tiroir agrandi ou non
  const [tab, setTab] = useState<SideTab>('actions');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showEnd, setShowEnd] = useState(true);
  const [dice, setDice] = useState<GameEvent | null>(null);
  const [toasts, setToasts] = useState<GameEvent[]>([]);
  const [rush, setRush] = useState(false);
  // jeu à plusieurs sur un appareil : on attend que le joueur suivant prenne la main
  const [gate, setGate] = useState<number | null>(null);
  const lastSeq = useRef(0);
  const lastHuman = useRef<number | null>(null);
  const diceOn = usePref('dice');
  const botSpeed = usePref('botSpeed');
  const tRef = useRef(t);
  tRef.current = t;

  const checkGate = useCallback(
    (s: GameState) => {
      // en ligne, chacun joue sur son appareil : personne à qui passer la main
      if (room) return;
      const humans = s.players.filter((p) => !p.isBot).length;
      const seat = s.current;
      if (s.phase !== 'playing' || s.players[seat].isBot) return;
      if (humans > 1 && lastHuman.current !== null && lastHuman.current !== seat) setGate(seat);
      else lastHuman.current = seat;
    },
    [room],
  );

  useEffect(() => {
    if (room) {
      lastSeq.current = room.state.eventSeq;
      setState(room.state);
      return;
    }
    api
      .getGame(id)
      .then(({ state: s }) => {
        lastSeq.current = s.eventSeq;
        lastHuman.current = s.players[s.current].isBot ? null : s.current;
        setState(s);
      })
      .catch((e) => setError(errorText(e, tRef.current)));
  }, [id, room]);

  const receive = useCallback(
    (next: GameState) => {
      const fresh = next.events.filter((e) => e.seq > lastSeq.current);
      lastSeq.current = next.eventSeq;
      const rolled = [...fresh].reverse().find((e) => e.roll);
      if (rolled && diceOn) setDice(rolled);
      // un seul son par mise à jour, le plus marquant (le dé animé joue les siens)
      const kinds = new Set(fresh.map((e) => e.kind));
      const sound: Sound | null = kinds.has('end')
        ? 'victory'
        : kinds.has('crisis') || kinds.has('boss')
          ? 'crisis'
          : kinds.has('levelUp')
            ? 'levelUp'
            : rolled && !diceOn
              ? rolled.roll!.success
                ? 'success'
                : 'fail'
              : kinds.has('move')
                ? 'jump'
                : null;
      if (sound) playSfx(sound);
      const notable = fresh.filter((e) => NOTABLE.has(e.kind));
      if (notable.length) {
        setToasts((ts) => [...ts, ...notable].slice(-4));
        setTimeout(() => setToasts((ts) => ts.filter((x) => !notable.includes(x))), 4200);
      }
      checkGate(next);
      setState(next);
    },
    [diceOn, checkGate],
  );

  // salon : chaque mise à jour reçue en direct (coups des autres joueurs, ordinateurs, places)
  const receiveRef = useRef(receive);
  receiveRef.current = receive;
  useEffect(() => {
    if (!room) return;
    let shown = room.state;
    return room.subscribe(() => {
      if (room.state === shown) return;
      shown = room.state;
      receiveRef.current(room.state);
    });
  }, [room]);

  const act = async (action: Action) => {
    if (!state || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (room) await room.act(action);
      else receive((await api.act(id, state.current, action)).state);
      if (action.type !== 'buy' && action.type !== 'move') setShop(false);
      if (action.type === 'move') setSelected(null);
    } catch (e) {
      setError(errorText(e, t));
      playSfx('error');
    } finally {
      setBusy(false);
    }
  };

  // tour des ordinateurs (dans un salon avec serveur, c'est le serveur qui les fait jouer)
  const current = state?.players[state.current];
  const drivesBots = !room || room.drivesBots;
  useEffect(() => {
    if (!drivesBots || state?.phase !== 'playing' || !current?.isBot || dice || busy) return;
    const timer = setTimeout(
      () => {
        (room ? room.bot() : api.bot(id).then(({ state: next }) => receive(next))).catch((e) =>
          setError(errorText(e, tRef.current)),
        );
      },
      rush ? 0 : BOT_DELAYS[botSpeed],
    );
    return () => clearTimeout(timer);
  }, [state, current, drivesBots, dice, busy, rush, botSpeed, id, room, receive]);

  // « Accélérer » ne vaut que jusqu'au prochain tour humain ; la fiche suit le joueur actif
  const currentSeat = state?.current;
  const currentIsBot = current?.isBot;
  useEffect(() => {
    if (currentSeat === undefined) return;
    if (!currentIsBot) setRush(false);
    setViewSeat(null);
  }, [currentSeat, currentIsBot]);

  // héros joués sur cet appareil : en ligne, sa place seulement
  const isLocal = (seat: number) => (room ? seat === mySeat : !state?.players[seat].isBot);
  const localTurn = !!state && isLocal(state.current);
  const canAct = !!state && state.phase === 'playing' && localTurn && !busy && gate === null && !dice;
  // en ligne : prévenir quand c'est à cet appareil de jouer
  useTurnAlert(!!room && localTurn && state?.phase === 'playing');
  // téléphone : le tiroir montre les actions dès que c'est à moi
  useEffect(() => {
    if (localTurn) setTab('actions');
  }, [localTurn]);
  const reach = useMemo(() => (state && canAct && state.movesLeft > 0 ? reachable(state, state.current) : null), [state, canAct]);

  if (!state || !current) {
    return (
      <div className="screen loading">
        <p>{error ?? t('game.loading')}</p>
        {error && (
          <button type="button" className="btn" onClick={onExit}>
            {t('game.exit')}
          </button>
        )}
      </div>
    );
  }

  const onSystem = (sysId: string) => {
    if (canAct && reach?.has(sysId) && sysId !== current.pos) {
      act({ type: 'move', to: sysId });
      return;
    }
    setSelected((s) => (s === sysId ? null : sysId));
    setTab('actions');
  };

  const viewed = state.players[viewSeat ?? state.current];
  const finished = state.phase === 'finished';
  const botDiceDelay = rush ? 250 : BOT_DELAYS[botSpeed] * 1.4 + 700;
  const seatInfo = room?.seats[state.current];
  const banner = current.isBot
    ? t('game.thinking', { name: current.name })
    : localTurn
      ? t('game.turnOf', { name: current.name })
      : seatInfo && !seatInfo.claimed
        ? t('room.waitingGuest', { name: current.name })
        : t('room.waiting', { name: current.name });

  return (
    <div className="screen game">
      <header className="topbar">
        <button type="button" className="btn ghost small" onClick={onExit} aria-label={t('game.exit')}>
          ←
        </button>
        <Brand compact />
        <span className="round">{t('game.round', { n: state.round })}</span>
        <ThreatTrack threat={state.threat} />
        <span className="goal small muted">{t('game.goal', { goal: RENOWN_GOAL })}</span>
        <div className="topbar-tools">
          {room && <ReactButton room={room} />}
          {room && <RoomButton room={room} />}
          <button type="button" className="btn ghost small" onClick={() => setShowLog(true)} aria-label={t('game.log')}>
            📜
          </button>
          <button type="button" className="btn ghost small" onClick={onRules} aria-label={t('home.rules')}>
            ?
          </button>
          <button type="button" className="btn ghost small" onClick={onSettings} aria-label={t('home.settings')}>
            ⚙
          </button>
        </div>
      </header>

      <div className="game-body">
        <div className="map-area">
          <StarMap state={state} reach={reach} selected={selected} onSystem={onSystem} />
          {!finished && (
            <div className="turn-banner" style={{ '--c': PLAYER_FILL[current.color] } as React.CSSProperties}>
              <span className="dot" />
              {banner}
              {room && !localTurn && canGiveToBot(room, seatInfo) && (
                <ToBotButton room={room} seat={state.current} className="ghost" />
              )}
              {current.isBot && drivesBots && !rush && (
                <button type="button" className="btn ghost small" onClick={() => setRush(true)}>
                  ⏩ {t('game.speedUp')}
                </button>
              )}
            </div>
          )}
          {room && <ReactionBubbles room={room} />}
          {!room && (
            <Coach
              gameId={id}
              state={state}
              viewer={Math.max(
                0,
                state.players.findIndex((p) => !p.isBot),
              )}
            />
          )}
          <div className="toasts" aria-live="polite">
            <AnimatePresence>
              {toasts.map((e) => (
                <motion.div
                  key={e.seq}
                  className={`toast ${e.kind}`}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                >
                  {formatEvent(e, state, t, lang)}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <aside className={`side ${drawerOpen ? 'open' : ''}`} data-tab={tab}>
          {/* téléphone : tiroir à onglets ; sur ordinateur, tout reste visible l'un sous l'autre */}
          <div className="side-tabs" role="tablist" aria-label={t('game.panel')}>
            <button
              type="button"
              className="drawer-handle"
              aria-label={drawerOpen ? t('game.drawerClose') : t('game.drawerOpen')}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((o) => !o)}
            >
              <i />
            </button>
            {SIDE_TABS.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={tab === k ? 'on' : ''}
                onClick={() => {
                  if (tab === k) setDrawerOpen((o) => !o);
                  setTab(k);
                }}
              >
                {t(`game.tab.${k}` as MessageKey)}
                {k === 'actions' && localTurn && !finished && <span className="tab-dot" aria-hidden />}
              </button>
            ))}
          </div>
          <div className="side-pane" data-pane="crew">
            <CrewBar
              state={state}
              onPick={(seat) => {
                setViewSeat(seat === viewSeat ? null : seat);
                setTab('hero');
              }}
            />
          </div>
          <div className="side-pane" data-pane="actions">
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {selected && selected !== current.pos && (
              <SystemInfo state={state} system={selected} onClose={() => setSelected(null)} />
            )}
            {!finished && localTurn && <ActionPanel state={state} canAct={canAct} onAct={act} onShop={() => setShop(true)} />}
            {!finished && !localTurn && <p className="muted wait-note">⏳ {t('game.waitActions')}</p>}
            {finished && !showEnd && (
              <button type="button" className="btn primary" onClick={() => setShowEnd(true)}>
                🏆 {t('end.title')}
              </button>
            )}
          </div>
          <div className="side-pane" data-pane="hero">
            <HeroSheet hero={viewed} />
          </div>
          <div className="side-pane" data-pane="log">
            <LogList state={state} />
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {shop && <ShopDialog key="shop" state={state} canAct={canAct} onAct={act} onClose={() => setShop(false)} />}
        {showLog && (
          <Dialog key="log" title={t('game.log')} onClose={() => setShowLog(false)} className="log">
            <LogList state={state} />
          </Dialog>
        )}
        {dice && (
          <DiceOverlay
            key={`dice-${dice.seq}`}
            event={dice}
            state={state}
            autoClose={isLocal(dice.seat) ? undefined : botDiceDelay}
            onDone={() => setDice(null)}
          />
        )}
        {gate !== null && !dice && (
          <motion.div
            key="gate"
            className="backdrop gate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="dialog gate-card" style={{ '--c': PLAYER_FILL[state.players[gate].color] } as React.CSSProperties}>
              <h2>{t('game.passDevice', { name: state.players[gate].name })}</h2>
              <button
                type="button"
                className="btn primary big"
                onClick={() => {
                  lastHuman.current = gate;
                  setGate(null);
                }}
              >
                {t('game.ready')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {finished && showEnd && !dice && (
        <EndScreen state={state} onClose={() => setShowEnd(false)} onNewGame={onNewGame} onHome={onExit} />
      )}
    </div>
  );
}
