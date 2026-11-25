import type { MatchHistoryItem } from "@stacked/shared";
import { ArrowRight, CalendarDays, Coins, Sparkles, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

export default function HistoryPage() {
  const [matches, setMatches] = useState<MatchHistoryItem[] | null>(null);
  const [error, setError] = useState(false);
  const t = useT();

  useEffect(() => {
    let alive = true;
    api
      .get<MatchHistoryItem[]>("/api/me/matches")
      .then((data) => {
        if (alive) setMatches(data);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">{t("your record")}</p>
          <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">{t("Match history")}</h1>
          <p className="mt-2 max-w-[55ch] text-sm text-muted-foreground">
            {t("Every finished round, the result and the full timeline.")}
          </p>
        </div>
        <Link href="/play">
          <Button variant="brand" className="gap-1.5">
            {t("Play a round")} <ArrowRight />
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-xs text-destructive">
          {t("Could not load your match history.")}
        </div>
      )}

      {!matches && !error && (
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
      )}

      {matches && matches.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
          <Trophy className="mx-auto mb-3 size-6 text-muted-foreground" />
          <p className="text-sm font-medium">{t("No matches yet.")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("Finish a round and it will show up here.")}</p>
        </div>
      )}

      {matches && matches.length > 0 && (
        <ul className="flex flex-col gap-2">
          {matches.map((match) => (
            <li key={match.id}>
              <Link
                href={`/history/${match.id}`}
                className="group flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 transition-colors hover:border-brand/30 hover:bg-brand/[0.04]"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] font-mono text-sm font-semibold text-brand">
                  {match.placement === 1 ? "1" : `#${match.placement}`}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="font-mono tracking-[0.12em]">{match.roomCode}</span>
                    {match.winnerName ? (
                      <span className="text-muted-foreground">
                        {t("won by {name}", { name: match.winnerName })}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      {new Date(match.endedAt).toLocaleString()}
                    </span>
                    <span>{t("{n} players", { n: match.playerCount })}</span>
                    <span>{t("{n}s", { n: match.durationSeconds })}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={match.coins < 0 ? "text-destructive" : "text-brand"}>
                    <Coins className="mr-1 inline size-3.5" />
                    {match.coins >= 0 ? "+" : "−"}
                    {Math.abs(match.coins)}
                  </span>
                  <span className="text-warning">
                    <Sparkles className="mr-1 inline size-3.5" />+{match.xp} XP
                  </span>
                  <Badge variant={match.placement === 1 ? "brand" : "outline"}>
                    {match.placement === 1 ? t("Win") : t("Loss")}
                  </Badge>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
