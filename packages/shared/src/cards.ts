/**
 * Cards, deck construction and small display helpers.
 * Kept dependency-free so it can run on the server, in the browser and in tests.
 */

export const COLORS = ["red", "yellow", "green", "blue"] as const;
export type Color = (typeof COLORS)[number];

export type CardKind =
  | "number"
  | "skip"
  | "reverse"
  | "draw2"
  | "wild"
  | "wild4"
  | "swap"
  | "draw10"
  | "skipAll"
  | "flip";

export interface CardFace {
  color: Color | null;
  kind: CardKind;
  value: number | null;
}

export interface Card extends CardFace {
  /** Unique within a deck. */
  id: string;
  /** Present on doubly-sided cards; the face on the other side. */
  back?: CardFace;
}

/** Owner-only hand editor. The server turns this into a real Card. */
export interface OwnerCardSpec {
  color: Color | null;
  kind: CardKind;
  value?: number | null;
}

export function isValidOwnerCardSpec(spec: OwnerCardSpec): boolean {
  if (!spec || typeof spec !== "object") return false;
  if (spec.kind === "number") {
    return (
      spec.color !== null &&
      COLORS.includes(spec.color) &&
      typeof spec.value === "number" &&
      Number.isInteger(spec.value) &&
      spec.value >= 0 &&
      spec.value <= 9
    );
  }
  if (spec.kind === "wild" || spec.kind === "wild4" || spec.kind === "swap") {
    return spec.color === null;
  }
  if (spec.kind === "skip" || spec.kind === "reverse" || spec.kind === "draw2" || spec.kind === "draw10" || spec.kind === "skipAll" || spec.kind === "flip") {
    return spec.color !== null && COLORS.includes(spec.color);
  }
  return false;
}

export function ownerCardFromSpec(spec: OwnerCardSpec, id: string): Card {
  return {
    id,
    color: spec.color,
    kind: spec.kind,
    value: spec.kind === "number" ? (spec.value ?? 0) : null,
  };
}

export const KIND_LABEL: Record<CardKind, string> = {
  number: "Number",
  skip: "Giddy Up",
  reverse: "Wrong Way",
  draw2: "Quick Draw",
  wild: "Colour Wild",
  wild4: "Wild Draw Four",
  swap: "Oscar's Swap",
  draw10: "Double Draw",
  skipAll: "Skip Everyone",
  flip: "Flip",
};

export const KIND_SHORT: Record<CardKind, string> = {
  number: "",
  skip: "Skip",
  reverse: "Reverse",
  draw2: "+2",
  wild: "Wild",
  wild4: "+4",
  swap: "Swap",
  draw10: "+10",
  skipAll: "Skip all",
  flip: "Flip",
};

export function isWild(card: Card): boolean {
  return card.kind === "wild" || card.kind === "wild4" || card.kind === "swap";
}

/** Standard 112-card deck with the house action cards folded in. */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let n = 0;
  const add = (color: Color | null, kind: CardKind, value: number | null = null) => {
    cards.push({ id: `c${n++}`, color, kind, value });
  };

  for (const color of COLORS) {
    add(color, "number", 0);
    for (let value = 1; value <= 9; value++) {
      add(color, "number", value);
      add(color, "number", value);
    }
    for (const kind of ["skip", "reverse", "draw2"] as const) {
      add(color, kind);
      add(color, kind);
    }
  }
  for (let i = 0; i < 4; i++) {
    add(null, "wild");
    add(null, "wild4");
    add(null, "swap");
  }
  return cards;
}

export function invertColor(color: Color | null): Color | null {
  if (color === "red") return "blue";
  if (color === "blue") return "red";
  if (color === "yellow") return "green";
  if (color === "green") return "yellow";
  return null;
}

/**
 * Doubly Stacked deck: every physical card has a light face and a darker,
 * nastier back face. Flip cards turn every card over in one go.
 */
export function buildDoublyDeck(): Card[] {
  const cards = buildDeck();
  for (const card of cards) {
    card.back = {
      color: invertColor(card.color),
      kind:
        card.kind === "draw2"
          ? "draw10"
          : card.kind === "skip"
            ? "skipAll"
            : card.kind,
      value: card.kind === "number" ? card.value : null,
    };
  }
  for (let i = 0; i < 4; i++) {
    const color = COLORS[i] as Color;
    cards.push({
      id: `flip${i}`,
      color,
      kind: "flip",
      value: null,
      back: { color: invertColor(color), kind: "flip", value: null },
    });
  }
  return cards;
}

export function flipCard(card: Card): void {
  if (!card.back) return;
  const current: CardFace = { color: card.color, kind: card.kind, value: card.value };
  card.color = card.back.color;
  card.kind = card.back.kind;
  card.value = card.back.value;
  card.back = current;
}

export function cardPoints(card: Card): number {
  switch (card.kind) {
    case "number":
      return card.value ?? 0;
    case "draw2":
    case "skip":
    case "reverse":
      return 20;
    case "draw10":
      return 50;
    case "skipAll":
      return 30;
    case "flip":
      return 25;
    case "wild":
    case "wild4":
    case "swap":
      return 50;
  }
}

export function handPoints(hand: Card[]): number {
  return hand.reduce((total, card) => total + cardPoints(card), 0);
}

export function sameCard(a: Card, b: Card): boolean {
  return a.color === b.color && a.kind === b.kind && a.value === b.value;
}

/** Text used by screen readers and fallbacks. */
export function cardLabel(card: Card): string {
  if (card.kind === "number") return `${card.color} ${card.value}`;
  if (isWild(card)) return KIND_LABEL[card.kind];
  return `${card.color} ${KIND_LABEL[card.kind]}`;
}
