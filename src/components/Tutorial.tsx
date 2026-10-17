import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { MessageKey } from '../../shared/i18n';
import type { GameEvent, GameState } from '../../shared/types';
import { useT } from '../lib/i18n';

/**
 * Partie guidée : une capitaine accompagne une vraie partie, étape par étape.
 * Les étapes d'action se valident toutes seules quand le joueur a fait ce qui est demandé ;
 * les étapes d'explication se passent avec « Suivant ».
 */

const KEY = 'so.tutorial';

interface TutorialSave {
  gameId: number;
  step: number;
  /** Numéro d'événement au début de l'étape, pour détecter ce qui s'est passé depuis. */
  since: number;
}

function load(): TutorialSave | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TutorialSave) : null;
  } catch {
    return null;
  }
}

function save(v: TutorialSave | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible : le guide vaut pour cette visite */
  }
}

/** Démarre la partie guidée pour cette partie. */
export function startTutorial(gameId: number) {
  save({ gameId, step: 0, since: 0 });
}

export interface CoachContext {
  state: GameState;
  /** Siège du joueur guidé. */
  viewer: number;
}

interface Step {
  /** Clé de traduction : `tutorial.<id>.title` et `tutorial.<id>.text`. */
  id: 'jump' | 'act' | 'dice' | 'station' | 'threat' | 'end';
  done?: (c: CoachContext, since: number) => boolean;
}

const mine = (c: CoachContext, since: number, kinds: GameEvent['kind'][]) =>
  c.state.events.some((e) => e.seq > since && e.seat === c.viewer && kinds.includes(e.kind));

const STEPS: Step[] = [
  { id: 'jump', done: (c, since) => mine(c, since, ['move']) },
  { id: 'act', done: (c, since) => mine(c, since, ['mission', 'explore', 'rest', 'wait']) },
  { id: 'dice' },
  { id: 'station' },
  { id: 'threat' },
  { id: 'end' },
];

export function Coach(ctx: CoachContext & { gameId: number }) {
  const { t } = useT();
  const [saved, setSaved] = useState<TutorialSave | null>(() => load());
  const [collapsed, setCollapsed] = useState(false);
  const active = saved && saved.gameId === ctx.gameId && saved.step < STEPS.length;
  const step = active ? STEPS[saved.step] : null;

  const next = () => {
    if (!saved) return;
    const n = { ...saved, step: saved.step + 1, since: ctx.state.eventSeq };
    save(n);
    setSaved(n);
    setCollapsed(false);
  };

  // validation automatique de l'étape en cours
  useEffect(() => {
    if (active && step?.done?.(ctx, saved.since)) next();
  });

  const finish = () => {
    save(null);
    setSaved(null);
  };

  if (!active || !step || ctx.state.phase === 'finished') return null;
  const last = saved.step === STEPS.length - 1;
  return (
    // une bulle par étape (clé), sans animation de sortie : rien ne s'empile pendant les transitions
    <motion.div
      key={saved.step}
      className={`coach ${collapsed ? 'collapsed' : ''}`}
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        className="coach-avatar"
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? t('tutorial.expand') : t('tutorial.collapse')}
      >
        🧑‍🚀
      </button>
      {!collapsed && (
        <div className="coach-body">
          <div className="coach-head">
            <b>{t(`tutorial.${step.id}.title` as MessageKey)}</b>
            <span>{t('tutorial.step', { n: saved.step + 1, total: STEPS.length })}</span>
          </div>
          <p>{t(`tutorial.${step.id}.text` as MessageKey)}</p>
          <div className="coach-actions">
            {!last && (
              <button type="button" className="btn ghost small" onClick={finish}>
                {t('tutorial.quit')}
              </button>
            )}
            {!step.done && (
              <button type="button" className="btn primary small" onClick={last ? finish : next}>
                {last ? t('tutorial.finish') : t('tutorial.next')}
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
