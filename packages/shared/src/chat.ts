/**
 * Quick-chat catalogue. Only server-approved lines can be sent, so there is no
 * free-text moderation surface. Packs are permanent unlocks bought with coins;
 * the owner and beta packs are granted by the corresponding account flags.
 */

export type ChatPackUnlock =
  | { type: "default" }
  | { type: "shop"; price: number }
  | { type: "owner" }
  | { type: "beta" };

export interface ChatLine {
  id: string;
  packId: string;
  /** English source text; the UI passes it through the i18n catalogue. */
  text: string;
}

export interface ChatPack {
  id: string;
  name: string;
  description: string;
  unlock: ChatPackUnlock;
  lines: ChatLine[];
}

export interface ChatPackView extends ChatPack {
  owned: boolean;
}

export const DEFAULT_CHAT_PACK_ID = "essentials";

function pack(
  id: string,
  name: string,
  description: string,
  unlock: ChatPackUnlock,
  lines: [string, string][],
): ChatPack {
  return {
    id,
    name,
    description,
    unlock,
    lines: lines.map(([lineId, text]) => ({ id: `${id}-${lineId}`, packId: id, text })),
  };
}

export const CHAT_PACKS: ChatPack[] = [
  pack(
    "essentials",
    "Essentials",
    "The basics. Always free, always useful.",
    { type: "default" },
    [
      ["nice-one", "Nice one."],
      ["good-game", "Good game."],
      ["oops", "Oops."],
      ["your-turn", "Your turn."],
      ["one-card", "One card left."],
      ["needed-that", "I needed that."],
      ["so-close", "So close."],
      ["wait", "Wait…"],
      ["thanks", "Thanks."],
      ["lets-go", "Let's go."],
    ],
  ),
  pack(
    "good-vibes",
    "Good Vibes",
    "Kind words for a mean little game.",
    { type: "shop", price: 300 },
    [
      ["well-played", "Well played."],
      ["nice-hand", "Nice hand."],
      ["no-hard-feelings", "No hard feelings."],
      ["you-got-me", "You got me."],
      ["good-luck", "Good luck."],
      ["smooth", "That was smooth."],
    ],
  ),
  pack(
    "trash-talk",
    "Trash Talk",
    "Playful jabs. Keep it friendly.",
    { type: "shop", price: 500 },
    [
      ["too-easy", "Too easy."],
      ["read-table", "Read the table."],
      ["best", "Is that your best?"],
      ["ouch", "Ouch."],
      ["sure", "You sure?"],
      ["stack-it", "Stack it."],
      ["cute", "Cute."],
      ["try-again", "Try again."],
    ],
  ),
  pack(
    "table-talk",
    "Table Talk",
    "Strategy, shortcuts and warnings.",
    { type: "shop", price: 600 },
    [
      ["watch-stack", "Watch the stack."],
      ["swap", "Swap?"],
      ["draw-four", "Draw four incoming."],
      ["save-it", "Save it."],
      ["coming-for-hand", "I'm coming for that hand."],
      ["seven-zero", "Seven-zero?"],
      ["jump-in", "Jump in."],
    ],
  ),
  pack(
    "chaos",
    "Chaos Gremlin",
    "For when the plan is vibes.",
    { type: "shop", price: 700 },
    [
      ["no-idea", "I have no idea what I'm doing."],
      ["this-is-fine", "This is fine."],
      ["chaos-wins", "Chaos wins."],
      ["meant-to", "I meant to do that."],
      ["rigged", "The deck is rigged."],
      ["trust-process", "Trust the process."],
      ["absolutely-not", "Absolutely not."],
    ],
  ),
  pack(
    "mind-games",
    "Mind Games",
    "Bluffs, reads and smug silence.",
    { type: "shop", price: 800 },
    [
      ["interesting", "Interesting…"],
      ["knew-it", "I knew it."],
      ["sure-you-did", "Sure you did."],
      ["bluff", "Bluff."],
      ["as-planned", "Exactly as planned."],
      ["saw-it", "I saw that coming."],
      ["no-comment", "No comment."],
    ],
  ),
  pack(
    "speed",
    "Speed Demon",
    "For players who think in milliseconds.",
    { type: "shop", price: 650 },
    [
      ["faster", "Faster."],
      ["tick-tock", "Tick tock."],
      ["times-up", "Time's up."],
      ["no-thinking", "No thinking."],
      ["next", "Next."],
      ["too-slow", "Too slow."],
    ],
  ),
  pack(
    "winner",
    "Winner's Circle",
    "Celebrate like you meant it.",
    { type: "shop", price: 900 },
    [
      ["another-one", "Another one."],
      ["easy-money", "Easy money."],
      ["undefeated", "Undefeated."],
      ["skill-issue", "Skill issue."],
      ["bow-down", "Bow down."],
      ["rematch", "Rematch?"],
    ],
  ),
  pack(
    "house",
    "The House",
    "Owner only. The table knows who runs it.",
    { type: "owner" },
    [
      ["own-table", "I own this table."],
      ["house-rules", "House rules."],
      ["nice-try", "Nice try."],
      ["always-wins", "The house always wins."],
      ["see-hand", "I can see your hand."],
      ["my-game", "You're playing my game."],
    ],
  ),
  pack(
    "beta-lab",
    "Beta Lab",
    "Beta tester only. You were here before the launch.",
    { type: "beta" },
    [
      ["beta-build", "Beta build."],
      ["report-bug", "Report that bug."],
      ["here-first", "I was here first."],
      ["founding-player", "Founding player."],
      ["lab-open", "The lab is open."],
      ["stable-never", "Stable? Never."],
    ],
  ),
];

export const CHAT_PACKS_BY_ID = new Map(CHAT_PACKS.map((entry) => [entry.id, entry]));

export const CHAT_LINES_BY_ID = new Map(
  CHAT_PACKS.flatMap((entry) => entry.lines.map((line) => [line.id, line] as const)),
);

export function chatPackVisible(
  pack: ChatPack,
  flags: { owner: boolean; beta: boolean },
): boolean {
  if (pack.unlock.type === "owner") return flags.owner;
  if (pack.unlock.type === "beta") return flags.beta || flags.owner;
  return true;
}
