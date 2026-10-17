import { useEffect, useRef } from 'react';
import type { T } from '../../shared/i18n';
import { useT } from './i18n';
import { playSfx } from './sfx';

/** Notification système (si le joueur l'a autorisée) : par le service worker quand il existe (mobile). */
function notify(t: T) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const title = t('turn.notifyTitle');
  const options: NotificationOptions = { body: t('turn.notifyBody'), tag: 'so-turn' };
  const show = () => {
    try {
      new Notification(title, options);
    } catch {
      /* Android : seules les notifications du service worker sont permises */
    }
  };
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, options)).catch(show);
  } else show();
}

/** Notifications système possibles et pas encore demandées. */
export const canAskNotifications = () => typeof Notification !== 'undefined' && Notification.permission === 'default';
export const notificationsOn = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';

/**
 * En ligne : prévient quand c'est au tour de cet appareil — son, vibration, titre d'onglet
 * (qui clignote si l'onglet est caché) et notification système si la page n'est pas visible.
 */
export function useTurnAlert(myTurn: boolean) {
  const { t } = useT();
  const alerted = useRef(false);
  useEffect(() => {
    const base = t('brand.full');
    if (!myTurn) {
      alerted.current = false;
      return;
    }
    const mark = `● ${t('turn.title')} — ${base}`;
    document.title = mark;
    // une seule alerte par tour (le double montage de React ou un changement de langue ne la rejouent pas)
    if (!alerted.current) {
      alerted.current = true;
      playSfx('turn');
      navigator.vibrate?.([90, 50, 90]);
      if (document.hidden) notify(t);
    }
    let lit = true;
    const timer = setInterval(() => {
      lit = document.hidden ? !lit : true;
      document.title = lit ? mark : base;
    }, 1000);
    return () => {
      clearInterval(timer);
      document.title = base;
    };
  }, [myTurn, t]);
}
