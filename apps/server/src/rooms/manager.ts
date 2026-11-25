import { randomInt } from "node:crypto";
import {
  COSMETICS,
  CHAT_PACKS_BY_ID,
  CHAT_LINES_BY_ID,
  EMOTES,
  GameError,
  botAction,
  completedAchievements,
  countedCosmetics,
  createGame,
  defaultLoadout,
  levelForXp,
  matchRewardsForHumans,
  normaliseRules,
  reduce,
  roundIsRanked,
  timeout,
  type ClientMessage,
  type GameAction,
  type GameRules,
  type Loadout,
  type OwnerAction,
  type RewardGrant,
  type RoomSummary,
  type ServerMessage,
} from "@stacked/shared";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { matches, matchPlayers, users } from "../db/schema.js";
import { rateLimit } from "../lib/rate-limit.js";
import {
  equippedOf,
  getOwnedIds,
  isOwner,
  statsOf,
  syncUnlocks,
  visibleOwned,
} from "../services/account.js";
import {
  OwnerToolError,
  assertLiveOwner,
  auditOwnerCheat,
  cardSpec,
  makeOwnerCard,
} from "../services/owner-tools.js";
import { hasChatPack } from "../services/chat.js";
import {
  Room,
  botName,
  buildRoomView,
  createSeatFromPrincipal,
  guestSeat,
  placementMap,
  type ClientConn,
  type Seat,
} from "./room.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_ROOMS = 300;
const LOBBY_GRACE_MS = 30_000;

export interface ManagerLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export class RoomError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  readonly allConns = new Set<ClientConn>();
  private botCounter = 0;
  private nextConnId = 1;
  private readonly lastEmote = new Map<string, number>();
  private log: ManagerLogger = console;

  constructor(logger?: ManagerLogger) {
    if (logger) this.log = logger;
  }

  setLogger(logger: ManagerLogger): void {
    this.log = logger;
  }

  /* ─────────────────────────── connections ─────────────────────────── */

  attach(conn: ClientConn): void {
    this.allConns.add(conn);
  }

  detach(conn: ClientConn): void {
    this.allConns.delete(conn);
    if (!conn.roomCode) return;
    const room = this.rooms.get(conn.roomCode);
    conn.roomCode = null;
    if (!room) return;

    room.connections.delete(conn);
    const stillConnected = [...room.connections].some((other) => other.playerId === conn.playerId);
    const seat = room.seat(conn.playerId);
    if (seat && !stillConnected) {
      seat.connected = false;
      seat.disconnectedAt = Date.now();
      if (room.phase === "ended") room.removeSeat(seat.id);
    }
    this.afterDeparture(room);
  }

  nextConnectionId(): number {
    return this.nextConnId++;
  }

  handleMessage(conn: ClientConn, raw: string): void {
    const now = Date.now();
    if (now - conn.windowStart > 5000) {
      conn.windowStart = now;
      conn.windowCount = 0;
    }
    conn.windowCount++;
    if (conn.windowCount > 60) {
      this.error(conn, "rate_limited", "Slow down a little.");
      return;
    }

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      this.error(conn, "bad_message", "That message was not valid JSON.");
      return;
    }
    if (!msg || typeof msg.t !== "string") {
      this.error(conn, "bad_message", "Unknown message.");
      return;
    }

    try {
      this.dispatch(conn, msg);
    } catch (error) {
      if (error instanceof RoomError) {
        this.error(conn, error.code, error.message);
      } else if (error instanceof GameError) {
        this.send(conn, { t: "action_error", code: error.code, message: error.message });
      } else {
        this.log.error({ err: error, type: msg.t }, "socket message failed");
        this.error(conn, "server_error", "Something went wrong. Try again.");
      }
    }
  }

  private dispatch(conn: ClientConn, msg: ClientMessage): void {
    switch (msg.t) {
      case "ping":
        this.send(conn, { t: "pong", at: Number(msg.at) || Date.now() });
        break;
      case "create":
        this.createRoom(conn, msg.rules, msg.visibility);
        break;
      case "join":
        this.joinRoom(conn, String(msg.code ?? ""));
        break;
      case "quick":
        this.quickPlay(conn);
        break;
      case "leave":
        this.leaveRoom(conn, true);
        break;
      case "ready":
        this.setReady(conn, Boolean(msg.ready));
        break;
      case "rules":
        this.updateRules(conn, msg.rules);
        break;
      case "start":
        this.startGame(conn);
        break;
      case "rematch":
        this.rematch(conn);
        break;
      case "bot":
        this.toggleBot(conn, Boolean(msg.add));
        break;
      case "kick":
        this.kick(conn, String(msg.playerId ?? ""));
        break;
      case "action":
        this.playAction(conn, msg.action, Number(msg.seq));
        break;
      case "owner":
        this.ownerAction(conn, msg.action);
        break;
      case "chat":
        this.chat(conn, String(msg.lineId ?? ""));
        break;
      case "emote":
        this.emote(conn, String(msg.emote ?? ""));
        break;
      default:
        this.error(conn, "unknown_message", "Unknown message.");
    }
  }

  /* ─────────────────────────── room lifecycle ─────────────────────────── */

  private generateCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = "";
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError("no_codes", "Could not create a room right now.");
  }

  private createRoom(conn: ClientConn, input: Partial<GameRules> | undefined, visibility: "public" | "private" | undefined): void {
    if (this.rooms.size >= MAX_ROOMS) throw new RoomError("busy", "The server is full. Try again soon.");
    const rules = normaliseRules(input);
    if (rules.wager > 0 && conn.principal.kind !== "user") {
      throw new RoomError("wager_account", "Wager tables need a signed-in account.");
    }
    this.leaveRoom(conn, false);

    const room = new Room(this.generateCode(), visibility === "public" ? "public" : "private", rules);
    const seat = this.seatFor(conn, room);
    room.addSeat(seat);
    room.hostId = seat.id;
    this.rooms.set(room.code, room);
    this.enter(conn, room);
    this.broadcast(room);
  }

  private joinRoom(conn: ClientConn, rawCode: string): void {
    const gate = rateLimit(`join:${conn.ip}`, 40, 5 * 60_000);
    if (!gate.ok) {
      throw new RoomError("rate_limited", "Too many table joins. Try again in a few minutes.");
    }
    const code = rawCode.trim().toUpperCase();
    if (!code) throw new RoomError("bad_code", "Enter a room code.");
    const room = this.rooms.get(code);
    if (!room) throw new RoomError("room_not_found", "No room with that code.");
    if (room.rules.wager > 0 && conn.principal.kind !== "user") {
      throw new RoomError("wager_account", "Wager tables need a signed-in account.");
    }

    let seat = room.seat(conn.playerId);
    if (!seat) {
      if (room.phase !== "lobby") throw new RoomError("in_progress", "That round is already in progress.");
      if (room.isFull()) throw new RoomError("room_full", "That table is full.");
      if (conn.roomCode && conn.roomCode !== code) this.leaveRoom(conn, false);
      seat = this.seatFor(conn, room);
      seat.name = room.uniqueName(seat.name);
      room.addSeat(seat);
    } else if (conn.roomCode && conn.roomCode !== code) {
      this.leaveRoom(conn, false);
    }

    this.enter(conn, room);
    room.touch();
    this.broadcast(room);
  }

  private quickPlay(conn: ClientConn): void {
    this.leaveRoom(conn, false);
    const candidate = [...this.rooms.values()]
      .filter(
        (room) =>
          room.visibility === "public" &&
          room.phase === "lobby" &&
          !room.isFull() &&
          room.rules.wager === 0 &&
          room.seats.some((seat) => !seat.isBot),
      )
      .sort((a, b) => b.humanSeats().length - a.humanSeats().length || a.createdAt - b.createdAt)[0];

    if (candidate) {
      this.joinRoom(conn, candidate.code);
      return;
    }

    this.send(conn, {
      t: "toast",
      tone: "info",
      message: "No open tables right now — we opened a fresh one for you.",
    });
    const rules = normaliseRules(undefined);
    const room = new Room(this.generateCode(), "public", rules);
    const seat = this.seatFor(conn, room);
    room.addSeat(seat);
    room.hostId = seat.id;
    this.rooms.set(room.code, room);
    this.enter(conn, room);
    this.broadcast(room);
  }

  private seatFor(conn: ClientConn, _room: Room): Seat {
    if (conn.principal.kind === "user") {
      const user = conn.principal.user;
      return createSeatFromPrincipal(
        conn.principal,
        conn.playerId,
        equippedOf(user),
        levelForXp(user.xp),
        user.displayName,
        isOwner(user),
        user.isBetaTester,
      );
    }
    return guestSeat(conn.principal, conn.playerId);
  }

  private enter(conn: ClientConn, room: Room): void {
    conn.roomCode = room.code;
    conn.ownerPeek = false;
    conn.ownerPeekUntil = 0;
    conn.lastOwnerActionAt = 0;
    room.connections.add(conn);
    const seat = room.seat(conn.playerId);
    if (seat) {
      seat.connected = true;
      seat.disconnectedAt = null;
    }
    room.touch();
  }

  private leaveRoom(conn: ClientConn, notify: boolean): void {
    conn.ownerPeek = false;
    conn.ownerPeekUntil = 0;
    if (!conn.roomCode) {
      if (notify) this.send(conn, { t: "left" });
      return;
    }
    const room = this.rooms.get(conn.roomCode);
    conn.roomCode = null;
    if (!room) {
      if (notify) this.send(conn, { t: "left" });
      return;
    }

    room.connections.delete(conn);
    const hasOther = [...room.connections].some((other) => other.playerId === conn.playerId);
    const seat = room.seat(conn.playerId);

    if (seat && !hasOther) {
      if (room.phase === "lobby" || room.phase === "ended") {
        room.removeSeat(seat.id);
      } else {
        seat.connected = false;
        seat.disconnectedAt = Date.now();
      }
    }

    if (notify) this.send(conn, { t: "left" });
    this.afterDeparture(room);
  }

  private afterDeparture(room: Room): void {
    if (!this.rooms.has(room.code)) return;
    if (room.humanSeats().length === 0) {
      this.deleteRoom(room);
      return;
    }
    const host = room.host();
    if (!host || host.isBot || !host.connected) room.transferHost();
    this.broadcast(room);
  }

  private deleteRoom(room: Room): void {
    room.clearTimers();
    this.rooms.delete(room.code);
    for (const conn of room.connections) {
      conn.roomCode = null;
      this.send(conn, { t: "left" });
    }
    room.connections.clear();
  }

  /* ─────────────────────────── lobby actions ─────────────────────────── */

  private setReady(conn: ClientConn, ready: boolean): void {
    const { room, seat } = this.mustSeat(conn);
    if (room.phase !== "lobby") return;
    seat.ready = ready;
    room.touch();
    this.broadcast(room);
  }

  private updateRules(conn: ClientConn, input: Partial<GameRules> | undefined): void {
    const { room, seat } = this.mustSeat(conn);
    if (room.hostId !== seat.id) throw new RoomError("not_host", "Only the host can change the rules.");
    if (room.phase !== "lobby") throw new RoomError("locked", "Rules are locked once the round starts.");
    const merged = normaliseRules({ ...room.rules, ...(input ?? {}) });
    if (merged.maxPlayers < room.seats.length) {
      throw new RoomError("too_many_seats", "Remove players before lowering the seat count.");
    }
    if (merged.wager > 0 && room.seats.some((seat) => seat.isBot || !seat.userId)) {
      throw new RoomError("wager_players", "Wager tables need registered players only.");
    }
    if (merged.wager > 0 && conn.principal.kind !== "user") {
      throw new RoomError("wager_account", "Wager tables need a signed-in account.");
    }
    room.rules = merged;
    room.touch();
    this.broadcast(room);
  }

  private startGame(conn: ClientConn): void {
    void this.startGameAsync(conn).catch((error) => this.lobbyError(conn, error));
  }

  private async startGameAsync(conn: ClientConn): Promise<void> {
    const { room, seat } = this.mustSeat(conn);
    if (room.hostId !== seat.id) throw new RoomError("not_host", "Only the host can start.");
    await this.validateWager(room);
    if (!this.rooms.has(room.code) || room.phase !== "lobby") return;
    this.beginRound(room);
  }

  private rematch(conn: ClientConn): void {
    void this.rematchAsync(conn).catch((error) => this.lobbyError(conn, error));
  }

  private async rematchAsync(conn: ClientConn): Promise<void> {
    const { room, seat } = this.mustSeat(conn);
    if (room.hostId !== seat.id) throw new RoomError("not_host", "Only the host can deal again.");
    if (room.phase !== "ended") throw new RoomError("not_ended", "The round is still going.");
    await this.validateWager(room);
    if (!this.rooms.has(room.code) || room.phase !== "ended") return;
    this.beginRound(room);
  }

  private lobbyError(conn: ClientConn, error: unknown): void {
    if (error instanceof RoomError) {
      this.error(conn, error.code, error.message);
      return;
    }
    this.log.error({ err: error, playerId: conn.playerId }, "lobby action failed");
    this.error(conn, "server_error", "Something went wrong. Try again.");
  }

  private async validateWager(room: Room): Promise<void> {
    const wager = room.rules.wager;
    if (wager <= 0) return;
    if (room.seats.length < 2) {
      throw new RoomError("wager_players_needed", "A wager table needs at least two players.");
    }
    if (room.seats.some((seat) => seat.isBot || !seat.userId)) {
      throw new RoomError("wager_players", "Wager tables need registered players only.");
    }
    const ids = room.seats.map((seat) => seat.userId as string);
    const rows = await db
      .select({ id: users.id, coins: users.coins })
      .from(users)
      .where(inArray(users.id, ids));
    if (rows.length !== ids.length || rows.some((row) => row.coins < wager)) {
      throw new RoomError("wager_funds", `Everyone needs ${wager} coins to start.`);
    }
  }

  private beginRound(room: Room): void {
    if (room.phase === "playing") throw new RoomError("already_playing", "A round is already in progress.");
    if (room.seats.length < 2) throw new RoomError("not_enough_players", "Add a player or a bot first.");

    room.clearTimers();
    room.phase = "playing";
    room.persisted = false;
    room.endedAt = 0;
    room.startedAt = Date.now();
    for (const seat of room.seats) {
      seat.stats = { cardsPlayed: 0, jumps: 0, stacks: 0 };
      seat.rewards = null;
      seat.cheated = false;
      seat.ready = true;
      seat.disconnectedAt = seat.connected ? null : Date.now();
    }
    // X-ray and cheat state never carry over into a new round; the owner's
    // client re-requests it explicitly and that request taints the round.
    for (const conn of room.connections) {
      conn.ownerPeek = false;
      conn.ownerPeekUntil = 0;
    }

    room.game = createGame(
      room.seats.map((seat) => ({
        id: seat.id,
        name: seat.name,
        isBot: seat.isBot,
        connected: seat.isBot || seat.connected,
      })),
      room.rules,
      room.rng,
      Date.now(),
    );
    room.touch();
    this.broadcast(room);
    this.scheduleTurn(room);
    this.scheduleBot(room);
  }

  private toggleBot(conn: ClientConn, add: boolean): void {
    const { room, seat } = this.mustSeat(conn);
    if (room.hostId !== seat.id) throw new RoomError("not_host", "Only the host can manage bots.");
    if (room.phase !== "lobby") throw new RoomError("locked", "Bots join in the lobby.");
    if (add && room.rules.wager > 0) throw new RoomError("wager_no_bots", "No bots at a wager table.");

    if (add) {
      if (room.isFull()) throw new RoomError("room_full", "No free seats.");
      const id = `bot_${++this.botCounter}`;
      const loadout = this.botLoadout(room);
      room.addSeat({
        id,
        userId: null,
        name: botName(room.seats.map((candidate) => candidate.name)),
        isBot: true,
        connected: true,
        ready: true,
        loadout,
        level: 1 + Math.floor(Math.random() * 14),
        owner: false,
        beta: false,
        cheated: false,
        joinedAt: Date.now(),
        disconnectedAt: null,
        rewards: null,
        stats: { cardsPlayed: 0, jumps: 0, stacks: 0 },
      });
    } else {
      const bot = [...room.seats].reverse().find((candidate) => candidate.isBot);
      if (bot) room.removeSeat(bot.id);
    }
    room.rules = normaliseRules(room.rules);
    room.touch();
    this.broadcast(room);
  }

  private botLoadout(room: Room): Loadout {
    const slots = ["cardBack", "table", "avatar", "nameEffect", "winEffect"] as const;
    const loadout = defaultLoadout();
    for (const slot of slots) {
      const options = COSMETICS.filter(
        (item) => item.slot === slot && item.unlock.type !== "achievement" && item.unlock.type !== "owner" && item.unlock.type !== "beta",
      );
      const chosen = options[Math.floor(Math.random() * options.length)];
      if (chosen) loadout[slot] = chosen.id;
    }
    // Give the table a stable, shared look for the room.
    loadout.table = room.host()?.loadout.table ?? loadout.table;
    return loadout;
  }

  private kick(conn: ClientConn, playerId: string): void {
    const { room, seat } = this.mustSeat(conn);
    if (room.hostId !== seat.id) throw new RoomError("not_host", "Only the host can remove players.");
    if (room.phase !== "lobby") throw new RoomError("locked", "You can only remove players in the lobby.");
    if (playerId === seat.id) throw new RoomError("cannot_kick_self", "You cannot remove yourself.");
    if (!room.seat(playerId)) return;

    for (const other of room.connections) {
      if (other.playerId === playerId) {
        other.roomCode = null;
        room.connections.delete(other);
        this.send(other, { t: "left" });
      }
    }
    room.removeSeat(playerId);
    this.afterDeparture(room);
  }

  /* ─────────────────────────── gameplay ─────────────────────────── */

  /* ─────────────────────────── owner tools ─────────────────────────── */

  private ownerAction(conn: ClientConn, action: OwnerAction): void {
    void this.runOwnerAction(conn, action).catch((error) => this.ownerError(conn, error));
  }

  private async runOwnerAction(conn: ClientConn, action: OwnerAction): Promise<void> {
    const principal = conn.principal;
    if (principal.kind !== "user") {
      throw new OwnerToolError("owner_only", "Owner tools are not available.");
    }
    if (!action || typeof action !== "object") {
      throw new OwnerToolError("bad_request", "Unknown owner action.", 400);
    }

    const now = Date.now();
    if (conn.lastOwnerActionAt && now - conn.lastOwnerActionAt < 250) {
      throw new OwnerToolError("slow_down", "Slow down a little.", 429);
    }
    conn.lastOwnerActionAt = now;

    // Live check: a revoked owner loses access immediately, not at reconnect.
    try {
      await assertLiveOwner(principal.user.id);
    } catch (error) {
      conn.ownerPeek = false;
      conn.ownerPeekUntil = 0;
      const currentRoom = conn.roomCode ? this.rooms.get(conn.roomCode) : undefined;
      if (currentRoom) {
        this.send(conn, { t: "room", room: buildRoomView(currentRoom, conn.playerId, false) });
      }
      throw error;
    }

    const { room, seat } = this.mustSeat(conn);
    if (room.rules.wager > 0) {
      throw new OwnerToolError("wager_no_cheats", "Cheats are disabled at wager tables.", 403);
    }
    const game = room.game;
    if (!game || room.phase !== "playing") {
      throw new OwnerToolError("not_playing", "Start a round first.", 400);
    }

    if (action.type === "peek") {
      const enabled = Boolean(action.enabled);
      const wasEnabled = conn.ownerPeek === true && (conn.ownerPeekUntil ?? 0) > now;
      conn.ownerPeek = enabled;
      conn.ownerPeekUntil = enabled ? now + 60_000 : 0;
      if (enabled) seat.cheated = true;
      this.send(conn, {
        t: "room",
        room: buildRoomView(room, conn.playerId, this.peekActive(conn)),
      });
      // Refreshes every minute are silent; only real on/off transitions are audited.
      if (enabled !== wasEnabled) {
        await auditOwnerCheat(principal.user, { cheat: "peek", enabled, room: room.code }).catch((error) =>
          this.log.error({ err: error }, "owner audit failed"),
        );
      }
      return;
    }

    if (action.type === "replace") {
      if (game.players[game.turn]?.id === seat.id && game.drawnCard) {
        throw new OwnerToolError("drawn_card", "Play or pass the drawn card first.", 400);
      }
      const player = game.players.find((candidate) => candidate.id === seat.id);
      const index = player?.hand.findIndex((card) => card.id === String(action.cardId)) ?? -1;
      const before = index >= 0 ? player?.hand[index] : undefined;
      if (!player || !before) {
        throw new OwnerToolError("not_in_hand", "That card is not in your hand.", 400);
      }

      const after = makeOwnerCard(action.card);
      player.hand[index] = after;
      seat.cheated = true;
      room.touch();
      this.broadcast(room);
      await auditOwnerCheat(principal.user, {
        cheat: "replace",
        room: room.code,
        before: cardSpec(before),
        after: cardSpec(after),
      }).catch((error) => this.log.error({ err: error }, "owner audit failed"));
      return;
    }

    throw new OwnerToolError("bad_request", "Unknown owner action.", 400);
  }

  private peekActive(conn: ClientConn): boolean {
    return conn.ownerPeek === true && (conn.ownerPeekUntil ?? 0) > Date.now();
  }

  private ownerError(conn: ClientConn, error: unknown): void {
    if (error instanceof OwnerToolError) {
      this.send(conn, { t: "action_error", code: error.code, message: error.message });
      return;
    }
    if (error instanceof RoomError) {
      this.error(conn, error.code, error.message);
      return;
    }
    this.log.error({ err: error, playerId: conn.playerId }, "owner action failed");
    this.error(conn, "server_error", "Something went wrong. Try again.");
  }

  private playAction(conn: ClientConn, action: GameAction, seq: number): void {
    const { room, seat } = this.mustSeat(conn);
    if (room.phase !== "playing" || !room.game) throw new RoomError("not_playing", "The round has not started.");
    if (seq !== room.game.seq) {
      this.send(conn, { t: "action_error", code: "stale", message: "The table moved on. Try again." });
      this.send(conn, { t: "room", room: buildRoomView(room, conn.playerId, this.peekActive(conn)) });
      return;
    }

    const previousPending = room.game.pending;
    let next;
    try {
      next = reduce(room.game, seat.id, action, { now: Date.now(), rng: room.rng });
    } catch (error) {
      if (error instanceof GameError) {
        this.send(conn, { t: "action_error", code: error.code, message: error.message });
        return;
      }
      throw error;
    }

    if (action.type === "play" || action.type === "jump") {
      seat.stats.cardsPlayed++;
      if (action.type === "jump") seat.stats.jumps++;
      if (previousPending > 0) seat.stats.stacks++;
    }

    room.game = next;
    room.touch();
    if (next.phase === "ended") {
      void this.finishMatch(room);
      return;
    }
    this.broadcast(room);
    this.scheduleTurn(room);
    this.scheduleBot(room);
  }

  private chat(conn: ClientConn, lineId: string): void {
    void this.runChat(conn, lineId).catch((error) => {
      if (error instanceof RoomError) {
        this.error(conn, error.code, error.message);
        return;
      }
      this.log.error({ err: error, playerId: conn.playerId }, "chat failed");
      this.error(conn, "server_error", "Something went wrong. Try again.");
    });
  }

  private async runChat(conn: ClientConn, lineId: string): Promise<void> {
    const { room } = this.mustSeat(conn);
    if (!rateLimit(`chat:${conn.playerId}`, 4, 10_000).ok) {
      throw new RoomError("rate_limited", "Easy on the quick chat.");
    }
    const line = CHAT_LINES_BY_ID.get(lineId);
    if (!line) return;
    const pack = CHAT_PACKS_BY_ID.get(line.packId);
    if (!pack) return;

    if (conn.principal.kind === "user") {
      if (!(await hasChatPack(conn.principal.user, pack.id))) {
        this.send(conn, {
          t: "toast",
          tone: "error",
          message: "That quick-chat pack isn't yours.",
        });
        return;
      }
    } else if (pack.unlock.type !== "default") {
      this.send(conn, {
        t: "toast",
        tone: "error",
        message: "Guests can use the free pack. Create an account to buy more.",
      });
      return;
    }

    const message: ServerMessage = {
      t: "chat",
      playerId: conn.playerId,
      lineId: line.id,
      at: Date.now(),
    };
    for (const other of room.connections) this.send(other, message);
  }

  private emote(conn: ClientConn, emote: string): void {
    const { room, seat } = this.mustSeat(conn);
    if (!EMOTES.some((entry) => entry.id === emote)) return;
    const now = Date.now();
    if (now - (this.lastEmote.get(seat.id) ?? 0) < 1200) return;
    this.lastEmote.set(seat.id, now);
    for (const other of room.connections) {
      this.send(other, { t: "emote", playerId: seat.id, emote });
    }
  }

  /* ─────────────────────────── timers & bots ─────────────────────────── */

  private scheduleTurn(room: Room): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    if (room.phase !== "playing" || !room.game) return;
    const delay = Math.max(120, room.game.deadline - Date.now() + 100);
    room.timer = setTimeout(() => {
      room.timer = null;
      void this.onTurnTimeout(room);
    }, Math.min(delay, 2_000_000_000));
  }

  private async onTurnTimeout(room: Room): Promise<void> {
    if (!this.rooms.has(room.code) || room.phase !== "playing" || !room.game) return;
    if (room.game.deadline > Date.now() + 250) {
      this.scheduleTurn(room);
      return;
    }
    try {
      const next = timeout(room.game, { now: Date.now(), rng: room.rng });
      room.game = next;
      if (next.phase === "ended") {
        await this.finishMatch(room);
        return;
      }
      this.broadcast(room);
      this.scheduleTurn(room);
      this.scheduleBot(room);
    } catch (error) {
      this.log.error({ err: error, room: room.code }, "turn timeout failed");
    }
  }

  private scheduleBot(room: Room): void {
    if (room.botTimer) clearTimeout(room.botTimer);
    room.botTimer = null;
    if (room.phase !== "playing" || !room.game) return;
    const current = room.game.players[room.game.turn];
    const seat = room.seat(current?.id);
    if (!seat?.isBot) return;
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      void this.runBot(room);
    }, 650 + Math.floor(Math.random() * 900));
  }

  private async runBot(room: Room): Promise<void> {
    if (!this.rooms.has(room.code) || room.phase !== "playing" || !room.game) return;
    const game = room.game;
    const current = game.players[game.turn];
    const seat = room.seat(current?.id);
    if (!seat?.isBot) return;

    try {
      const action = botAction(game, seat.id, room.rng);
      if (!action) return;
      const previousPending = game.pending;
      const next = reduce(game, seat.id, action, { now: Date.now(), rng: room.rng });
      if (action.type === "play" || action.type === "jump") {
        seat.stats.cardsPlayed++;
        if (action.type === "jump") seat.stats.jumps++;
        if (previousPending > 0) seat.stats.stacks++;
      }
      room.game = next;
      room.touch();
      if (next.phase === "ended") {
        await this.finishMatch(room);
        return;
      }
      this.broadcast(room);
      this.scheduleTurn(room);
      this.scheduleBot(room);
    } catch (error) {
      this.log.error({ err: error, room: room.code }, "bot failed");
      this.scheduleTurn(room);
    }
  }

  /* ─────────────────────────── persistence ─────────────────────────── */

  private async finishMatch(room: Room): Promise<void> {
    if (!room.game || room.phase === "ended") return;
    room.clearTimers();
    room.phase = "ended";
    room.endedAt = Date.now();
    if (room.game.phase !== "ended") {
      this.broadcast(room);
      return;
    }
    if (room.persisted) {
      this.broadcast(room);
      return;
    }
    room.persisted = true;

    const game = room.game;
    const placements = placementMap(game);
    const winnerSeat = room.seat(game.winner);
    const results = game.results ?? [];

    const humanSeats = room.seats.filter((seat) => seat.userId !== null);
    const humanIds = humanSeats.map((seat) => seat.userId as string);
    // Guests are humans too: they count as real opponents, they just do not persist.
    const humanPlayers = room.seats.filter((seat) => !seat.isBot);
    const humanCount = humanPlayers.length;
    const ranked = roundIsRanked(humanCount);
    const humanSeatIds = new Set(humanPlayers.map((seat) => seat.id));
    const wager = room.rules.wager;
    const wagerWinnerId = wager > 0 ? (winnerSeat?.userId ?? null) : null;
    const wagerPot = wager > 0 && wagerWinnerId ? wager * Math.max(0, humanCount - 1) : 0;

    let oldUsers = new Map<string, (typeof users.$inferSelect)>();
    const beforeAchievements = new Map<string, string[]>();
    try {
      if (humanIds.length > 0) {
        const rows = await db.select().from(users).where(inArray(users.id, humanIds));
        oldUsers = new Map(rows.map((row) => [row.id, row]));
        await Promise.all(
          humanSeats.map(async (seat) => {
            const userId = seat.userId as string;
            const row = oldUsers.get(userId);
            if (!row) return;
            const owned = await getOwnedIds(userId);
            beforeAchievements.set(
              userId,
              completedAchievements(statsOf(row), countedCosmetics(visibleOwned(row, owned))),
            );
          }),
        );
      }

      const computed = room.seats.map((seat) => {
        const placement = placements.get(seat.id) ?? room.seats.length;
        // Bots are furniture: they never add to the reward pool.
        const humanOpponentsLeft = results
          .filter((result) => result.id !== seat.id && humanSeatIds.has(result.id))
          .reduce((total, result) => total + result.cardsLeft, 0);
        const rewards = seat.cheated
          ? { coins: 0, xp: 0 }
          : matchRewardsForHumans({
              placement,
              humanPlayers: humanCount,
              opponentCardsLeft: placement === 1 ? humanOpponentsLeft : 0,
              cardsPlayed: seat.stats.cardsPlayed,
              jumps: seat.stats.jumps,
            });
        // Wager tables pay the pot instead of the normal coin reward.
        const coinDelta =
          wager > 0
            ? seat.userId && wagerWinnerId
              ? seat.userId === wagerWinnerId
                ? wagerPot
                : -wager
              : 0
            : rewards.coins;
        if (wager > 0) rewards.coins = 0;
        // A cheat-tainted seat is silently unranked, even in a ranked room.
        return { seat, placement, rewards, coinDelta, ranked: ranked && !seat.cheated };
      });

      const matchId = await db.transaction(async (tx) => {
        const [match] = await tx
          .insert(matches)
          .values({
            roomCode: room.code,
            playerCount: room.seats.length,
            winnerId: winnerSeat?.userId ?? null,
            winnerName: winnerSeat?.name ?? null,
            durationSeconds: Math.max(0, Math.round((room.endedAt - room.startedAt) / 1000)),
            rules: room.rules,
          })
          .returning({ id: matches.id });
        if (!match) throw new Error("match insert failed");

        for (const entry of computed) {
          const seat = entry.seat;
          if (seat.userId) {
            const old = oldUsers.get(seat.userId);
            if (!entry.ranked) {
              // Practice round: no XP, coins, stats, wins or achievements.
              await tx
                .update(users)
                .set({ lastSeenAt: new Date() })
                .where(eq(users.id, seat.userId));
              seat.rewards = {
                coins: 0,
                xp: 0,
                level: levelForXp(old?.xp ?? 0),
                levelUp: false,
                placement: entry.placement,
                achievements: [],
                unlocked: [],
                banked: true,
                unranked: true,
              };
            } else {
              const [fresh] = await tx
                .update(users)
                .set({
                  xp: sql`${users.xp} + ${entry.rewards.xp}`,
                  coins: sql`greatest(0, ${users.coins} + ${entry.ranked ? entry.coinDelta : 0})`,
                  games: sql`${users.games} + 1`,
                  wins: sql`${users.wins} + ${entry.placement === 1 ? 1 : 0}`,
                  jumps: sql`${users.jumps} + ${seat.stats.jumps}`,
                  stacks: sql`${users.stacks} + ${seat.stats.stacks}`,
                  cardsPlayed: sql`${users.cardsPlayed} + ${seat.stats.cardsPlayed}`,
                  lastSeenAt: new Date(),
                })
                .where(eq(users.id, seat.userId))
                .returning();
              if (fresh) {
                const grant: RewardGrant = {
                  coins: entry.ranked ? entry.coinDelta : 0,
                  xp: entry.rewards.xp,
                  level: levelForXp(fresh.xp),
                  levelUp: levelForXp(fresh.xp) > levelForXp(old?.xp ?? 0),
                  placement: entry.placement,
                  achievements: [],
                  unlocked: [],
                  banked: true,
                };
                seat.rewards = grant;
              }
            }
          } else if (seat.isBot) {
            seat.rewards = null;
          } else {
            seat.rewards = {
              coins: entry.rewards.coins,
              xp: entry.rewards.xp,
              level: 1,
              levelUp: false,
              placement: entry.placement,
              achievements: [],
              unlocked: [],
              banked: false,
              unranked: !entry.ranked,
            };
          }

          await tx.insert(matchPlayers).values({
            matchId: match.id,
            userId: seat.userId,
            displayName: seat.name,
            isBot: seat.isBot,
            placement: entry.placement,
            cardsLeft: results.find((result) => result.id === seat.id)?.cardsLeft ?? 0,
            coins: entry.ranked ? entry.coinDelta : 0,
            xp: entry.rewards.xp,
          });
        }
        return match.id;
      });

      if (matchId) {
        for (const seat of room.seats) {
          if (!seat.userId || !seat.rewards || seat.rewards.unranked) continue;
          try {
            const [fresh] = await db.select().from(users).where(eq(users.id, seat.userId)).limit(1);
            if (!fresh) continue;
            const sync = await syncUnlocks(fresh);
            const before = new Set(beforeAchievements.get(seat.userId) ?? []);
            const newly = sync.achievements.filter((id) => !before.has(id));
            seat.rewards.achievements = newly;
            seat.rewards.unlocked = sync.newly;
            seat.rewards.level = levelForXp(fresh.xp);
            seat.rewards.levelUp = levelForXp(fresh.xp) > levelForXp(oldUsers.get(seat.userId)?.xp ?? 0);
          } catch (error) {
            this.log.warn({ err: error, userId: seat.userId }, "unlock sync failed");
          }
        }
      }
    } catch (error) {
      this.log.error({ err: error, room: room.code }, "persisting match failed");
      for (const seat of room.seats) {
        if (seat.rewards) seat.rewards.banked = false;
      }
    }

    this.broadcast(room);
  }

  /* ─────────────────────────── queries & housekeeping ─────────────────────────── */

  /** Owner tool: remove a player from every table and close their sockets. */
  kickPlayer(playerId: string, message = "You were removed from the table."): void {
    for (const room of [...this.rooms.values()]) {
      const seat = room.seat(playerId);
      if (!seat) continue;
      for (const conn of [...room.connections]) {
        if (conn.playerId !== playerId) continue;
        this.send(conn, { t: "toast", tone: "error", message });
        this.send(conn, { t: "left" });
        conn.roomCode = null;
        room.connections.delete(conn);
        try {
          conn.socket.close(4003, "removed");
        } catch {
          // already gone
        }
      }
      room.removeSeat(playerId);
      this.afterDeparture(room);
    }
  }

  private mustSeat(conn: ClientConn): { room: Room; seat: Seat } {
    if (!conn.roomCode) throw new RoomError("no_room", "Join a room first.");
    const room = this.rooms.get(conn.roomCode);
    if (!room) throw new RoomError("room_not_found", "That room is gone.");
    const seat = room.seat(conn.playerId);
    if (!seat) throw new RoomError("not_seated", "You are not seated at this table.");
    return { room, seat };
  }

  private send(conn: ClientConn, message: ServerMessage): void {
    if (conn.socket.readyState === 1) {
      try {
        conn.socket.send(JSON.stringify(message));
      } catch {
        // socket died between the check and the send
      }
    }
  }

  private error(conn: ClientConn, code: string, message: string): void {
    this.send(conn, { t: "error", code, message });
  }

  private broadcast(room: Room): void {
    for (const conn of room.connections) {
      this.send(conn, {
        t: "room",
        room: buildRoomView(room, conn.playerId, this.peekActive(conn)),
      });
    }
  }

  listPublic(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter(
        (room) =>
          room.visibility === "public" &&
          room.phase === "lobby" &&
          room.seats.length > 0 &&
          room.seats.length < room.rules.maxPlayers,
      )
      .sort((a, b) => b.humanSeats().length - a.humanSeats().length || a.createdAt - b.createdAt)
      .slice(0, 40)
      .map((room) => ({
        code: room.code,
        hostName: room.host()?.name ?? "Open table",
        players: room.seats.length,
        maxPlayers: room.rules.maxPlayers,
        phase: room.phase,
        turnSeconds: room.rules.turnSeconds,
        stacking: room.rules.stacking,
        wager: room.rules.wager,
        createdAt: room.createdAt,
      }));
  }

  roomCount(): number {
    return this.rooms.size;
  }

  onlineCount(): number {
    const principals = new Set<string>();
    for (const conn of this.allConns) {
      principals.add(conn.playerId);
    }
    return principals.size;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Push a server message to every live socket of an account. */
  sendToUser(userId: string, message: ServerMessage): void {
    for (const conn of this.allConns) {
      if (conn.principal.kind === "user" && conn.principal.user.id === userId) {
        this.send(conn, message);
      }
    }
  }

  /** Online + current room for a set of accounts (friends presence). */
  presenceFor(userIds: string[]): Map<string, { online: boolean; room: Room | null }> {
    const wanted = new Set(userIds);
    const result = new Map<string, { online: boolean; room: Room | null }>();
    const rank = (room: Room): number =>
      room.phase === "playing" ? 3 : room.phase === "lobby" ? 2 : 1;

    for (const conn of this.allConns) {
      if (conn.principal.kind !== "user") continue;
      const id = conn.principal.user.id;
      if (!wanted.has(id)) continue;
      const entry = result.get(id) ?? { online: true, room: null };
      entry.online = true;
      if (conn.roomCode) {
        const room = this.rooms.get(conn.roomCode);
        if (room && (!entry.room || rank(room) > rank(entry.room))) entry.room = room;
      }
      result.set(id, entry);
    }
    return result;
  }

  activeRoomForUser(userId: string): Room | null {
    return this.presenceFor([userId]).get(userId)?.room ?? null;
  }

  sweep(): void {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      if (room.phase === "lobby") {
        for (const seat of [...room.seats]) {
          if (!seat.isBot && !seat.connected && seat.disconnectedAt && now - seat.disconnectedAt > LOBBY_GRACE_MS) {
            room.removeSeat(seat.id);
          }
        }
        if (room.humanSeats().length === 0) {
          this.deleteRoom(room);
          continue;
        }
        if (!room.host()) room.transferHost();
      }

      if (room.phase === "ended" && room.connections.size === 0 && now - room.endedAt > 5 * 60_000) {
        this.deleteRoom(room);
        continue;
      }
      if (room.phase === "ended" && now - room.endedAt > 30 * 60_000) {
        this.deleteRoom(room);
        continue;
      }

      if (room.phase === "playing") {
        const humans = room.humanSeats();
        const allGone = humans.every(
          (seat) => !seat.connected && seat.disconnectedAt && now - seat.disconnectedAt > 10 * 60_000,
        );
        if (humans.length === 0 || allGone) {
          this.deleteRoom(room);
          continue;
        }
      }

      if (room.seats.length === 0) this.deleteRoom(room);
    }
  }

  shutdown(): void {
    for (const room of this.rooms.values()) room.clearTimers();
    this.rooms.clear();
  }
}

export const rooms = new RoomManager();
