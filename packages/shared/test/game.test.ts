import { describe, expect, it } from "vitest";
import { buildDeck, isWild, type Card, type Color } from "../src/cards.js";
import {
  DEFAULT_RULES,
  GameError,
  JUMP_WINDOW_MS,
  botAction,
  createGame,
  isCardPlayable,
  reduce,
  timeout,
  type GamePlayer,
  type GameRules,
  type GameState,
} from "../src/game.js";
import { mulberry32 } from "../src/rng.js";

function card(id: string, color: Color | null, kind: Card["kind"], value: number | null = null): Card {
  return { id, color, kind, value };
}

function players(hands: Card[][], overrides: Partial<GamePlayer>[] = []): GamePlayer[] {
  return hands.map((hand, index) => ({
    id: ["a", "b", "c", "d"][index] as string,
    name: `P${index}`,
    hand,
    isBot: false,
    connected: true,
    ...overrides[index],
  }));
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    players: players([
      [card("a1", "red", "number", 5), card("a2", "blue", "draw2")],
      [card("b1", "green", "number", 5), card("b2", "yellow", "skip")],
    ]),
    drawPile: [card("d1", "red", "number", 1), card("d2", "blue", "number", 2)],
    discard: [card("t1", "red", "number", 3)],
    color: "red",
    turn: 0,
    dir: 1,
    phase: "playing",
    pending: 0,
    pendingKind: null,
    drawnCard: null,
    winner: null,
    deadline: 60_000,
    turnStartedAt: 0,
    startedAt: 0,
    lastPlayAt: 0,
    lastCard: null,
    rules: { ...DEFAULT_RULES },
    seq: 0,
    log: [],
    results: null,
    ...overrides,
  };
}

const ctx = { now: 5_000, rng: mulberry32(7) };

describe("deck", () => {
  it("builds a 112 card deck with unique ids", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(112);
    expect(new Set(deck.map((c) => c.id)).size).toBe(112);
    expect(deck.filter((c) => c.kind === "wild4")).toHaveLength(4);
    expect(deck.filter((c) => c.kind === "draw2")).toHaveLength(8);
  });

  it("deals a deterministic starting hand", () => {
    const game = createGame(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      { startingHand: 5 },
      mulberry32(42),
      1_000,
    );
    expect(game.players[0]?.hand).toHaveLength(5);
    expect(game.players[1]?.hand).toHaveLength(5);
    expect(game.discard[0]?.kind).toBe("number");
    expect(game.deadline).toBe(1_000 + DEFAULT_RULES.turnSeconds * 1000);
  });
});

describe("playing cards", () => {
  it("rejects a card that does not match", () => {
    const s = state();
    expect(() => reduce(s, "a", { type: "play", cardId: "a2" }, ctx)).toThrow(GameError);
  });

  it("plays a matching number and advances the turn", () => {
    const s = reduce(state(), "a", { type: "play", cardId: "a1" }, ctx);
    expect(s.discard.at(-1)?.id).toBe("a1");
    expect(s.turn).toBe(1);
    expect(s.players[0]?.hand).toHaveLength(1);
    expect(s.seq).toBeGreaterThan(0);
  });

  it("requires a color for wilds", () => {
    const s = state({
      players: players([[card("a1", null, "wild"), card("a2", "blue", "number", 2)], [card("b1", "green", "number", 5)]]),
    });
    expect(() => reduce(s, "a", { type: "play", cardId: "a1" }, ctx)).toThrow(/color/i);
    const played = reduce(s, "a", { type: "play", cardId: "a1", color: "green" }, ctx);
    expect(played.color).toBe("green");
  });

  it("ends the game when the last card is played", () => {
    const s = state({
      players: players([[card("a1", "red", "number", 5)], [card("b1", "green", "number", 5), card("b2", "yellow", "skip")]]),
    });
    const done = reduce(s, "a", { type: "play", cardId: "a1" }, ctx);
    expect(done.phase).toBe("ended");
    expect(done.winner).toBe("a");
    expect(done.results?.find((r) => r.id === "b")?.cardsLeft).toBe(2);
  });

  it("sets the table colour from the played card", () => {
    const s = state({
      players: players([
        [card("a1", "red", "number", 5), card("a2", "blue", "number", 2)],
        [card("b1", "green", "number", 5), card("b2", "yellow", "skip")],
      ]),
      discard: [card("t1", "green", "number", 5)],
      color: "green",
    });
    const out = reduce(s, "a", { type: "play", cardId: "a1" }, ctx);
    expect(out.color).toBe("red");
  });

  it("ignores a colour sent alongside a normal card", () => {
    const s = state({
      players: players([
        [card("a1", "green", "number", 2), card("a2", "blue", "number", 2)],
        [card("b1", "green", "number", 5), card("b2", "yellow", "skip")],
      ]),
      discard: [card("t1", "yellow", "number", 2)],
      color: "yellow",
    });
    // Bots used to attach their favourite colour to number cards.
    const out = reduce(s, "a", { type: "play", cardId: "a1", color: "yellow" }, ctx);
    expect(out.color).toBe("green");
  });

  it("repairs a stale table colour from the visible top card", () => {
    const s = state({
      players: players([
        [card("a1", "red", "number", 5), card("a2", "blue", "number", 2)],
        [card("b1", "green", "number", 5), card("b2", "yellow", "skip")],
      ]),
      discard: [card("t1", "green", "number", 5)],
      color: "yellow",
    });
    const out = reduce(s, "a", { type: "draw" }, ctx);
    expect(out.color).toBe("green");
  });

  it("treats reverse as a skip with two players", () => {
    const s = state({
      players: players([
        [card("a1", "red", "reverse"), card("a2", "blue", "number", 2)],
        [card("b1", "green", "number", 5), card("b2", "yellow", "skip")],
      ]),
    });
    const out = reduce(s, "a", { type: "play", cardId: "a1" }, ctx);
    expect(out.dir).toBe(-1);
    expect(out.turn).toBe(0);
  });
});

describe("draw stacking", () => {
  it("stacks same-kind draw cards", () => {
    let s = state({
      players: players([
        [card("a1", "red", "draw2"), card("a2", "blue", "number", 2)],
        [card("b1", "blue", "draw2"), card("b2", "yellow", "skip")],
        [card("c1", "green", "draw2"), card("c2", "green", "number", 1)],
      ]),
      color: "red",
    });
    s = reduce(s, "a", { type: "play", cardId: "a1", color: "red" }, ctx);
    expect(s.pending).toBe(2);
    expect(s.turn).toBe(1);
    s = reduce(s, "b", { type: "play", cardId: "b1", color: "red" }, { ...ctx, now: 6_000 });
    expect(s.pending).toBe(4);
    expect(s.turn).toBe(2);
    expect(s.players[2]?.hand).toHaveLength(2);
  });

  it("auto-takes the pile when the next player cannot stack", () => {
    const s = state({
      players: players([
        [card("a1", "red", "draw2"), card("a2", "blue", "number", 2)],
        [card("b1", "green", "number", 5)],
      ]),
      drawPile: [card("d1", "red", "number", 1), card("d2", "blue", "number", 2), card("d3", "green", "number", 3)],
      color: "red",
    });
    const out = reduce(s, "a", { type: "play", cardId: "a1" }, ctx);
    expect(out.pending).toBe(0);
    expect(out.turn).toBe(0);
    expect(out.players[1]?.hand).toHaveLength(3);
    expect(out.log.some((entry) => entry.kind === "draw_penalty" && entry.actor === "b" && entry.count === 2)).toBe(true);
  });

  it("leaves the pile for a player who can stack", () => {
    const s = state({
      players: players([
        [card("a1", "red", "draw2"), card("a2", "blue", "number", 2)],
        [card("b1", "blue", "draw2"), card("b2", "yellow", "skip")],
      ]),
      color: "red",
    });
    const out = reduce(s, "a", { type: "play", cardId: "a1" }, ctx);
    expect(out.pending).toBe(2);
    expect(out.turn).toBe(1);
    expect(out.players[1]?.hand).toHaveLength(2);
  });

  it("resolves instantly when stacking is off", () => {    let s = state({
      players: players([
        [card("a1", "red", "draw2"), card("a2", "blue", "number", 2)],
        [card("b1", "blue", "draw2"), card("b2", "yellow", "skip")],
        [card("c1", "green", "number", 1)],
      ]),
      rules: { ...DEFAULT_RULES, stacking: "off" },
    });
    s = reduce(s, "a", { type: "play", cardId: "a1" }, ctx);
    expect(s.pending).toBe(0);
    expect(s.players[1]?.hand).toHaveLength(4);
    expect(s.turn).toBe(2);
  });

  it("only allows the pending draw type when stacking is same", () => {
    const s = state({
      players: players([
        [card("a1", null, "wild4"), card("a2", "blue", "number", 2)],
        [card("b1", "blue", "number", 2)],
      ]),
      pending: 2,
      pendingKind: "draw2",
      color: "red",
    });
    expect(isCardPlayable(s, card("b2", "red", "draw2"))).toBe(true);
    expect(isCardPlayable(s, card("b3", null, "wild4"))).toBe(false);
  });
});

describe("jumping in", () => {
  it("allows the exact same card inside the window", () => {
    const s = state({
      players: players([
        [card("a1", "red", "number", 5), card("a2", "blue", "number", 2)],
        [card("b1", "blue", "number", 6)],
      ]),
      turn: 1,
      lastCard: card("x", "red", "number", 5),
      lastPlayAt: 4_500,
      discard: [card("x", "red", "number", 5)],
    });
    const out = reduce(s, "a", { type: "jump", cardId: "a1" }, { ...ctx, now: 5_000 });
    expect(out.turn).toBe(1);
    expect(out.players[0]?.hand).toHaveLength(1);
    expect(out.discard.at(-1)?.id).toBe("a1");
  });

  it("rejects a jump with a different card", () => {
    const s = state({
      players: players([
        [card("a1", "blue", "number", 5), card("a2", "blue", "number", 2)],
        [card("b1", "blue", "number", 6)],
      ]),
      turn: 1,
      lastCard: card("x", "red", "number", 5),
      lastPlayAt: 4_900,
      discard: [card("x", "red", "number", 5)],
    });
    expect(() => reduce(s, "a", { type: "jump", cardId: "a1" }, { ...ctx, now: 5_000 })).toThrow(/exact/i);
  });

  it("rejects jumps after the window", () => {
    const s = state({
      players: players([
        [card("a1", "red", "number", 5), card("a2", "blue", "number", 2)],
        [card("b1", "blue", "number", 6)],
      ]),
      turn: 1,
      lastCard: card("x", "red", "number", 5),
      lastPlayAt: 0,
      discard: [card("x", "red", "number", 5)],
    });
    expect(() => reduce(s, "a", { type: "jump", cardId: "a1" }, { ...ctx, now: JUMP_WINDOW_MS + 1 })).toThrow(
      /slow/i,
    );
  });
});

describe("drawing and passing", () => {
  it("draws one playable card and keeps the turn", () => {
    const s = state({
      players: players([
        [card("a1", "blue", "number", 2)],
        [card("b1", "green", "number", 5), card("b2", "yellow", "skip")],
      ]),
      drawPile: [card("d1", "red", "number", 9)],
    });
    const out = reduce(s, "a", { type: "draw" }, ctx);
    expect(out.players[0]?.hand).toHaveLength(2);
    expect(out.drawnCard).toBe("d1");
    expect(out.turn).toBe(0);
    const passed = reduce(out, "a", { type: "pass" }, ctx);
    expect(passed.turn).toBe(1);
  });

  it("auto-passes when the drawn card is not playable", () => {
    const s = state({
      players: players([[card("a1", "blue", "number", 2)], [card("b1", "green", "number", 5)]]),
      drawPile: [card("d1", "green", "number", 9)],
      color: "red",
    });
    const out = reduce(s, "a", { type: "draw" }, ctx);
    expect(out.turn).toBe(1);
    expect(out.players[0]?.hand).toHaveLength(2);
  });

  it("takes the pending stack when drawing", () => {
    const s = state({ pending: 6, pendingKind: "wild4" });
    const out = reduce(s, "a", { type: "draw" }, ctx);
    expect(out.players[0]?.hand).toHaveLength(4);
    expect(out.pending).toBe(0);
    expect(out.turn).toBe(1);
  });
});

describe("oscar's swap", () => {
  it("swaps hands with the chosen player", () => {
    const s = state({
      players: players([
        [card("a1", null, "swap"), card("a2", "blue", "number", 2)],
        [card("b1", "green", "number", 5)],
        [card("c1", "yellow", "number", 1), card("c2", "yellow", "number", 2)],
      ]),
    });
    const out = reduce(s, "a", { type: "play", cardId: "a1", color: "blue", targetId: "c" }, ctx);
    expect(out.players[0]?.hand.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(out.players[2]?.hand.map((c) => c.id)).toEqual(["a2"]);
  });

  it("auto-targets the only opponent in a two-player game", () => {
    const s = state({
      players: players([
        [card("a1", null, "swap"), card("a2", "blue", "number", 2)],
        [card("b1", "green", "number", 5), card("b2", "yellow", "number", 1)],
      ]),
    });
    const out = reduce(s, "a", { type: "play", cardId: "a1", color: "green" }, ctx);
    expect(out.players[0]?.hand.map((c) => c.id)).toEqual(["b1", "b2"]);
    expect(out.players[1]?.hand.map((c) => c.id)).toEqual(["a2"]);
    expect(out.log.some((entry) => entry.kind === "swap" && entry.target === "b")).toBe(true);
  });
});

describe("timers", () => {
  it("draws a penalty and passes on timeout", () => {
    const out = timeout(state(), ctx);
    expect(out.players[0]?.hand).toHaveLength(3);
    expect(out.turn).toBe(1);
    expect(out.log.at(-2)?.kind).toBe("timeout");
  });
});

describe("bots", () => {
  it("does not attach a colour to a normal card", () => {
    const s = state({
      players: players([
        [card("a1", "red", "number", 5), card("a2", "blue", "number", 2)],
        [card("b1", "green", "number", 5), card("b2", "yellow", "skip")],
      ]),
      discard: [card("t1", "green", "number", 3)],
      color: "green",
      turn: 1,
    });
    const action = botAction(s, "b", mulberry32(3));
    expect(action?.type).toBe("play");
    expect(action?.color).toBeUndefined();

    const drawn = state({
      players: players([
        [card("a1", "red", "number", 5), card("a2", "blue", "number", 2)],
        [card("b1", "green", "number", 2), card("b2", "yellow", "skip")],
      ]),
      discard: [card("t1", "green", "number", 3)],
      color: "green",
      turn: 1,
      drawnCard: "b1",
    });
    const drawnAction = botAction(drawn, "b", mulberry32(3));
    expect(drawnAction?.type).toBe("play");
    expect(drawnAction?.color).toBeUndefined();
  });

  it("always returns something legal on their turn", () => {
    const rng = mulberry32(11);
    let s = createGame(
      [
        { id: "a", name: "A", isBot: true },
        { id: "b", name: "B", isBot: true },
      ],
      { startingHand: 7 },
      rng,
      1_000,
    );
    for (let i = 0; i < 120 && s.phase === "playing"; i++) {
      const turnPlayer = s.players[s.turn];
      const action = botAction(s, turnPlayer?.id ?? "", rng);
      expect(action).not.toBeNull();
      if (!action) break;
      s = reduce(s, turnPlayer?.id ?? "", action, { now: 2_000 + i * 100, rng });
      if (s.drawnCard) {
        const follow = botAction(s, turnPlayer?.id ?? "", rng);
        if (follow) s = reduce(s, turnPlayer?.id ?? "", follow, { now: 2_100 + i * 100, rng });
      }
      const top = s.discard[s.discard.length - 1];
      if (top && !isWild(top) && top.color) {
        expect(s.color).toBe(top.color);
      }
    }
    expect(s.phase).toBe("ended");
  });
});

describe("rules normalisation", () => {
  it("clamps bad host input", () => {
    const game = createGame(
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      { turnSeconds: 9999, startingHand: 400, stacking: "same", wager: 99999 } as Partial<GameRules>,
      mulberry32(1),
      1_000,
    );
    expect(game.rules.turnSeconds).toBe(90);
    expect(game.rules.startingHand).toBe(10);
    expect(game.rules.wager).toBe(5000);
  });
});
