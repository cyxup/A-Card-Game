import type { Card } from "@stacked/shared";
import { ArrowRight, Layers, Sparkles, Swords, Timer, Users } from "lucide-react";
import { Link } from "wouter";
import { CardFace } from "@/components/cards/playing-card";
import { Button } from "@/components/ui/button";

const CARDS: { card: Card; name: string; body: string }[] = [
  {
    card: { id: "r1", color: "red", kind: "number", value: 7 },
    name: "Number cards",
    body: "Match the colour on the table or the same number. Simple until someone stacks four cards on you.",
  },
  {
    card: { id: "r2", color: "yellow", kind: "skip", value: null },
    name: "Giddy Up · Skip",
    body: "The next player loses their turn. With two players left, it comes straight back to you.",
  },
  {
    card: { id: "r3", color: "blue", kind: "reverse", value: null },
    name: "Wrong Way · Reverse",
    body: "Flips the direction of play. In a two-player game it acts as a skip, so you go again.",
  },
  {
    card: { id: "r4", color: "green", kind: "draw2", value: null },
    name: "Quick Draw · +2",
    body: "The next player draws two — or stacks another +2 and passes the problem along.",
  },
  {
    card: { id: "r5", color: null, kind: "wild", value: null },
    name: "Wild Eight",
    body: "Play it on anything and call the next colour. The wild card that started all of this.",
  },
  {
    card: { id: "r6", color: null, kind: "wild4", value: null },
    name: "Wild Draw Four",
    body: "Call a colour, add four to the stack. Only an honest +4 can answer it when stacking is on.",
  },
  {
    card: { id: "r7", color: null, kind: "swap", value: null },
    name: "Oscar's Swap",
    body: "Pick a player and take their hand. Pick a colour too. Yes, it can be played out of turn in the jump window.",
  },
];

const STEPS = [
  {
    title: "Match the card on the table",
    body: "Play a card with the same colour, the same number, or the same action. Wild cards ignore colour entirely.",
  },
  {
    title: "Or draw one",
    body: "No match? Draw a card. If it is playable you may play it immediately, or pass. If it is not, the turn moves on.",
  },
  {
    title: "Stack the draw cards",
    body: "With stacking on, the player facing a +2 or +4 can answer with another draw card instead of taking the pile.",
  },
  {
    title: "Jump in if you have the duplicate",
    body: "For five seconds after a card lands, anyone holding the exact same card can slam it out of turn.",
  },
  {
    title: "Empty your hand",
    body: "First to zero cards wins the round. Coins and XP are paid out, and the table can rematch immediately.",
  },
];

export default function RulesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="max-w-3xl">
        <p className="eyebrow mb-2">how to play</p>
        <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-6xl">
          House rules. <span className="text-muted-foreground">No house edge.</span>
        </h1>
        <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
          Stacked is UNO&apos;s colour matching with Blazing 8s&apos; dirty tricks: draw stacks, jump-ins, hand swaps
          and a seven-zero rule for the brave. Every table can turn the sharp edges on or off before the deal.
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Users, label: "2–8 players", detail: "humans, bots, or both" },
          { icon: Timer, label: "30s turns", detail: "host can change it" },
          { icon: Layers, label: "112 cards", detail: "four colours + wilds" },
        ].map((item) => (
          <div key={item.label} className="panel flex items-center gap-3 rounded-xl px-4 py-3">
            <item.icon className="size-4 text-brand" />
            <div>
              <p className="text-xs font-medium">{item.label}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="mt-14">
        <p className="eyebrow mb-2">the deck</p>
        <h2 className="mb-6 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">Seven ways to ruin a friendship.</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((entry) => (
            <div key={entry.card.id} className="panel flex items-start gap-4 rounded-2xl p-4">
              <CardFace card={entry.card} style={{ "--cw": "58px" } as React.CSSProperties} />
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-semibold tracking-[-0.01em]">{entry.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{entry.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <p className="eyebrow mb-2">a turn</p>
        <h2 className="mb-6 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">Clockwise, until it isn&apos;t.</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <div key={step.title} className="panel rounded-2xl p-5">
              <span className="mb-3 inline-grid size-7 place-items-center rounded-full border border-brand/25 bg-brand/10 font-mono text-[11px] text-brand">
                {index + 1}
              </span>
              <p className="text-sm font-semibold tracking-[-0.01em]">{step.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-4 lg:grid-cols-2">
        <div className="panel rounded-2xl p-6">
          <Swords className="mb-4 size-5 text-brand" />
          <h2 className="text-lg font-semibold tracking-[-0.02em]">The house toggles</h2>
          <ul className="mt-3 flex flex-col gap-3 text-xs leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Stacking.</span> Same card only, mixed (+2 onto +4 and
              back), or off entirely.
            </li>
            <li>
              <span className="font-medium text-foreground">Jump in.</span> Exact duplicates are playable out of turn
              inside a five-second window.
            </li>
            <li>
              <span className="font-medium text-foreground">Swap anytime.</span> Oscar&apos;s Swap can be used out of
              turn in that same window.
            </li>
            <li>
              <span className="font-medium text-foreground">Seven-zero.</span> A 7 swaps hands with the next player; a
              0 rotates every hand one seat.
            </li>
            <li>
              <span className="font-medium text-foreground">Draw until playable.</span> Keep drawing until you can play.
              Hosts, please warn your friends.
            </li>
          </ul>
        </div>

        <div className="panel rounded-2xl p-6">
          <Sparkles className="mb-4 size-5 text-warning" />
          <h2 className="text-lg font-semibold tracking-[-0.02em]">Coins, levels, furniture</h2>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Rounds pay coins and XP. Winning pays more, but every seat earns something. Levels auto-unlock card backs,
            tables and name effects. Achievements unlock the loud stuff. Everything you equip is visible to the table —
            including the win animation when you take the round.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Guests can play every mode, but nothing persists. Create an account whenever you want to keep it.
          </p>
        </div>
      </section>

      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/8 bg-gradient-to-br from-white/[0.045] to-brand/[0.05] p-6">
        <div>
          <p className="text-lg font-semibold tracking-[-0.02em]">Enough reading.</p>
          <p className="mt-1 text-xs text-muted-foreground">The cards explain themselves faster.</p>
        </div>
        <Link href="/play">
          <Button variant="brand" size="lg">
            Find a table <ArrowRight />
          </Button>
        </Link>
      </div>
    </div>
  );
}
