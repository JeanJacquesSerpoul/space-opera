import { useEffect, useMemo } from 'react';
import { ENCOUNTER_BY_ID, ITEM_BY_ID, MISSION_BY_ID } from '../../shared/data';
import { type Lang, type MessageKey, type Params, type T, makeT } from '../../shared/i18n';
import { SYSTEM_BY_ID } from '../../shared/sector';
import { ACTIVITY_BY_ID } from '../../shared/worlds';
import type { GameEvent, GameState, Item, Text } from '../../shared/types';
import { getPref, usePref } from './prefs';

/** Traducteur de l'interface, dans la langue choisie (réglages) ou celle du navigateur. */
export function useT(): { t: T; lang: Lang; tx: (text: Text) => string } {
  const lang = usePref('lang');
  const value = useMemo(() => ({ t: makeT(lang), lang, tx: (text: Text) => text[lang] }), [lang]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = value.t('brand.full');
  }, [lang, value]);
  return value;
}

/** Traducteur hors composant (messages ponctuels). */
export const currentT = (): T => makeT(getPref('lang'));

export const systemName = (id: string, lang: Lang) => SYSTEM_BY_ID[id]?.name[lang] ?? id;

/** Effet d'un objet : « +2 Combat », « +4 PV max »… */
export function itemBonus(t: T, item: Item): string {
  if (item.slot === 'armor') return t('itemBonus.armor', { n: item.bonus });
  if (item.slot === 'engine') return t('itemBonus.engine', { n: item.bonus });
  const stat = { weapon: 'combat', tool: 'tech', focus: 'mystic', kit: 'social' }[item.slot];
  return t('itemBonus.stat', { n: item.bonus, stat: t(`stat.${stat}` as MessageKey) });
}

/** Texte d'un événement de partie, dans la langue de l'interface. */
export function formatEvent(e: GameEvent, s: GameState, t: T, lang: Lang): string {
  const name = s.players[e.seat]?.name ?? '';
  const system = e.system ? systemName(e.system, lang) : '';
  const roll: Params = e.roll ? { d20: e.roll.d20, bonus: e.roll.bonus, dc: e.roll.dc } : {};
  switch (e.kind) {
    case 'move':
      return t('event.move', { name, system });
    case 'mission':
      return t(e.roll?.success ? 'event.missionWin' : 'event.missionFail', {
        name,
        mission: MISSION_BY_ID[e.missionId!].name[lang],
        ...roll,
      });
    case 'explore':
      return t(e.roll?.success ? 'event.exploreWin' : 'event.exploreFail', {
        name,
        system,
        encounter: ENCOUNTER_BY_ID[e.encounterId!].name[lang],
        ...roll,
      });
    case 'discovery':
      return t('event.discovery', { name, system });
    case 'buy':
      return t('event.buy', { name, item: ITEM_BY_ID[e.itemId!].name[lang], n: e.amount ?? 0 });
    case 'loot':
      return t('event.loot', { name, item: ITEM_BY_ID[e.itemId!].name[lang] });
    case 'rest':
      return t('event.rest', { name, n: e.amount ?? 0 });
    case 'wait':
      return t('event.wait', { name });
    case 'ko':
      return t('event.ko', { name, system, n: e.amount ?? 0 });
    case 'levelUp':
      return t('event.levelUp', { name, n: e.amount ?? 1 });
    case 'round':
      return t('event.round', { n: e.amount ?? 0 });
    case 'crisis':
      return t('event.crisis', { n: e.amount ?? 0 });
    case 'boss':
      return t('event.boss', { system });
    case 'end':
      return t('event.end', { name });
    case 'activity': {
      const activity = ACTIVITY_BY_ID[e.activityId!].name[lang];
      const text = t(e.roll?.success ? 'event.activityWin' : 'event.activityFail', { name, activity, system, ...roll });
      return e.amount ? `${text} ${t('event.found', { name, activity })}` : text;
    }
    case 'settle':
      return e.amount === 1 ? t('event.settle', { name, system }) : t('event.develop', { name, system, n: e.amount ?? 1 });
    case 'income':
      return t('event.income', { name, n: e.amount ?? 0 });
    case 'hazard':
      return t('event.hazard', { name, system, n: e.amount ?? 0 });
  }
}

/** Message d'erreur traduit à partir du code renvoyé par le moteur ou le serveur. */
export function errorText(e: unknown, t: T): string {
  const code = (e as { code?: string })?.code;
  if (code) return t(`error.${code}` as MessageKey);
  return e instanceof Error ? e.message : String(e);
}
