import { getPref } from './prefs';

/**
 * Effets sonores du jeu, synthétisés avec la Web Audio API (aucun fichier audio).
 * Volume volontairement discret ; coupés dans les réglages.
 */

const VOLUME = 0.32;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let lastPlay = 0;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.6);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine', glideTo?: number) {
  const c = ctx!;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(env).connect(master!);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function hiss(start: number, dur: number, gain: number, freq: number, q = 1, sweepTo?: number) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(freq, start);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, start + dur);
  filter.Q.value = q;
  const env = c.createGain();
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(env).connect(master!);
  src.start(start);
  src.stop(start + dur + 0.02);
}

export type Sound = 'jump' | 'dice' | 'success' | 'fail' | 'levelUp' | 'crisis' | 'turn' | 'react' | 'error' | 'victory';

const SOUNDS: Record<Sound, (t: number) => void> = {
  // saut hyperspatial : souffle qui monte et note glissée
  jump: (t) => {
    hiss(t, 0.35, 0.35, 400, 0.8, 3200);
    tone(220, t, 0.35, 0.08, 'sawtooth', 880);
  },
  // le d20 roule : petits chocs
  dice: (t) => {
    for (let i = 0; i < 6; i++) {
      hiss(t + i * 0.07 + (i % 2) * 0.01, 0.05, 0.4 - i * 0.04, 1800 + i * 200, 2);
    }
  },
  success: (t) => {
    [660, 880, 1320].forEach((f, i) => {
      tone(f, t + i * 0.08, 0.45, 0.15, 'triangle');
    });
  },
  fail: (t) => {
    tone(330, t, 0.3, 0.14, 'square', 220);
    tone(247, t + 0.18, 0.45, 0.12, 'square', 165);
  },
  levelUp: (t) => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      tone(f, t + i * 0.07, 0.5, 0.12, 'triangle');
    });
  },
  // crise : sirène grave
  crisis: (t) => {
    for (const s of [0, 0.5]) tone(180, t + s, 0.45, 0.16, 'sawtooth', 360);
    hiss(t, 1, 0.15, 200, 0.6);
  },
  // à votre tour : deux bips clairs
  turn: (t) => {
    tone(988, t, 0.14, 0.16, 'sine');
    tone(1319, t + 0.16, 0.22, 0.16, 'sine');
  },
  react: (t) => {
    tone(1568, t, 0.12, 0.1, 'sine', 2093);
  },
  error: (t) => {
    tone(196, t, 0.18, 0.12, 'square', 150);
  },
  victory: (t) => {
    [523, 659, 784, 1047].forEach((f, i) => {
      tone(f, t + i * 0.13, 0.35, 0.16, 'triangle');
    });
    for (const f of [523, 659, 784]) tone(f, t + 0.55, 1.4, 0.1, 'triangle');
  },
};

/** Joue un effet (sauf s'il vient d'en être joué un, pour ne pas saturer quand les ordinateurs jouent vite). */
export function playSfx(sound: Sound) {
  if (!getPref('sfx')) return;
  const c = audio();
  if (!c) return;
  const now = c.currentTime;
  if (now - lastPlay < 0.06) return;
  lastPlay = now;
  SOUNDS[sound](now + 0.01);
}
