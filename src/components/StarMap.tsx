import { motion } from 'motion/react';
import { memo } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { CLASSES, MISSION_BY_ID } from '../../shared/data';
import { LANES, SECTOR_H, SECTOR_W, SYSTEMS, SYSTEM_BY_ID } from '../../shared/sector';
import type { GameState, StarSystem } from '../../shared/types';
import { useT } from '../lib/i18n';
import { PLAYER_FILL, TIER_FILL, planetHue } from '../lib/theme';

/** Étoiles du fond de carte (positions fixes). */
const BG_STARS = Array.from({ length: 220 }, (_, i) => ({
  x: (i * 97.31) % SECTOR_W,
  y: (i * 59.17 + (i % 13) * 23) % SECTOR_H,
  r: i % 17 === 0 ? 1.6 : i % 5 === 0 ? 1 : 0.6,
}));

const Background = memo(function Background() {
  return (
    <g className="bg">
      <rect width={SECTOR_W} height={SECTOR_H} fill="url(#space)" />
      <ellipse cx={720} cy={420} rx={320} ry={150} fill="url(#galaxy)" opacity={0.35} transform="rotate(-20 720 420)" />
      <ellipse cx={240} cy={180} rx={260} ry={110} fill="url(#galaxy2)" opacity={0.25} transform="rotate(25 240 180)" />
      {BG_STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} className={i % 7 === 0 ? 'bg-star twinkle' : 'bg-star'} />
      ))}
    </g>
  );
});

function SystemShape({ sys }: { sys: StarSystem }) {
  switch (sys.kind) {
    case 'station':
      return (
        <g className="shape-station">
          <polygon points="0,-15 13,-7.5 13,7.5 0,15 -13,7.5 -13,-7.5" />
          <circle r={4.5} />
        </g>
      );
    case 'nebula':
      return (
        <g className="shape-nebula">
          <circle r={30} fill="url(#nebula)" />
          <circle r={5} />
        </g>
      );
    case 'derelict':
      return (
        <g className="shape-derelict">
          <path d="M-10,-4 L-2,-10 L9,-6 L6,3 L10,9 L-3,8 L-9,4 Z" />
          <path d="M-4,-3 L3,2 M0,-6 L-1,5" />
        </g>
      );
    default: {
      const hue = planetHue(sys.id);
      return (
        <g className="shape-planet">
          <circle r={11} fill={`hsl(${hue} 65% 52%)`} />
          <circle r={11} fill="url(#shade)" />
          {hue % 3 === 0 && <ellipse rx={18} ry={4.5} className="ring" transform="rotate(-20)" />}
        </g>
      );
    }
  }
}

const LABEL_POS: Record<StarSystem['label'], { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }> = {
  n: { dx: 0, dy: -22, anchor: 'middle' },
  s: { dx: 0, dy: 30, anchor: 'middle' },
  e: { dx: 20, dy: 5, anchor: 'start' },
  w: { dx: -20, dy: 5, anchor: 'end' },
};

/** Place les pions de plusieurs héros présents dans le même système. */
function tokenOffset(index: number, count: number) {
  if (count === 1) return { dx: 0, dy: 0 };
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  return { dx: Math.cos(angle) * 13, dy: Math.sin(angle) * 13 };
}

export function StarMap({
  state,
  reach,
  selected,
  onSystem,
}: {
  state: GameState;
  /** Systèmes accessibles (tour d'un joueur humain), null sinon. */
  reach: Map<string, number> | null;
  selected: string | null;
  onSystem: (id: string) => void;
}) {
  const { lang, t } = useT();
  const current = state.players[state.current];
  const missionAt = new Map(state.board.map((b) => [b.system, b.missionId]));

  return (
    <TransformWrapper
      minScale={1}
      maxScale={4}
      centerOnInit
      limitToBounds
      doubleClick={{ disabled: true }}
      wheel={{ step: 0.12 }}
    >
      <TransformComponent wrapperClass="map-wrap" contentClass="map-content">
        <svg className="starmap" viewBox={`0 0 ${SECTOR_W} ${SECTOR_H}`} aria-label={t('brand.full')}>
          <defs>
            <radialGradient id="space" cx="50%" cy="50%" r="75%">
              <stop offset="0" stopColor="#111a3d" />
              <stop offset="1" stopColor="#05070f" />
            </radialGradient>
            <radialGradient id="galaxy">
              <stop offset="0" stopColor="#7a4dff" />
              <stop offset="1" stopColor="#7a4dff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="galaxy2">
              <stop offset="0" stopColor="#1fb6ff" />
              <stop offset="1" stopColor="#1fb6ff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="nebula">
              <stop offset="0" stopColor="#ff6ad5" stopOpacity="0.75" />
              <stop offset="0.6" stopColor="#8a3cff" stopOpacity="0.35" />
              <stop offset="1" stopColor="#8a3cff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="shade" cx="35%" cy="30%" r="75%">
              <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.55" />
            </radialGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <Background />

          <g className="lanes">
            {LANES.map((l) => {
              const a = SYSTEM_BY_ID[l.a];
              const b = SYSTEM_BY_ID[l.b];
              const da = reach?.get(l.a);
              const db = reach?.get(l.b);
              let lit = false;
              if (da !== undefined && db !== undefined && Math.abs(da - db) === 1) {
                // on ne traverse pas une nébuleuse : le couloir qui en repart reste éteint
                lit = Math.min(da, db) === 0 || SYSTEM_BY_ID[da < db ? l.a : l.b].kind !== 'nebula';
              }
              return <line key={`${l.a}-${l.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={lit ? 'lane lit' : 'lane'} />;
            })}
          </g>

          <g className="systems">
            {SYSTEMS.map((sys) => {
              const canJump = reach?.has(sys.id) && sys.id !== current.pos;
              const label = LABEL_POS[sys.label];
              const missionId = missionAt.get(sys.id);
              const explored = state.explored.includes(sys.id);
              return (
                // biome-ignore lint/a11y/useSemanticElements: élément SVG cliquable
                <g
                  key={sys.id}
                  transform={`translate(${sys.x} ${sys.y})`}
                  className={`system ${sys.kind} ${canJump ? 'reachable' : ''} ${selected === sys.id ? 'selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={sys.name[lang]}
                  data-system={sys.id}
                  onClick={() => onSystem(sys.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSystem(sys.id)}
                >
                  <circle r={26} className="hit" />
                  {canJump && <circle r={21} className="reach-ring" />}
                  {selected === sys.id && <circle r={24} className="select-ring" />}
                  <SystemShape sys={sys} />
                  {!explored && sys.kind !== 'station' && <circle r={2.2} cx={-14} cy={12} className="unexplored" />}
                  <text x={label.dx} y={label.dy} textAnchor={label.anchor} className="sys-label">
                    {sys.name[lang]}
                  </text>
                  {missionId !== undefined && (
                    <g className="mission-pin" transform="translate(15 -15)">
                      <rect
                        x={-8}
                        y={-8}
                        width={16}
                        height={16}
                        transform="rotate(45)"
                        fill={TIER_FILL[MISSION_BY_ID[missionId].tier]}
                        filter="url(#glow)"
                      />
                      <text y={4} textAnchor="middle">
                        {MISSION_BY_ID[missionId].tier === 4 ? '☠' : MISSION_BY_ID[missionId].tier}
                      </text>
                      <title>{MISSION_BY_ID[missionId].name[lang]}</title>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          <g className="tokens">
            {state.players.map((h, seat) => {
              const sys = SYSTEM_BY_ID[h.pos];
              const here = state.players.map((p, k) => ({ p, k })).filter((x) => x.p.pos === h.pos);
              const { dx, dy } = tokenOffset(
                here.findIndex((x) => x.k === seat),
                here.length,
              );
              const active = seat === state.current && state.phase === 'playing';
              return (
                <motion.g
                  key={seat}
                  className={`token ${active ? 'active' : ''}`}
                  initial={false}
                  animate={{ x: sys.x + dx, y: sys.y + dy }}
                  transition={{ type: 'spring', stiffness: 120, damping: 16 }}
                  style={{ pointerEvents: 'none' }}
                >
                  {active && <circle r={13} className="token-pulse" stroke={PLAYER_FILL[h.color]} />}
                  <circle r={active ? 9.5 : 8} fill={PLAYER_FILL[h.color]} className="token-body" />
                  <text y={3.6} textAnchor="middle" className="token-glyph">
                    {CLASSES[h.classId].glyph}
                  </text>
                </motion.g>
              );
            })}
          </g>
        </svg>
      </TransformComponent>
    </TransformWrapper>
  );
}
