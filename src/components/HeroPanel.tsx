import { motion } from 'motion/react';
import { CLASSES, ITEM_BY_ID, MISSION_BY_ID, SPECIES, STATS } from '../../shared/data';
import {
  DC,
  FIELD_REST,
  LEVEL_XP,
  MISSION_REWARD,
  RENOWN_GOAL,
  checkChance,
  heroLevel,
  heroSpeed,
  itemCost,
  jumps,
  maxHp,
  maxResolve,
  missionsAt,
  statValue,
} from '../../shared/engine';
import type { MessageKey } from '../../shared/i18n';
import { SYSTEM_BY_ID } from '../../shared/sector';
import type { Action, GameState, Hero, Slot } from '../../shared/types';
import { itemBonus, systemName, useT } from '../lib/i18n';
import { KIND_ICON, PLAYER_FILL, STAT_ICON, TIER_FILL } from '../lib/theme';
import { Dialog } from './Dialog';

const pct = (p: number) => Math.round(p * 100);
const SLOTS: Slot[] = ['weapon', 'tool', 'focus', 'kit', 'armor', 'engine'];

// ---------------------------------------------------------------- fiche

export function HeroSheet({ hero }: { hero: Hero }) {
  const { t, tx } = useT();
  const level = heroLevel(hero);
  const hpMax = maxHp(hero);
  const next = LEVEL_XP[level];
  return (
    <section className="sheet" style={{ '--c': PLAYER_FILL[hero.color] } as React.CSSProperties}>
      <header className="sheet-head">
        <span className="hero-glyph big">{CLASSES[hero.classId].glyph}</span>
        <div className="sheet-id">
          <strong>{hero.name}</strong>
          <span className="muted small">
            {t(`class.${hero.classId}` as MessageKey)} · {t(`species.${hero.speciesId}` as MessageKey)} ·{' '}
            {t('hero.level', { n: level })}
          </span>
        </div>
        <div className="renown" title={t('hero.renown')}>
          <span className="renown-val">{hero.renown}</span>
          <span className="renown-goal">/ {RENOWN_GOAL} ★</span>
        </div>
      </header>

      <div className="bars">
        <div className="bar hp" title={t('hero.hp')}>
          <span className="bar-label">♥ {t('hero.hp')}</span>
          <div className="bar-track">
            <motion.div className="bar-fill" animate={{ width: `${(100 * hero.hp) / hpMax}%` }} />
          </div>
          <span className="bar-val">
            {hero.hp}/{hpMax}
          </span>
        </div>
        <div className="bar xp" title="XP">
          <span className="bar-label">✦ XP</span>
          <div className="bar-track">
            <motion.div
              className="bar-fill"
              animate={{ width: next ? `${(100 * (hero.xp - LEVEL_XP[level - 1])) / (next - LEVEL_XP[level - 1])}%` : '100%' }}
            />
          </div>
          <span className="bar-val">{next ? `${hero.xp}/${next}` : t('hero.xpMax')}</span>
        </div>
      </div>

      <div className="counters">
        <span title={t('hero.resolve')}>
          {Array.from({ length: maxResolve(hero) }, (_, i) => (
            <i key={i} className={`pip ${i < hero.resolve ? 'on' : ''}`} />
          ))}
          <small>{t('hero.resolve')}</small>
        </span>
        <span title={t('hero.credits')}>
          ◎ {hero.credits} <small>{t('hero.credits')}</small>
        </span>
        <span>
          ➤ <small>{t('hero.speed', { n: heroSpeed(hero) })}</small>
        </span>
      </div>

      <div className="stats">
        {STATS.map((s) => (
          <div key={s} className="stat">
            <span className="stat-icon">{STAT_ICON[s]}</span>
            <span className="stat-name">{t(`stat.${s}` as MessageKey)}</span>
            <span className="stat-val">+{statValue(hero, s)}</span>
          </div>
        ))}
      </div>

      <p className="power small">{t(`power.${hero.classId}` as MessageKey)}</p>
      {SPECIES[hero.speciesId] && <p className="muted small">{t(`speciesDesc.${hero.speciesId}` as MessageKey)}</p>}

      <div className="gear">
        {SLOTS.filter((s) => hero.gear[s]).map((s) => {
          const item = ITEM_BY_ID[hero.gear[s]!];
          return (
            <span key={s} className="gear-chip" title={t(`slot.${s}` as MessageKey)}>
              {tx(item.name)} <b>{itemBonus(t, item)}</b>
            </span>
          );
        })}
        {SLOTS.every((s) => !hero.gear[s]) && <span className="muted small">{t('hero.noGear')}</span>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- carte de mission

export function MissionCard({
  missionId,
  hero,
  system,
  canAct,
  onAct,
}: {
  missionId: number;
  hero: Hero;
  system: string;
  canAct: boolean;
  onAct?: (a: Action) => void;
}) {
  const { t, tx, lang } = useT();
  const m = MISSION_BY_ID[missionId];
  const r = MISSION_REWARD[m.tier];
  const p = checkChance(hero, m.stats, DC[m.tier]);
  const pb = checkChance(hero, m.stats, DC[m.tier], true);
  return (
    <article className={`mission ${m.tier === 4 ? 'boss' : ''}`} style={{ '--t': TIER_FILL[m.tier] } as React.CSSProperties}>
      <header>
        <span className="tier">{m.tier === 4 ? t('mission.boss') : t('mission.tier', { n: m.tier })}</span>
        <span className="muted small">
          {KIND_ICON[SYSTEM_BY_ID[system].kind]} {systemName(system, lang)}
        </span>
      </header>
      <h4>{tx(m.name)}</h4>
      <p className="mission-line">
        {m.stats.map((s) => (
          <span key={s} className="stat-chip">
            {STAT_ICON[s]} {t(`stat.${s}` as MessageKey)}
          </span>
        ))}
        <span className="dc">{t('mission.dc', { dc: DC[m.tier] })}</span>
      </p>
      <p className="small reward">{t('mission.reward', { renown: r.renown, credits: r.credits, xp: r.xp })}</p>
      <p className="small risk">{t('mission.risk', { dmg: r.damage })}</p>
      {canAct && onAct && (
        <div className="mission-actions">
          <button type="button" className="btn primary" onClick={() => onAct({ type: 'mission', missionId })}>
            🎲 {t('action.mission')} <span className="chance">{t('action.chance', { p: pct(p) })}</span>
          </button>
          <button
            type="button"
            className="btn"
            disabled={hero.resolve <= 0}
            onClick={() => onAct({ type: 'mission', missionId, boost: true })}
          >
            ✦ {t('action.boost')} <span className="chance">{t('action.chance', { p: pct(pb) })}</span>
          </button>
        </div>
      )}
      {!canAct && <p className="chance-line">🎲 {t('action.chance', { p: pct(p) })}</p>}
    </article>
  );
}

// ---------------------------------------------------------------- actions du tour

export function ActionPanel({
  state,
  canAct,
  onAct,
  onShop,
}: {
  state: GameState;
  canAct: boolean;
  onAct: (a: Action) => void;
  onShop: () => void;
}) {
  const { t, lang } = useT();
  const hero = state.players[state.current];
  const sys = SYSTEM_BY_ID[hero.pos];
  const missions = missionsAt(state, hero.pos);
  const station = sys.kind === 'station';
  const heal = station || hero.classId === 'mystic' ? maxHp(hero) - hero.hp : Math.min(FIELD_REST, maxHp(hero) - hero.hp);

  return (
    <section className="actions">
      <header className="actions-head">
        <h3>
          {KIND_ICON[sys.kind]} {t('game.here', { system: systemName(hero.pos, lang) })}
        </h3>
        <span className="moves">{t('game.moves', { n: state.movesLeft })}</span>
      </header>
      <p className="muted small">{state.movesLeft > 0 ? t('game.moveHint') : t('game.noMoves')}</p>

      {missions.map((id) => (
        <MissionCard key={id} missionId={id} hero={hero} system={hero.pos} canAct={canAct} onAct={onAct} />
      ))}

      <div className="action-grid">
        {!station && (
          <button type="button" className="btn action" disabled={!canAct} onClick={() => onAct({ type: 'explore' })}>
            <span className="a-icon">🔭</span>
            <span>{t('action.explore')}</span>
            <small>{state.explored.includes(hero.pos) ? t('action.exploreHint') : t('action.discovery')}</small>
          </button>
        )}
        {station && (
          <button type="button" className="btn action" disabled={!canAct} onClick={onShop}>
            <span className="a-icon">🛒</span>
            <span>{t('action.shop')}</span>
            <small>{t('shop.free')}</small>
          </button>
        )}
        <button type="button" className="btn action" disabled={!canAct} onClick={() => onAct({ type: 'rest' })}>
          <span className="a-icon">🛌</span>
          <span>{t('action.rest')}</span>
          <small>{station ? t('action.restFull') : t('action.restHint', { n: heal })}</small>
        </button>
        <button type="button" className="btn action ghost" disabled={!canAct} onClick={() => onAct({ type: 'wait' })}>
          <span className="a-icon">⏭</span>
          <span>{t('action.wait')}</span>
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- informations sur un système

export function SystemInfo({ state, system, onClose }: { state: GameState; system: string; onClose: () => void }) {
  const { t, lang } = useT();
  const sys = SYSTEM_BY_ID[system];
  const hero = state.players[state.current];
  const missions = missionsAt(state, system);
  const here = state.players.filter((p) => p.pos === system);
  const hint = sys.kind === 'station' ? t('kindHint.station') : sys.kind === 'nebula' ? t('kindHint.nebula') : null;
  return (
    <section className="system-info">
      <header>
        <h3>
          {KIND_ICON[sys.kind]} {sys.name[lang]}
        </h3>
        <button type="button" className="btn ghost small" onClick={onClose} aria-label="✕">
          ✕
        </button>
      </header>
      <p className="muted small">
        {t(`kind.${sys.kind}` as MessageKey)}
        {hint && ` · ${hint}`}
        {system !== hero.pos && ` · ${t('hero.speed', { n: jumps(hero.pos, system) })}`}
      </p>
      {here.length > 0 && (
        <p className="small">
          {here.map((p) => (
            <span key={p.name} className="chip" style={{ '--c': PLAYER_FILL[p.color] } as React.CSSProperties}>
              {CLASSES[p.classId].glyph} {p.name}
            </span>
          ))}
        </p>
      )}
      {missions.length === 0 && <p className="muted small">{t('mission.none')}</p>}
      {missions.map((id) => (
        <MissionCard key={id} missionId={id} hero={hero} system={system} canAct={false} />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- marché

export function ShopDialog({
  state,
  canAct,
  onAct,
  onClose,
}: {
  state: GameState;
  canAct: boolean;
  onAct: (a: Action) => void;
  onClose: () => void;
}) {
  const { t, tx, lang } = useT();
  const hero = state.players[state.current];
  return (
    <Dialog title={t('shop.title', { system: systemName(hero.pos, lang) })} onClose={onClose} className="shop">
      <p className="muted small">
        ◎ {hero.credits} {t('hero.credits')} · {t('shop.free')}
      </p>
      <div className="market">
        {state.market.map((itemId, index) => {
          if (itemId === null) return <div key={index} className="item empty" />;
          const item = ITEM_BY_ID[itemId];
          const cost = itemCost(hero, itemId);
          const owned = hero.gear[item.slot] ? ITEM_BY_ID[hero.gear[item.slot]!] : null;
          const worse = owned && owned.bonus >= item.bonus;
          return (
            <article key={index} className={`item ${worse ? 'worse' : ''}`}>
              <span className="slot">{t(`slot.${item.slot}` as MessageKey)}</span>
              <h4>{tx(item.name)}</h4>
              <p className="bonus">{itemBonus(t, item)}</p>
              {owned && <p className="small muted">{worse ? t('shop.worse') : t('shop.equipped', { item: tx(owned.name) })}</p>}
              <button
                type="button"
                className="btn primary"
                disabled={!canAct || hero.credits < cost}
                onClick={() => onAct({ type: 'buy', index })}
              >
                {t('shop.buy')} · {t('shop.cost', { n: cost })}
              </button>
            </article>
          );
        })}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- équipage

export function CrewBar({ state, onPick }: { state: GameState; onPick: (seat: number) => void }) {
  const { t } = useT();
  return (
    <div className="crew" title={t('game.heroes')}>
      {state.players.map((h, seat) => (
        <button
          key={seat}
          type="button"
          className={`crew-chip ${seat === state.current && state.phase === 'playing' ? 'current' : ''}`}
          style={{ '--c': PLAYER_FILL[h.color] } as React.CSSProperties}
          onClick={() => onPick(seat)}
        >
          <span className="hero-glyph">{CLASSES[h.classId].glyph}</span>
          <span className="crew-name">
            {h.isBot ? '🤖 ' : ''}
            {h.name}
          </span>
          <span className="crew-stats">
            ★{h.renown} · ♥{h.hp} · {t('hero.level', { n: heroLevel(h) })}
          </span>
        </button>
      ))}
    </div>
  );
}
