/** Level curve: level 1 at 0 XP, level 2 at 100, level 3 at 400, ... */
export function levelForXp(xp: number): number {
  const safe = Math.max(0, xp);
  return Math.floor(Math.sqrt(safe / 100)) + 1;
}

export function xpForLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return 100 * (safe - 1) ** 2;
}

export interface LevelProgress {
  level: number;
  xp: number;
  intoLevel: number;
  needed: number;
  pct: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const needed = Math.max(1, next - floor);
  const intoLevel = Math.max(0, xp - floor);
  return { level, xp, intoLevel, needed, pct: Math.min(1, intoLevel / needed) };
}

export interface MatchRewardInput {
  placement: number;
  playerCount: number;
  /** Cards left in every opponent's hand when you won (0 for losers). */
  opponentCardsLeft: number;
  cardsPlayed: number;
  jumps: number;
}

export interface MatchRewards {
  coins: number;
  xp: number;
}

/**
 * Deliberately generous for winners, still worth something for a loss.
 * Guests never persist these.
 */
export function matchRewards(input: MatchRewardInput): MatchRewards {
  const won = input.placement === 1;
  if (won) {
    return {
      coins: 110 + input.opponentCardsLeft * 6 + input.jumps * 10,
      xp: 85 + input.opponentCardsLeft * 5 + input.cardsPlayed,
    };
  }
  const participation = Math.max(1, input.playerCount - 1);
  const base = Math.round(40 / Math.sqrt(input.placement - 0.5));
  return {
    coins: 18 + base + Math.min(20, Math.round(participation * 2)),
    xp: 22 + Math.round(base / 2) + input.cardsPlayed + input.jumps * 3,
  };
}
