/**
 * Cosmetic catalogue. The server is the source of truth for prices and
 * unlock conditions; the client only renders them.
 */

export type CosmeticSlot = "cardBack" | "table" | "avatar" | "nameEffect" | "winEffect";
export type Rarity = "common" | "rare" | "epic" | "legendary";

export type Unlock =
  | { type: "default" }
  | { type: "shop"; price: number }
  | { type: "level"; level: number }
  | { type: "achievement"; id: string }
  /** Hidden from the public catalogue. Granted by users.is_owner. */
  | { type: "owner" }
  /** Hidden from the public catalogue. Granted by users.is_beta_tester. */
  | { type: "beta" };

export interface CosmeticItem {
  id: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
  rarity: Rarity;
  unlock: Unlock;
}

export const SLOT_LABEL: Record<CosmeticSlot, string> = {
  cardBack: "Card backs",
  table: "Tables",
  avatar: "Avatars",
  nameEffect: "Name effects",
  winEffect: "Win effects",
};

export const SLOT_FALLBACK: Record<CosmeticSlot, string> = {
  cardBack: "midnight",
  table: "noir",
  avatar: "rook",
  nameEffect: "plain",
  winEffect: "none",
};

export const COSMETICS: CosmeticItem[] = [
  // ── Card backs ──────────────────────────────────────────────────────────
  {
    id: "midnight",
    slot: "cardBack",
    name: "Midnight",
    description: "The house deck. Quiet, sharp, always in style.",
    rarity: "common",
    unlock: { type: "default" },
  },
  {
    id: "ember",
    slot: "cardBack",
    name: "Ember",
    description: "Slow-burning orange with a hot core.",
    rarity: "rare",
    unlock: { type: "shop", price: 400 },
  },
  {
    id: "jade",
    slot: "cardBack",
    name: "Jade",
    description: "Deep green lacquer and a thin gold edge.",
    rarity: "rare",
    unlock: { type: "shop", price: 700 },
  },
  {
    id: "carbon",
    slot: "cardBack",
    name: "Carbon",
    description: "Woven charcoal. Looks expensive because it is.",
    rarity: "epic",
    unlock: { type: "shop", price: 1200 },
  },
  {
    id: "aurora",
    slot: "cardBack",
    name: "Aurora",
    description: "Polar light caught under glass. Reaches level 6.",
    rarity: "epic",
    unlock: { type: "level", level: 6 },
  },
  {
    id: "holo",
    slot: "cardBack",
    name: "Holographic",
    description: "Ten wins. The foil does the talking.",
    rarity: "legendary",
    unlock: { type: "achievement", id: "win_10" },
  },
  {
    id: "blossom",
    slot: "cardBack",
    name: "Blossom",
    description: "Ink-washed petals for players who like a soft table.",
    rarity: "epic",
    unlock: { type: "shop", price: 1800 },
  },
  {
    id: "prism",
    slot: "cardBack",
    name: "Prism Foil",
    description: "Owner only. A full spectrum folded into the deck.",
    rarity: "legendary",
    unlock: { type: "owner" },
  },
  {
    id: "vanguard",
    slot: "cardBack",
    name: "Vanguard",
    description: "Beta tester only. The very first deck ever shuffled. It still hums.",
    rarity: "legendary",
    unlock: { type: "beta" },
  },

  // ── Tables ──────────────────────────────────────────────────────────────
  {
    id: "noir",
    slot: "table",
    name: "Noir",
    description: "Black felt, warm spotlight, no distractions.",
    rarity: "common",
    unlock: { type: "default" },
  },
  {
    id: "ember-room",
    slot: "table",
    name: "Ember Room",
    description: "A table lit from below like a forge.",
    rarity: "rare",
    unlock: { type: "shop", price: 500 },
  },
  {
    id: "jade-pit",
    slot: "table",
    name: "Jade Pit",
    description: "Classic casino green with soft gold rails.",
    rarity: "rare",
    unlock: { type: "shop", price: 650 },
  },
  {
    id: "ocean",
    slot: "table",
    name: "Deep End",
    description: "Cold blue light and a long way down.",
    rarity: "rare",
    unlock: { type: "shop", price: 650 },
  },
  {
    id: "sunset",
    slot: "table",
    name: "Golden Hour",
    description: "The last twenty minutes of a good day.",
    rarity: "epic",
    unlock: { type: "level", level: 8 },
  },
  {
    id: "arcade",
    slot: "table",
    name: "Arcade Carpet",
    description: "Twenty-five games played. You earned the carpet.",
    rarity: "epic",
    unlock: { type: "achievement", id: "games_25" },
  },
  {
    id: "frost",
    slot: "table",
    name: "Frost",
    description: "A table that bites back.",
    rarity: "legendary",
    unlock: { type: "shop", price: 1500 },
  },
  {
    id: "owners-box",
    slot: "table",
    name: "The Owner's Box",
    description: "Owner only. The felt itself refuses to pick one colour.",
    rarity: "legendary",
    unlock: { type: "owner" },
  },
  {
    id: "lab",
    slot: "table",
    name: "The Lab",
    description: "Beta tester only. Where the deck was broken in. The grid never quite switches off.",
    rarity: "legendary",
    unlock: { type: "beta" },
  },

  // ── Avatars ─────────────────────────────────────────────────────────────
  {
    id: "rook",
    slot: "avatar",
    name: "Rook",
    description: "A straight edge and a steady hand.",
    rarity: "common",
    unlock: { type: "default" },
  },
  {
    id: "comet",
    slot: "avatar",
    name: "Comet",
    description: "Something moving very fast, slightly on fire.",
    rarity: "rare",
    unlock: { type: "shop", price: 300 },
  },
  {
    id: "fox",
    slot: "avatar",
    name: "Fox",
    description: "Reads the table. Says nothing.",
    rarity: "rare",
    unlock: { type: "shop", price: 450 },
  },
  {
    id: "ghost",
    slot: "avatar",
    name: "Ghost",
    description: "Was here last round. Probably.",
    rarity: "rare",
    unlock: { type: "shop", price: 450 },
  },
  {
    id: "crown",
    slot: "avatar",
    name: "Crown",
    description: "Level 5. The hat does the work.",
    rarity: "epic",
    unlock: { type: "level", level: 5 },
  },
  {
    id: "skull",
    slot: "avatar",
    name: "Skull",
    description: "All luck, no face.",
    rarity: "epic",
    unlock: { type: "shop", price: 900 },
  },
  {
    id: "orb",
    slot: "avatar",
    name: "Oracle",
    description: "Level 9. Knows what you drew.",
    rarity: "epic",
    unlock: { type: "level", level: 9 },
  },
  {
    id: "flame",
    slot: "avatar",
    name: "Flame",
    description: "A five-win streak keeps it lit.",
    rarity: "legendary",
    unlock: { type: "achievement", id: "win_5" },
  },
  {
    id: "ace",
    slot: "avatar",
    name: "The Ace",
    description: "Owner only. The house always has one more card.",
    rarity: "legendary",
    unlock: { type: "owner" },
  },
  {
    id: "flask",
    slot: "avatar",
    name: "The Flask",
    description: "Beta tester only. Every rule was tested in here first.",
    rarity: "legendary",
    unlock: { type: "beta" },
  },

  // ── Name effects ────────────────────────────────────────────────────────
  {
    id: "plain",
    slot: "nameEffect",
    name: "Plain",
    description: "Just your name. Confident enough.",
    rarity: "common",
    unlock: { type: "default" },
  },
  {
    id: "shimmer",
    slot: "nameEffect",
    name: "Shimmer",
    description: "A slow sweep of light across the letters.",
    rarity: "rare",
    unlock: { type: "shop", price: 600 },
  },
  {
    id: "blaze",
    slot: "nameEffect",
    name: "Blaze",
    description: "Warm glow, restless edges.",
    rarity: "epic",
    unlock: { type: "shop", price: 900 },
  },
  {
    id: "gold",
    slot: "nameEffect",
    name: "Solid Gold",
    description: "Level 10. Tasteful, allegedly.",
    rarity: "legendary",
    unlock: { type: "level", level: 10 },
  },
  {
    id: "glitch",
    slot: "nameEffect",
    name: "Glitch",
    description: "Fifty games in. Reality is optional.",
    rarity: "legendary",
    unlock: { type: "achievement", id: "games_50" },
  },
  {
    id: "frostbite",
    slot: "nameEffect",
    name: "Frostbite",
    description: "Cold letters that smoke when you win.",
    rarity: "epic",
    unlock: { type: "shop", price: 1200 },
  },
  {
    id: "spectrum",
    slot: "nameEffect",
    name: "Spectrum",
    description: "Owner only. Every colour, all at once, forever.",
    rarity: "legendary",
    unlock: { type: "owner" },
  },
  {
    id: "founder",
    slot: "nameEffect",
    name: "Founder",
    description: "Beta tester only. A signature from before the game had a name.",
    rarity: "legendary",
    unlock: { type: "beta" },
  },

  // ── Win effects ─────────────────────────────────────────────────────────
  {
    id: "none",
    slot: "winEffect",
    name: "Clean Finish",
    description: "No fireworks. Just the win.",
    rarity: "common",
    unlock: { type: "default" },
  },
  {
    id: "confetti",
    slot: "winEffect",
    name: "Confetti",
    description: "Paper, everywhere, for a second.",
    rarity: "rare",
    unlock: { type: "shop", price: 400 },
  },
  {
    id: "embers",
    slot: "winEffect",
    name: "Embers",
    description: "The table remembers the fire.",
    rarity: "epic",
    unlock: { type: "shop", price: 700 },
  },
  {
    id: "snow",
    slot: "winEffect",
    name: "Snowfall",
    description: "A quiet, cold celebration.",
    rarity: "epic",
    unlock: { type: "shop", price: 700 },
  },
  {
    id: "shockwave",
    slot: "winEffect",
    name: "Shockwave",
    description: "Level 12. The room feels it.",
    rarity: "legendary",
    unlock: { type: "level", level: 12 },
  },
  {
    id: "supernova",
    slot: "winEffect",
    name: "Supernova",
    description: "Twenty-five wins. Bring sunglasses.",
    rarity: "legendary",
    unlock: { type: "achievement", id: "win_25" },
  },
  {
    id: "prism-burst",
    slot: "winEffect",
    name: "Prism Burst",
    description: "Owner only. A rainbow detonates over the table.",
    rarity: "legendary",
    unlock: { type: "owner" },
  },
  {
    id: "beta-burst",
    slot: "winEffect",
    name: "Beta Burst",
    description: "Beta tester only. The build is stable. The table is not.",
    rarity: "legendary",
    unlock: { type: "beta" },
  },
];

export const COSMETICS_BY_ID = new Map(COSMETICS.map((item) => [item.id, item]));

export type Loadout = Record<CosmeticSlot, string>;

export function cosmeticsForSlot(slot: CosmeticSlot): CosmeticItem[] {
  return COSMETICS.filter((item) => item.slot === slot);
}

export function defaultLoadout(): Loadout {
  return { ...SLOT_FALLBACK };
}

/** House defaults should not inflate collection achievements. */
export function isDefaultCosmetic(itemId: string): boolean {
  return COSMETICS_BY_ID.get(itemId)?.unlock.type === "default";
}

/** Number of genuinely earned / bought cosmetics, ignoring starter items. */
export function countedCosmetics(ids: Iterable<string>): number {
  let count = 0;
  for (const id of ids) {
    if (!isDefaultCosmetic(id)) count++;
  }
  return count;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  metric: "wins" | "games" | "jumps" | "stacks" | "cardsPlayed" | "cosmetics";
  goal: number;
  /** Cosmetic unlocked by completing it. */
  reward?: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_win", name: "First blood", description: "Win your first round.", metric: "wins", goal: 1 },
  { id: "win_5", name: "Heater", description: "Win five rounds.", metric: "wins", goal: 5, reward: "flame" },
  { id: "win_10", name: "House always wins", description: "Win ten rounds.", metric: "wins", goal: 10, reward: "holo" },
  { id: "win_25", name: "Untouchable", description: "Win twenty-five rounds.", metric: "wins", goal: 25, reward: "supernova" },
  { id: "games_10", name: "Regular", description: "Play ten games.", metric: "games", goal: 10 },
  { id: "games_25", name: "Fixtures", description: "Play twenty-five games.", metric: "games", goal: 25, reward: "arcade" },
  { id: "games_50", name: "Part of the furniture", description: "Play fifty games.", metric: "games", goal: 50, reward: "glitch" },
  { id: "jump_10", name: "Sniper", description: "Jump in on ten plays.", metric: "jumps", goal: 10 },
  { id: "stack_10", name: "The stack", description: "Stack ten draw cards.", metric: "stacks", goal: 10 },
  { id: "cards_250", name: "Dealer's hand", description: "Play 250 cards.", metric: "cardsPlayed", goal: 250 },
  { id: "collector_10", name: "Collector", description: "Unlock ten cosmetics. Starter items don't count.", metric: "cosmetics", goal: 10 },
];

export interface PlayerStats {
  games: number;
  wins: number;
  jumps: number;
  stacks: number;
  cardsPlayed: number;
}

export const EMPTY_STATS: PlayerStats = { games: 0, wins: 0, jumps: 0, stacks: 0, cardsPlayed: 0 };

export function achievementValue(
  achievement: Achievement,
  stats: PlayerStats,
  ownedCosmetics: number,
): number {
  if (achievement.metric === "cosmetics") return ownedCosmetics;
  return stats[achievement.metric] ?? 0;
}

export function completedAchievements(stats: PlayerStats, ownedCosmetics: number): string[] {
  return ACHIEVEMENTS.filter(
    (achievement) => achievementValue(achievement, stats, ownedCosmetics) >= achievement.goal,
  ).map((achievement) => achievement.id);
}
