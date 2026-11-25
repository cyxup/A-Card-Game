import type { Card, PublicStats } from "@stacked/shared";
import { ArrowRight, BookOpen, Bot, Layers, Palette, Sparkles, Swords, Users, Zap } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Link, useLocation } from "wouter";
import { askForName } from "@/components/auth/guest-prompt";
import { CardFace } from "@/components/cards/playing-card";
import { TutorialDialog } from "@/components/game/tutorial-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { game } from "@/lib/game";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";

const SHOWCASE: { card: Card; rotate: number; x: number; y: number; delay: string }[] = [
  { card: { id: "s1", color: "blue", kind: "number", value: 7 }, rotate: -22, x: -146, y: 28, delay: "0s" },
  { card: { id: "s2", color: "red", kind: "skip", value: null }, rotate: -12, x: -76, y: 8, delay: ".2s" },
  { card: { id: "s3", color: null, kind: "wild4", value: null }, rotate: 2, x: 0, y: -14, delay: ".4s" },
  { card: { id: "s4", color: "yellow", kind: "reverse", value: null }, rotate: 13, x: 78, y: 8, delay: ".6s" },
  { card: { id: "s5", color: "green", kind: "number", value: 2 }, rotate: 23, x: 150, y: 30, delay: ".8s" },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-2xl tabular-nums tracking-[-0.04em] text-foreground sm:text-3xl">{value}</span>
      <span className="eyebrow">{label}</span>
    </div>
  );
}

export default function HomePage() {
  const { session, loading } = useSession();
  const t = useT();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem("stacked:tutorial-seen")) return;
    const timer = window.setTimeout(() => setTutorialOpen(true), 800);
    return () => window.clearTimeout(timer);
  }, []);

  function closeTutorial(open: boolean) {
    setTutorialOpen(open);
    if (!open) window.localStorage.setItem("stacked:tutorial-seen", "1");
  }

  useEffect(() => {
    let alive = true;
    api
      .get<PublicStats>("/api/stats")
      .then((data) => {
        if (alive) setStats(data);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  function ensure(fn: () => Promise<void>) {
    if (!session || session.kind === "anon") {
      askForName(() => void fn());
      return;
    }
    void fn();
  }

  async function quickPlay() {
    if (busy) return;
    setBusy("quick");
    try {
      const room = await game.quickPlay();
      navigate(`/room/${room.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not find a table."));
    } finally {
      setBusy(null);
    }
  }

  async function practice() {
    if (busy) return;
    setBusy("practice");
    try {
      const room = await game.createRoom({ maxPlayers: 4 }, "private");
      game.addBot();
      game.addBot();
      navigate(`/room/${room.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not start practice."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
      <section className="grid items-center gap-10 pb-10 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:pb-16 lg:pt-16">
        <div className="flex flex-col items-start gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand" dot>
              {t("live tables")}
            </Badge>
            <span className="eyebrow">{t("2–8 PLAYERS · 30S TURNS · NO INSTALL")}</span>
          </div>

          <h1 className="display text-[clamp(3.1rem,8.6vw,7.4rem)]">
            <span className="hero-outline block">{t("PLAY YOUR")}</span>
            <span className="brand-text block">{t("HAND.")}</span>
            <span className="mt-1 block text-foreground/95">{t("STACK THE")}</span>
            <span className="brand-text block">{t("DECK.")}</span>
          </h1>

          <p className="max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            {t("A fast, mean little card game. Match the colour or the number, stack the draws, jump in out of turn and empty your hand before the rest of the table.")}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="brand"
              size="xl"
              className="min-w-[168px]"
              loading={busy === "quick"}
              disabled={loading || Boolean(busy)}
              onClick={() => ensure(quickPlay)}
            >
              {t("Play now")} <ArrowRight />
            </Button>
            <Link href="/play?tab=create">
              <Button variant="outline" size="xl">
                {t("Create a table")}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="xl"
              className="text-muted-foreground"
              loading={busy === "practice"}
              disabled={loading || Boolean(busy)}
              onClick={() => ensure(practice)}
            >
              <Bot /> {t("Practice")}
            </Button>
            <Button
              variant="ghost"
              size="xl"
              className="text-muted-foreground"
              onClick={() => setTutorialOpen(true)}
            >
              <BookOpen /> {t("Tutorial")}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {session?.kind === "user" ? (
              <>
                {t("Signed in as {name} · coins and levels save automatically.", {
                  name: session.user?.displayName ?? "",
                })}
              </>
            ) : session?.kind === "guest" ? (
              <>
                {t("Playing as {name} · create an account to keep cosmetics.", {
                  name: session.guestName ?? "",
                })}
              </>
            ) : (
              <>
                {t("No account needed to play. Sign up to earn XP and coins.")}
              </>
            )}
          </p>
        </div>

        <div className="relative mx-auto hidden h-[420px] w-full max-w-[560px] sm:block">
          <div className="absolute inset-x-6 top-8 bottom-8 rounded-[48px] border border-white/6 bg-white/[0.015]" />
          <div className="soft-float absolute inset-0">
            {SHOWCASE.map((item) => (
              <div
                key={item.card.id}
                className="absolute left-1/2 top-1/2"
                style={{
                  rotate: `${item.rotate}deg`,
                  translate: `calc(-50% + ${item.x}px) ${item.y}px`,
                  animationDelay: item.delay,
                }}
              >
                <CardFace card={item.card} style={{ "--cw": "clamp(78px, 10vw, 108px)" } as CSSProperties} />
              </div>
            ))}
          </div>
          <div className="absolute right-4 top-6 rotate-2 rounded-full border border-white/10 bg-black/50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-brand backdrop-blur-sm">
            +4 {t("STACKED")}
          </div>
          <div className="absolute bottom-8 left-2 -rotate-3 rounded-full border border-white/10 bg-black/50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/80 backdrop-blur-sm">
            {t("JUMP IN!")}
          </div>
          <div className="absolute bottom-24 right-6 rotate-3 rounded-full border border-white/10 bg-black/50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/70 backdrop-blur-sm">
            {t("HAND SWAPPED")}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-6 border-y border-white/8 py-6 sm:grid-cols-4">
        <Stat label={t("REGISTERED PLAYERS")} value={stats ? compactNumber(stats.players) : "—"} />
        <Stat label={t("ONLINE NOW")} value={stats ? String(stats.online) : "—"} />
        <Stat label={t("OPEN TABLES")} value={stats ? String(stats.rooms) : "—"} />
        <Stat label={t("ROUNDS PLAYED")} value={stats ? compactNumber(stats.matches) : "—"} />
      </section>

      <section className="py-14 sm:py-20">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow mb-2">{t("PICK A TABLE")}</p>
            <h2 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{t("Three ways in.")}</h2>
          </div>
          <Link href="/play" className="text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
            {t("See all tables")}
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => ensure(quickPlay)}
            className="panel panel-hover group flex flex-col items-start gap-4 rounded-2xl p-6 text-left"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-brand/12 text-brand">
              <Zap className="size-5" />
            </span>
            <span className="flex flex-col gap-1.5">
              <span className="text-lg font-semibold tracking-[-0.02em]">{t("Quick play")}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                {t("Drop into the first open public table. Strangers, bots, chaos.")}
              </span>
            </span>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-xs font-medium text-brand">
              {t("Find a table")} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>

          <Link href="/play?tab=create" className="panel panel-hover group flex flex-col items-start gap-4 rounded-2xl p-6">
            <span className="grid size-10 place-items-center rounded-xl bg-white/6 text-foreground">
              <Users className="size-5" />
            </span>
            <span className="flex flex-col gap-1.5">
              <span className="text-lg font-semibold tracking-[-0.02em]">{t("Private table")}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                {t("A five-letter code, your rules, your people. No matchmaking.")}
              </span>
            </span>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-xs font-medium text-foreground/80">
              {t("Set the rules")} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          <button
            type="button"
            onClick={() => ensure(practice)}
            className="panel panel-hover group flex flex-col items-start gap-4 rounded-2xl p-6 text-left"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-white/6 text-foreground">
              <Bot className="size-5" />
            </span>
            <span className="flex flex-col gap-1.5">
              <span className="text-lg font-semibold tracking-[-0.02em]">{t("Practice")}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                {t("You and two bots. Learn the stacking rules without the embarrassment.")}
              </span>
            </span>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-xs font-medium text-foreground/80">
              {t("Deal me in")} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>
      </section>

      <section className="grid gap-10 pb-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div>
          <p className="eyebrow mb-3">{t("house rules")}</p>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] sm:text-4xl">
            {t("The easy part.")}
            <br />
            <span className="text-muted-foreground">{t("Then the dirty part.")}</span>
          </h2>
          <p className="mt-4 max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
            {t("Every table can toggle the sharp edges: stacking, jump-ins, Oscar's Swap from anywhere, and the seven-zero hand swap. Hosts set it, everyone sees it before the first card lands.")}
          </p>
          <Link href="/rules" className="mt-6 inline-flex">
            <Button variant="outline" size="lg">
              {t("Read the full rules")}
            </Button>
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              icon: Layers,
              title: t("Stack the pain"),
              body: t("+2 on +2, +4 on +4. Make the next player eat the whole pile."),
            },
            {
              icon: Swords,
              title: t("Jump in"),
              body: t("Hold the exact same card? Slam it out of turn while the window is open."),
            },
            {
              icon: Sparkles,
              title: t("Cosmetics that show"),
              body: t("Card backs, felts, avatars, name effects and win animations visible to the table."),
            },
            {
              icon: Palette,
              title: t("Every move, visible"),
              body: t("Cards fly, backs fan out, the active seat glows. The table tells you what happened."),
            },
          ].map((feature) => (
            <div key={feature.title} className="panel rounded-2xl p-5">
              <feature.icon className="mb-4 size-5 text-brand" />
              <p className="text-sm font-semibold tracking-[-0.01em]">{feature.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-16 grid items-center gap-6 overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-white/[0.045] via-transparent to-brand/[0.06] p-6 sm:grid-cols-[1fr_auto] sm:p-10">
        <div>
          <p className="eyebrow mb-2">{t("EARN THE GOOD DECK")}</p>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
            {t("Win rounds. Unlock better furniture.")}
          </h2>
          <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
            {t("Levels unlock card backs and tables. Achievements unlock the loud ones. Coins buy the rest — and every effect is visible to the people you beat.")}
          </p>
        </div>
        <Link href={session?.kind === "user" ? "/profile" : "/signup"}>
          <Button variant="brand" size="lg">
            {session?.kind === "user" ? t("Open your collection") : t("Start collecting")} <ArrowRight />
          </Button>
        </Link>
      </section>

      <TutorialDialog
        open={tutorialOpen}
        onOpenChange={closeTutorial}
        onPractice={() => {
          closeTutorial(false);
          ensure(practice);
        }}
      />
    </div>
  );
}
