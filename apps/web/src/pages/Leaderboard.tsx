import type { LeaderboardEntry } from "@stacked/shared";
import { ArrowRight, Crown, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Avatar } from "@/components/brand/avatar";
import { NameEffect } from "@/components/brand/name-effect";
import { UserTags } from "@/components/brand/user-tags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);
  const t = useT();

  useEffect(() => {
    let alive = true;
    api
      .get<LeaderboardEntry[]>("/api/leaderboard")
      .then((data) => {
        if (alive) setEntries(data);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const podium = entries?.slice(0, 3) ?? [];
  const rest = entries?.slice(3) ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">{t("the wall")}</p>
          <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">{t("Who's stacking?")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("Ranked by XP. Wins break the tie.")}</p>
        </div>
        <Link href="/play">
          <Button variant="brand" className="gap-1.5">
            {t("Play a round")} <ArrowRight />
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-xs text-destructive">
          {t("Could not load the leaderboard. Try again in a moment.")}
        </div>
      )}

      {!entries && !error && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-44 rounded-2xl" />
          ))}
        </div>
      )}

      {entries && entries.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
          <Trophy className="mx-auto mb-3 size-6 text-muted-foreground" />
          <p className="text-sm font-medium">{t("Nobody on the wall yet.")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("Win a round and take the top spot.")}</p>
        </div>
      )}

      {podium.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {podium.map((entry, index) => (
            <div
              key={entry.id}
              className={cn(
                "panel relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl px-4 pb-5 pt-7 text-center",
                index === 0 && "border-brand/30 bg-brand/[0.04]",
              )}
            >
              {index === 0 && (
                <div className="warm-glow pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70" />
              )}
              <span className="text-2xl">{MEDALS[index]}</span>
              <Avatar id={entry.avatar} size={index === 0 ? 64 : 52} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  <NameEffect effect={entry.nameEffect}>{entry.displayName}</NameEffect>
                </p>
                <UserTags tags={entry.tags} max={3} className="mt-1 justify-center" />
                <p className="font-mono text-[10px] text-muted-foreground">
                  {t("level {n}", { n: entry.level })} · {compactNumber(entry.xp)} xp
                </p>
              </div>
              <Badge variant={index === 0 ? "brand" : "outline"}>
                {t("{n} wins", { n: entry.wins })}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className="panel mt-4 overflow-hidden rounded-2xl">
          <ul className="divide-y divide-white/6">
            {rest.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-8 font-mono text-xs text-muted-foreground">#{entry.rank}</span>
                <Avatar id={entry.avatar} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    <NameEffect effect={entry.nameEffect}>{entry.displayName}</NameEffect>
                  </p>
                  <UserTags tags={entry.tags} max={2} className="mt-0.5" />
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {t("{wins}W / {games}G · level {level}", {
                      wins: entry.wins,
                      games: entry.games,
                      level: entry.level,
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs tabular-nums">{compactNumber(entry.xp)}</p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">xp</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {entries && entries.length > 0 && (
        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Crown className="size-3 text-warning" /> {t("Guests don't appear here. Create an account to keep your spot.")}
        </p>
      )}
    </div>
  );
}
