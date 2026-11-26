import { KIND_LABEL, KIND_SHORT, type Card, type LogEntry } from "@stacked/shared";
import { tNow } from "./i18n";

const COLOR_NAME: Record<string, string> = {
  red: "rouge",
  yellow: "jaune",
  green: "vert",
  blue: "bleu",
};

export function nameOf(players: { id: string; name: string }[], id: string | undefined, fallback = "Someone"): string {
  if (!id) return fallback;
  return players.find((player) => player.id === id)?.name ?? fallback;
}

export function localizedCardLabel(card: Card): string {
  const color = card.color ? (COLOR_NAME[card.color] ?? card.color) : "";
  if (card.kind === "number") return `${card.value} ${color}`.trim();
  if (card.kind === "wild" || card.kind === "wild4" || card.kind === "swap") {
    return tNow(KIND_LABEL[card.kind]);
  }
  return `${tNow(KIND_LABEL[card.kind])} ${color}`.trim();
}

export function cardShort(card: Card): string {
  if (card.kind === "number") return `${COLOR_NAME[card.color ?? ""] ?? card.color ?? ""} ${card.value}`.trim();
  if (card.kind === "wild") return tNow("a colour wild");
  if (card.kind === "wild4") return tNow("a Wild Draw Four");
  return `${COLOR_NAME[card.color ?? ""] ?? card.color ?? ""} ${KIND_SHORT[card.kind]}`.trim();
}

export function logText(entry: LogEntry, players: { id: string; name: string }[]): string {
  const actor = nameOf(players, entry.actor);
  const target = nameOf(players, entry.target);
  switch (entry.kind) {
    case "deal":
      return tNow("{n} players. Cards dealt.", { n: entry.count ?? players.length });
    case "play":
      return tNow("{name} played {card}", {
        name: actor,
        card: entry.card ? localizedCardLabel(entry.card) : tNow("a card"),
      });
    case "draw":
      return entry.count === 0
        ? tNow("{name} could not draw", { name: actor })
        : entry.count === 1
          ? tNow("{name} drew a card", { name: actor })
          : tNow("{name} drew {n} cards", { name: actor, n: entry.count });
    case "draw_penalty":
      return tNow("{name} took {n}", { name: actor, n: entry.count ?? 0 });
    case "no_play":
      return tNow("{name} could not play and passed", { name: actor });
    case "pass":
      return tNow("{name} passed", { name: actor });
    case "timeout":
      return tNow("{name} ran out of time", { name: actor });
    case "reshuffle":
      return tNow("The deck was reshuffled");
    case "swap":
      return tNow("{name} swapped hands with {target}", { name: actor, target });
    case "rotate":
      return tNow("Every hand moved one seat");
    case "jump":
      return tNow("{name} jumped in!", { name: actor });
    case "skip":
      return tNow("{name} skipped {target}", { name: actor, target });
    case "reverse":
      return tNow("Direction reversed");
    case "win":
      return tNow("{name} wins the round", { name: actor });
    default:
      return "";
  }
}

export function formatRelative(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 10) return tNow("just now");
  if (seconds < 60) return tNow("{n}s ago", { n: seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return tNow("{n}m ago", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return tNow("{n}h ago", { n: hours });
  return tNow("{n}d ago", { n: Math.round(hours / 24) });
}

export function compactNumber(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
}
