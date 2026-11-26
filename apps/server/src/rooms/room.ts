import type {
  Card,
  GameRules,
  GameState,
  Loadout,
  RewardGrant,
  RoomPlayerView,
  RoomView,
  Rng,
} from "@stacked/shared";
import { cryptoRng, defaultLoadout, isWild, topCard } from "@stacked/shared";import type WebSocket from "ws";
import type { Principal } from "../auth/session.js";
import { tagsForUserSync } from "../services/tags.js";

export interface ClientConn {
  id: number;
  socket: WebSocket;
  principal: Principal;
  playerId: string;
  /** Remote address, used for room-code brute-force limits. */
  ip: string;
  roomCode: string | null;
  alive: boolean;
  windowStart: number;
  windowCount: number;
  /** Owner-only x-ray, re-checked against the database before enabling. */
  ownerPeek?: boolean;
  /** X-ray expires unless the owner client refreshes it. */
  ownerPeekUntil?: number;
  /** Simple throttle for owner cheat actions. */
  lastOwnerActionAt?: number;
}

export interface SeatStats {
  cardsPlayed: number;
  jumps: number;
  stacks: number;
}

export interface Seat {
  id: string;
  userId: string | null;
  name: string;
  isBot: boolean;
  connected: boolean;
  ready: boolean;
  loadout: Loadout;
  level: number;
  owner: boolean;
  beta: boolean;
  /** Owner used a cheat this round: progression is skipped silently. */
  cheated: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
  rewards: RewardGrant | null;
  stats: SeatStats;
}

export type RoomPhase = "lobby" | "playing" | "ended";

export class Room {
  readonly code: string;
  createdAt = Date.now();
  lastActivity = Date.now();
  visibility: "public" | "private";
  hostId: string;
  phase: RoomPhase = "lobby";
  seats: Seat[] = [];
  rules: GameRules;
  game: GameState | null = null;
  rng: Rng;
  connections = new Set<ClientConn>();
  timer: NodeJS.Timeout | null = null;
  botTimer: NodeJS.Timeout | null = null;
  startedAt = 0;
  endedAt = 0;
  persisted = false;
  /** Coins already deducted for the running round, held until settlement. */
  wager: { ids: string[]; pot: number; stake: number } | null = null;
  starting = false;
  frozen = false;

  constructor(code: string, visibility: "public" | "private", rules: GameRules) {
    this.code = code;
    this.visibility = visibility;
    this.rules = rules;
    this.rng = cryptoRng();
    this.hostId = "";
  }

  host(): Seat | undefined {
    return this.seats.find((seat) => seat.id === this.hostId);
  }

  seat(id: string | null | undefined): Seat | undefined {
    if (!id) return undefined;
    return this.seats.find((seat) => seat.id === id);
  }

  humanSeats(): Seat[] {
    return this.seats.filter((seat) => !seat.isBot);
  }

  connectedHumans(): Seat[] {
    return this.seats.filter((seat) => !seat.isBot && seat.connected);
  }

  isFull(): boolean {
    return this.seats.length >= this.rules.maxPlayers;
  }

  addSeat(seat: Seat): void {
    this.seats.push(seat);
    if (!this.hostId) this.hostId = seat.id;
  }

  removeSeat(seatId: string): void {
    this.seats = this.seats.filter((seat) => seat.id !== seatId);
    if (this.hostId === seatId) this.transferHost();
    this.touch();
  }

  transferHost(): void {
    const next = this.seats.find((seat) => !seat.isBot && seat.connected) ?? this.seats.find((seat) => !seat.isBot);
    this.hostId = next?.id ?? "";
  }

  uniqueName(base: string): string {
    const exists = (name: string) => this.seats.some((seat) => seat.name.toLowerCase() === name.toLowerCase());
    if (!exists(base)) return base;
    for (let i = 2; i < 100; i++) {
      const candidate = `${base.slice(0, 17)} ${i}`;
      if (!exists(candidate)) return candidate;
    }
    return `${base.slice(0, 14)} ${Math.floor(Math.random() * 900 + 100)}`;
  }

  touch(): void {
    this.lastActivity = Date.now();
  }

  clearTimers(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.botTimer) clearTimeout(this.botTimer);
    this.timer = null;
    this.botTimer = null;
  }
}

export function createSeatFromPrincipal(
  principal: Principal,
  playerId: string,
  loadout: Loadout,
  level: number,
  name: string,
  owner = false,
  beta = false,
): Seat {
  return {
    id: playerId,
    userId: principal.kind === "user" ? principal.user.id : null,
    name,
    isBot: false,
    connected: true,
    ready: false,
    loadout,
    level,
    owner,
    beta,
    cheated: false,
    joinedAt: Date.now(),
    disconnectedAt: null,
    rewards: null,
    stats: { cardsPlayed: 0, jumps: 0, stacks: 0 },
  };
}

export function guestSeat(principal: Principal, playerId: string): Seat {
  return createSeatFromPrincipal(principal, playerId, defaultLoadout(), 1, principal.kind === "guest" ? principal.name : "Player");
}

const BOT_NAMES = [
  "Cinder",
  "Marlow",
  "Juno",
  "Rook",
  "Piper",
  "Otis",
  "Vex",
  "Sable",
  "Milo",
  "Nova",
  "Hollis",
  "Fable",
];

export function botName(taken: string[]): string {
  const lower = new Set(taken.map((name) => name.toLowerCase()));
  return BOT_NAMES.find((name) => !lower.has(name.toLowerCase())) ?? `Bot ${taken.length + 1}`;
}

export function placementMap(game: GameState): Map<string, number> {
  const map = new Map<string, number>();
  if (!game.results) return map;
  if (game.rules.finishAll && game.finishOrder.length > 0) {
    for (const [index, id] of game.finishOrder.entries()) map.set(id, index + 1);
    const remaining = game.results
      .filter((result) => !map.has(result.id))
      .sort((a, b) => a.cardsLeft - b.cardsLeft || a.points - b.points);
    let next = map.size + 1;
    for (const result of remaining) map.set(result.id, next++);
    return map;
  }
  if (game.winningTeam !== null) {
    for (const player of game.players) {
      map.set(player.id, player.team === game.winningTeam ? 1 : 2);
    }
    return map;
  }
  const ordered = [...game.results].sort((a, b) => {
    if (a.id === game.winner) return -1;
    if (b.id === game.winner) return 1;
    return a.cardsLeft - b.cardsLeft || a.points - b.points;
  });
  ordered.forEach((result, index) => map.set(result.id, index + 1));
  return map;
}

export function buildRoomView(room: Room, viewerId: string, ownerPeek = false): RoomView {
  const viewer = room.seat(viewerId);
  const placements = room.game ? placementMap(room.game) : new Map<string, number>();
  const players: RoomPlayerView[] = room.seats.map((seat) => {
    const gamePlayer = room.game?.players.find((player) => player.id === seat.id);
    return {
      id: seat.id,
      name: seat.name,
      isBot: seat.isBot,
      connected: seat.connected,
      ready: seat.ready,
      host: seat.id === room.hostId,
      level: seat.level,
      avatar: seat.loadout.avatar,
      cardBack: seat.loadout.cardBack,
      table: seat.loadout.table,
      nameEffect: seat.loadout.nameEffect,
      winEffect: seat.loadout.winEffect,
      cardCount: gamePlayer?.hand.length ?? 0,
      placement: placements.get(seat.id) ?? null,
      owner: seat.owner,
      beta: seat.beta,
      tags: tagsForUserSync(seat.userId),
      team: gamePlayer?.team ?? (room.rules.teamMode === "2v2" ? room.seats.indexOf(seat) % 2 : null),
      registered: Boolean(seat.userId) && !seat.isBot,
    };
  });

  const game = room.game;
  const hand: Card[] = viewer ? (game?.players.find((player) => player.id === viewer.id)?.hand ?? []) : [];
  const currentId = game ? (game.players[game.turn]?.id ?? "") : "";
  // X-ray is only attached to the connection that passed the live owner check.
  const ownerHands =
    ownerPeek && game
      ? Object.fromEntries(game.players.map((player) => [player.id, player.hand.map((card) => ({ ...card }))]))
      : undefined;

  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId || null,
    rules: room.rules,
    visibility: room.visibility,
    createdAt: room.createdAt,
    serverTime: Date.now(),
    players,
    you: {
      id: viewerId,
      hand,
      isHost: room.hostId === viewerId,
      rewards: viewer?.rewards ?? null,
    },
    game: game
      ? (() => {
          const top = topCard(game);
          // A normal card's face owns the colour. Never report a stale colour
          // from an old/buggy room state.
          const viewColor = !isWild(top) && top.color ? top.color : game.color;
          return {
            phase: game.phase,
            top,
            color: viewColor,
            turnId: currentId,
            dir: game.dir,
            pending: game.pending,
            pendingKind: game.pendingKind,
            deadline: game.deadline,
            seq: game.seq,
            drawnCardId: currentId === viewerId ? game.drawnCard : null,
            winner: game.winner,
            winningTeam: game.winningTeam,
            finishOrder: game.finishOrder,
            results: game.results,
            log: game.log.slice(-24),
            lastCard: game.lastCard,
            lastPlayAt: game.lastPlayAt,
            drawCount: game.drawPile.length,
            startedAt: game.startedAt,
          };
        })()
      : null,
    ...(ownerHands ? { ownerHands } : {}),
    ...(!viewer ? { spectator: true } : {}),
    ...(room.frozen ? { frozen: true } : {}),
  };
}
