import type { PlayerColor, Stat, SystemKind, Tier } from '../../shared/types';

export const PLAYER_COLORS: PlayerColor[] = ['cyan', 'magenta', 'lime', 'amber', 'violet'];

export const PLAYER_FILL: Record<PlayerColor, string> = {
  cyan: '#36e3ff',
  magenta: '#ff4fd8',
  lime: '#9dff5c',
  amber: '#ffb43b',
  violet: '#a98bff',
};

export const TIER_FILL: Record<Tier, string> = { 1: '#4ee6a0', 2: '#ffc04a', 3: '#ff5c6c', 4: '#ff4fd8' };

export const STAT_ICON: Record<Stat, string> = { combat: '⚔', tech: '⌬', mystic: '✶', social: '❖' };

export const KIND_ICON: Record<SystemKind, string> = { station: '⬡', planet: '◍', derelict: '✕', nebula: '☁' };

/** Teinte d'une planète, tirée de son identifiant. */
export function planetHue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
