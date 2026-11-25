import type { Card, Color, OwnerCardSpec } from "./cards.js";
import type { GameAction, GameResult, GameRules, LogEntry } from "./game.js";
import type { PlayerStats, CosmeticItem, Loadout, Achievement } from "./cosmetics.js";
import type { ChatPackView } from "./chat.js";

/* ────────────────────────────── Accounts ────────────────────────────── */

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  level: number;
  xp: number;
  coins: number;
  avatar: string;
  cardBack: string;
  table: string;
  nameEffect: string;
  winEffect: string;
  stats: PlayerStats;
  createdAt: number;
  /** True when users.is_owner is enabled in the database. */
  owner: boolean;
  /** True when users.is_beta_tester is enabled in the database. */
  beta: boolean;
}

export interface SessionInfo {
  kind: "user" | "guest" | "anon";
  user: PublicUser | null;
  guestName: string | null;
  /** Cosmetic ids the account owns. Guests get defaults only. */
  unlocks: string[];
  /** Quick-chat packs the session can use. Guests get the free pack. */
  chatPacks: string[];
  achievements: string[];
  /**
   * Only present immediately after registering, resetting a password or
   * rotating the code. The raw value is never stored or returned again.
   */
  recoveryCode?: string;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  displayName: string;
  level: number;
  xp: number;
  wins: number;
  games: number;
  avatar: string;
  nameEffect: string;
}

export interface PublicStats {
  players: number;
  online: number;
  rooms: number;
  matches: number;
}

export interface MatchHistoryItem {
  id: string;
  roomCode: string;
  playerCount: number;
  winnerName: string | null;
  endedAt: number;
  durationSeconds: number;
  placement: number;
  cardsLeft: number;
  coins: number;
  xp: number;
}

export interface MatchHistoryPlayer {
  id: string;
  displayName: string;
  isBot: boolean;
  placement: number;
  cardsLeft: number;
  coins: number;
  xp: number;
}

export interface MatchHistoryDetail extends MatchHistoryItem {
  rules: GameRules;
  log: LogEntry[];
  players: MatchHistoryPlayer[];
}

/* ────────────────────────────── Owner tools ────────────────────────────── */

export interface AdminUserView {
  id: string;
  username: string;
  displayName: string;
  level: number;
  xp: number;
  coins: number;
  games: number;
  wins: number;
  owner: boolean;
  beta: boolean;
  banned: boolean;
  banReason: string | null;
  createdAt: number;
}

export interface AdminAuditView {
  id: string;
  actorName: string;
  action: string;
  targetName: string | null;
  detail: Record<string, unknown> | null;
  createdAt: number;
}

export interface AdminGrantInput {
  coins?: number;
  xp?: number;
  unlockAll?: boolean;
}

export interface AchievementView {
  id: string;
  name: string;
  description: string;
  metric: string;
  goal: number;
  progress: number;
  unlocked: boolean;
  reward: string | null;
}

export interface ProfilePayload {
  user: PublicUser;
  items: CosmeticItem[];
  owned: string[];
  achievements: AchievementView[];
  equipped: Loadout;
  chatPacks: ChatPackView[];
}

/* ────────────────────────────── Friends ────────────────────────────── */

export type FriendRelationship = "none" | "friends" | "pending_in" | "pending_out" | "blocked";

export interface FriendPresence {
  status: "offline" | "online" | "lobby" | "playing";
  room: {
    code: string | null;
    players: number;
    maxPlayers: number;
    visibility: "public" | "private";
    phase: "lobby" | "playing" | "ended";
  } | null;
}

export interface FriendUserView {
  id: string;
  username: string;
  displayName: string;
  level: number;
  avatar: string;
  nameEffect: string;
  owner: boolean;
  beta: boolean;
  relationship: FriendRelationship;
  presence?: FriendPresence;
}

export interface FriendsPayload {
  friends: FriendUserView[];
  incoming: FriendUserView[];
  outgoing: FriendUserView[];
  blocked: FriendUserView[];
  you: {
    roomCode: string | null;
    canInvite: boolean;
  };
}

/* ────────────────────────────── Rooms ────────────────────────────── */

export interface RoomPlayerView {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  ready: boolean;
  host: boolean;
  level: number;
  avatar: string;
  cardBack: string;
  table: string;
  nameEffect: string;
  winEffect: string;
  cardCount: number;
  placement: number | null;
  owner?: boolean;
  beta?: boolean;
}

export interface RewardGrant {
  coins: number;
  xp: number;
  level: number;
  levelUp: boolean;
  placement: number;
  achievements: string[];
  unlocked: string[];
  banked: boolean;
  /** Practice round: bots only, so nothing counts. */
  unranked?: boolean;
}

export interface GameView {
  phase: "playing" | "ended";
  top: Card;
  color: Color;
  turnId: string;
  dir: 1 | -1;
  pending: number;
  pendingKind: "draw2" | "wild4" | null;
  deadline: number;
  seq: number;
  drawnCardId: string | null;
  winner: string | null;
  results: GameResult[] | null;
  log: LogEntry[];
  lastCard: Card | null;
  lastPlayAt: number;
  drawCount: number;
  startedAt: number;
}

export interface RoomView {
  code: string;
  phase: "lobby" | "playing" | "ended";
  hostId: string | null;
  rules: GameRules;
  visibility: "public" | "private";
  createdAt: number;
  serverTime: number;
  players: RoomPlayerView[];
  you: {
    id: string;
    hand: Card[];
    isHost: boolean;
    rewards: RewardGrant | null;
  };
  game: GameView | null;
  /** Owner-only x-ray. Never sent to non-owner connections. */
  ownerHands?: Record<string, Card[]>;
}

export interface RoomSummary {
  code: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  phase: "lobby" | "playing" | "ended";
  turnSeconds: number;
  stacking: GameRules["stacking"];
  wager: number;
  createdAt: number;
}

/* ────────────────────────────── Wire ────────────────────────────── */

export type OwnerAction =
  | { type: "peek"; enabled: boolean }
  | { type: "replace"; cardId: string; card: OwnerCardSpec };

export type ClientMessage =
  | { t: "create"; rules?: Partial<GameRules>; visibility?: "public" | "private" }
  | { t: "join"; code: string }
  | { t: "quick" }
  | { t: "leave" }
  | { t: "ready"; ready: boolean }
  | { t: "rules"; rules: Partial<GameRules> }
  | { t: "start" }
  | { t: "rematch" }
  | { t: "lobby" }
  | { t: "bot"; add: boolean }
  | { t: "kick"; playerId: string }
  | { t: "action"; action: GameAction; seq: number }
  | { t: "owner"; action: OwnerAction }
  | { t: "chat"; lineId: string }
  | { t: "emote"; emote: string }
  | { t: "ping"; at: number };

export type ServerMessage =
  | { t: "room"; room: RoomView }
  | { t: "left" }
  | { t: "error"; code: string; message: string }
  | { t: "action_error"; code: string; message: string }
  | { t: "emote"; playerId: string; emote: string }
  | { t: "chat"; playerId: string; lineId: string; at: number }
  | {
      t: "friend_invite";
      inviteId: string;
      fromName: string;
      roomCode: string;
      players: number;
      maxPlayers: number;
      expiresAt: number;
    }
  | { t: "toast"; message: string; tone?: "info" | "success" | "error" }
  | { t: "pong"; at: number };

export const EMOTES = [
  { id: "gg", glyph: "🤝", label: "Good game" },
  { id: "fire", glyph: "🔥", label: "On fire" },
  { id: "wow", glyph: "😮", label: "Wow" },
  { id: "nice", glyph: "👏", label: "Nice one" },
  { id: "oops", glyph: "😬", label: "Oops" },
  { id: "sad", glyph: "😭", label: "Nooo" },
  { id: "think", glyph: "🤔", label: "Hmm" },
  { id: "skull", glyph: "💀", label: "Cooked" },
] as const;
