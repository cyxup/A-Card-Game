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
  | "swap";

export interface Card {
  /** Unique within a deck. */
  id: string;
  /** null for wild cards. */
  color: Color | null;
  kind: CardKind;
  /** 0-9 for number cards, null otherwise. */
  value: number | null;
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
  if (spec.kind === "skip" || spec.kind === "reverse" || spec.kind === "draw2") {
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
};

export const KIND_SHORT: Record<CardKind, string> = {
  number: "",
  skip: "Skip",
  reverse: "Reverse",
  draw2: "+2",
  wild: "Wild",
  wild4: "+4",
  swap: "Swap",
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

export function cardPoints(card: Card): number {
  switch (card.kind) {
    case "number":
      return card.value ?? 0;
    case "draw2":
    case "skip":
    case "reverse":
      return 20;
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
