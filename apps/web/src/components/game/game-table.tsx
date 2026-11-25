import type { Card, Color, LogEntry, RoomView } from "@stacked/shared";
import {
  EMOTES,
  canJumpInView,
  canPlayCard,
  cardLabel,
} from "@stacked/shared";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ArrowRightLeft,
  ArrowUpDown,
  ChevronRight,
  DoorOpen,
  Flame,
  Layers,
  RefreshCw,
  Repeat2,
  Share2,
  SkipForward,
  Sparkles,
  Timer,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Avatar } from "@/components/brand/avatar";
import { Logo } from "@/components/brand/logo";
import { NameEffect } from "@/components/brand/name-effect";
import { CardBack, CardFace } from "@/components/cards/playing-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { setPrefs, usePrefs } from "@/lib/prefs";
import { logText } from "@/lib/format";
import { game as client, useGame } from "@/lib/game";
import { easeOutExpo, spring } from "@/lib/motion";
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

interface Point {
  x: number;
  y: number;
}

interface Flyer {
  id: string;
  card?: Card;
  back?: string;
  from: Point;
  to: Point;
  delay: number;
  duration: number;
  spin: number;
  scale: number;
  glow?: string;
}

interface Banner {
  id: string;
  entry: LogEntry;
}

function useStageGeometry(stageRef: RefObject<HTMLDivElement | null>) {
  return (element: Element | null): Point | null => {
    const stage = stageRef.current;
    if (!stage || !element) return null;
    const stageRect = stage.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left - stageRect.left + rect.width / 2,
      y: rect.top - stageRect.top + rect.height / 2,
    };
  };
}

function BannerIcon({ entry }: { entry: LogEntry }) {
  if (entry.card) return null;
  const className = "size-4";
  switch (entry.kind) {
    case "draw":
      return <Layers className={className} />;
    case "draw_penalty":
      return <Flame className={className} />;
    case "skip":
      return <SkipForward className={className} />;
    case "reverse":
      return <Repeat2 className={className} />;
    case "swap":
    case "rotate":
      return <ArrowRightLeft className={className} />;
    case "timeout":
      return <Timer className={className} />;
    case "jump":
      return <Zap className={className} />;
    case "win":
      return <Sparkles className={className} />;
    default:
      return <ChevronRight className={className} />;
  }
}

function TurnStatus({
  room,
  isMyTurn,
  currentName,
  offset,
  mustDraw,
}: {
  room: RoomView;
  isMyTurn: boolean;
  currentName: string;
  offset: number;
  mustDraw: boolean;
}) {
  const game = room.game;
  const left = useCountdown(game?.deadline, offset, game?.phase === "playing");
  const initial = useMemo(() => Math.max(120, left), [game?.deadline]);
  if (!game) return null;
  const seconds = Math.ceil(left / 1000);
  const color = COLOR_META[game.color];

  const hint = game.pending > 0
    ? `+${game.pending} stacked — play another draw card or take the pile`
    : isMyTurn
      ? game.drawnCardId
        ? "You drew — play that card or pass"
        : mustDraw
          ? "No match — draw a card"
          : "Play a matching card, or draw"
      : `Waiting for ${currentName}…`;

  return (
    <div className="turn-status">
      <div className="turn-status-row">
        <span className="turn-status-live" data-active={isMyTurn} />
        <span className={cn("turn-status-name", isMyTurn && "text-brand")} aria-live="polite">
          {isMyTurn ? "Your turn" : `${currentName}'s turn`}
        </span>
        <span className="turn-status-seconds">{seconds > 0 ? `${seconds}s` : "…"}</span>
      </div>
      <div className="turn-status-bar">
        <div
          key={game.deadline}
          className="turn-timer h-full rounded-full"
          style={{
            animationDuration: `${initial}ms`,
            background: isMyTurn ? "var(--brand)" : "rgb(255 255 255 / 0.45)",
          }}
        />
      </div>
      <div className="turn-status-hint">
        <span>{hint}</span>
        <span className="turn-status-meta">
          <span className="turn-color-dot" style={{ background: color.hex, boxShadow: `0 0 10px ${color.hex}` }} />
          {color.label}
          <span className="text-white/15">·</span>
          <RefreshCw className={cn("size-3", game.dir === -1 && "rotate-180")} />
          {game.dir === 1 ? "clockwise" : "counter-clockwise"}
        </span>
      </div>
    </div>
  );
}

function JumpPrompt({ room, hand, offset }: { room: RoomView; hand: Card[]; offset: number }) {
  const game = room.game;
  const [now, setNow] = useState(() => Date.now() + offset);

  useEffect(() => {
    if (!game?.lastCard) return;
    const timer = window.setInterval(() => setNow(Date.now() + offset), 500);
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
  const card = matches[0];
  if (!card) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={spring.snappy}
    >
      <Button
        variant="brand"
        size="sm"
        className="jump-prompt gap-2"
        onClick={() => client.action({ type: "jump", cardId: card.id })}
      >
        <Zap className="size-3.5" />
        Jump in with
        <span className="jump-prompt-card">
          <CardFace card={card} style={{ "--cw": "18px" } as CSSProperties} />
        </span>
      </Button>
    </motion.div>
  );
}

export function GameTable({ room, onLeave }: { room: RoomView; onLeave: () => void }) {
  const gameView = room.game;
  const { emotes, offset } = useGame();
  const prefs = usePrefs();
  const [colorCard, setColorCard] = useState<Card | null>(null);
  const [swapCard, setSwapCard] = useState<Card | null>(null);
  const [swapMode, setSwapMode] = useState<"play" | "jump">("play");
  const [sorted, setSorted] = useState(true);
  const [wiggle, setWiggle] = useState<string | null>(null);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [turnFlash, setTurnFlash] = useState(false);
  const [colorFlash, setColorFlash] = useState<{ id: number; hex: string } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const handPanelRef = useRef<HTMLDivElement>(null);
  const lastLogRef = useRef<number | null>(null);
  const gameStartRef = useRef<number | null>(null);
  const flyerCounter = useRef(0);
  const bannerCounter = useRef(0);
  const flashCounter = useRef(0);
  const stageCenter = useStageGeometry(stageRef);

  const meId = room.you.id;
  const me = room.players.find((player) => player.id === meId);
  const selfEmote = emotes.findLast((event) => event.playerId === meId);
  const isMyTurn = gameView?.turnId === meId;
  const current = room.players.find((player) => player.id === gameView?.turnId);
  const tableId = room.players.find((player) => player.host)?.table ?? me?.table ?? "noir";
  const winnerEffect = room.players.find((player) => player.id === gameView?.winner)?.winEffect ?? "none";
  const deckBack = room.players.find((player) => player.host)?.cardBack ?? "midnight";

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

  const canDraw = Boolean(isMyTurn && !gameView?.drawnCardId && gameView?.phase === "playing");
  const mustDraw = Boolean(isMyTurn && playableIds.size === 0 && !gameView?.drawnCardId);
  const jumpWindow = Math.max(0, (gameView?.lastPlayAt ?? 0) + 5000 - (Date.now() + offset));
  const swapInCard = hand.find((card) => card.kind === "swap");
  const canSwapIn = Boolean(
    !isMyTurn &&
      room.rules.swapAnytime &&
      gameView?.pending === 0 &&
      (gameView?.lastPlayAt ?? 0) > 0 &&
      jumpWindow > 0 &&
      swapInCard,
  );
  const opponents = useMemo(() => {
    const myIndex = room.players.findIndex((player) => player.id === meId);
    return [...room.players.slice(myIndex + 1), ...room.players.slice(0, myIndex)];
  }, [room.players, meId]);
  const denseRail = opponents.length > 4;
  const layerId = gameView ? `round-${gameView.startedAt}` : "round";

  function nudge(card: Card) {
    setWiggle(card.id);
    playSound("error");
    window.setTimeout(() => setWiggle((currentId) => (currentId === card.id ? null : currentId)), 320);
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

  function removeFlyer(id: string) {
    setFlyers((currentFlyers) => currentFlyers.filter((flyer) => flyer.id !== id));
  }

  function pushFlyer(spec: Omit<Flyer, "id">) {
    const id = `flyer-${++flyerCounter.current}`;
    setFlyers((currentFlyers) => [...currentFlyers.slice(-10), { ...spec, id }]);
    window.setTimeout(() => removeFlyer(id), spec.delay + spec.duration * 1000 + 120);
  }

  function pushBanner(entry: LogEntry) {
    const id = `banner-${++bannerCounter.current}`;
    setBanners([{ id, entry }]);
  }

  function seatHandCenter(playerId: string | undefined): Point {
    if (playerId === meId) return handCenter();
    if (playerId) {
      const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(playerId) : playerId;
      const element = stageRef.current?.querySelector<HTMLElement>(`[data-seat-id="${escaped}"] .opp-hand`);
      const center = stageCenter(element ?? null);
      if (center) return center;
    }
    const stage = stageRef.current;
    return stage ? { x: stage.clientWidth / 2, y: 150 } : { x: 0, y: 0 };
  }

  function handCenter(): Point {
    const center = stageCenter(handPanelRef.current);
    const stage = stageRef.current;
    return center ?? (stage ? { x: stage.clientWidth / 2, y: stage.clientHeight - 110 } : { x: 0, y: 0 });
  }

  function processLog(entry: LogEntry) {
    const actor = entry.actor;
    const isMe = actor === meId;
    const deck = stageCenter(deckRef.current);
    const discard = stageCenter(discardRef.current);

    if (entry.kind === "play" || entry.kind === "jump") {
      pushBanner(entry);
      if (entry.card) {
        if (!isMe && deck && discard) {
          pushFlyer({
            card: entry.card,
            from: seatHandCenter(actor),
            to: discard,
            delay: 0,
            duration: 0.52,
            spin: isMe ? 0 : -8,
            scale: 0.82,
          });
        }
        if (entry.card.kind === "wild" || entry.card.kind === "wild4" || entry.card.kind === "swap") {
          const hex = entry.color
            ? COLOR_META[entry.color].hex
            : entry.card.color
              ? COLOR_META[entry.card.color].hex
              : "#ff5a2b";
          const id = ++flashCounter.current;
          setColorFlash({ id, hex });
          window.setTimeout(() => setColorFlash((currentFlash) => (currentFlash?.id === id ? null : currentFlash)), 900);
        }
      }
      return;
    }

    if (entry.kind === "draw" || entry.kind === "draw_penalty") {
      pushBanner(entry);
      if (!deck) return;
      const to = isMe ? handCenter() : seatHandCenter(actor);
      const count = Math.min(Math.max(entry.count ?? 1, 1), 5);
      for (let index = 0; index < count; index++) {
        pushFlyer({
          back: deckBack,
          from: { x: deck.x + index * 3, y: deck.y + index * 2 },
          to,
          delay: index * 0.07,
          duration: 0.48,
          spin: isMe ? 180 : index % 2 ? 8 : -8,
          scale: 0.72,
        });
      }
      return;
    }

    if (entry.kind === "swap") {
      pushBanner(entry);
      if (!entry.actor || !entry.target) return;
      const from = seatHandCenter(entry.actor);
      const to = seatHandCenter(entry.target);
      const actorBack = room.players.find((player) => player.id === entry.actor)?.cardBack ?? deckBack;
      const targetBack = room.players.find((player) => player.id === entry.target)?.cardBack ?? deckBack;
      pushFlyer({ back: actorBack, from, to, delay: 0, duration: 0.62, spin: -10, scale: 0.72, glow: "var(--brand)" });
      pushFlyer({ back: targetBack, from: to, to: from, delay: 0.08, duration: 0.62, spin: 10, scale: 0.72, glow: "var(--brand)" });
      return;
    }

    if (entry.kind === "deal") return;
    if (entry.kind === "win") return;
    if (entry.kind === "reshuffle") return;
    pushBanner(entry);
  }

  useEffect(() => {
    if (!gameView) return;
    if (gameStartRef.current !== gameView.startedAt) {
      gameStartRef.current = gameView.startedAt;
      lastLogRef.current = gameView.log[gameView.log.length - 1]?.id ?? 0;
      setBanners([]);
      setFlyers([]);
      setTurnFlash(false);
      return;
    }
    const previous = lastLogRef.current ?? 0;
    const fresh = gameView.log.filter((entry) => entry.id > previous);
    lastLogRef.current = gameView.log[gameView.log.length - 1]?.id ?? 0;
    for (const entry of fresh) processLog(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameView?.log, gameView?.startedAt]);

  useEffect(() => {
    const firstId = banners[0]?.id;
    if (!firstId) return;
    const timer = window.setTimeout(() => setBanners((currentBanners) => currentBanners.slice(1)), 1650);
    return () => window.clearTimeout(timer);
  }, [banners]);

  useEffect(() => {
    const last = gameView?.log[gameView.log.length - 1];
    if (!last) return;
    if (last.kind === "play" || last.kind === "jump" || last.kind === "skip" || last.kind === "reverse") playSound("play");
    else if (last.kind === "draw" || last.kind === "draw_penalty") playSound("draw");
    else if (last.kind === "deal") playSound("deal");
    else if (last.kind === "swap" || last.kind === "rotate") playSound("play");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameView?.log[gameView.log.length - 1]?.id]);

  useEffect(() => {
    setColorCard(null);
    setSwapCard(null);
  }, [gameView?.seq]);

  useEffect(() => {
    if (!isMyTurn || gameView?.phase !== "playing") return;
    setTurnFlash(true);
    playSound("turn");
    const timer = window.setTimeout(() => setTurnFlash(false), 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, gameView?.turnId, gameView?.phase]);

  if (!gameView) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">
        Waiting for the first card…
      </div>
    );
  }

  const overlap = hand.length > 16 ? 52 : hand.length > 12 ? 42 : hand.length > 9 ? 30 : hand.length > 6 ? 16 : 5;
  const currentColor = COLOR_META[gameView.color];
  const banner = banners[0];
  const recentLogs = gameView.log.slice(-4).reverse();
  const bannerAccent = banner?.entry.card?.color
    ? COLOR_META[banner.entry.card.color].hex
    : banner?.entry.color
      ? COLOR_META[banner.entry.color].hex
      : "#ff5a2b";

  return (
    <LayoutGroup id={layerId}>
      <motion.div
        ref={stageRef}
        className="game-stage"
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: easeOutExpo }}
      >
        <div className={cn("table-surface table-surface-live", `felt-${tableId}`)}>
          <div className="table-atmosphere" aria-hidden>
            {Array.from({ length: 14 }).map((_, index) => (
              <span
                key={index}
                className="table-ember"
                style={{
                  left: `${(index * 37 + 11) % 100}%`,
                  animationDelay: `-${(index * 1.7) % 12}s`,
                  animationDuration: `${9 + (index % 5) * 2}s`,
                  opacity: 0.08 + (index % 4) * 0.035,
                }}
              />
            ))}
          </div>
          <div className="table-vignette" aria-hidden />
          <div className="table-spotlight" aria-hidden />

          <div className="table-topbar">
            <div className="flex min-w-0 items-center gap-2.5">
              <Logo compact className="table-logo" />
              <span className="topbar-divider" />
              <span className="eyebrow hidden sm:inline">table</span>
              <button
                type="button"
                onClick={copyInvite}
                className="table-code"
                title="Copy invite link"
              >
                {room.code}
                <Share2 className="size-3" />
              </button>
              <Badge variant="outline" className="hidden items-center gap-1 sm:inline-flex">
                <Users className="size-3" /> {room.players.length}
              </Badge>
              <span className="live-chip">
                <span className="live-dot" /> live
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setPrefs({ sound: !prefs.sound })}
                title={prefs.sound ? "Mute sound" : "Unmute sound"}
                aria-label={prefs.sound ? "Mute sound" : "Unmute sound"}
                className="text-white/60 hover:text-white"
              >
                {prefs.sound ? <Volume2 /> : <VolumeX />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onLeave}
                title="Leave table"
                aria-label="Leave table"
                className="text-white/60 hover:text-white"
              >
                <DoorOpen />
              </Button>
            </div>
          </div>

          <div className="table-rail" data-count={opponents.length} data-dense={denseRail}>
            {opponents.map((player) => (
              <Seat
                key={player.id}
                player={player}
                active={gameView.turnId === player.id}
                deadline={gameView.turnId === player.id ? gameView.deadline : undefined}
                offset={offset}
                dense={denseRail}
                emote={emotes.findLast((event) => event.playerId === player.id)?.emote}
                className="table-rail-seat"
              />
            ))}
          </div>

          <div className="play-zone">
            <AnimatePresence>
              {turnFlash ? (
                <motion.div
                  key="turn-flash"
                  className="turn-flash"
                  aria-hidden
                  initial={{ opacity: 0, scale: 0.94, filter: "blur(10px)" }}
                  animate={{ opacity: 0.34, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 1.04, filter: "blur(8px)" }}
                  transition={spring.gentle}
                >
                  YOUR TURN
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="action-banner-slot" role="status" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                {banner ? (
                  <motion.div
                    key={banner.id}
                    className="action-banner"
                    style={{ "--accent": bannerAccent } as CSSProperties}
                    initial={{ opacity: 0, y: -14, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={spring.snappy}
                  >
                    <span className="action-banner-icon">
                      {banner.entry.card ? (
                        <CardFace
                          card={banner.entry.card}
                          style={{ "--cw": "26px" } as CSSProperties}
                          label={cardLabel(banner.entry.card)}
                        />
                      ) : (
                        <BannerIcon entry={banner.entry} />
                      )}
                    </span>
                    <span className="action-banner-text">{logText(banner.entry, room.players)}</span>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <motion.div
              className="direction-orbit"
              aria-hidden
              animate={{ rotate: gameView.dir === 1 ? 360 : -360 }}
              transition={{ duration: 64, repeat: Infinity, ease: "linear" }}
            >
              <span className="direction-orbit-tick" />
            </motion.div>

            <div className="play-piles">
              <div className="pile-column">
                <span className="pile-label">draw</span>
                <div className="deck-wrap">
                  <motion.button
                    ref={deckRef}
                    type="button"
                    onClick={draw}
                    disabled={!canDraw}
                    className={cn("deck-button", canDraw && "deck-ready", gameView.pending > 0 && "deck-stacked")}
                    animate={gameView.pending > 0 ? { rotate: [0, -1.4, 1.4, 0] } : { rotate: 0 }}
                    transition={gameView.pending > 0 ? { duration: 1.9, repeat: Infinity, ease: "easeInOut" } : { duration: 0.25 }}
                    aria-label={gameView.pending > 0 ? `Take ${gameView.pending} cards` : "Draw a card"}
                    title={gameView.pending > 0 ? `Take ${gameView.pending} cards` : "Draw a card"}
                  >
                    <span className="deck-stack-edge" aria-hidden />
                    <CardBack
                      back={deckBack}
                      style={{ "--cw": "clamp(74px, 8vw, 104px)" } as CSSProperties}
                      className="deck-card"
                    />
                    <motion.span
                    key={gameView.drawCount}
                    className="deck-count"
                    initial={{ scale: 0.55, opacity: 0.4 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={spring.bouncy}
                  >
                    {gameView.drawCount}
                  </motion.span>
                    {gameView.pending > 0 ? <span className="deck-pending">+{gameView.pending}</span> : null}
                    {canDraw ? (
                      <motion.span
                        className="deck-ready-ring"
                        initial={{ opacity: 0.7, scale: 0.9 }}
                        animate={{ opacity: [0.65, 0.15, 0.65], scale: [1, 1.12, 1] }}
                        transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
                        aria-hidden
                      />
                    ) : null}
                  </motion.button>
                  <span className="deck-hint">{canDraw ? "tap to draw" : `${gameView.drawCount} left`}</span>
                </div>
              </div>

              <div className="pile-column pile-discard" ref={discardRef}>
                <span className="pile-label">discard</span>
                <div className="discard-wrap">
                  <motion.span
                    className="discard-aura"
                    animate={{ backgroundColor: currentColor.hex, opacity: [0.16, 0.28, 0.16] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                    aria-hidden
                  />
                  <AnimatePresence>
                    {colorFlash ? (
                      <motion.span
                        key={colorFlash.id}
                        className="color-splash"
                        style={{ background: `radial-gradient(circle, ${colorFlash.hex}, transparent 70%)` }}
                        initial={{ opacity: 0.7, scale: 0.5 }}
                        animate={{ opacity: 0, scale: 1.7 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.85, ease: easeOutExpo }}
                        aria-hidden
                      />
                    ) : null}
                  </AnimatePresence>
                  <motion.div
                    key={gameView.top.id}
                    layoutId={`${layerId}-card-${gameView.top.id}`}
                    className="discard-card"
                    transition={spring.smooth}
                    initial={{ scale: 0.82, rotate: -5, opacity: 0.6 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  >
                    <CardFace
                      card={gameView.top}
                      style={{ "--cw": "clamp(86px, 9.2vw, 116px)" } as CSSProperties}
                      label={cardLabel(gameView.top)}
                    />
                  </motion.div>
                </div>
                <span className="pile-hint">
                  <span className="turn-color-dot" style={{ background: currentColor.hex, boxShadow: `0 0 10px ${currentColor.hex}` }} />
                  {currentColor.label}
                </span>
              </div>
            </div>

            <TurnStatus
              room={room}
              isMyTurn={isMyTurn}
              currentName={current?.name ?? "someone"}
              offset={offset}
              mustDraw={mustDraw}
            />
          </div>

          <div className="event-ticker" aria-hidden>
            {recentLogs.map((entry) => (
              <div key={entry.id} className="event-ticker-row">
                <span className="event-ticker-icon">
                  <BannerIcon entry={entry} />
                </span>
                <span className="truncate">{logText(entry, room.players)}</span>
              </div>
            ))}
          </div>

          <WinEffect effect={gameView.phase === "ended" ? winnerEffect : null} />
        </div>

        <div className="hand-panel" ref={handPanelRef}>
          <div className="hand-header">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="relative">
                <Avatar id={me?.avatar ?? "rook"} size={32} />
                <AnimatePresence>
                  {selfEmote ? (
                    <motion.span
                      key={selfEmote.key}
                      className="self-emote"
                      initial={{ opacity: 0, y: 6, scale: 0.6 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.8 }}
                      transition={spring.bouncy}
                    >
                      {EMOTES.find((entry) => entry.id === selfEmote.emote)?.glyph ?? "??"}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <NameEffect effect={me?.nameEffect} className="max-w-[180px] text-sm font-semibold">
                    {me?.name ?? "You"}
                  </NameEffect>
                  {me?.host ? <Badge variant="outline" className="hidden sm:inline-flex">host</Badge> : null}
                </div>
                <div className="hand-meta">
                  <span>{hand.length} cards</span>
                  <span className="text-white/15">·</span>
                  <span>Lv {me?.level ?? 1}</span>
                  {isMyTurn ? <span className="hand-turn">your turn</span> : null}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setSorted((value) => !value)} title="Sort hand">
                <ArrowUpDown /> <span className="hidden sm:inline">Sort</span>
              </Button>
              <Button
                size="sm"
                variant={mustDraw ? "brand" : "outline"}
                disabled={!canDraw}
                onClick={draw}
                title="Draw a card"
                className={cn(mustDraw && "draw-button-ready")}
              >
                <Layers /> {gameView.pending > 0 ? `Take +${gameView.pending}` : "Draw"}
              </Button>
              <Button size="sm" variant="outline" disabled={!isMyTurn || !gameView.drawnCardId} onClick={pass}>
                Pass
              </Button>
            </div>
          </div>

          <div className="my-hand-scroll">
            <div className="my-hand-row">
              {hand.map((card, index) => {
                const playable = playableIds.has(card.id);
                const jumpable = jumpableIds.has(card.id) || (canSwapIn && card.kind === "swap");
                const drawn = gameView.drawnCardId === card.id;
                const middle = (hand.length - 1) / 2;
                return (
                  <motion.div
                    key={card.id}
                    layout
                    layoutId={`${layerId}-card-${card.id}`}
                    className="my-hand-slot"
                    data-playable={playable || jumpable}
                    style={{
                      marginLeft: index === 0 ? 0 : -overlap,
                      zIndex: index + 1,
                    }}
                    initial={{ opacity: 0, y: 26, scale: 0.92, rotate: -2 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      rotate: hand.length > 3 ? (index - middle) * 0.7 : 0,
                    }}
                    transition={{ ...spring.snappy, delay: Math.min(index * 0.018, 0.18) }}
                    whileTap={{ scale: 0.96 }}
                  >
                    <CardFace
                      card={card}
                      playable={playable || jumpable}
                      muted={!playable && !jumpable && gameView.phase === "playing"}
                      drawn={drawn}
                      className={cn(wiggle === card.id && "pcard-wiggle")}
                      onClick={() => onCard(card)}
                      label={cardLabel(card)}
                    />
                  </motion.div>
                );
              })}
              {hand.length === 0 ? (
                <div className="py-10 text-xs text-muted-foreground">No cards. Either you won or something went very wrong.</div>
              ) : null}
            </div>
          </div>

          <div className="hand-footer">
            <div className="hand-context">
              <span className={cn("hand-context-dot", isMyTurn && "is-live")} />
              {isMyTurn
                ? gameView.drawnCardId
                  ? "Play the card you drew, or pass."
                  : mustDraw
                    ? "Nothing matches — the deck is waiting."
                    : "Pick a highlighted card."
                : `${current?.name ?? "Someone"} is choosing…`}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <AnimatePresence initial={false}>
                {!isMyTurn && gameView.lastCard && jumpWindow > 0 ? (
                  <JumpPrompt key="jump" room={room} hand={hand} offset={offset} />
                ) : null}
                {canSwapIn && swapInCard ? (
                  <motion.div
                    key="swap-in"
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={spring.snappy}
                  >
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
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
            <div className="emote-bar">
              {EMOTES.map((emote) => (
                <button
                  key={emote.id}
                  type="button"
                  onClick={() => client.emote(emote.id)}
                  title={emote.label}
                  aria-label={emote.label}
                  className="emote-button"
                >
                  {emote.glyph}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flyer-layer" aria-hidden>
          <AnimatePresence>
            {flyers.map((flyer) => (
              <motion.div
                key={flyer.id}
                className={cn("card-flyer", flyer.glow && "card-flyer-glow")}
                style={flyer.glow ? ({ "--glow": flyer.glow } as CSSProperties) : undefined}
                initial={{ x: flyer.from.x, y: flyer.from.y, scale: flyer.scale, rotate: flyer.spin, opacity: 0 }}
                animate={{
                  x: [flyer.from.x, (flyer.from.x + flyer.to.x) / 2, flyer.to.x],
                  y: [flyer.from.y, Math.min(flyer.from.y, flyer.to.y) - 34, flyer.to.y],
                  scale: [flyer.scale, 1.04, 1],
                  rotate: [flyer.spin, 0, 0],
                  opacity: [0, 1, 1],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: flyer.duration, delay: flyer.delay, ease: easeOutExpo as unknown as [number, number, number, number], times: [0, 0.55, 1] }}
                onAnimationComplete={() => removeFlyer(flyer.id)}
              >
                {flyer.card ? (
                  <CardFace card={flyer.card} style={{ "--cw": "clamp(76px, 7vw, 96px)" } as CSSProperties} />
                ) : (
                  <CardBack back={flyer.back ?? deckBack} style={{ "--cw": "54px" } as CSSProperties} />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      <ColorDialog
        card={colorCard}
        open={Boolean(colorCard)}
        onOpenChange={(open) => (!open ? setColorCard(null) : undefined)}
        onPick={pickColor}
      />
      <SwapDialog
        card={swapCard}
        open={Boolean(swapCard)}
        onOpenChange={(open) => (!open ? setSwapCard(null) : undefined)}
        players={room.players}
        meId={meId}
        outOfTurn={swapMode === "jump"}
        onConfirm={pickSwap}
      />

      {gameView.phase === "ended" ? (
        <GameOverDialog room={room} onLeave={onLeave} onRematch={() => client.rematch()} />
      ) : null}
    </LayoutGroup>
  );
}
