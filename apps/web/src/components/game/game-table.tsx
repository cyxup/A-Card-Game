import type { Card, Color, RoomView } from "@stacked/shared";
import {
  EMOTES,
  canJumpInView,
  canPlayCard,
  cardLabel,
} from "@stacked/shared";
import { ArrowUpDown, DoorOpen, Layers, RefreshCw, Share2, Zap } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Avatar } from "@/components/brand/avatar";
import { NameEffect } from "@/components/brand/name-effect";
import { CardBack, CardFace } from "@/components/cards/playing-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { logText } from "@/lib/format";
import { game as client, useGame } from "@/lib/game";
import { playSound } from "@/lib/sound";
import { useCountdown } from "@/lib/use-countdown";
import { cn } from "@/lib/utils";
import { COLOR_META, ColorDialog, SwapDialog } from "./color-dialog";
import { GameOverDialog } from "./game-over";
import { Seat } from "./seat";
import { WinEffect } from "./win-effect";

const COLOR_ORDER = { red: 0, yellow: 1, green: 2, blue: 3 } as const;
const KIND_ORDER = { skip: 10, reverse: 11, draw2: 12, wild: 13, wild4: 14, swap: 15 } as const;

function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const colorA = a.color ? COLOR_ORDER[a.color] : 4;
    const colorB = b.color ? COLOR_ORDER[b.color] : 4;
    if (colorA !== colorB) return colorA - colorB;
    const rankA = a.kind === "number" ? (a.value ?? 0) : KIND_ORDER[a.kind];
    const rankB = b.kind === "number" ? (b.value ?? 0) : KIND_ORDER[b.kind];
    return rankA - rankB;
  });
}

function TableStatus({
  room,
  isMyTurn,
  currentName,
  offset,
}: {
  room: RoomView;
  isMyTurn: boolean;
  currentName: string;
  offset: number;
}) {
  const game = room.game;
  const left = useCountdown(game?.deadline, offset, game?.phase === "playing");
  const initial = useMemo(() => Math.max(120, left), [game?.deadline]);
  if (!game) return null;
  const seconds = Math.ceil(left / 1000);

  return (
    <div className="flex w-full max-w-[320px] flex-col items-center gap-1.5">
      <div className="flex items-center gap-2 text-[10px]">
        <span className={cn("font-medium", isMyTurn ? "text-brand" : "text-white/55")} aria-live="polite">
          {isMyTurn ? "Your turn" : `${currentName}'s turn`}
        </span>
        <span className="font-mono text-white/35">{seconds > 0 ? `${seconds}s` : "…"}</span>
      </div>
      <div className="h-0.5 w-32 overflow-hidden rounded-full bg-white/10">
        <div
          key={game.deadline}
          className="turn-timer h-full rounded-full"
          style={{
            animationDuration: `${initial}ms`,
            background: isMyTurn ? "var(--brand)" : "rgb(255 255 255 / 0.35)",
          }}
        />
      </div>
      <p className="text-center text-[11px] leading-snug text-white/45">
        {game.pending > 0
          ? `+${game.pending} on the stack — stack it or take the cards`
          : isMyTurn
            ? game.drawnCardId
              ? "You drew. Play that card or pass."
              : "Play a card, or draw one."
            : "Waiting for the table…"}
      </p>
    </div>
  );
}

function JumpPrompt({
  room,
  hand,
  offset,
}: {
  room: RoomView;
  hand: Card[];
  offset: number;
}) {
  const game = room.game;
  const [now, setNow] = useState(() => Date.now() + offset);

  useEffect(() => {
    if (!game?.lastCard) return;
    const timer = window.setInterval(() => setNow(Date.now() + offset), 600);
    return () => window.clearInterval(timer);
  }, [game?.lastCard, game?.lastPlayAt, offset]);

  if (!game?.lastCard) return null;
  const matches = hand.filter((card) =>
    canJumpInView(
      { rules: room.rules, pending: game.pending, lastCard: game.lastCard, lastPlayAt: game.lastPlayAt },
      card,
      now,
    ),
  );
  if (matches.length === 0) return null;

  return (
    <Button
      variant="brand"
      size="sm"
      className="gap-1.5"
      onClick={() => client.action({ type: "jump", cardId: (matches[0] as Card).id })}
    >
      <Zap className="size-3.5" /> Jump in
    </Button>
  );
}

export function GameTable({ room, onLeave }: { room: RoomView; onLeave: () => void }) {
  const gameView = room.game;
  const { emotes, offset } = useGame();
  const [colorCard, setColorCard] = useState<Card | null>(null);
  const [swapCard, setSwapCard] = useState<Card | null>(null);
  const [swapMode, setSwapMode] = useState<"play" | "jump">("play");
  const [sorted, setSorted] = useState(true);
  const [wiggle, setWiggle] = useState<string | null>(null);

  const meId = room.you.id;
  const me = room.players.find((player) => player.id === meId);
  const isMyTurn = gameView?.turnId === meId;
  const current = room.players.find((player) => player.id === gameView?.turnId);
  const tableId = room.players.find((player) => player.host)?.table ?? me?.table ?? "noir";
  const winnerEffect = room.players.find((player) => player.id === gameView?.winner)?.winEffect ?? "none";

  const hand = useMemo(() => (sorted ? sortHand(room.you.hand) : room.you.hand), [room.you.hand, sorted]);

  const context = useMemo(
    () =>
      gameView
        ? {
            top: gameView.top,
            color: gameView.color,
            pending: gameView.pending,
            pendingKind: gameView.pendingKind,
            rules: room.rules,
          }
        : null,
    [gameView, room.rules],
  );

  const playableIds = useMemo(() => {
    if (!context || !isMyTurn || gameView?.phase === "ended") return new Set<string>();
    if (gameView?.drawnCardId) return new Set([gameView.drawnCardId]);
    return new Set(hand.filter((card) => canPlayCard(context, card)).map((card) => card.id));
  }, [context, hand, isMyTurn, gameView?.phase, gameView?.drawnCardId]);

  const jumpableIds = useMemo(() => {
    if (!gameView?.lastCard || isMyTurn) return new Set<string>();
    const now = Date.now() + offset;
    return new Set(
      hand
        .filter((card) =>
          canJumpInView(
            { rules: room.rules, pending: gameView.pending, lastCard: gameView.lastCard, lastPlayAt: gameView.lastPlayAt },
            card,
            now,
          ),
        )
        .map((card) => card.id),
    );
  }, [gameView, hand, isMyTurn, offset, room.rules]);

  const lastLog = gameView?.log[gameView.log.length - 1];
  const lastLogId = lastLog?.id ?? 0;
  useEffect(() => {
    if (!lastLog) return;
    if (lastLog.kind === "play" || lastLog.kind === "jump") playSound("play");
    else if (lastLog.kind === "draw" || lastLog.kind === "draw_penalty") playSound("draw");
    else if (lastLog.kind === "deal") playSound("deal");
    else if (lastLog.kind === "swap" || lastLog.kind === "rotate") playSound("play");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastLogId]);

  // A dialog that was open for a turn that has since moved on is stale.
  useEffect(() => {
    setColorCard(null);
    setSwapCard(null);
  }, [gameView?.seq]);

  const prevTurn = useMemo(() => gameView?.turnId, [gameView?.turnId]);
  useEffect(() => {
    if (prevTurn === meId && gameView?.phase === "playing") playSound("turn");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevTurn]);

  if (!gameView) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">
        Waiting for the first card…
      </div>
    );
  }

  const myIndex = room.players.findIndex((player) => player.id === meId);
  const ordered = [...room.players.slice(myIndex + 1), ...room.players.slice(0, myIndex)];
  const step = 360 / Math.max(2, room.players.length);

  const overlap = hand.length > 16 ? 52 : hand.length > 12 ? 42 : hand.length > 9 ? 30 : hand.length > 6 ? 16 : 5;
  const canDraw = isMyTurn && !gameView.drawnCardId;
  const jumpWindow = Math.max(0, gameView.lastPlayAt + 5000 - (Date.now() + offset));
  const swapInCard = hand.find((card) => card.kind === "swap");
  const canSwapIn =
    !isMyTurn &&
    room.rules.swapAnytime &&
    gameView.pending === 0 &&
    gameView.lastPlayAt > 0 &&
    jumpWindow > 0 &&
    Boolean(swapInCard);

  function nudge(card: Card) {
    setWiggle(card.id);
    playSound("error");
    window.setTimeout(() => setWiggle((current) => (current === card.id ? null : current)), 320);
  }

  function onCard(card: Card) {
    if (gameView?.phase !== "playing") return;
    if (isMyTurn) {
      if (gameView.drawnCardId && card.id !== gameView.drawnCardId) {
        toast.info("You can only play the card you drew, or pass.");
        nudge(card);
        return;
      }
      if (!playableIds.has(card.id)) {
        nudge(card);
        return;
      }
      if (card.kind === "wild" || card.kind === "wild4") {
        setColorCard(card);
        return;
      }
      if (card.kind === "swap") {
        setSwapMode("play");
        setSwapCard(card);
        return;
      }
      client.action({ type: "play", cardId: card.id });
      return;
    }
    if (card.kind === "swap" && canSwapIn) {
      setSwapMode("jump");
      setSwapCard(card);
      return;
    }
    if (jumpableIds.has(card.id)) {
      client.action({ type: "jump", cardId: card.id });
      return;
    }
    nudge(card);
  }

  function pickColor(color: Color) {
    if (!colorCard) return;
    const isJump = jumpableIds.has(colorCard.id) && !isMyTurn;
    client.action({ type: isJump ? "jump" : "play", cardId: colorCard.id, color });
    setColorCard(null);
  }

  function pickSwap(targetId: string, color: Color) {
    if (!swapCard) return;
    client.action({ type: swapMode, cardId: swapCard.id, color, targetId });
    setSwapCard(null);
  }

  function draw() {
    if (!canDraw) return;
    client.action({ type: "draw" });
  }

  function pass() {
    if (!isMyTurn || !gameView?.drawnCardId) return;
    client.action({ type: "pass" });
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${room.code}`);
      toast.success("Invite link copied.");
    } catch {
      toast.error(`Room code: ${room.code}`);
    }
  }

  const currentColor = COLOR_META[gameView.color];
  const logs = gameView.log.slice(-3);

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col px-1.5 pb-1.5 sm:px-3 sm:pb-3">
        <div
          className={cn(
            "table-surface relative h-[min(54vh,560px)] min-h-[330px] w-full lg:h-[calc(100dvh-56px-252px)]",
            `felt-${tableId}`,
          )}
        >
          <div className="table-spotlight" />
          <WinEffect effect={gameView.phase === "ended" ? winnerEffect : null} />

          <div className="absolute right-2.5 top-2.5 z-30 flex items-center gap-1.5">
            <button
              type="button"
              onClick={copyInvite}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] text-white/70 transition-colors hover:text-white"
              title="Copy invite link"
            >
              {room.code}
              <Share2 className="size-3" />
            </button>
            <Button variant="ghost" size="icon-xs" onClick={onLeave} title="Leave table" aria-label="Leave table" className="text-white/60 hover:text-white">
              <DoorOpen />
            </Button>
          </div>

          {/* mobile opponents */}
          <div className="absolute inset-x-0 top-2 z-20 flex justify-center px-10 lg:hidden">
            <div className="flex max-w-full gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
              {ordered.map((player) => (
                <Seat
                  key={player.id}
                  player={player}
                  compact
                  active={gameView.turnId === player.id}
                  deadline={gameView.turnId === player.id ? gameView.deadline : undefined}
                  offset={offset}
                  className="w-[74px] shrink-0"
                />
              ))}
            </div>
          </div>

          {/* desktop seats around the ellipse */}
          {ordered.map((player, index) => {
            const radians = ((90 + step * (index + 1)) * Math.PI) / 180;
            const left = 50 + 43 * Math.cos(radians);
            const top = 50 + 33 * Math.sin(radians);
            return (
              <div
                key={player.id}
                className="absolute hidden -translate-x-1/2 -translate-y-1/2 lg:block"
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                <Seat
                  player={player}
                  active={gameView.turnId === player.id}
                  deadline={gameView.turnId === player.id ? gameView.deadline : undefined}
                  offset={offset}
                />
              </div>
            );
          })}

          {/* centre */}
          <div className="absolute left-1/2 top-[55%] z-10 flex w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 px-4 lg:top-[48%]">
            <div className="flex items-end gap-3.5 pb-3 sm:gap-6">
              <button
                type="button"
                onClick={draw}
                disabled={!canDraw}
                className={cn(
                  "group relative rounded-[10px] outline-none transition-transform duration-150",
                  canDraw ? "cursor-pointer hover:-translate-y-1" : "cursor-default",
                )}
                title={gameView.pending > 0 ? `Take ${gameView.pending} cards` : "Draw a card"}
                aria-label={gameView.pending > 0 ? `Take ${gameView.pending} cards` : "Draw a card"}
              >
                <CardBack
                  back={me?.cardBack ?? "midnight"}
                  style={{ "--cw": "clamp(58px, 7vw, 76px)", opacity: 0.45, transform: "translate(5px,-5px)" } as CSSProperties}
                  className="absolute left-0 top-0"
                />
                <CardBack
                  back={me?.cardBack ?? "midnight"}
                  style={{ "--cw": "clamp(58px, 7vw, 76px)", opacity: 0.7, transform: "translate(2.5px,-2.5px)" } as CSSProperties}
                  className="absolute left-0 top-0"
                />
                <CardBack
                  back={me?.cardBack ?? "midnight"}
                  style={{ "--cw": "clamp(58px, 7vw, 76px)" } as CSSProperties}
                  className={cn("relative", canDraw && "ring-2 ring-brand/45 ring-offset-2 ring-offset-black/30")}
                />
                <span className="absolute -left-2 -top-2 grid min-w-6 place-items-center rounded-full border border-white/15 bg-background px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                  {gameView.drawCount}
                </span>
                {gameView.pending > 0 && (
                  <span className="absolute -top-3 -right-3 grid min-w-7 place-items-center rounded-full border border-brand/40 bg-brand px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-foreground shadow-lg">
                    +{gameView.pending}
                  </span>
                )}
              </button>

              <div className="relative">
                <div
                  className="rounded-[12px] p-0.5"
                  style={{ boxShadow: `0 0 0 1.5px ${currentColor.hex}66, 0 0 34px ${currentColor.hex}33` }}
                >
                    <CardFace
                    key={gameView.top.id}
                    card={gameView.top}
                    className="discard-pop"
                    style={{ "--cw": "clamp(62px, 7.6vw, 84px)" } as CSSProperties}
                    label={cardLabel(gameView.top)}
                  />
                </div>
                <span
                  className="absolute -bottom-2.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                  style={{ background: currentColor.hex, boxShadow: `0 0 10px ${currentColor.hex}` }}
                />
              </div>
            </div>

            <TableStatus room={room} isMyTurn={isMyTurn} currentName={current?.name ?? "someone"} offset={offset} />

            <div className="flex items-center gap-2 text-[10px] text-white/35">
              <RefreshCw className={cn("size-3", gameView.dir === -1 && "rotate-180")} />
              <span>{gameView.dir === 1 ? "clockwise" : "counter-clockwise"}</span>
              {gameView.pending > 0 && (
                <>
                  <span className="text-white/15">·</span>
                  <span className="text-brand">stack +{gameView.pending}</span>
                </>
              )}
            </div>
          </div>

          {/* log */}
          <div className="absolute bottom-3 left-4 hidden w-56 flex-col gap-1 xl:flex">
            {logs.map((entry) => (
              <p key={entry.id} className="truncate text-[10px] text-white/35">
                {logText(entry, room.players)}
              </p>
            ))}
          </div>

          {/* emotes */}
          <div className="pointer-events-none absolute left-1/2 top-16 z-40 flex -translate-x-1/2 flex-col items-center gap-1">
            {emotes.map((event) => {
              const player = room.players.find((candidate) => candidate.id === event.playerId);
              const emote = EMOTES.find((candidate) => candidate.id === event.emote);
              return (
                <div
                  key={event.key}
                  className="emote-bubble flex items-center gap-2 rounded-full border border-white/12 bg-black/70 px-3 py-1.5 text-xs text-white/85 shadow-lg"
                >
                  <span className="text-base">{emote?.glyph ?? "👋"}</span>
                  <span className="max-w-[140px] truncate text-[11px] text-white/60">{player?.name ?? "player"}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* hand / controls */}
        <div className="relative z-20 -mt-1 border-t border-white/8 bg-[linear-gradient(180deg,rgba(20,20,21,0.6),rgba(10,10,11,0.95))]">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-2 px-3 pt-2 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar id={me?.avatar ?? "rook"} size={26} />
              <NameEffect effect={me?.nameEffect} className="max-w-[160px] text-xs font-semibold">
                {me?.name ?? "You"}
              </NameEffect>
              {me?.host && <Badge variant="outline" className="hidden sm:inline-flex">host</Badge>}
              <span className="font-mono text-[10px] text-muted-foreground">{hand.length} cards</span>
              {isMyTurn && (
                <span className="hidden items-center gap-1 rounded-full border border-brand/25 bg-brand/10 px-2 py-0.5 text-[10px] text-brand sm:inline-flex">
                  <span className="size-1.5 animate-pulse rounded-full bg-brand" /> your turn
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setSorted((value) => !value)} title="Sort hand">
                <ArrowUpDown /> <span className="hidden sm:inline">Sort</span>
              </Button>
              <Button
                size="sm"
                variant={gameView.pending > 0 ? "brand" : "outline"}
                disabled={!canDraw}
                onClick={draw}
                title="Draw a card"
              >
                <Layers /> {gameView.pending > 0 ? `Take +${gameView.pending}` : "Draw"}
              </Button>
              <Button size="sm" variant="outline" disabled={!isMyTurn || !gameView.drawnCardId} onClick={pass}>
                Pass
              </Button>
            </div>
          </div>

          <div className="hand-row mx-auto max-w-[1500px] px-3 sm:px-5">
            {hand.map((card, index) => {
              const playable = playableIds.has(card.id);
              const jumpable = jumpableIds.has(card.id) || (canSwapIn && card.kind === "swap");
              const drawn = gameView.drawnCardId === card.id;
              return (
                <div
                  key={card.id}
                  className="hand-slot"
                  style={{ marginLeft: index === 0 ? 0 : -overlap }}
                >
                  <CardFace
                    card={card}
                    playable={playable || jumpable}
                    muted={!playable && !jumpable && (isMyTurn || gameView.phase === "playing")}
                    drawn={drawn}
                    className={cn(wiggle === card.id && "pcard-wiggle")}
                    onClick={() => onCard(card)}
                    label={cardLabel(card)}
                  />
                </div>
              );
            })}
            {hand.length === 0 && (
              <div className="py-10 text-xs text-muted-foreground">No cards. Either you won or something went very wrong.</div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1 px-3 pb-2.5">
            {!isMyTurn && gameView.lastCard && jumpWindow > 0 && (
              <JumpPrompt room={room} hand={hand} offset={offset} />
            )}
            {canSwapIn && swapInCard && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setSwapMode("jump");
                  setSwapCard(swapInCard);
                }}
              >
                <Zap className="size-3.5" /> Swap in
              </Button>
            )}
            <div className="mx-1 h-4 w-px bg-white/10" />
            {EMOTES.slice(0, 8).map((emote) => (
              <button
                key={emote.id}
                type="button"
                onClick={() => client.emote(emote.id)}
                title={emote.label}
                aria-label={emote.label}
                className="grid size-7 place-items-center rounded-md text-base opacity-65 transition-[opacity,background-color,transform] hover:bg-white/8 hover:opacity-100 active:scale-90"
              >
                {emote.glyph}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ColorDialog card={colorCard} open={Boolean(colorCard)} onOpenChange={(open) => (!open ? setColorCard(null) : undefined)} onPick={pickColor} />
      <SwapDialog
        card={swapCard}
        open={Boolean(swapCard)}
        onOpenChange={(open) => (!open ? setSwapCard(null) : undefined)}
        players={room.players}
        meId={meId}
        outOfTurn={swapMode === "jump"}
        onConfirm={pickSwap}
      />

      {gameView.phase === "ended" && <GameOverDialog room={room} onLeave={onLeave} onRematch={() => client.rematch()} />}
    </>
  );
}
