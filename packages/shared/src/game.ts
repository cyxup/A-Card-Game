import {
  COLORS,
  buildDeck,
  handPoints,
  isWild,
  sameCard,
  type Card,
  type Color,
} from "./cards.js";
import { shuffle, type Rng } from "./rng.js";

/* ────────────────────────────── Rules ────────────────────────────── */

export type Stacking = "off" | "same" | "mixed";

export interface GameRules {
  maxPlayers: number;
  turnSeconds: number;
  /** off: draw cards resolve instantly. same: only the same card stacks. mixed: +2 and +4 stack on each other. */
  stacking: Stacking;
  jumpIn: boolean;
  /** Oscar's Swap can be played out of turn, Blazing 8s style. */
  swapAnytime: boolean;
  /** House rule: 7 swaps hands with the next player, 0 rotates every hand. */
  sevenZero: boolean;
  drawUntilPlayable: boolean;
  startingHand: number;
}

export const DEFAULT_RULES: GameRules = {
  maxPlayers: 8,
  turnSeconds: 30,
  stacking: "same",
  jumpIn: true,
  swapAnytime: true,
  sevenZero: false,
  drawUntilPlayable: false,
  startingHand: 7,
};

export const RULE_BOUNDS = {
  maxPlayers: { min: 2, max: 8 },
  turnSeconds: { min: 10, max: 90 },
  startingHand: { min: 5, max: 10 },
} as const;

export const JUMP_WINDOW_MS = 5000;

/**
 * Bump when the authoritative engine changes in a way the client can observe.
 * `/api/health` exposes it so a stale server build is obvious.
 */
export const ENGINE_VERSION = 2;

export function normaliseRules(input: Partial<GameRules> | undefined): GameRules {
  const rules = { ...DEFAULT_RULES, ...input };
  return {
    maxPlayers: clampInt(rules.maxPlayers, RULE_BOUNDS.maxPlayers.min, RULE_BOUNDS.maxPlayers.max, DEFAULT_RULES.maxPlayers),
    turnSeconds: clampInt(rules.turnSeconds, RULE_BOUNDS.turnSeconds.min, RULE_BOUNDS.turnSeconds.max, DEFAULT_RULES.turnSeconds),
    startingHand: clampInt(rules.startingHand, RULE_BOUNDS.startingHand.min, RULE_BOUNDS.startingHand.max, DEFAULT_RULES.startingHand),
    stacking: rules.stacking === "mixed" || rules.stacking === "off" ? rules.stacking : "same",
    jumpIn: Boolean(rules.jumpIn),
    swapAnytime: Boolean(rules.swapAnytime),
    sevenZero: Boolean(rules.sevenZero),
    drawUntilPlayable: Boolean(rules.drawUntilPlayable),
  };
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/* ────────────────────────────── State ────────────────────────────── */

export interface GamePlayer {
  id: string;
  name: string;
  hand: Card[];
  isBot: boolean;
  connected: boolean;
}

export type LogKind =
  | "deal"
  | "play"
  | "draw"
  | "draw_penalty"
  | "no_play"
  | "pass"
  | "timeout"
  | "reshuffle"
  | "swap"
  | "rotate"
  | "jump"
  | "skip"
  | "reverse"
  | "win";

export interface LogEntry {
  id: number;
  at: number;
  kind: LogKind;
  actor?: string;
  target?: string;
  card?: Card;
  color?: Color;
  count?: number;
}

export interface GameResult {
  id: string;
  cardsLeft: number;
  points: number;
}

export interface GameState {
  players: GamePlayer[];
  drawPile: Card[];
  discard: Card[];
  color: Color;
  turn: number;
  dir: 1 | -1;
  phase: "playing" | "ended";
  /** Accumulated draw cards waiting to be stacked or taken. */
  pending: number;
  pendingKind: "draw2" | "wild4" | null;
  /** Card drawn this turn that the player may still play. */
  drawnCard: string | null;
  winner: string | null;
  deadline: number;
  turnStartedAt: number;
  startedAt: number;
  lastPlayAt: number;
  lastCard: Card | null;
  rules: GameRules;
  seq: number;
  log: LogEntry[];
  results: GameResult[] | null;
}

export type GameAction =
  | { type: "play"; cardId: string; color?: Color; targetId?: string }
  | { type: "jump"; cardId: string; color?: Color; targetId?: string }
  | { type: "draw" }
  | { type: "pass" };

export class GameError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GameError";
    this.code = code;
  }
}

export interface ReduceContext {
  now: number;
  rng: Rng;
}

/* ────────────────────────────── Queries ────────────────────────────── */

export function topCard(state: GameState): Card {
  const card = state.discard[state.discard.length - 1];
  if (!card) throw new Error("Discard pile is empty");
  return card;
}

export function playerById(state: GameState, id: string): GamePlayer | undefined {
  return state.players.find((player) => player.id === id);
}

export function currentPlayer(state: GameState): GamePlayer {
  return state.players[state.turn] as GamePlayer;
}

export function nextIndex(state: GameState, from: number, steps = 1): number {
  const n = state.players.length;
  return (((from + state.dir * steps) % n) + n) % n;
}

export function canStack(state: GameState, card: Card): boolean {
  return canStackCard(
    { pending: state.pending, pendingKind: state.pendingKind, rules: state.rules },
    card,
  );
}

export interface PlayContext {
  top: Card;
  color: Color;
  pending: number;
  pendingKind: "draw2" | "wild4" | null;
  rules: GameRules;
}

export function canStackCard(
  context: { pending: number; pendingKind: "draw2" | "wild4" | null; rules: GameRules },
  card: Card,
): boolean {
  if (context.pending <= 0) return false;
  if (context.rules.stacking === "off") return false;
  const mixed = context.rules.stacking === "mixed";
  if (context.pendingKind === "draw2") return card.kind === "draw2" || (mixed && card.kind === "wild4");
  if (context.pendingKind === "wild4") return card.kind === "wild4" || (mixed && card.kind === "draw2");
  return card.kind === "draw2" || card.kind === "wild4";
}

/** Can this card be played right now by the player whose turn it is? */
export function isCardPlayable(state: GameState, card: Card): boolean {
  if (state.phase !== "playing") return false;
  return canPlayCard(
    {
      top: topCard(state),
      color: state.color,
      pending: state.pending,
      pendingKind: state.pendingKind,
      rules: state.rules,
    },
    card,
  );
}

export function canPlayCard(context: PlayContext, card: Card): boolean {
  if (context.pending > 0) return canStackCard(context, card);
  if (isWild(card)) return true;
  if (card.color === context.color) return true;
  const top = context.top;
  if (card.kind === "number" && top.kind === "number") return card.value === top.value;
  if (card.kind !== "number" && card.kind === top.kind) return true;
  return false;
}

export function canJumpIn(state: GameState, card: Card, now: number): boolean {
  return canJumpInView(
    { rules: state.rules, pending: state.pending, lastCard: state.lastCard, lastPlayAt: state.lastPlayAt },
    card,
    now,
  );
}

export function canJumpInView(
  view: { rules: GameRules; pending: number; lastCard: Card | null; lastPlayAt: number },
  card: Card,
  now: number,
): boolean {
  if (!view.rules.jumpIn || view.pending > 0) return false;
  if (!view.lastCard || isWild(view.lastCard) || isWild(card) || card.color === null) return false;
  if (now - view.lastPlayAt > JUMP_WINDOW_MS) return false;
  return sameCard(card, view.lastCard);
}

export function legalCards(state: GameState, playerId: string): Card[] {
  const player = playerById(state, playerId);
  if (!player) return [];
  if (state.players[state.turn]?.id !== playerId) return [];
  if (state.drawnCard) return player.hand.filter((card) => card.id === state.drawnCard);
  return player.hand.filter((card) => isCardPlayable(state, card));
}

/** A fresh game. `seated` defines the seating order. */
export function createGame(
  seated: { id: string; name: string; isBot?: boolean; connected?: boolean }[],
  rulesInput: Partial<GameRules> | undefined,
  rng: Rng,
  now: number,
): GameState {
  const rules = normaliseRules(rulesInput);
  if (seated.length < 2) throw new GameError("not_enough_players", "You need at least two players.");
  if (seated.length > rules.maxPlayers) throw new GameError("room_full", "That is too many players.");

  const deck = shuffle(buildDeck(), rng);
  const players: GamePlayer[] = seated.map((seat) => ({
    id: seat.id,
    name: seat.name,
    hand: [],
    isBot: Boolean(seat.isBot),
    connected: seat.connected ?? true,
  }));

  for (let round = 0; round < rules.startingHand; round++) {
    for (const player of players) {
      const card = deck.pop();
      if (card) player.hand.push(card);
    }
  }

  // Flip until a plain number card starts the discard. Keeps the first turn
  // simple and avoids weird instant-penalty openings.
  let starter: Card | undefined;
  while (deck.length > 0) {
    const card = deck.pop() as Card;
    if (card.kind === "number") {
      starter = card;
      break;
    }
    deck.unshift(card);
  }
  if (!starter) {
    starter = { id: "c0", color: "red", kind: "number", value: 0 };
  }

  const first = Math.floor(rng() * players.length);
  const state: GameState = {
    players,
    drawPile: deck,
    discard: [starter],
    color: starter.color as Color,
    turn: first,
    dir: 1,
    phase: "playing",
    pending: 0,
    pendingKind: null,
    drawnCard: null,
    winner: null,
    deadline: now + rules.turnSeconds * 1000,
    turnStartedAt: now,
    startedAt: now,
    lastPlayAt: 0,
    lastCard: null,
    rules,
    seq: 0,
    log: [],
    results: null,
  };

  pushLog(state, { at: now, kind: "deal", count: players.length });
  return state;
}

/* ────────────────────────────── Reduce ────────────────────────────── */

export function reduce(prev: GameState, playerId: string, action: GameAction, ctx: ReduceContext): GameState {
  if (prev.phase !== "playing") throw new GameError("game_over", "This round is already over.");
  const state = cloneState(prev);
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index < 0) throw new GameError("not_seated", "You are not in this game.");

  switch (action.type) {
    case "play":
      return applyPlay(state, index, action, ctx, false);
    case "jump":
      return applyPlay(state, index, action, ctx, true);
    case "draw":
      return applyDraw(state, index, ctx);
    case "pass":
      return applyPass(state, index, ctx);
    default:
      throw new GameError("unknown_action", "Unknown action.");
  }
}

function applyPlay(
  state: GameState,
  index: number,
  action: { cardId: string; color?: Color; targetId?: string },
  ctx: ReduceContext,
  jump: boolean,
): GameState {
  const player = state.players[index] as GamePlayer;
  const card = player.hand.find((candidate) => candidate.id === action.cardId);
  if (!card) throw new GameError("card_not_in_hand", "That card is not in your hand.");

  if (jump) {
    if (state.turn === index) throw new GameError("your_turn", "It is already your turn.");
    if (state.pending > 0) throw new GameError("pending_draw", "Resolve the draw stack first.");
    if (state.rules.swapAnytime && card.kind === "swap") {
      ensureJumpWindow(state, ctx.now);
    } else {
      if (!state.rules.jumpIn) throw new GameError("jump_disabled", "Jump-in is turned off in this room.");
      ensureJumpWindow(state, ctx.now);
      if (
        isWild(card) ||
        !state.lastCard ||
        isWild(state.lastCard) ||
        !sameCard(card, state.lastCard)
      ) {
        throw new GameError("jump_mismatch", "You can only jump in with the exact same card.");
      }
    }
    state.turn = index;
  } else {
    if (state.turn !== index) throw new GameError("not_your_turn", "Wait for your turn.");
    if (state.drawnCard && card.id !== state.drawnCard) {
      throw new GameError("must_play_drawn", "You can only play the card you drew.");
    }
    if (!isCardPlayable(state, card)) {
      throw new GameError("not_playable", "That card does not match.");
    }
  }

  if (isWild(card) || card.kind === "swap") {
    if (!action.color || !COLORS.includes(action.color)) {
      throw new GameError("color_required", "Pick a color first.");
    }
  }

  let target: GamePlayer | undefined;
  if (card.kind === "swap") {
    let targetId = action.targetId;
    if (!targetId && state.players.length === 2) {
      targetId = state.players.find((candidate) => candidate.id !== player.id)?.id;
    }
    if (!targetId || targetId === player.id) {
      throw new GameError("target_required", "Pick someone to swap hands with.");
    }
    target = state.players.find((candidate) => candidate.id === targetId);
    if (!target) throw new GameError("invalid_target", "That player is not at this table.");
  }

  player.hand = player.hand.filter((candidate) => candidate.id !== card.id);
  state.drawnCard = null;
  state.lastCard = card;
  state.lastPlayAt = ctx.now;
  state.discard.push(card);
  if (action.color) state.color = action.color;
  else if (card.color) state.color = card.color;

  pushLog(state, {
    at: ctx.now,
    kind: jump ? "jump" : "play",
    actor: player.id,
    card,
    color: action.color,
    target: target?.id,
  });

  // Winning with your last card ends the round before penalties resolve.
  if (player.hand.length === 0) {
    finish(state, player.id, ctx.now);
    return state;
  }

  if (card.kind === "swap" && target) {
    const mine = player.hand;
    player.hand = target.hand;
    target.hand = mine;
    pushLog(state, { at: ctx.now, kind: "swap", actor: player.id, target: target.id });
    state.turn = index;
    advance(state, ctx.now, 1);
    return state;
  }

  if (state.rules.sevenZero && card.kind === "number" && (card.value === 0 || card.value === 7)) {
    state.turn = index;
    if (card.value === 0) {
      rotateHands(state, ctx.now);
    } else {
      const partner = state.players[nextIndex(state, index, 1)] as GamePlayer;
      const mine = player.hand;
      player.hand = partner.hand;
      partner.hand = mine;
      pushLog(state, { at: ctx.now, kind: "swap", actor: player.id, target: partner.id });
    }
  }

  switch (card.kind) {
    case "skip":
      pushLog(state, { at: ctx.now, kind: "skip", actor: player.id, target: state.players[nextIndex(state, index, 1)]?.id });
      advance(state, ctx.now, 2);
      return state;

    case "reverse": {
      state.dir = state.dir === 1 ? -1 : 1;
      pushLog(state, { at: ctx.now, kind: "reverse", actor: player.id });
      // With two players a reverse acts as a skip, so the player goes again.
      advance(state, ctx.now, state.players.length === 2 ? 2 : 1);
      return state;
    }

    case "draw2":
    case "wild4": {
      const amount = card.kind === "draw2" ? 2 : 4;
      if (state.rules.stacking === "off") {
        const victim = state.players[nextIndex(state, index, 1)] as GamePlayer;
        const drawn = drawCards(state, victim, amount, ctx);
        pushLog(state, { at: ctx.now, kind: "draw_penalty", actor: victim.id, count: drawn });
        advance(state, ctx.now, 2);
      } else {
        state.pending += amount;
        state.pendingKind = card.kind;
        advance(state, ctx.now, 1);
        const victim = state.players[state.turn];
        // If there is nothing to stack, asking for an explicit "take" is just
        // busywork. Resolve it for the player.
        if (victim && !victim.hand.some((candidate) => canStack(state, candidate))) {
          const drawn = drawCards(state, victim, state.pending, ctx);
          pushLog(state, { at: ctx.now, kind: "draw_penalty", actor: victim.id, count: drawn });
          state.pending = 0;
          state.pendingKind = null;
          state.lastCard = null;
          advance(state, ctx.now, 1);
        }
      }
      return state;
    }

    default:
      advance(state, ctx.now, 1);
      return state;
  }
}

function applyDraw(state: GameState, index: number, ctx: ReduceContext): GameState {
  if (state.turn !== index) throw new GameError("not_your_turn", "Wait for your turn.");
  const player = state.players[index] as GamePlayer;

  if (state.pending > 0) {
    const drawn = drawCards(state, player, state.pending, ctx);
    pushLog(state, { at: ctx.now, kind: "draw_penalty", actor: player.id, count: drawn });
    state.pending = 0;
    state.pendingKind = null;
    state.lastCard = null;
    advance(state, ctx.now, 1);
    return state;
  }

  if (state.drawnCard) throw new GameError("already_drew", "You already drew this turn.");

  const wanted = state.rules.drawUntilPlayable ? state.drawPile.length + 1 : 1;
  let last: Card | undefined;
  let drawn = 0;
  for (let i = 0; i < wanted; i++) {
    const card = drawOne(state, ctx);
    if (!card) break;
    drawn++;
    player.hand.push(card);
    last = card;
    if (!state.rules.drawUntilPlayable || isCardPlayable(state, card)) break;
  }

  state.lastCard = null;
  if (!last) {
    pushLog(state, { at: ctx.now, kind: "draw", actor: player.id, count: 0 });
    finish(state, null, ctx.now);
    return state;
  }

  pushLog(state, { at: ctx.now, kind: "draw", actor: player.id, count: drawn });
  if (isCardPlayable(state, last)) {
    state.drawnCard = last.id;
    state.turnStartedAt = ctx.now;
    state.deadline = ctx.now + state.rules.turnSeconds * 1000;
    state.seq++;
    return state;
  }

  pushLog(state, { at: ctx.now, kind: "no_play", actor: player.id });
  advance(state, ctx.now, 1);
  return state;
}

function applyPass(state: GameState, index: number, ctx: ReduceContext): GameState {
  if (state.turn !== index) throw new GameError("not_your_turn", "Wait for your turn.");
  if (!state.drawnCard) throw new GameError("nothing_to_pass", "Draw a card before passing.");
  pushLog(state, { at: ctx.now, kind: "pass", actor: state.players[index]?.id });
  advance(state, ctx.now, 1);
  return state;
}

/** Turn timer fired on the server. Draws a penalty and passes. */
export function timeout(prev: GameState, ctx: ReduceContext): GameState {
  if (prev.phase !== "playing") return prev;
  const state = cloneState(prev);
  const index = state.turn;
  const player = state.players[index] as GamePlayer;
  pushLog(state, { at: ctx.now, kind: "timeout", actor: player.id });

  if (state.drawnCard) {
    advance(state, ctx.now, 1);
    return state;
  }

  if (state.pending > 0) {
    const drawn = drawCards(state, player, state.pending, ctx);
    pushLog(state, { at: ctx.now, kind: "draw_penalty", actor: player.id, count: drawn });
    state.pending = 0;
    state.pendingKind = null;
  } else {
    const card = drawOne(state, ctx);
    if (card) {
      player.hand.push(card);
      pushLog(state, { at: ctx.now, kind: "draw", actor: player.id, count: 1 });
    }
  }
  state.lastCard = null;
  advance(state, ctx.now, 1);
  return state;
}

/* ────────────────────────────── Internals ────────────────────────────── */

function ensureJumpWindow(state: GameState, now: number): void {
  if (!state.lastCard || now - state.lastPlayAt > JUMP_WINDOW_MS) {
    throw new GameError("jump_window", "You were too slow to jump in.");
  }
}

function advance(state: GameState, now: number, steps = 1): void {
  const n = state.players.length;
  state.turn = (((state.turn + state.dir * steps) % n) + n) % n;
  state.drawnCard = null;
  state.turnStartedAt = now;
  state.deadline = now + state.rules.turnSeconds * 1000;
  state.seq++;
}

function finish(state: GameState, winner: string | null, now: number): void {
  state.phase = "ended";
  state.winner = winner;
  state.deadline = 0;
  state.pending = 0;
  state.pendingKind = null;
  state.results = state.players.map((player) => ({
    id: player.id,
    cardsLeft: player.hand.length,
    points: handPoints(player.hand),
  }));
  pushLog(state, { at: now, kind: "win", actor: winner ?? undefined });
  state.seq++;
}

function rotateHands(state: GameState, now: number): void {
  const n = state.players.length;
  const hands = state.players.map((player) => player.hand);
  for (let i = 0; i < n; i++) {
    const next = (((i + state.dir) % n) + n) % n;
    (state.players[next] as GamePlayer).hand = hands[i] as Card[];
  }
  pushLog(state, { at: now, kind: "rotate" });
}

function drawOne(state: GameState, ctx: ReduceContext): Card | undefined {
  if (state.drawPile.length === 0) reshuffleDiscard(state, ctx);
  return state.drawPile.pop();
}

function drawCards(state: GameState, player: GamePlayer, count: number, ctx: ReduceContext): number {
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    const card = drawOne(state, ctx);
    if (!card) break;
    player.hand.push(card);
    drawn++;
  }
  return drawn;
}

function reshuffleDiscard(state: GameState, ctx: ReduceContext): void {
  if (state.discard.length <= 1) return;
  const top = state.discard.pop() as Card;
  state.drawPile = shuffle(state.discard, ctx.rng);
  state.discard = [top];
  pushLog(state, { at: ctx.now, kind: "reshuffle", count: state.drawPile.length });
}

function pushLog(state: GameState, entry: Omit<LogEntry, "id">): void {
  const nextId = (state.log[state.log.length - 1]?.id ?? 0) + 1;
  state.log.push({ ...entry, id: nextId });
  if (state.log.length > 60) state.log.splice(0, state.log.length - 60);
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

/* ────────────────────────────── Bots ────────────────────────────── */

/**
 * A quick heuristic. Bots are intentionally fair-to-middling: they use action
 * cards when someone is close to winning, hoard wilds otherwise.
 */
export function botAction(state: GameState, playerId: string, rng: Rng): GameAction | null {
  const player = playerById(state, playerId);
  if (!player || state.phase !== "playing") return null;
  if (state.players[state.turn]?.id !== playerId) return null;

  const opponents = state.players.filter((candidate) => candidate.id !== playerId);
  const nearestWin = Math.min(...opponents.map((candidate) => candidate.hand.length));
  const color = favouriteColor(player.hand, rng);

  if (state.pending > 0) {
    const stackable = player.hand.filter((card) => canStack(state, card));
    const pick = strongestDraw(stackable);
    if (pick && (nearestWin > 1 || stackable.length > 1)) {
      return { type: "play", cardId: pick.id, color: favouriteColor(player.hand, rng) };
    }
    return { type: "draw" };
  }

  if (state.drawnCard) {
    const card = player.hand.find((candidate) => candidate.id === state.drawnCard);
    if (card && isCardPlayable(state, card)) {
      return { type: "play", cardId: card.id, color, targetId: pickSwapTarget(state, player, rng) };
    }
    return { type: "pass" };
  }

  const playable = player.hand.filter((card) => isCardPlayable(state, card));
  if (playable.length === 0) return { type: "draw" };

  const winning = playable.find((card) => player.hand.length === 1);
  if (winning) {
    return { type: "play", cardId: winning.id, color, targetId: pickSwapTarget(state, player, rng) };
  }

  const scored = playable
    .map((card) => ({ card, score: cardScore(card, nearestWin, rng) }))
    .sort((a, b) => b.score - a.score);
  const chosen = scored[0]?.card;
  if (!chosen) return { type: "draw" };

  return {
    type: "play",
    cardId: chosen.id,
    color: chosen.color ?? color,
    targetId: chosen.kind === "swap" ? pickSwapTarget(state, player, rng) : undefined,
  };
}

function cardScore(card: Card, nearestWin: number, rng: Rng): number {
  const noise = rng() * 0.4;
  if (card.kind === "number") return 20 + (card.value ?? 0) + noise;
  if (card.kind === "skip" || card.kind === "reverse") return 44 + (nearestWin <= 2 ? 26 : 0) + noise;
  if (card.kind === "draw2") return 50 + (nearestWin <= 2 ? 30 : 0) + noise;
  if (card.kind === "swap") return 30 + (nearestWin <= 1 ? 18 : 0) + noise;
  if (card.kind === "wild4") return nearestWin <= 2 ? 70 : 12 + noise;
  return nearestWin <= 1 ? 55 : 18 + noise;
}

function strongestDraw(cards: Card[]): Card | undefined {
  return [...cards].sort((a, b) => (b.kind === "wild4" ? 4 : 2) - (a.kind === "wild4" ? 4 : 2))[0];
}

function pickSwapTarget(state: GameState, player: GamePlayer, rng: Rng): string | undefined {
  const others = state.players.filter((candidate) => candidate.id !== player.id);
  if (others.length === 0) return undefined;
  const sorted = [...others].sort((a, b) => a.hand.length - b.hand.length);
  // Mostly take the smallest hand, sometimes keep it unpredictable.
  return (rng() < 0.8 ? sorted[0] : sorted[Math.floor(rng() * sorted.length)])?.id;
}

function favouriteColor(hand: Card[], rng: Rng): Color {
  const counts = new Map<Color, number>();
  for (const color of COLORS) counts.set(color, 0);
  for (const card of hand) {
    if (card.color) counts.set(card.color, (counts.get(card.color) ?? 0) + 1);
  }
  let best = COLORS[0] as Color;
  let bestCount = -1;
  for (const color of COLORS) {
    const count = counts.get(color) ?? 0;
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  }
  if (bestCount === 0) return COLORS[Math.floor(rng() * COLORS.length)] as Color;
  return best;
}
