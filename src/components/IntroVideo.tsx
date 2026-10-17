import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CLASSES, CLASS_IDS, SPECIES_IDS } from '../../shared/data';
import { BOOST, CREDITS_PER_POINT, CRISES, DC, LEGEND_BONUS, MAX_THREAT, MISSION_REWARD, RENOWN_GOAL } from '../../shared/engine';
import type { Lang, MessageKey } from '../../shared/i18n';
import { HOME, LANES, SECTOR_H, SECTOR_W, SYSTEM_BY_ID, SYSTEMS } from '../../shared/sector';
import type { Tier } from '../../shared/types';
import { markIntroSeen } from '../lib/intro';
import { setPref, usePref } from '../lib/prefs';
import { useT } from '../lib/i18n';
import { PLAYER_COLORS, PLAYER_FILL, TIER_FILL } from '../lib/theme';

/**
 * Présentation du jeu en motion design, jouée comme une vidéo : chapitres animés,
 * sous-titres, voix off (synthèse vocale du navigateur) et contrôles de lecture.
 */

// ---------------------------------------------------------------- scènes

/** Traînées d'étoiles du saut hyperspatial (positions fixes). */
const WARP = Array.from({ length: 36 }, (_, i) => ({ a: (i * 137.5) % 360, d: (i % 9) * 0.18, l: 20 + (i % 5) * 9 }));

function SceneTitle() {
  const { t } = useT();
  return (
    <div className="iv-scene iv-center">
      <div className="iv-warp" aria-hidden>
        {WARP.map((w, i) => (
          <i key={i} style={{ '--a': `${w.a}deg`, '--l': `${w.l}cqw`, animationDelay: `${w.d}s` } as React.CSSProperties} />
        ))}
      </div>
      <motion.p className="iv-kicker" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        {t('intro.kicker')}
      </motion.p>
      <motion.h2
        className="iv-logo"
        initial={{ opacity: 0, scale: 0.4, letterSpacing: '0.6em' }}
        animate={{ opacity: 1, scale: 1, letterSpacing: '0.08em' }}
        transition={{ type: 'spring', stiffness: 120, damping: 15, delay: 0.6 }}
      >
        {t('brand.title')}
      </motion.h2>
      <motion.p className="iv-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>
        {t('brand.subtitle')}
      </motion.p>
      <motion.div
        className="iv-ship"
        aria-hidden
        initial={{ x: '-70cqw', y: '8cqw', rotate: 8 }}
        animate={{ x: '70cqw', y: '-6cqw', rotate: -4 }}
        transition={{ duration: 4.5, ease: [0.4, 0, 0.2, 1], delay: 1.6 }}
      >
        🚀
      </motion.div>
    </div>
  );
}

function SceneHeroes() {
  const { t } = useT();
  return (
    <div className="iv-scene iv-center">
      <motion.div className="iv-step" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        {t('intro.classes')}
      </motion.div>
      <div className="iv-classes">
        {CLASS_IDS.map((c, i) => (
          <motion.div
            key={c}
            className="iv-class"
            style={{ '--c': PLAYER_FILL[PLAYER_COLORS[i % PLAYER_COLORS.length]] } as React.CSSProperties}
            initial={{ opacity: 0, scale: 0, rotate: -30 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ delay: 0.5 + i * 0.3, type: 'spring', stiffness: 260, damping: 14 }}
          >
            <span className="iv-glyph">{CLASSES[c].glyph}</span>
            <small>{t(`class.${c}` as MessageKey)}</small>
          </motion.div>
        ))}
      </div>
      <div className="iv-species">
        {SPECIES_IDS.map((sp, i) => (
          <motion.span
            key={sp}
            className="iv-chip"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.8 + i * 0.25 }}
          >
            {t(`species.${sp}` as MessageKey)}
          </motion.span>
        ))}
      </div>
      <motion.p className="iv-legend" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 4 }}>
        {t('intro.species')}
      </motion.p>
    </div>
  );
}

// trajet de démonstration : deux sauts depuis la station de départ
const HOP1 = LANES.find((l) => l.a === HOME || l.b === HOME)!;
const MID = HOP1.a === HOME ? HOP1.b : HOP1.a;
const HOP2 = LANES.find((l) => (l.a === MID || l.b === MID) && l !== HOP1 && l.a !== HOME && l.b !== HOME)!;
const END = HOP2.a === MID ? HOP2.b : HOP2.a;
const ROUTE = [HOME, MID, END].map((id) => SYSTEM_BY_ID[id]);

function SceneSector() {
  const { t, lang } = useT();
  return (
    <div className="iv-scene iv-split">
      <svg viewBox={`0 0 ${SECTOR_W} ${SECTOR_H}`} className="iv-map" aria-hidden>
        {LANES.map((l, i) => {
          const a = SYSTEM_BY_ID[l.a];
          const b = SYSTEM_BY_ID[l.b];
          const lit = l === HOP1 || l === HOP2;
          return (
            <motion.line
              key={`${l.a}-${l.b}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={lit ? 'iv-lane lit' : 'iv-lane'}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 0.3 + (i % 12) * 0.08, duration: 0.8 }}
            />
          );
        })}
        {SYSTEMS.map((sys, i) => (
          <motion.circle
            key={sys.id}
            cx={sys.x}
            cy={sys.y}
            r={sys.kind === 'station' ? 14 : 10}
            className={`iv-sys ${sys.kind}`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            transition={{ delay: 0.2 + i * 0.05, type: 'spring', stiffness: 380, damping: 14 }}
          />
        ))}
        <motion.circle
          r={16}
          className="iv-token"
          initial={{ cx: ROUTE[0].x, cy: ROUTE[0].y, opacity: 0 }}
          animate={{ cx: ROUTE.map((s) => s.x), cy: ROUTE.map((s) => s.y), opacity: 1 }}
          transition={{
            opacity: { delay: 2 },
            cx: { delay: 2.6, duration: 2.2, times: [0, 0.5, 1], ease: 'easeInOut' },
            cy: { delay: 2.6, duration: 2.2, times: [0, 0.5, 1], ease: 'easeInOut' },
          }}
        />
      </svg>
      <div className="iv-side">
        <motion.div className="iv-big" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }}>
          {t('intro.jumps')}
        </motion.div>
        <motion.p className="iv-text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6 }}>
          {ROUTE.map((s) => s.name[lang as Lang]).join(' → ')}
        </motion.p>
        <motion.p className="iv-text muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 4.8 }}>
          {t('intro.then')}
        </motion.p>
      </div>
    </div>
  );
}

const ROLL = 14;
const BONUS = 5;

function SceneDice() {
  const { t } = useT();
  const [face, setFace] = useState(1);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      if (n >= 18) {
        clearInterval(timer);
        setFace(ROLL);
        setSettled(true);
      } else setFace(1 + ((n * 7) % 20));
    }, 90);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="iv-scene iv-center">
      <motion.div className="iv-step" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        {t('intro.d20')}
      </motion.div>
      <motion.div
        className={`iv-die ${settled ? 'settled' : ''}`}
        initial={{ rotate: -360, scale: 0.4 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ duration: 1.6, ease: 'easeOut' }}
      >
        <svg viewBox="0 0 100 100" aria-hidden>
          <polygon points="50,4 92,28 92,72 50,96 8,72 8,28" />
          <polygon points="50,22 78,68 22,68" className="iv-die-face" />
        </svg>
        <span>{face}</span>
      </motion.div>
      <motion.div
        className="iv-equation"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.2 }}
      >
        <b>{ROLL}</b> + {BONUS} ⚔ = <b>{ROLL + BONUS}</b> ≥ {t('intro.dc', { n: DC[2] })}
      </motion.div>
      <motion.div
        className="iv-success"
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 3.2, type: 'spring', stiffness: 260, damping: 12 }}
      >
        ✓ {t('intro.success')}
      </motion.div>
      <motion.p className="iv-legend" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 4.4 }}>
        ◆ {t('intro.resolve', { n: BOOST })}
      </motion.p>
    </div>
  );
}

const TIERS: Tier[] = [1, 2, 3];

function SceneMissions() {
  const { t } = useT();
  return (
    <div className="iv-scene iv-center">
      <motion.div className="iv-step" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        {t('intro.missions')}
      </motion.div>
      <div className="iv-cards">
        {TIERS.map((tier, i) => (
          <motion.div
            key={tier}
            className="iv-mission"
            style={{ '--c': TIER_FILL[tier] } as React.CSSProperties}
            initial={{ opacity: 0, y: 60, rotate: (i - 1) * 12 }}
            animate={{ opacity: 1, y: 0, rotate: (i - 1) * 4 }}
            transition={{ delay: 0.5 + i * 0.4, type: 'spring', stiffness: 180, damping: 15 }}
          >
            <span className="iv-tier">{t('intro.tier', { n: tier })}</span>
            <span className="iv-dc">{t('intro.dc', { n: DC[tier] })}</span>
            <b className="iv-reward">+{MISSION_REWARD[tier].renown} ★</b>
            <small>+{MISSION_REWARD[tier].credits} ◎</small>
          </motion.div>
        ))}
      </div>
      <motion.div
        className="iv-callout"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 3 }}
      >
        {t('intro.fail')}
      </motion.div>
    </div>
  );
}

function SceneBlight() {
  const { t } = useT();
  const hive = CRISES[1];
  return (
    <div className="iv-scene iv-center">
      <motion.div className="iv-step danger" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        ☣ {t('intro.threat')}
      </motion.div>
      <div className="iv-track">
        {Array.from({ length: MAX_THREAT }, (_, i) => (
          <motion.i
            key={i}
            className={CRISES.includes(i + 1) ? 'crisis' : ''}
            initial={{ background: 'rgba(255,255,255,0.08)' }}
            animate={{ background: CRISES.includes(i + 1) ? '#ff4fd8' : '#ff5c6c' }}
            transition={{ delay: 0.6 + i * 0.22, duration: 0.2 }}
          />
        ))}
      </div>
      <div className="iv-crises">
        {CRISES.map((c) => (
          <motion.span
            key={c}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 + c * 0.22 }}
          >
            {t('intro.crisis', { n: c })}
          </motion.span>
        ))}
      </div>
      <motion.div
        className="iv-hive"
        aria-hidden
        initial={{ opacity: 0, scale: 0.2, rotate: -90 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ delay: 0.8 + hive * 0.22, type: 'spring', stiffness: 90, damping: 12 }}
      >
        ⬢
      </motion.div>
      <motion.p className="iv-legend" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 + hive * 0.22 }}>
        {t('intro.hive', { n: DC[4] })}
      </motion.p>
    </div>
  );
}

function SceneVictory() {
  const { t } = useT();
  const renown = useMotionValue(0);
  const shown = useTransform(renown, (v) => Math.round(v));
  useEffect(() => {
    const ctrl = animate(renown, RENOWN_GOAL, { duration: 2.6, delay: 0.5, ease: 'easeOut' });
    return () => ctrl.stop();
  }, [renown]);
  return (
    <div className="iv-scene iv-center">
      <div className="iv-counter">
        <span className="iv-counter-icon">★</span>
        <motion.span className="iv-counter-num">{shown}</motion.span>
        <span className="iv-counter-label">/ {RENOWN_GOAL}</span>
      </div>
      <motion.div
        className="iv-banner"
        initial={{ scale: 0, rotate: -8 }}
        animate={{ scale: 1, rotate: -3 }}
        transition={{ delay: 3.2, type: 'spring', stiffness: 260, damping: 12 }}
      >
        🏆 {t('intro.legendary')}
      </motion.div>
      <motion.div
        className="iv-equation"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 4.4 }}
      >
        {t('intro.score', { n: CREDITS_PER_POINT, bonus: LEGEND_BONUS })}
      </motion.div>
    </div>
  );
}

function SceneOutro({ onFinish }: { onFinish: () => void }) {
  const { t } = useT();
  return (
    <div className="iv-scene iv-center iv-outro">
      <motion.div
        className="iv-ship static"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1 }}
      >
        🚀
      </motion.div>
      <motion.h2
        className="iv-logo small"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        {t('intro.yourTurn')}
      </motion.h2>
      <motion.button
        type="button"
        className="btn primary big"
        onClick={onFinish}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.2, type: 'spring' }}
      >
        🚀 {t('intro.go')}
      </motion.button>
    </div>
  );
}

interface Chapter {
  render: (finish: () => void) => React.ReactNode;
}

/** Huit chapitres : titres et sous-titres dans le dictionnaire (`intro.t0`…, `intro.c0`…). */
const CHAPTERS: Chapter[] = [
  { render: () => <SceneTitle /> },
  { render: () => <SceneHeroes /> },
  { render: () => <SceneSector /> },
  { render: () => <SceneDice /> },
  { render: () => <SceneMissions /> },
  { render: () => <SceneBlight /> },
  { render: () => <SceneVictory /> },
  { render: (finish) => <SceneOutro onFinish={finish} /> },
];

/** Durée d'un chapitre : le temps de lire (ou d'entendre) le sous-titre, avec un minimum. */
const durationOf = (caption: string) => Math.max(6, caption.length / 14 + 2);

// ---------------------------------------------------------------- voix off

function useVoice(enabled: boolean, lang: Lang) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (!supported) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
      voiceRef.current =
        voices.find((v) => /natural|google|amélie|thomas|denise|henri|sonia|libby|ryan/i.test(v.name)) ?? voices[0] ?? null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', pick);
      speechSynthesis.cancel();
    };
  }, [supported, lang]);

  const say = useCallback(
    (text: string) => {
      if (!supported) return;
      speechSynthesis.cancel();
      if (!enabled) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'fr' ? 'fr-FR' : 'en-GB';
      u.rate = 1.05;
      if (voiceRef.current) u.voice = voiceRef.current;
      speechSynthesis.speak(u);
    },
    [enabled, supported, lang],
  );
  const pause = useCallback(() => supported && speechSynthesis.pause(), [supported]);
  const resume = useCallback(() => supported && speechSynthesis.resume(), [supported]);
  const stop = useCallback(() => supported && speechSynthesis.cancel(), [supported]);
  return { supported, say, pause, resume, stop };
}

// ---------------------------------------------------------------- lecteur

export function IntroVideo({ onClose }: { onClose: () => void }) {
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [elapsed, setElapsed] = useState(0); // secondes écoulées dans le chapitre
  const voiceOn = usePref('introVoice');
  const { t, lang } = useT();
  const voice = useVoice(voiceOn, lang);
  const captions = useMemo(() => CHAPTERS.map((_, i) => t(`intro.c${i}` as MessageKey)), [t]);
  const titles = useMemo(() => CHAPTERS.map((_, i) => t(`intro.t${i}` as MessageKey)), [t]);
  const durations = useMemo(() => captions.map(durationOf), [captions]);
  const total = durations.reduce((a, b) => a + b, 0);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const close = useCallback(() => {
    voice.stop();
    markIntroSeen();
    onClose();
  }, [onClose, voice]);

  const goTo = useCallback(
    (i: number) => {
      setChapter(i);
      setElapsed(0);
      voice.say(captions[i]);
    },
    [voice, captions],
  );

  // horloge du lecteur (setInterval plutôt que requestAnimationFrame : continue même si l'onglet ralentit)
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (elapsed < durations[chapter]) return;
    if (chapter < CHAPTERS.length - 1) goTo(chapter + 1);
    else setPlaying(false); // dernier chapitre : on reste sur « À vous de jouer »
  }, [elapsed, chapter, goTo, durations]);

  const start = () => {
    setStarted(true);
    setPlaying(true);
    goTo(0);
  };

  const togglePlay = () => {
    if (chapter === CHAPTERS.length - 1 && elapsed >= durations[chapter] - 0.1) {
      setPlaying(true);
      goTo(0);
      return;
    }
    if (playing) voice.pause();
    else voice.resume();
    setPlaying((p) => !p);
  };

  // raccourcis clavier : réabonnés à chaque rendu pour rester à jour
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === ' ' && started) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggleVoice = () => {
    const next = !voiceOn;
    setPref('introVoice', next);
    if (!next) voice.stop();
  };
  // relance la phrase courante quand on réactive la voix
  const prevVoice = useRef(voiceOn);
  useEffect(() => {
    if (voiceOn && !prevVoice.current && playing) voice.say(captions[chapter]);
    prevVoice.current = voiceOn;
  }, [voiceOn, playing, chapter, voice, captions]);

  const before = useMemo(() => durations.slice(0, chapter).reduce((a, b) => a + b, 0), [chapter, durations]);
  const remaining = Math.max(0, Math.ceil(total - before - elapsed));

  return (
    <motion.div className="backdrop intro-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        ref={dialogRef}
        className="intro"
        role="dialog"
        aria-modal="true"
        aria-label={t('intro.label')}
        tabIndex={-1}
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        <div className="intro-head">
          <span className="intro-title">{t('intro.header')}</span>
          <button type="button" className="btn ghost small" onClick={close}>
            {chapter === CHAPTERS.length - 1 ? t('intro.close') : t('intro.skip')} ✕
          </button>
        </div>

        <div className="intro-stage">
          {started ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={chapter}
                className="intro-frame"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                {CHAPTERS[chapter].render(close)}
              </motion.div>
            </AnimatePresence>
          ) : (
            <button type="button" className="intro-poster" onClick={start}>
              <span className="iv-logo">{t('brand.title')}</span>
              <span className="intro-play" aria-hidden>
                ▶
              </span>
              <span className="intro-hint">{t('intro.hint', { n: Math.max(1, Math.round(total / 60)) })}</span>
            </button>
          )}
        </div>

        <p className="intro-caption" aria-live="polite">
          {started ? captions[chapter] : t('intro.poster')}
        </p>

        <div className="intro-controls">
          <button
            type="button"
            className="intro-btn"
            onClick={started ? togglePlay : start}
            aria-label={playing ? t('intro.pause') : t('intro.play')}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <div className="intro-chapters">
            {CHAPTERS.map((_, i) => (
              <button
                key={i}
                type="button"
                className="intro-chapter"
                style={{ flexGrow: durations[i] }}
                onClick={() => {
                  if (!started) setStarted(true);
                  setPlaying(true);
                  goTo(i);
                }}
                aria-label={t('intro.chapter', { n: i + 1, title: titles[i] })}
                title={titles[i]}
              >
                <span
                  className="intro-chapter-fill"
                  style={{
                    width: `${!started || i > chapter ? 0 : i < chapter ? 100 : Math.min(100, (elapsed / durations[i]) * 100)}%`,
                  }}
                />
              </button>
            ))}
          </div>
          <span className="intro-time">
            {started ? `-${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : ''}
          </span>
          {voice.supported && (
            <button
              type="button"
              className={`intro-btn ${voiceOn ? '' : 'off'}`}
              onClick={toggleVoice}
              aria-pressed={voiceOn}
              aria-label={voiceOn ? t('intro.voiceOff') : t('intro.voiceOn')}
              title={voiceOn ? t('intro.voiceOff') : t('intro.voiceOn')}
            >
              {voiceOn ? '🔊' : '🔈'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
