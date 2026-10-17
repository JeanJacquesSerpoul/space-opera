import { memo } from 'react';
import { useT } from '../lib/i18n';

export function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  return (
    <div className={`brand ${compact ? 'compact' : ''}`}>
      <h1 className="brand-title">{t('brand.title')}</h1>
      {!compact && <p className="brand-sub">{t('brand.subtitle')}</p>}
    </div>
  );
}

/** Étoiles de fond (positions fixes, scintillement en CSS). */
export const Starfield = memo(function Starfield() {
  const stars = Array.from({ length: 90 }, (_, i) => {
    const x = (i * 73.13) % 100;
    const y = (i * 41.77 + (i % 7) * 13) % 100;
    return { x, y, r: i % 9 === 0 ? 2 : 1, d: (i % 11) * 0.4 };
  });
  return (
    <div className="starfield" aria-hidden="true">
      {stars.map((s, i) => (
        <span key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r, height: s.r, animationDelay: `${s.d}s` }} />
      ))}
    </div>
  );
});
