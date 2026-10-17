import { LANGS, type MessageKey } from '../../shared/i18n';
import { useT } from '../lib/i18n';
import { BOT_SPEEDS, setPref, usePref } from '../lib/prefs';
import { Dialog } from './Dialog';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useT();
  const speed = usePref('botSpeed');
  const dice = usePref('dice');
  return (
    <Dialog title={t('settings.title')} onClose={onClose} className="settings">
      <div className="setting">
        <span>{t('settings.lang')}</span>
        <div className="seg">
          {LANGS.map((l) => (
            <button key={l} type="button" className={lang === l ? 'on' : ''} onClick={() => setPref('lang', l)}>
              {l === 'fr' ? 'Français' : 'English'}
            </button>
          ))}
        </div>
      </div>
      <div className="setting">
        <span>{t('settings.botSpeed')}</span>
        <div className="seg">
          {BOT_SPEEDS.map((s) => (
            <button key={s} type="button" className={speed === s ? 'on' : ''} onClick={() => setPref('botSpeed', s)}>
              {t(`settings.speed.${s}` as MessageKey)}
            </button>
          ))}
        </div>
      </div>
      <div className="setting">
        <span>{t('settings.dice')}</span>
        <div className="seg">
          <button type="button" className={dice ? 'on' : ''} onClick={() => setPref('dice', true)}>
            {t('common.yes')}
          </button>
          <button type="button" className={!dice ? 'on' : ''} onClick={() => setPref('dice', false)}>
            {t('common.no')}
          </button>
        </div>
      </div>
      <button type="button" className="btn primary" onClick={onClose}>
        {t('settings.close')}
      </button>
    </Dialog>
  );
}
