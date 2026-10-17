import { motion } from 'motion/react';
import { CLASSES } from '../../shared/data';
import { MAX_THREAT, RENOWN_GOAL } from '../../shared/engine';
import type { MessageKey } from '../../shared/i18n';
import type { GameState } from '../../shared/types';
import { useT } from '../lib/i18n';
import { PLAYER_FILL } from '../lib/theme';

export function EndScreen({
  state,
  onClose,
  onNewGame,
  onHome,
}: {
  state: GameState;
  onClose: () => void;
  onNewGame: () => void;
  onHome: () => void;
}) {
  const { t } = useT();
  const results = [...(state.results ?? [])].sort((a, b) => a.rank - b.rank || b.total - a.total);
  const winner = state.players[results[0].seat];
  const byThreat = state.threat >= MAX_THREAT && state.players.every((p) => p.renown < RENOWN_GOAL);

  return (
    <motion.div className="backdrop end-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div
        className="dialog end"
        style={{ '--c': PLAYER_FILL[winner.color] } as React.CSSProperties}
        initial={{ scale: 0.9, y: 30 }}
        animate={{ scale: 1, y: 0 }}
      >
        <p className="muted">{t('end.title')}</p>
        <h2 className="end-winner">
          <span className="hero-glyph big">{CLASSES[winner.classId].glyph}</span>
          {t('end.winner', { name: winner.name })}
        </h2>
        <p className="muted small">{byThreat ? t('end.threat') : t('end.goal', { goal: RENOWN_GOAL })}</p>
        <table className="results">
          <thead>
            <tr>
              <th />
              <th>{t('leader.name')}</th>
              <th>{t('end.renown')}</th>
              <th>{t('end.credits')}</th>
              <th>{t('end.legend')}</th>
              <th>{t('end.total')}</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const p = state.players[r.seat];
              return (
                <motion.tr
                  key={r.seat}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 * i }}
                  style={{ '--c': PLAYER_FILL[p.color] } as React.CSSProperties}
                >
                  <td className="rank">{r.rank === 1 ? '🏆' : r.rank}</td>
                  <td>
                    <span className="dot" /> {p.name}
                    <small className="muted">
                      {' '}
                      · {t(`class.${p.classId}` as MessageKey)} · {t('hero.missions', { n: r.missions })}
                    </small>
                  </td>
                  <td>{r.renown}</td>
                  <td>+{r.creditPoints}</td>
                  <td>{r.legendBonus ? `+${r.legendBonus}` : '—'}</td>
                  <td className="total">{r.total}</td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        <div className="end-actions">
          <button type="button" className="btn primary" onClick={onNewGame}>
            {t('end.newGame')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('end.board')}
          </button>
          <button type="button" className="btn ghost" onClick={onHome}>
            {t('end.home')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
