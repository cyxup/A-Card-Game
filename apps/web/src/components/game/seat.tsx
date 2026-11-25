import { EMOTES, type RoomPlayerView } from "@stacked/shared";
import { AnimatePresence, motion } from "motion/react";
import { Crown, Sparkles, WifiOff } from "lucide-react";
import { Avatar } from "@/components/brand/avatar";
import { NameEffect } from "@/components/brand/name-effect";
import { spring } from "@/lib/motion";
import { useCountdown } from "@/lib/use-countdown";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { OpponentHand } from "./opponent-hand";

export function Seat({
  player,
  active,
  deadline,
  offset,
  dense = false,
  emote,
  className,
}: {
  player: RoomPlayerView;
  active: boolean;
  deadline?: number;
  offset: number;
  dense?: boolean;
  emote?: string;
  className?: string;
}) {
  const left = useCountdown(deadline, offset, active);
  const t = useT();
  const seconds = Math.ceil(left / 1000);
  const avatarSize = dense ? 34 : 42;
  const handSize = dense ? 22 : 27;
  const offline = !player.connected && !player.isBot;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -14, scale: 0.96 }}
      animate={{ opacity: offline ? 0.45 : 1, y: 0, scale: active ? 1.02 : 1 }}
      transition={spring.smooth}
      className={cn("seat-plate", active && "seat-plate-active", dense && "seat-plate-dense", className)}
      data-seat-id={player.id}
      data-turn={active}
      aria-current={active ? "true" : undefined}
    >
      {active && <div className="seat-plate-spotlight" />}
      <AnimatePresence>
        {emote ? (
          <motion.span
            key={emote}
            className="seat-emote"
            initial={{ opacity: 0, y: 8, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.8 }}
            transition={spring.bouncy}
          >
            {EMOTES.find((entry) => entry.id === emote)?.glyph ?? "??"}
          </motion.span>
        ) : null}
      </AnimatePresence>

      <div className="seat-top">
        <div className="seat-avatar-wrap" style={{ width: avatarSize, height: avatarSize }}>
          <Avatar id={player.avatar} size={avatarSize} />
          {active && deadline ? (
            <svg className="seat-turn-ring" viewBox="0 0 100 100" aria-hidden>
              <circle className="seat-turn-track" cx="50" cy="50" r="46" pathLength={1} />
              <motion.circle
                key={deadline}
                className="seat-turn-progress"
                cx="50"
                cy="50"
                r="46"
                pathLength={1}
                strokeDasharray="1 1"
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: 1 }}
                transition={{ duration: Math.max(0.15, left / 1000), ease: "linear" }}
              />
            </svg>
          ) : null}
          {player.host && (
            <span className="seat-crown" title={t("Host")}>
              <Crown className="size-3" />
            </span>
          )}
          {offline && (
            <span className="seat-offline" title={t("Reconnecting")}>
              <WifiOff className="size-3" />
            </span>
          )}
        </div>

        <div className="seat-info">
          <NameEffect effect={player.nameEffect} className="seat-name">
            {player.name}
          </NameEffect>
          <div className="seat-meta">
            <span>{t("Lv {n}", { n: player.level })}</span>
            {player.owner ? (
              <span className="seat-owner">
                <Sparkles className="size-2.5" /> {t("owner")}
              </span>
            ) : null}
            {player.isBot ? <span className="seat-bot">{t("bot")}</span> : null}
            {active ? <span className="seat-time">{seconds > 0 ? `${seconds}s` : "…"}</span> : null}
          </div>
        </div>

        {active ? (
          <motion.span
            className="seat-turn-chip"
            initial={{ opacity: 0, y: -4, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={spring.bouncy}
          >
            {t("turn")}
          </motion.span>
        ) : null}
      </div>

      <OpponentHand
        count={player.cardCount}
        back={player.cardBack}
        size={handSize}
        compact
        className="seat-hand"
      />
    </motion.div>
  );
}
