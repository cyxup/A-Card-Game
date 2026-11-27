/**
 * Cards, deck construction and small display helpers.
 * Kept dependency-free so it can run on the server, in the browser and in tests.
 */

export const COLORS = ["red", "yellow", "green", "blue"] as const;
export const DARK_COLORS = ["pink", "teal", "orange", "purple"] as const;
export const ALL_COLORS = [...COLORS, ...DARK_COLORS] as const;
export type Color = (typeof ALL_COLORS)[number];

export type CardKind =
  | "number"
  | "skip"
  | "reverse"
  | "draw2"
  | "draw5"
  | "wild"
  | "wild4"
  | "wild9"
  | "wildColor"
  | "swap"
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
      ALL_COLORS.includes(spec.color) &&
      typeof spec.value === "number" &&
      Number.isInteger(spec.value) &&
      spec.value >= 0 &&
      spec.value <= 9
    );
  }
  if (isWildKind(spec.kind)) {
    return spec.color === null;
  }
  if (spec.kind === "skip" || spec.kind === "reverse" || spec.kind === "draw2" || spec.kind === "draw5" || spec.kind === "skipAll" || spec.kind === "flip") {
    return spec.color !== null && ALL_COLORS.includes(spec.color);
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
  draw5: "Draw Five",
  wild: "Colour Wild",
  wild4: "Wild Draw Four",
  wild9: "Wild Draw Nine",
  wildColor: "Wild Draw Color",
  swap: "Oscar's Swap",
  skipAll: "Skip Everyone",
  flip: "Flip",
};

export const KIND_SHORT: Record<CardKind, string> = {
  number: "",
  skip: "Skip",
  reverse: "Reverse",
  draw2: "+2",
  draw5: "+5",
  wild: "Wild",
  wild4: "+4",
  wild9: "+9",
  wildColor: "Color",
  swap: "Swap",
  skipAll: "Skip all",
  flip: "Flip",
};

export const DOUBLY_ONLY_KINDS: CardKind[] = ["draw5", "wild9", "wildColor", "skipAll", "flip"];

export function isDoublyOnlyKind(kind: CardKind): boolean {
  return DOUBLY_ONLY_KINDS.includes(kind);
}

/** Dark-side colours only exist on Doubly Stacked cards. */
export function isDarkColor(color: Color | null): boolean {
  return color !== null && (DARK_COLORS as readonly Color[]).includes(color);
}

export function isWildKind(kind: CardKind): boolean {
  return kind === "wild" || kind === "wild4" || kind === "wild9" || kind === "wildColor" || kind === "swap";
}

export function isWild(card: Card): boolean {
  return isWildKind(card.kind);
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
  if (color === "red") return "pink";
  if (color === "pink") return "red";
  if (color === "blue") return "teal";
  if (color === "teal") return "blue";
  if (color === "yellow") return "orange";
  if (color === "orange") return "yellow";
  if (color === "green") return "purple";
  if (color === "purple") return "green";
  return null;
}

/**
 * The reverse of a number card deliberately shows another number. If both
 * sides showed the same value, opponents could read your hand through the far
 * side in Doubly Stacked.
 */
export function inverseNumber(value: number | null): number | null {
  if (value === null) return null;
  return (value + 5) % 10;
}

export function inverseFace(face: CardFace): CardFace {
  return {
    color: invertColor(face.color),
    kind:
      face.kind === "draw2"
        ? "draw5"
        : face.kind === "draw5"
          ? "draw2"
          : face.kind === "wild4"
            ? "wild9"
            : face.kind === "wild9"
              ? "wild4"
              : face.kind === "wild"
                ? "wildColor"
                : face.kind === "wildColor"
                  ? "wild"
                  : face.kind === "skip"
                    ? "skipAll"
                    : face.kind === "skipAll"
                      ? "skip"
                      : face.kind,
    value: face.kind === "number" ? inverseNumber(face.value) : null,
  };
}

/**
 * Doubly Stacked deck: every physical card has a light face and a darker,
 * nastier back face. Flip cards turn every card over in one go.
 */
export function buildDoublyDeck(): Card[] {
  const cards = buildDeck();
  for (const card of cards) {
    card.back = inverseFace(card);
  }
  for (let i = 0; i < 4; i++) {
    const color = COLORS[i] as Color;
    const face: CardFace = { color, kind: "flip", value: null };
    cards.push({ id: `flip${i}`, ...face, back: inverseFace(face) });
  }
  return cards;
}

export function flipCard(card: Card): void {
  const current: CardFace = { color: card.color, kind: card.kind, value: card.value };
  const other = card.back ?? inverseFace(current);
  card.color = other.color;
  card.kind = other.kind;
  card.value = other.value;
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
    case "draw5":
      return 35;
    case "skipAll":
      return 30;
    case "flip":
      return 25;
    case "wild":
    case "wild4":
    case "wildColor":
    case "swap":
      return 50;
    case "wild9":
      return 70;
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
