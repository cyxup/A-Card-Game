import type { MatchHistoryDetail } from "@stacked/shared";
import { ArrowLeft, CalendarDays, Coins, Play, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { logText } from "@/lib/format";
import { useT } from "@/lib/i18n";

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  const [match, setMatch] = useState<MatchHistoryDetail | null>(null);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const t = useT();

  useEffect(() => {
    let alive = true;
    api
      .get<MatchHistoryDetail>(`/api/me/matches/${params.id}`)
      .then((data) => {
        if (!alive) return;
        setMatch(data);
        setVisible(data.log.length);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [params.id]);

  useEffect(() => {
    if (!replaying || !match) return;
    if (visible >= match.log.length) {
      setReplaying(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible((value) => value + 1), 650);
    return () => window.clearTimeout(timer);
  }, [replaying, visible, match]);

  const names = (match?.players ?? []).map((player) => ({ id: player.id, name: player.displayName }));

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-destructive">{t("Could not load that match.")}</p>
        <Link href="/history" className="mt-4 inline-block">
          <Button variant="outline">{t("Back to history")}</Button>
        </Link>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
        <Skeleton className="h-12 w-56 rounded-xl" />
        <Skeleton className="mt-6 h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <Link href="/history" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {t("Back to history")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">{t("match report")}</p>
          <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">
            {match.winnerName ? t("{name} won", { name: match.winnerName }) : t("No winner")}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono tracking-[0.16em]">{match.roomCode}</span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" /> {new Date(match.endedAt).toLocaleString()}
            </span>
            <span>{t("{n} players", { n: match.playerCount })}</span>
            <span>{t("{n}s", { n: match.durationSeconds })}</span>
          </p>
        </div>
        <Badge variant={match.placement === 1 ? "brand" : "outline"} className="text-sm">
          <Trophy className="mr-1 size-3.5" />
          {match.placement === 1 ? t("Victory") : t("Place {n}", { n: match.placement })}
        </Badge>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="panel rounded-2xl p-4">
          <p className="eyebrow">{t("your rewards")}</p>
          <p className="mt-2 flex items-center gap-2 font-mono text-lg">
            <Coins className="size-4 text-brand" />
            <span className={match.coins < 0 ? "text-destructive" : "text-foreground"}>
              {match.coins >= 0 ? "+" : "−"}
              {Math.abs(match.coins)}
            </span>
            <span className="text-xs text-muted-foreground">{t("coins")}</span>
            <Sparkles className="ml-2 size-4 text-warning" />+{match.xp} XP
          </p>
        </div>
        <div className="panel rounded-2xl p-4">
          <p className="eyebrow">{t("final standings")}</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {match.players.map((player) => (
              <li key={`${player.id}-${player.displayName}`} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{player.placement}</span>
                  {player.displayName}
                  {player.isBot ? <span className="ml-1 text-[10px] text-muted-foreground">bot</span> : null}
                </span>
                <span className="font-mono text-xs text-muted-foreground">{player.cardsLeft} 🂠</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel mt-4 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="eyebrow">{t("round timeline")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("Replay the round action by action.")}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={match.log.length === 0}
              onClick={() => {
                setVisible(0);
                setReplaying(true);
              }}
            >
              <RotateCcw className="size-3.5" /> {t("Replay")}
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setVisible(match.log.length)}>
              <Play className="size-3.5" /> {t("Show all")}
            </Button>
          </div>
        </div>
        <ol className="mt-4 flex max-h-[420px] flex-col gap-1 overflow-y-auto pr-2">
          {match.log.slice(0, visible).map((entry, index) => (
            <li
              key={`${entry.at}-${index}`}
              className="flex gap-3 rounded-lg px-2 py-1.5 text-xs odd:bg-white/[0.025]"
            >
              <span className="w-7 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                {index + 1}
              </span>
              <span className="text-muted-foreground">{logText(entry, names)}</span>
            </li>
          ))}
          {match.log.length === 0 ? (
            <li className="py-6 text-center text-xs text-muted-foreground">{t("No timeline for this match.")}</li>
          ) : null}
        </ol>
      </div>
    </div>
  );
}
