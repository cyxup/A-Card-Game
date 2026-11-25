import type { RoomPlayerView } from "@stacked/shared";
import { Crown, Layers, WifiOff } from "lucide-react";
import { useMemo } from "react";
import { Avatar } from "@/components/brand/avatar";
import { NameEffect } from "@/components/brand/name-effect";
import { useCountdown } from "@/lib/use-countdown";
import { cn } from "@/lib/utils";

export function Seat({
  player,
  active,
  deadline,
  offset,
  compact = false,
  className,
}: {
  player: RoomPlayerView;
  active: boolean;
  deadline?: number;
  offset: number;
  compact?: boolean;
  className?: string;
}) {
  const left = useCountdown(deadline, offset, active);
  const seconds = Math.ceil(left / 1000);
  const initial = useMemo(() => Math.max(120, left), [deadline]);

  return (
    <div
      className={cn("seat", className)}
      data-turn={active}
      data-offline={!player.connected && !player.isBot}
    >
      <div className="seat-avatar-wrap">
        <Avatar id={player.avatar} size={compact ? 38 : 48} />
        <div className="seat-avatar-ring" />
        {player.host && (
          <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-white/15 bg-background text-warning">
            <Crown className="size-3" />
          </span>
        )}
        {!player.connected && !player.isBot && (
          <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border border-white/15 bg-background text-muted-foreground">
            <WifiOff className="size-2.5" />
          </span>
        )}
      </div>
      <NameEffect effect={player.nameEffect} className="seat-name">
        {player.name}
      </NameEffect>
      <span className="seat-cards">
        <Layers className="size-3" />
        {player.cardCount}
        <span className="mx-0.5 text-white/15">·</span>
        {active ? (
          <span className="text-brand">{seconds > 0 ? `${seconds}s` : "…"}</span>
        ) : (
          <span>L{player.level}</span>
        )}
      </span>
      {active && deadline ? (
        <div className="mt-0.5 h-0.5 w-16 overflow-hidden rounded-full bg-white/10">
          <div
            key={deadline}
            className="turn-timer h-full rounded-full bg-brand"
            style={{ animationDuration: `${initial}ms` }}
          />
        </div>
      ) : null}
    </div>
  );
}
