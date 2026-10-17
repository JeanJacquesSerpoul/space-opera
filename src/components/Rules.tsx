import { CLASSES, CLASS_IDS } from '../../shared/data';
import { CREDITS_PER_POINT, LEGEND_BONUS, MAX_THREAT, RENOWN_GOAL } from '../../shared/engine';
import type { MessageKey } from '../../shared/i18n';
import { useT } from '../lib/i18n';
import { Dialog } from './Dialog';

const SECTIONS = ['goal', 'turn', 'checks', 'missions', 'explore', 'worlds', 'threat', 'score'] as const;

export function RulesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const params = { goal: RENOWN_GOAL, max: MAX_THREAT, per: CREDITS_PER_POINT, legend: LEGEND_BONUS };
  return (
    <Dialog title={t('rules.title')} onClose={onClose} className="rules">
      {SECTIONS.map((s) => (
        <section key={s}>
          <h3>{t(`rules.${s}.h` as MessageKey)}</h3>
          <p>{t(`rules.${s}` as MessageKey, params)}</p>
        </section>
      ))}
      <section>
        <h3>{t('rules.classes.h')}</h3>
        <ul className="class-list">
          {CLASS_IDS.map((c) => (
            <li key={c}>
              <span className="hero-glyph">{CLASSES[c].glyph}</span>
              <div>
                <strong>{t(`class.${c}` as MessageKey)}</strong>
                <p>{t(`power.${c}` as MessageKey)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <button type="button" className="btn primary" onClick={onClose}>
        {t('rules.close')}
      </button>
    </Dialog>
  );
}
