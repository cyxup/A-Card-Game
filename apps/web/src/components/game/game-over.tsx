import type { RoomView } from "@stacked/shared";
import { ACHIEVEMENTS, COSMETICS_BY_ID, SLOT_LABEL } from "@stacked/shared";
import { ArrowRight, Bot, Coins, Crown, Sparkles, Trophy } from "lucide-react";
import { useEffect } from "react";
import { Link } from "wouter";
import { Avatar } from "@/components/brand/avatar";
import { NameEffect } from "@/components/brand/name-effect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { playSound } from "@/lib/sound";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";

const PLACE_LABEL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

export function GameOverDialog({
  room,
  onLeave,
  onRematch,
}: {
  room: RoomView;
  onLeave: () => void;
  onRematch: () => void;
}) {
  const { session } = useSession();
  const t = useT();
  const game = room.game;
  const me = room.players.find((player) => player.id === room.you.id);
  const rewards = room.you.rewards;
  const results = [...(game?.results ?? [])].sort((a, b) => {
    if (a.id === game?.winner) return -1;
    if (b.id === game?.winner) return 1;
    return a.cardsLeft - b.cardsLeft || a.points - b.points;
  });
  const winner = room.players.find((player) => player.id === game?.winner);

  useEffect(() => {
    playSound(rewards?.placement === 1 ? "win" : "lose");
    if (rewards?.banked) {
      const timer = window.setTimeout(() => playSound("reward"), 520);
      return () => window.clearTimeout(timer);
    }
  }, [rewards?.placement, rewards?.banked]);

  const unlocked = (rewards?.unlocked ?? [])
    .map((id) => COSMETICS_BY_ID.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const achievements = (rewards?.achievements ?? [])
    .map((id) => ACHIEVEMENTS.find((achievement) => achievement.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent size="lg" showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant={rewards?.placement === 1 ? "brand" : "outline"} dot>
              {t("round over")}
            </Badge>
            <span className="eyebrow">
              {room.code} · {t("{n} players", { n: room.players.length })}
            </span>
          </div>
          <DialogTitle className="sr-only">{t("Round results")}</DialogTitle>
          <DialogDescription className="sr-only">{t("Final placements and rewards.")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="relative">
            <Avatar id={winner?.avatar ?? "rook"} size={68} />
            <span className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full border border-warning/30 bg-background text-warning">
              <Crown className="size-4" />
            </span>
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-[-0.04em]">
              <NameEffect effect={winner?.nameEffect}>{winner?.name ?? t("Nobody")}</NameEffect> {t("takes it.")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {winner?.isBot ? t("A bot won. It will be insufferable about it.") : t("First to empty their hand.")}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          {results.map((result, index) => {
            const player = room.players.find((candidate) => candidate.id === result.id);
            const isMe = result.id === room.you.id;
            return (
              <div
                key={result.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                  isMe ? "border-brand/30 bg-brand/[0.05]" : "border-white/6 bg-white/[0.015]"
                }`}
              >
                <span className="w-7 font-mono text-xs text-muted-foreground">
                  {t(PLACE_LABEL[index + 1] ?? String(index + 1))}
                </span>
                <Avatar id={player?.avatar ?? "rook"} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  <NameEffect effect={player?.nameEffect}>{player?.name ?? "Player"}</NameEffect>
                  {isMe && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-brand">you</span>}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {t(result.cardsLeft === 1 ? "{n} card left" : "{n} cards left", { n: result.cardsLeft })}
                </span>
              </div>
            );
          })}
        </div>

        <Separator />

        {room.rules.wager > 0 ? (
          <p className="text-[11px] text-warning">
            {t("Wager table — winner takes the pot ({n} coins each).", { n: room.rules.wager })}
          </p>
        ) : null}

        {rewards?.unranked ? (
          <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/[0.06] px-4 py-3">
            <Bot className="mt-0.5 size-4 shrink-0 text-info" />
            <div className="text-xs">
              <p className="font-semibold text-info">{t("Practice table — no progression.")}</p>
              <p className="mt-1 leading-relaxed text-info/80">
                {t("XP, coins and stats only count when at least one other real player is seated.")}
              </p>
            </div>
          </div>
        ) : rewards ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
              <div className="flex items-center gap-2">
                <Coins className="size-4 text-brand" />
                <span
                  className={`font-mono text-lg tabular-nums ${
                    rewards.coins < 0 ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {rewards.coins >= 0 ? "+" : "−"}
                  {Math.abs(rewards.coins)}
                </span>
                <span className="text-xs text-muted-foreground">{t("coins")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-warning" />
                <span className="font-mono text-lg tabular-nums text-foreground">+{rewards.xp}</span>
                <span className="text-xs text-muted-foreground">XP</span>
                {rewards.levelUp && <Badge variant="success">{t("level {n}", { n: rewards.level })}</Badge>}
              </div>
            </div>

            {rewards.banked ? (
              <p className="text-[11px] text-muted-foreground">
                {t("Saved to {name}. Coins and XP are already in your profile.", { name: me?.name ?? "" })}
              </p>
            ) : session?.kind === "guest" ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/25 bg-warning/[0.06] px-3 py-2.5 text-xs text-warning">
                <span>{t("Guest progress isn't saved.")}</span>
                <Link href="/signup">
                  <Button variant="brand" size="xs">
                    {t("Create an account")} <ArrowRight />
                  </Button>
                </Link>
              </div>
            ) : (
              <p className="text-[11px] text-warning">
                {t("The round ended, but rewards could not be saved. They will be waiting next time.")}
              </p>
            )}

            {(unlocked.length > 0 || achievements.length > 0) && (
              <div className="flex flex-col gap-2">
                <p className="eyebrow">{t("new unlocks")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {achievements.map((achievement) => (
                    <Badge key={achievement.id} variant="success">
                      <Trophy /> {t(achievement.name)}
                    </Badge>
                  ))}
                  {unlocked.map((item) => (
                    <Badge key={item.id} variant="brand">
                      {t(SLOT_LABEL[item.slot])} · {t(item.name)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("No rewards this round.")}</p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          {room.you.isHost ? (
            <Button variant="brand" size="lg" className="flex-1" onClick={onRematch}>
              {t("Deal again")}
            </Button>
          ) : (
            <Button variant="secondary" size="lg" className="flex-1" disabled>
              {t("Waiting for the host")}
            </Button>
          )}
          <Button variant="outline" size="lg" onClick={onLeave} className="flex-1">
            {t("Leave table")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
