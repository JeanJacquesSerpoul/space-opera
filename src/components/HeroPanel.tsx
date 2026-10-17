import { motion } from 'motion/react';
import { CLASSES, ITEM_BY_ID, MISSION_BY_ID, SPECIES, STATS } from '../../shared/data';
import {
  DC,
  FIELD_REST,
  LEVEL_XP,
  MISSION_REWARD,
  RENOWN_GOAL,
  canShopAt,
  checkChance,
  fullRestAt,
  heroLevel,
  heroSpeed,
  itemCost,
  jumps,
  maxHp,
  maxResolve,
  missionsAt,
  outpostIncome,
  outpostsOf,
  settleOffer,
  statValue,
} from '../../shared/engine';
import type { MessageKey } from '../../shared/i18n';
import { SYSTEM_BY_ID } from '../../shared/sector';
import type { Action, GameState, Hero, Outpost, Slot } from '../../shared/types';
import { BIOME_ICON, OUTPOST_MAX, OUTPOST_RENOWN, WORLDS } from '../../shared/worlds';
import { itemBonus, systemName, useT } from '../lib/i18n';
import { KIND_ICON, PLAYER_FILL, STAT_ICON, TIER_FILL } from '../lib/theme';
import { outcomeText } from './Dice';
import { Dialog } from './Dialog';

const pct = (p: number) => Math.round(p * 100);
const SLOTS: Slot[] = ['weapon', 'tool', 'focus', 'kit', 'armor', 'engine'];

// ---------------------------------------------------------------- fiche

export function HeroSheet({ hero, outposts = [] }: { hero: Hero; outposts?: [string, Outpost][] }) {
  const { t, tx, lang } = useT();
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

      {outposts.length > 0 && (
        <div className="hero-outposts">
          <span className="muted small">{t('hero.outposts')}</span>
          {outposts.map(([system, o]) => (
            <span key={system} className="gear-chip" title={t(`perk.${WORLDS[system].perk}` as MessageKey)}>
              {BIOME_ICON[WORLDS[system].biome]} {systemName(system, lang)} <LevelPips level={o.level} />
            </span>
          ))}
        </div>
      )}
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
  const shop = canShopAt(state, state.current, hero.pos);
  const fullRest = fullRestAt(state, state.current, hero.pos);
  const heal = fullRest || hero.classId === 'mystic' ? maxHp(hero) - hero.hp : Math.min(FIELD_REST, maxHp(hero) - hero.hp);

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

      <WorldCard state={state} system={hero.pos} canAct={canAct} onAct={onAct} />

      <div className="action-grid">
        {!station && (
          <button type="button" className="btn action" disabled={!canAct} onClick={() => onAct({ type: 'explore' })}>
            <span className="a-icon">🔭</span>
            <span>{t('action.explore')}</span>
            <small>{state.explored.includes(hero.pos) ? t('action.exploreHint') : t('action.discovery')}</small>
          </button>
        )}
        {shop && (
          <button type="button" className="btn action" disabled={!canAct} onClick={onShop}>
            <span className="a-icon">🛒</span>
            <span>{t('action.shop')}</span>
            <small>{t('shop.free')}</small>
          </button>
        )}
        <button type="button" className="btn action" disabled={!canAct} onClick={() => onAct({ type: 'rest' })}>
          <span className="a-icon">🛌</span>
          <span>{t('action.rest')}</span>
          <small>{fullRest ? t('action.restFull') : t('action.restHint', { n: heal })}</small>
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
      <WorldCard state={state} system={system} canAct={false} />
    </section>
  );
}

// ---------------------------------------------------------------- monde : activités et avant-poste

function LevelPips({ level }: { level: number }) {
  return (
    <span className="level-pips" aria-hidden>
      {Array.from({ length: OUTPOST_MAX }, (_, i) => (
        <i key={i} className={i < level ? 'on' : ''} />
      ))}
    </span>
  );
}

/**
 * Ce qu'on peut faire sur un monde : biome, danger, activités, avant-poste.
 * Sur le monde du héros dont c'est le tour, les boutons permettent d'agir.
 */
export function WorldCard({
  state,
  system,
  canAct,
  onAct,
}: {
  state: GameState;
  system: string;
  canAct: boolean;
  onAct?: (a: Action) => void;
}) {
  const { t, tx } = useT();
  const world = WORLDS[system];
  if (!world) return null;
  const seat = state.current;
  const hero = state.players[seat];
  const here = hero.pos === system && canAct && !!onAct;
  const outpost = outpostsOf(state)[system];
  const owner = outpost ? state.players[outpost.seat] : null;
  const offer = settleOffer(state, seat, system);
  const found = hero.found ?? [];
  return (
    <section className="world" data-biome={world.biome}>
      <header className="world-head">
        <span className="biome">
          {BIOME_ICON[world.biome]} {t(`biome.${world.biome}` as MessageKey)}
        </span>
        {world.hazard && <span className="hazard small">⚠ {t('world.hazard', { n: world.hazard })}</span>}
      </header>
      <p className="world-desc">{tx(world.desc)}</p>

      <h4>{t('world.activities')}</h4>
      {world.activities.map((a, index) => {
        const done = found.includes(a.id);
        const p = checkChance(hero, [a.stat], a.dc);
        const pb = checkChance(hero, [a.stat], a.dc, true);
        return (
          <article key={a.id} className={`activity ${done ? 'done' : ''}`}>
            <header>
              <b>{tx(a.name)}</b>
              <span className={`small ${done ? 'found' : 'first'}`}>
                {done ? `✓ ${t('world.found')}` : t('world.firstBonus')}
              </span>
            </header>
            <p className="mission-line">
              <span className="stat-chip">
                {STAT_ICON[a.stat]} {t(`stat.${a.stat}` as MessageKey)}
              </span>
              <span className="dc">{t('mission.dc', { dc: a.dc })}</span>
              <span className="small reward">{outcomeText(a.success)}</span>
              {Object.keys(a.failure).length > 0 && <span className="small risk">✗ {outcomeText(a.failure)}</span>}
            </p>
            {here ? (
              <div className="mission-actions">
                <button type="button" className="btn primary" onClick={() => onAct({ type: 'activity', index: index as 0 | 1 })}>
                  🎲 {t('action.mission')} <span className="chance">{t('action.chance', { p: pct(p) })}</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={hero.resolve <= 0}
                  onClick={() => onAct({ type: 'activity', index: index as 0 | 1, boost: true })}
                >
                  ✦ {t('action.boost')} <span className="chance">{t('action.chance', { p: pct(pb) })}</span>
                </button>
              </div>
            ) : (
              <p className="chance-line">🎲 {t('action.chance', { p: pct(p) })}</p>
            )}
          </article>
        );
      })}

      <div className="outpost-box">
        {!world.perk ? (
          <p className="muted small">{t('world.uninhabitable')}</p>
        ) : (
          <>
            <p className="small perk">🏠 {t(`perk.${world.perk}` as MessageKey)}</p>
            {outpost && owner ? (
              <p className="small">
                <span className="chip" style={{ '--c': PLAYER_FILL[owner.color] } as React.CSSProperties}>
                  {CLASSES[owner.classId].glyph} {t('world.outpost', { name: owner.name, n: outpost.level })}
                </span>{' '}
                <LevelPips level={outpost.level} /> · {t('world.income', { n: outpostIncome(system, outpost) })}
              </p>
            ) : (
              <p className="muted small">{t('world.free')}</p>
            )}
            {outpost?.seat === seat && hero.pos === system && <p className="muted small">{t('world.shelter')}</p>}
            {here && offer && (
              <button
                type="button"
                className="btn primary settle"
                disabled={hero.credits < offer.cost}
                onClick={() => onAct({ type: 'settle' })}
              >
                🏗 {offer.level === 1 ? t('world.settle') : t('world.develop', { n: offer.level })}
                <small>{t('world.settleHint', { cost: offer.cost, renown: OUTPOST_RENOWN[offer.level] })}</small>
              </button>
            )}
            {outpost?.seat === seat && outpost.level >= OUTPOST_MAX && <p className="muted small">{t('world.maxLevel')}</p>}
          </>
        )}
      </div>
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
            {Object.values(outpostsOf(state)).some((o) => o.seat === seat) &&
              ` · 🏠${Object.values(outpostsOf(state)).filter((o) => o.seat === seat).length}`}
          </span>
        </button>
      ))}
    </div>
  );
}
