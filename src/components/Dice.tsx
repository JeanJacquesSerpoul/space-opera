import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { ENCOUNTER_BY_ID, MISSION_BY_ID } from '../../shared/data';
import { MISSION_REWARD } from '../../shared/engine';
import type { MessageKey } from '../../shared/i18n';
import type { GameEvent, GameState, Outcome } from '../../shared/types';
import { systemName, useT } from '../lib/i18n';
import { playSfx } from '../lib/sfx';
import { PLAYER_FILL, STAT_ICON } from '../lib/theme';

/** Résumé compact d'un gain ou d'une perte : « +2 ★ · −4 ♥ ». */
function outcomeText(o: Outcome): string {
  const parts: string[] = [];
  const sign = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
  if (o.renown) parts.push(`${sign(o.renown)} ★`);
  if (o.credits) parts.push(`${sign(o.credits)} ◎`);
  if (o.xp) parts.push(`${sign(o.xp)} XP`);
  if (o.hp) parts.push(`${sign(o.hp)} ♥`);
  if (o.resolve) parts.push(`${sign(o.resolve)} ✦`);
  if (o.item) parts.push('+1 ⚙');
  return parts.join(' · ') || '—';
}

const D20_POINTS = '50,4 92,28 92,72 50,96 8,72 8,28';

/** Jet de d20 animé : le dé tourne, puis affiche le résultat et ses conséquences. */
export function DiceOverlay({
  event,
  state,
  autoClose,
  onDone,
}: {
  event: GameEvent;
  state: GameState;
  /** Fermeture automatique (ms), pour les jets des ordinateurs. */
  autoClose?: number;
  onDone: () => void;
}) {
  const { t, tx, lang } = useT();
  const roll = event.roll!;
  const hero = state.players[event.seat];
  const [face, setFace] = useState(() => 1 + Math.floor(Math.random() * 20));
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let n = 0;
    playSfx('dice');
    const timer = setInterval(() => {
      n += 1;
      if (n >= 12) {
        clearInterval(timer);
        setFace(roll.d20);
        setSettled(true);
        playSfx(roll.success ? 'success' : 'fail');
      } else setFace(1 + Math.floor(Math.random() * 20));
    }, 60);
    return () => clearInterval(timer);
  }, [roll.d20, roll.success]);

  useEffect(() => {
    if (!settled || autoClose === undefined) return;
    const timer = setTimeout(onDone, autoClose);
    return () => clearTimeout(timer);
  }, [settled, autoClose, onDone]);

  let title: string;
  let consequence: string;
  if (event.kind === 'mission') {
    const m = MISSION_BY_ID[event.missionId!];
    const r = MISSION_REWARD[m.tier];
    title = tx(m.name);
    consequence = roll.success
      ? outcomeText({ renown: r.renown + (roll.crit ? 2 : 0), credits: r.credits, xp: r.xp })
      : outcomeText({ hp: -r.damage, xp: 1 });
  } else {
    const e = ENCOUNTER_BY_ID[event.encounterId!];
    title = tx(e.name);
    consequence = outcomeText(roll.success ? e.success : e.failure);
  }

  const verdict = roll.crit
    ? t('dice.crit')
    : roll.d20 === 1
      ? t('dice.fumble')
      : roll.success
        ? t('dice.success')
        : t('dice.failure');

  return (
    <motion.div
      className="backdrop dice-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDone}
    >
      <motion.div
        className={`dice-card ${settled ? (roll.success ? 'win' : 'lose') : ''}`}
        style={{ '--c': PLAYER_FILL[hero.color] } as React.CSSProperties}
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        role="status"
        aria-live="polite"
      >
        <p className="dice-who">
          {hero.name} · {event.system ? systemName(event.system, lang) : ''}
        </p>
        <h3>{title}</h3>
        <p className="dice-stat">
          {STAT_ICON[roll.stat]} {t(`stat.${roll.stat}` as MessageKey)}
        </p>

        <motion.svg
          className="d20"
          viewBox="0 0 100 100"
          animate={settled ? { rotate: 0, scale: [1.25, 1] } : { rotate: [0, 360] }}
          transition={settled ? { duration: 0.35 } : { duration: 0.6, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        >
          <polygon points={D20_POINTS} className="d20-body" />
          <path
            d="M50,4 L28,40 L72,40 Z M28,40 L50,80 L72,40 M8,28 L28,40 M92,28 L72,40 M8,72 L50,80 L92,72 M50,96 L50,80"
            className="d20-edges"
          />
          <text x="50" y="62" textAnchor="middle" className="d20-face">
            {face}
          </text>
        </motion.svg>

        {settled && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <p className="dice-total">
              {t('dice.total', { d20: roll.d20, bonus: roll.bonus, total: roll.d20 + roll.bonus, dc: roll.dc })}
            </p>
            {roll.boost && <p className="small muted">{t('dice.boost')}</p>}
            {roll.reroll && <p className="small muted">{t('dice.reroll', { n: roll.reroll })}</p>}
            <p className="dice-verdict">{verdict}</p>
            <p className="dice-consequence">{consequence}</p>
            {autoClose === undefined && (
              <button type="button" className="btn primary" onClick={onDone}>
                {t('dice.continue')}
              </button>
            )}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
