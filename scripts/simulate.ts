import { botAction } from '../shared/bot';
import { CLASS_IDS, SPECIES_IDS } from '../shared/data';
import { applyAction, createGame } from '../shared/engine';
import type { BotLevel, ClassId, HeroConfig, PlayerColor } from '../shared/types';

/**
 * Équilibrage : simule des parties entre ordinateurs et affiche les victoires par classe,
 * la durée moyenne et la manière dont la partie se termine.
 * Usage : npm run simulate -- [parties=300] [héros=4]
 */

const games = Number(process.argv[2] ?? 300);
const size = Number(process.argv[3] ?? 4);
const COLORS: PlayerColor[] = ['cyan', 'magenta', 'lime', 'amber', 'violet'];
const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];

const wins: Record<string, number> = {};
const seats: Record<string, number> = {};
const levelWins: Record<BotLevel, number> = { easy: 0, normal: 0, hard: 0 };
let rounds = 0;
let byThreat = 0;
let bossKills = 0;
let totalScore = 0;
let kos = 0;
const actions: Record<string, number> = {};
let outposts = 0;
let outpostLevels = 0;
let found = 0;

for (let g = 0; g < games; g++) {
  const pick = <T>(arr: T[], i: number) => arr[(g * 7 + i * 3) % arr.length];
  const cfg: HeroConfig[] = Array.from({ length: size }, (_, i) => ({
    name: `B${i}`,
    isBot: true,
    color: COLORS[i],
    classId: CLASS_IDS[(g + i) % CLASS_IDS.length] as ClassId,
    speciesId: pick(SPECIES_IDS, i),
    level: process.env.LEVEL ? (process.env.LEVEL as BotLevel) : LEVELS[(g + Math.floor(g / CLASS_IDS.length) + i) % 3],
  }));
  let s = createGame(cfg, 1000 + g);
  while (s.phase === 'playing') {
    const action = botAction(s);
    actions[action.type] = (actions[action.type] ?? 0) + 1;
    s = applyAction(s, s.current, action);
  }
  const built = Object.values(s.outposts);
  outposts += built.length;
  outpostLevels += built.reduce((n, o) => n + o.level, 0);
  found += s.players.reduce((n, p) => n + p.found.length, 0);
  rounds += s.round;
  if (s.players.every((p) => p.renown < 40)) byThreat += 1;
  if (s.players.some((p) => p.missions.includes(99))) bossKills += 1;
  for (const r of s.results!) {
    const p = s.players[r.seat];
    seats[p.classId] = (seats[p.classId] ?? 0) + 1;
    totalScore += r.total;
    kos += p.kos;
    if (r.rank === 1) {
      wins[p.classId] = (wins[p.classId] ?? 0) + 1;
      levelWins[p.level ?? 'normal'] += 1;
    }
  }
}

console.log(`${games} parties à ${size} héros`);
console.log(
  `tours de table moyens : ${(rounds / games).toFixed(1)}  ·  fin par la menace : ${Math.round((100 * byThreat) / games)} %`,
);
console.log(
  `Vaisseau-Ruche détruit : ${Math.round((100 * bossKills) / games)} %  ·  score moyen : ${(totalScore / games / size).toFixed(1)}`,
);
console.log(`mises hors de combat par héros : ${(kos / games / size).toFixed(2)}`);
for (const c of CLASS_IDS)
  console.log(`  ${c.padEnd(13)} ${Math.round((100 * (wins[c] ?? 0)) / (seats[c] ?? 1))} % de victoires`);
console.log(`  niveaux : ${LEVELS.map((l) => `${l} ${levelWins[l]}`).join(' · ')}`);
const turns = Object.entries(actions)
  .filter(([type]) => type !== 'move' && type !== 'buy' && type !== 'settle')
  .reduce((n, [, v]) => n + v, 0);
console.log(
  `actions de fin de tour : ${Object.entries(actions)
    .filter(([type]) => type !== 'move' && type !== 'buy' && type !== 'settle')
    .map(([type, v]) => `${type} ${Math.round((100 * v) / turns)} %`)
    .join(' · ')}`,
);
console.log(`constructions (fondations et améliorations) par partie : ${((actions.settle ?? 0) / games).toFixed(1)}`);
console.log(
  `avant-postes par partie : ${(outposts / games).toFixed(1)} (niveau moyen ${(outpostLevels / Math.max(1, outposts)).toFixed(1)})  ·  activités découvertes par héros : ${(found / games / size).toFixed(1)}`,
);
