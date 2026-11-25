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
 * A round only pays out when at least two humans are seated. Bot-only tables
 * are practice: no XP, coins, stats or achievements.
 */
export function roundIsRanked(humanPlayers: number): boolean {
  return humanPlayers >= 2;
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

export interface HumanMatchRewardInput {
  placement: number;
  /** Non-bot seats at the table, including this player. */
  humanPlayers: number;
  /** Cards left in the other humans' hands only. Bots never count. */
  opponentCardsLeft: number;
  cardsPlayed: number;
  jumps: number;
}

/**
 * Rewards are only paid when a real opponent is seated. A bot-only table is
 * practice: 0 coins and 0 XP, no matter how badly the bots lost.
 */
export function matchRewardsForHumans(input: HumanMatchRewardInput): MatchRewards {
  if (!roundIsRanked(input.humanPlayers)) return { coins: 0, xp: 0 };
  return matchRewards({
    placement: input.placement,
    playerCount: input.humanPlayers,
    opponentCardsLeft: input.opponentCardsLeft,
    cardsPlayed: input.cardsPlayed,
    jumps: input.jumps,
  });
}
