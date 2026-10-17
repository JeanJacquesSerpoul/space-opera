import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CRISES, MAX_THREAT, RENOWN_GOAL, reachable } from '../../shared/engine';
import type { Action, GameEvent, GameState } from '../../shared/types';
import { api } from '../lib/api';
import { errorText, formatEvent, useT } from '../lib/i18n';
import { BOT_DELAYS, usePref } from '../lib/prefs';
import { PLAYER_FILL } from '../lib/theme';
import { Brand } from './Brand';
import { DiceOverlay } from './Dice';
import { Dialog } from './Dialog';
import { EndScreen } from './EndScreen';
import { ActionPanel, CrewBar, HeroSheet, ShopDialog, SystemInfo } from './HeroPanel';
import { StarMap } from './StarMap';

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

export function Game({
  id,
  onExit,
  onNewGame,
  onRules,
  onSettings,
}: {
  id: number;
  onExit: () => void;
  onNewGame: () => void;
  onRules: () => void;
  onSettings: () => void;
}) {
  const { t, lang } = useT();
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewSeat, setViewSeat] = useState<number | null>(null);
  const [shop, setShop] = useState(false);
  const [showLog, setShowLog] = useState(false);
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

  const checkGate = useCallback((s: GameState) => {
    const humans = s.players.filter((p) => !p.isBot).length;
    const seat = s.current;
    if (s.phase !== 'playing' || s.players[seat].isBot) return;
    if (humans > 1 && lastHuman.current !== null && lastHuman.current !== seat) setGate(seat);
    else lastHuman.current = seat;
  }, []);

  useEffect(() => {
    api
      .getGame(id)
      .then(({ state: s }) => {
        lastSeq.current = s.eventSeq;
        lastHuman.current = s.players[s.current].isBot ? null : s.current;
        setState(s);
      })
      .catch((e) => setError(errorText(e, tRef.current)));
  }, [id]);

  const receive = useCallback(
    (next: GameState) => {
      const fresh = next.events.filter((e) => e.seq > lastSeq.current);
      lastSeq.current = next.eventSeq;
      const rolled = [...fresh].reverse().find((e) => e.roll);
      if (rolled && diceOn) setDice(rolled);
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

  const act = async (action: Action) => {
    if (!state || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { state: next } = await api.act(id, state.current, action);
      receive(next);
      if (action.type !== 'buy' && action.type !== 'move') setShop(false);
      if (action.type === 'move') setSelected(null);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  // tour des ordinateurs
  const current = state?.players[state.current];
  useEffect(() => {
    if (state?.phase !== 'playing' || !current?.isBot || dice || busy) return;
    const timer = setTimeout(
      () => {
        api
          .bot(id)
          .then(({ state: next }) => receive(next))
          .catch((e) => setError(errorText(e, tRef.current)));
      },
      rush ? 0 : BOT_DELAYS[botSpeed],
    );
    return () => clearTimeout(timer);
  }, [state, current, dice, busy, rush, botSpeed, id, receive]);

  // « Accélérer » ne vaut que jusqu'au prochain tour humain ; la fiche suit le joueur actif
  const currentSeat = state?.current;
  const currentIsBot = current?.isBot;
  useEffect(() => {
    if (currentSeat === undefined) return;
    if (!currentIsBot) setRush(false);
    setViewSeat(null);
  }, [currentSeat, currentIsBot]);

  const canAct = !!state && state.phase === 'playing' && !!current && !current.isBot && !busy && gate === null && !dice;
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
  };

  const viewed = state.players[viewSeat ?? state.current];
  const finished = state.phase === 'finished';
  const botDiceDelay = rush ? 250 : BOT_DELAYS[botSpeed] * 1.4 + 700;

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
              {current.isBot ? t('game.thinking', { name: current.name }) : t('game.turnOf', { name: current.name })}
              {current.isBot && !rush && (
                <button type="button" className="btn ghost small" onClick={() => setRush(true)}>
                  ⏩ {t('game.speedUp')}
                </button>
              )}
            </div>
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

        <aside className="side">
          <CrewBar state={state} onPick={(seat) => setViewSeat(seat === viewSeat ? null : seat)} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {selected && selected !== current.pos && (
            <SystemInfo state={state} system={selected} onClose={() => setSelected(null)} />
          )}
          {!finished && !current.isBot && <ActionPanel state={state} canAct={canAct} onAct={act} onShop={() => setShop(true)} />}
          {finished && !showEnd && (
            <button type="button" className="btn primary" onClick={() => setShowEnd(true)}>
              🏆 {t('end.title')}
            </button>
          )}
          <HeroSheet hero={viewed} />
        </aside>
      </div>

      <AnimatePresence>
        {shop && <ShopDialog key="shop" state={state} canAct={canAct} onAct={act} onClose={() => setShop(false)} />}
        {showLog && (
          <Dialog key="log" title={t('game.log')} onClose={() => setShowLog(false)} className="log">
            <ol className="log-list">
              {[...state.events].reverse().map((e) => (
                <li key={e.seq} style={{ '--c': PLAYER_FILL[state.players[e.seat]?.color ?? 'cyan'] } as React.CSSProperties}>
                  {formatEvent(e, state, t, lang)}
                </li>
              ))}
            </ol>
          </Dialog>
        )}
        {dice && (
          <DiceOverlay
            key={`dice-${dice.seq}`}
            event={dice}
            state={state}
            autoClose={state.players[dice.seat].isBot ? botDiceDelay : undefined}
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
