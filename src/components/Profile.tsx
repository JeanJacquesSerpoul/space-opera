import { useEffect, useState } from 'react';
import { CLASSES } from '../../shared/data';
import type { MessageKey } from '../../shared/i18n';
import type { PlayerProfile } from '../../shared/stats';
import { api } from '../lib/api';
import { errorText, useT } from '../lib/i18n';
import { Dialog } from './Dialog';

/** Courbe des derniers scores (victoires en évidence). */
function ScoreChart({ history }: { history: PlayerProfile['history'] }) {
  const { t } = useT();
  const last = history.slice(-20);
  if (last.length < 2) return null;
  const W = 300;
  const H = 80;
  const max = Math.max(...last.map((h) => h.score), 1);
  const x = (i: number) => 8 + (i * (W - 16)) / (last.length - 1);
  const y = (s: number) => H - 8 - (s / max) * (H - 16);
  return (
    <figure className="profile-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('profile.chart', { n: last.length })}>
        <polyline points={last.map((h, i) => `${x(i)},${y(h.score)}`).join(' ')} />
        {last.map((h, i) => (
          <circle key={h.gameId} cx={x(i)} cy={y(h.score)} r={h.won ? 4.5 : 3} className={h.won ? 'won' : ''}>
            <title>
              {h.score} · {h.won ? '🏆' : `${h.rank}/${h.players}`}
            </title>
          </circle>
        ))}
      </svg>
      <figcaption className="muted small">{t('profile.chart', { n: last.length })}</figcaption>
    </figure>
  );
}

/** Fiche d'un joueur du Panthéon : chiffres clés, classes jouées, derniers scores. */
export function ProfileDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const { t, lang } = useT();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: chargement lié au nom, pas à la langue
  useEffect(() => {
    api
      .player(name)
      .then(setProfile)
      .catch((e) => setError(errorText(e, t)));
  }, [name]);

  const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))} %`;

  return (
    <Dialog title={t('profile.title', { name })} onClose={onClose} className="profile">
      {error && <p className="error">{error}</p>}
      {!profile && !error && <p className="muted">{t('game.loading')}</p>}
      {profile && (
        <>
          <div className="profile-figures">
            {(
              [
                ['profile.games', profile.games],
                ['profile.wins', `${profile.wins} · ${pct(profile.wins, profile.games)}`],
                ['profile.avg', profile.avgScore],
                ['profile.best', profile.bestScore],
                ['profile.missions', profile.missions],
                ['profile.kos', profile.kos],
              ] as [MessageKey, string | number][]
            ).map(([key, value]) => (
              <div key={key}>
                <b>{value}</b>
                <small>{t(key)}</small>
              </div>
            ))}
          </div>

          <h3>{t('profile.classes')}</h3>
          <ul className="profile-classes">
            {profile.classes.map((c) => (
              <li key={c.classId}>
                <span className="hero-glyph">{CLASSES[c.classId].glyph}</span>
                <span className="profile-class-name">{t(`class.${c.classId}` as MessageKey)}</span>
                <span className="profile-bar" aria-hidden>
                  <i style={{ width: pct(c.games, profile.games) }} />
                </span>
                <small className="muted">{t('profile.classLine', { n: c.games, wins: c.wins })}</small>
              </li>
            ))}
          </ul>
          <p className="muted small">
            {profile.species.map((s) => `${t(`species.${s.speciesId}` as MessageKey)} ×${s.games}`).join(' · ')}
          </p>

          <ScoreChart history={profile.history} />

          <h3>{t('profile.recent')}</h3>
          <ul className="profile-recent">
            {[...profile.history]
              .reverse()
              .slice(0, 5)
              .map((h) => (
                <li key={h.gameId}>
                  <span>{new Date(h.date.replace(' ', 'T')).toLocaleDateString(lang)}</span>
                  <span>
                    {CLASSES[h.classId].glyph} {t(`class.${h.classId}` as MessageKey)}
                  </span>
                  <b>{h.score}</b>
                  <span>{h.won ? '🏆' : `${h.rank}/${h.players}`}</span>
                </li>
              ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
