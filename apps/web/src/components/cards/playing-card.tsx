import type { Card } from "@stacked/shared";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

const SYMBOLS = {
  skip: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2">
      <circle cx="12" cy="12" r="8.4" />
      <path d="M6.2 6.2l11.6 11.6" />
    </svg>
  ),
  reverse: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2">
      <path d="M6 8h11l-3-3M18 16H7l3 3" />
    </svg>
  ),
  swap: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1">
      <path d="M8 4v12M5 7l3-3 3 3M16 20V8M13 17l3 3 3-3" />
    </svg>
  ),
} as const;

function glyph(card: Card) {
  switch (card.kind) {
    case "number":
      return card.value ?? 0;
    case "skip":
      return SYMBOLS.skip;
    case "reverse":
      return SYMBOLS.reverse;
    case "draw2":
      return "+2";
    case "draw10":
      return "+10";
    case "flip":
      return "↻";
    case "skipAll":
      return SYMBOLS.skip;
    case "wild":
      return "";
    case "wild4":
      return "+4";
    case "swap":
      return SYMBOLS.swap;
  }
}

function corner(card: Card): ReactNode {
  switch (card.kind) {
    case "number":
      return String(card.value ?? 0);
    case "skip":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4">
          <circle cx="12" cy="12" r="7.6" />
          <path d="M6.6 6.6l10.8 10.8" />
        </svg>
      );
    case "reverse":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4">
          <path d="M6 9h11l-3-3M18 15H7l3 3" />
        </svg>
      );
    case "draw2":
      return "+2";
    case "draw10":
      return "+10";
    case "flip":
      return "↻";
    case "skipAll":
      return "ALL";
    case "wild":
      return "";
    case "wild4":
      return "+4";
    case "swap":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3">
          <path d="M8 5v12M5 8l3-3 3 3M16 19V7M13 16l3 3 3-3" />
        </svg>
      );
  }
}

export interface CardFaceProps {
  card: Card;
  className?: string;
  style?: CSSProperties;
  muted?: boolean;
  playable?: boolean;
  drawn?: boolean;
  onClick?: () => void;
  label?: string;
}

export function CardFace({ card, className, style, muted, playable, drawn, onClick, label }: CardFaceProps) {
  const wild = card.color === null;
  const center = glyph(card);
  const content = (
    <>
      <div className="pcard-inner">
        <span className="pcard-corner tl">{corner(card)}</span>
        <span className="pcard-corner br">{corner(card)}</span>
        <div className="pcard-oval">
          {center ? <span className="pcard-glyph">{center}</span> : null}
        </div>
      </div>
    </>
  );

  if (!onClick) {
    const semantics = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };
    return (
      <div
        className={cn("pcard", muted && "pcard-dim", playable && "pcard-playable", drawn && "pcard-drawn", className)}
        data-color={card.color ?? undefined}
        data-wild={wild}
        style={style}
        {...semantics}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn("pcard cursor-pointer", muted && "pcard-dim", playable && "pcard-playable", drawn && "pcard-drawn", className)}
      data-color={card.color ?? undefined}
      data-wild={wild}
      style={style}
      onClick={onClick}
      aria-label={label}
    >
      {content}
    </button>
  );
}

export function CardBack({ back, className, style }: { back: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn("pcard pcard-back", `back-${back}`, className)} style={style} aria-hidden>
      <div className="pcard-inner" />
      <span className="back-mark">S</span>
    </div>
  );
}
