import { EMOTES, type Card, type RoomPlayerView } from "@stacked/shared";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRightLeft, Check, Crown, FlaskConical, Sparkles, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/brand/avatar";
import { NameEffect } from "@/components/brand/name-effect";
import { UserTags } from "@/components/brand/user-tags";
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
  selectable = false,
  selected = false,
  onSelect,
  revealedHand,
  chat,
  className,
}: {
  player: RoomPlayerView;
  active: boolean;
  deadline?: number;
  offset: number;
  dense?: boolean;
  emote?: string;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** Owner x-ray only. */
  revealedHand?: Card[];
  /** Latest quick-chat line, already translated. */
  chat?: { key: number; text: string };
  className?: string;
}) {
  const left = useCountdown(deadline, offset, active);
  const t = useT();
  const seconds = Math.ceil(left / 1000);
  const avatarSize = dense ? 34 : 42;
  const handSize = dense ? 22 : 27;
  const offline = !player.connected && !player.isBot;
  const plateRef = useRef<HTMLDivElement>(null);
  const [chatPos, setChatPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!chat) {
      setChatPos(null);
      return;
    }
    let frame = 0;
    const update = () => {
      const rect = plateRef.current?.getBoundingClientRect();
      if (!rect) return;
      setChatPos({ left: rect.left + rect.width / 2, top: rect.bottom + 10 });
    };
    update();
    frame = requestAnimationFrame(update);
    const late = window.setTimeout(update, 320);
    const settled = window.setTimeout(update, 720);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (observer && plateRef.current) observer.observe(plateRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(late);
      window.clearTimeout(settled);
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [chat?.key]);

  return (
    <motion.div
      ref={plateRef}
      layout
      initial={{ opacity: 0, y: -14, scale: 0.96 }}
      animate={{ opacity: offline ? 0.45 : 1, y: 0, scale: active || selected ? 1.02 : 1 }}
      whileHover={selectable ? { scale: 1.045 } : undefined}
      whileTap={selectable ? { scale: 0.98 } : undefined}
      transition={spring.smooth}
      className={cn(
        "seat-plate",
        active && "seat-plate-active",
        dense && "seat-plate-dense",
        selectable && "seat-plate-target",
        selected && "seat-plate-chosen",
        className,
      )}
      data-seat-id={player.id}
      data-team={player.team ?? undefined}
      data-turn={active}
      aria-current={active ? "true" : undefined}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      aria-label={selectable ? `${t("Swap hands with")} ${player.name}` : undefined}
      onClick={selectable ? onSelect : undefined}
      onKeyDown={
        selectable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
    >
      {selectable ? (
        <span className={cn("seat-swap-tag", selected && "is-chosen")}>
          {selected ? <Check className="size-3" /> : <ArrowRightLeft className="size-3" />}
          {selected ? t("Chosen") : t("Swap")}
        </span>
      ) : null}
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

      {chat && chatPos && typeof document !== "undefined"
        ? createPortal(
            <span
              key={chat.key}
              className="seat-chat"
              style={{ left: chatPos.left, top: chatPos.top }}
            >
              {chat.text}
            </span>,
            document.body,
          )
        : null}

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
          <UserTags tags={player.tags} max={2} className="mt-0.5" />
          <div className="seat-meta">
            <span>{t("Lv {n}", { n: player.level })}</span>
            {player.team !== null && player.team !== undefined ? (
              <span className={cn("seat-team", player.team === 0 ? "seat-team-a" : "seat-team-b")}>
                {t(player.team === 0 ? "Team A" : "Team B")}
              </span>
            ) : null}
            {player.owner ? (
              <span className="seat-owner">
                <Sparkles className="size-2.5" /> {t("owner")}
              </span>
            ) : null}
            {player.beta ? (
              <span className="seat-beta">
                <FlaskConical className="size-2.5" /> beta
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
        cards={revealedHand ?? player.otherHand}
        max={revealedHand || player.otherHand ? 10 : 7}
        farSide={!revealedHand && player.otherHand !== undefined}
        size={handSize}
        compact
        className="seat-hand"
      />
    </motion.div>
  );
}
