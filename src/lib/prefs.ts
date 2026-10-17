import { useSyncExternalStore } from 'react';
import { type Lang, detectLang } from '../../shared/i18n';

/** Préférences de l'appareil (localStorage), partagées en direct entre les écrans. */

export type BotSpeed = 'slow' | 'normal' | 'fast' | 'instant';
export const BOT_SPEEDS: BotSpeed[] = ['slow', 'normal', 'fast', 'instant'];
/** Pause avant chaque action d'un ordinateur (ms). */
export const BOT_DELAYS: Record<BotSpeed, number> = { slow: 1300, normal: 750, fast: 300, instant: 0 };

export interface Prefs {
  lang: Lang;
  botSpeed: BotSpeed;
  dice: boolean;
}

const KEYS: Record<keyof Prefs, string> = { lang: 'so.lang', botSpeed: 'so.botSpeed', dice: 'so.dice' };

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function load(): Prefs {
  const prefs: Prefs = { lang: detectLang(), botSpeed: 'normal', dice: !reducedMotion() };
  try {
    const lang = localStorage.getItem(KEYS.lang);
    if (lang === 'fr' || lang === 'en') prefs.lang = lang;
    const speed = localStorage.getItem(KEYS.botSpeed) as BotSpeed | null;
    if (speed && BOT_SPEEDS.includes(speed)) prefs.botSpeed = speed;
    const dice = localStorage.getItem(KEYS.dice);
    if (dice !== null) prefs.dice = dice === '1';
  } catch {
    /* stockage indisponible : valeurs par défaut */
  }
  return prefs;
}

let current = load();
const listeners = new Set<() => void>();

export function getPref<K extends keyof Prefs>(key: K): Prefs[K] {
  return current[key];
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEYS[key], typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  } catch {
    /* préférence gardée pour la session */
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function usePref<K extends keyof Prefs>(key: K): Prefs[K] {
  return useSyncExternalStore(
    subscribe,
    () => current[key],
    () => current[key],
  );
}

/** Dernier nom saisi, proposé à la prochaine partie. */
export function savedName(fallback: string): string {
  try {
    return localStorage.getItem('so.name') || fallback;
  } catch {
    return fallback;
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem('so.name', name);
  } catch {
    /* rien */
  }
}
