import type { ClassId, GameState, SpeciesId } from './types';

/**
 * Fiche d'un joueur, calculée à partir des parties terminées
 * (côté serveur : table `games` ; hors ligne : stockage du navigateur).
 */

export interface FinishedGame {
  id: number;
  /** Date de fin (ISO ou « AAAA-MM-JJ HH:MM:SS »). */
  date: string;
  state: GameState;
}

export interface HistoryEntry {
  gameId: number;
  date: string;
  classId: ClassId;
  score: number;
  rank: number;
  players: number;
  won: boolean;
}

export interface PlayerProfile {
  name: string;
  isBot: boolean;
  games: number;
  wins: number;
  avgScore: number;
  bestScore: number;
  missions: number;
  /** Mises hors de combat. */
  kos: number;
  /** Classes jouées, de la plus jouée à la moins jouée. */
  classes: { classId: ClassId; games: number; wins: number }[];
  species: { speciesId: SpeciesId; games: number }[];
  /** Du plus ancien au plus récent. */
  history: HistoryEntry[];
}

export function playerProfile(name: string, games: FinishedGame[]): PlayerProfile | null {
  const history: HistoryEntry[] = [];
  const classes = new Map<ClassId, { games: number; wins: number }>();
  const species = new Map<SpeciesId, number>();
  let isBot = false;
  let missions = 0;
  let kos = 0;

  const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  for (const g of sorted) {
    const seat = g.state.players.findIndex((p) => p.name === name);
    const result = g.state.results?.find((r) => r.seat === seat);
    if (seat < 0 || !result) continue;
    const hero = g.state.players[seat];
    const won = result.rank === 1;
    isBot ||= hero.isBot;
    missions += result.missions;
    kos += hero.kos;
    const c = classes.get(hero.classId) ?? { games: 0, wins: 0 };
    classes.set(hero.classId, { games: c.games + 1, wins: c.wins + (won ? 1 : 0) });
    species.set(hero.speciesId, (species.get(hero.speciesId) ?? 0) + 1);
    history.push({
      gameId: g.id,
      date: g.date,
      classId: hero.classId,
      score: result.total,
      rank: result.rank,
      players: g.state.players.length,
      won,
    });
  }
  if (history.length === 0) return null;

  const total = history.reduce((s, h) => s + h.score, 0);
  return {
    name,
    isBot,
    games: history.length,
    wins: history.filter((h) => h.won).length,
    avgScore: Math.round((10 * total) / history.length) / 10,
    bestScore: Math.max(...history.map((h) => h.score)),
    missions,
    kos,
    classes: [...classes.entries()]
      .map(([classId, v]) => ({ classId, ...v }))
      .sort((a, b) => b.games - a.games || b.wins - a.wins),
    species: [...species.entries()].map(([speciesId, n]) => ({ speciesId, games: n })).sort((a, b) => b.games - a.games),
    history,
  };
}
