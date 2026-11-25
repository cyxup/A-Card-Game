import { KIND_SHORT, cardLabel, type Card, type LogEntry } from "@stacked/shared";

export function nameOf(players: { id: string; name: string }[], id: string | undefined, fallback = "Someone"): string {
  if (!id) return fallback;
  return players.find((player) => player.id === id)?.name ?? fallback;
}

export function cardShort(card: Card): string {
  if (card.kind === "number") return `${card.color ?? ""} ${card.value}`.trim();
  if (card.kind === "wild") return "a Wild Eight";
  if (card.kind === "wild4") return "a Wild Draw Four";
  return `${card.color ?? ""} ${KIND_SHORT[card.kind]}`.trim();
}

export function logText(entry: LogEntry, players: { id: string; name: string }[]): string {
  const actor = nameOf(players, entry.actor);
  const target = nameOf(players, entry.target);
  switch (entry.kind) {
    case "deal":
      return `${entry.count ?? players.length} players. Cards dealt.`;
    case "play":
      return `${actor} played ${entry.card ? cardLabel(entry.card) : "a card"}`;
    case "draw":
      return entry.count === 0 ? `${actor} could not draw` : `${actor} drew ${entry.count === 1 ? "a card" : `${entry.count} cards`}`;
    case "draw_penalty":
      return `${actor} took ${entry.count ?? 0}`;
    case "no_play":
      return `${actor} could not play and passed`;
    case "pass":
      return `${actor} passed`;
    case "timeout":
      return `${actor} ran out of time`;
    case "reshuffle":
      return "The deck was reshuffled";
    case "swap":
      return `${actor} swapped hands with ${target}`;
    case "rotate":
      return "Every hand moved one seat";
    case "jump":
      return `${actor} jumped in!`;
    case "skip":
      return `${actor} skipped ${target}`;
    case "reverse":
      return "Direction reversed";
    case "win":
      return `${actor} wins the round`;
    default:
      return "";
  }
}

export function formatRelative(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function compactNumber(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
}
