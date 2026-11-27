import type { Card, CardKind, Color, LogEntry, RoomView } from "@stacked/shared";
import {
  CHAT_LINES_BY_ID,
  CHAT_PACKS,
  COLORS,
  DARK_COLORS,
  DEFAULT_CHAT_PACK_ID,
  EMOTES,
  JUMP_WINDOW_MS,
  KIND_LABEL,
  canJumpInView,
  canPlayCard,
  isDoublyOnlyKind,
} from "@stacked/shared";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ArrowRightLeft,
  ArrowUpDown,
  ChevronRight,
  Coins,
  DoorOpen,
  Eye,
  EyeOff,
  Flame,
  FlaskConical,
  Layers,
  MessageCircle,
  Pencil,
  RefreshCw,
  Repeat2,
  Share2,
  SkipForward,
  Sparkles,
  Timer,
  Users,
  Volume2,
  VolumeX,
  X,
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
import { localizedCardLabel, logText } from "@/lib/format";
import { game as client, useGame, type ChatEvent } from "@/lib/game";
import { useT } from "@/lib/i18n";
import { easeOutExpo, spring } from "@/lib/motion";
import { useSession } from "@/lib/session";
import { playSound } from "@/lib/sound";
import { useCountdown } from "@/lib/use-countdown";
import { cn } from "@/lib/utils";
import { COLOR_META, TableColorPicker, TableSwapPrompt } from "./color-dialog";
import { GameOverDialog } from "./game-over";
import { Seat } from "./seat";
import { WinEffect } from "./win-effect";

const COLOR_ORDER = { red: 0, yellow: 1, green: 2, blue: 3, pink: 4, teal: 5, orange: 6, purple: 7 } as const;
const KIND_ORDER = { skip: 10, reverse: 11, draw2: 12, draw10: 13, skipAll: 14, flip: 15, wild: 16, wild4: 17, swap: 18 } as const;

function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const colorA = a.color ? COLOR_ORDER[a.color] : 8;
    const colorB = b.color ? COLOR_ORDER[b.color] : 8;
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
    case "skip_all":
      return <SkipForward className={className} />;
    case "reverse":
      return <Repeat2 className={className} />;
    case "flip":
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

function ColorLabel({ color }: { color: Color }) {
  const t = useT();
  const meta = COLOR_META[color];
  return (
    <motion.span
      key={color}
      className="color-live-label"
      initial={{ opacity: 0, y: 5, scale: 0.7 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring.bouncy}
    >
      <motion.span
        className="color-live-ring"
        style={{ borderColor: meta.hex }}
        initial={{ opacity: 0.8, scale: 0.45 }}
        animate={{ opacity: 0, scale: 1.9 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        aria-hidden
      />
      <motion.span
        className="turn-color-dot"
        style={{ background: meta.hex, boxShadow: `0 0 14px ${meta.hex}` }}
        initial={{ scale: 0.4 }}
        animate={{ scale: [0.7, 1.6, 1] }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      />
      <span style={{ textShadow: `0 0 16px ${meta.hex}66` }}>{t(meta.label)}</span>
    </motion.span>
  );
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
  const t = useT();
  const game = room.game;
  const left = useCountdown(game?.deadline, offset, game?.phase === "playing");
  const initial = useMemo(() => Math.max(120, left), [game?.deadline]);
  if (!game) return null;
  const seconds = Math.ceil(left / 1000);

  const hint = game.pending > 0
    ? t("+{n} stacked — play another draw card or take the pile", { n: game.pending })
    : isMyTurn
      ? game.drawnCardId
        ? t("You drew — play that card or pass")
        : mustDraw
          ? t("No match — draw a card")
          : t("Play a matching card, or draw")
      : t("Waiting for {name}…", { name: currentName });

  return (
    <div className="turn-status">
      <div className="turn-status-row">
        <span className="turn-status-live" data-active={isMyTurn} />
        {isMyTurn ? null : (
          <span className="turn-status-name" aria-live="polite">
            {t("{name}'s turn", { name: currentName })}
          </span>
        )}
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
          <ColorLabel color={game.color} />
          <span className="text-white/15">·</span>
          <RefreshCw className={cn("size-4", game.dir === -1 && "rotate-180")} />
          {game.dir === 1 ? t("clockwise") : t("counter-clockwise")}
          {room.rules.gameMode === "doubly" ? (
            <>
              <span className="text-white/15">·</span>
              <Repeat2 className="size-4" />
              {t(game.side === "dark" ? "Flipped side" : "Normal side")}
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function JumpPrompt({ room, hand, offset }: { room: RoomView; hand: Card[]; offset: number }) {
  const t = useT();
  const game = room.game;
  const [now, setNow] = useState(() => Date.now() + offset);

  useEffect(() => {
    if (!game?.lastCard) return;
    const timer = window.setInterval(() => setNow(Date.now() + offset), 250);
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
  const remaining = Math.max(0, JUMP_WINDOW_MS - (now - game.lastPlayAt));
  if (remaining <= 0) return null;
  const seconds = Math.max(1, Math.ceil(remaining / 1000));
  const percent = Math.max(0, Math.min(100, (remaining / JUMP_WINDOW_MS) * 100));

  return (
    <motion.div
      className="jump-banner"
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={spring.snappy}
    >
      <span className="jump-banner-icon">
        <Zap className="size-4" />
      </span>
      <div className="jump-banner-copy">
        <p className="jump-banner-title">{t("Intervention available!")}</p>
        <p className="jump-banner-text">
          {t("Play your matching card now — the window closes in {n}s.", { n: seconds })}
        </p>
      </div>
      <span className="jump-banner-card">
        <CardFace card={card} style={{ "--cw": "32px" } as CSSProperties} />
      </span>
      <Button
        variant="brand"
        size="sm"
        className="jump-banner-button gap-1.5"
        onClick={() => client.action({ type: "jump", cardId: card.id })}
      >
        <Zap className="size-3.5" />
        {t("Jump in now")}
      </Button>
      <span className="jump-banner-progress" aria-hidden>
        <span style={{ width: `${percent}%` }} />
      </span>
    </motion.div>
  );
}

export function GameTable({ room, onLeave }: { room: RoomView; onLeave: () => void }) {
  const gameView = room.game;
  const { emotes, offset, status, chats } = useGame();
  const { session } = useSession();
  const t = useT();
  const prefs = usePrefs();
  const reducedMotion = prefs.reducedMotion;
  const [colorCard, setColorCard] = useState<Card | null>(null);
  const [swapCard, setSwapCard] = useState<Card | null>(null);
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);
  const [swapMode, setSwapMode] = useState<"play" | "jump">("play");
  const [sorted, setSorted] = useState(true);
  const [wiggle, setWiggle] = useState<string | null>(null);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [colorFlash, setColorFlash] = useState<{ id: number; hex: string } | null>(null);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [xray, setXray] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editKind, setEditKind] = useState<CardKind>("number");
  const [editColor, setEditColor] = useState<Color | null>("red");
  const [editValue, setEditValue] = useState(1);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPackId, setChatPackId] = useState(DEFAULT_CHAT_PACK_ID);

  const stageRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const handPanelRef = useRef<HTMLDivElement>(null);
  const lastLogRef = useRef<number | null>(null);
  const gameStartRef = useRef<number | null>(null);
  const ownerRoundRef = useRef<number | null>(null);
  const flyerCounter = useRef(0);
  const bannerCounter = useRef(0);
  const flashCounter = useRef(0);
  const stageCenter = useStageGeometry(stageRef);

  const meId = room.you.id;
  const me = room.players.find((player) => player.id === meId);
  const sideColors: readonly Color[] = gameView?.side === "dark" ? DARK_COLORS : COLORS;
  const ownerMode = Boolean(me?.owner && prefs.ownerCheats && room.rules.wager === 0);
  const canEditHand = Boolean(
    ownerMode &&
      gameView?.phase === "playing" &&
      !(gameView.turnId === meId && gameView.drawnCardId),
  );
  const revealedHands = ownerMode && xray ? room.ownerHands : undefined;
  const chatPackIds = useMemo(
    () => new Set(session?.chatPacks ?? [DEFAULT_CHAT_PACK_ID]),
    [session?.chatPacks],
  );
  const availableChatPacks = useMemo(
    () => CHAT_PACKS.filter((entry) => chatPackIds.has(entry.id)),
    [chatPackIds],
  );
  const activeChatPack =
    availableChatPacks.find((entry) => entry.id === chatPackId) ??
    availableChatPacks[0] ??
    CHAT_PACKS[0]!;
  const latestChats = useMemo(() => {
    const map = new Map<string, ChatEvent>();
    for (const entry of chats) map.set(entry.playerId, entry);
    return map;
  }, [chats]);
  const selfChat = chatFor(meId);
  const selfEmote = emotes.findLast((event) => event.playerId === meId);
  const isMyTurn = gameView?.turnId === meId;
  const current = room.players.find((player) => player.id === gameView?.turnId);
  const tableId = room.players.find((player) => player.host)?.table ?? me?.table ?? "noir";
  const winnerPlayer = room.players.find((player) => player.id === gameView?.winner);
  const winnerEffect = winnerPlayer?.winEffect ?? "none";
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
    if (myIndex < 0) return [...room.players];
    return [...room.players.slice(myIndex + 1), ...room.players.slice(0, myIndex)];
  }, [room.players, meId]);
  const swapTargets = opponents.filter((player) => player.cardCount > 0);
  const onlySwapTarget = swapTargets.length === 1 ? swapTargets[0] : null;
  const swapTarget = swapCard ? room.players.find((player) => player.id === swapTargetId) ?? null : null;
  const targetingSwap = Boolean(swapCard && !swapTargetId);
  const pickerCard = swapCard ? (swapTargetId ? swapCard : null) : colorCard;
  const pickerSubtitle = swapCard && swapTarget
    ? t("Swapping hands with {name}. Choose the colour that follows.", { name: swapTarget.name })
    : null;
  const canPass = Boolean(isMyTurn && gameView?.drawnCardId && gameView?.phase === "playing");
  const denseRail = opponents.length > 4;
  const layerId = gameView ? `round-${gameView.startedAt}` : "round";

  function clearTableChoice() {
    setColorCard(null);
    setSwapCard(null);
    setSwapTargetId(null);
  }

  function beginSwap(card: Card, mode: "play" | "jump") {
    setSwapMode(mode);
    setColorCard(null);
    setSwapCard(card);
    setSwapTargetId(onlySwapTarget?.id ?? null);
    playSound("swap");
  }

  function nudge(card: Card) {
    setWiggle(card.id);
    playSound("error");
    window.setTimeout(() => setWiggle((currentId) => (currentId === card.id ? null : currentId)), 320);
  }

  function onCard(card: Card) {
    if (gameView?.phase !== "playing") return;
    // A colour call or a swap target is pending: finish it or cancel first.
    if (colorCard || swapCard) return;
    if (isMyTurn) {
      if (gameView.drawnCardId && card.id !== gameView.drawnCardId) {
        toast.info(t("You can only play the card you drew, or pass."));
        nudge(card);
        return;
      }
      if (!playableIds.has(card.id)) {
        nudge(card);
        return;
      }
      if (card.kind === "wild" || card.kind === "wild4") {
        setSwapCard(null);
        setSwapTargetId(null);
        setColorCard(card);
        playSound("wild");
        return;
      }
      if (card.kind === "swap") {
        if (swapTargets.length === 0) {
          toast.info(t("No one has cards to swap with."));
          nudge(card);
          return;
        }
        beginSwap(card, "play");
        return;
      }
      client.action({ type: "play", cardId: card.id });
      return;
    }
    if (card.kind === "swap" && canSwapIn) {
      if (swapTargets.length === 0) {
        toast.info(t("No one has cards to swap with."));
        nudge(card);
        return;
      }
      beginSwap(card, "jump");
      return;
    }
    if (jumpableIds.has(card.id)) {
      client.action({ type: "jump", cardId: card.id });
      return;
    }
    nudge(card);
  }

  function pickSwapTarget(playerId: string) {
    if (!swapCard) return;
    setSwapTargetId(playerId);
    playSound("equip");
  }

  function pickColor(color: Color) {
    if (swapCard) {
      const targetId = swapTargetId ?? onlySwapTarget?.id;
      if (!targetId) return;
      client.action({ type: swapMode, cardId: swapCard.id, color, targetId });
      clearTableChoice();
      return;
    }
    if (!colorCard) return;
    const isJump = jumpableIds.has(colorCard.id) && !isMyTurn;
    client.action({ type: isJump ? "jump" : "play", cardId: colorCard.id, color });
    clearTableChoice();
  }

  function chatFor(playerId: string): { key: number; text: string } | undefined {
    const event = latestChats.get(playerId);
    if (!event) return undefined;
    const line = CHAT_LINES_BY_ID.get(event.lineId);
    return line ? { key: event.key, text: t(line.text) } : undefined;
  }

  function toggleChat() {
    if (!chatOpen) setOwnerOpen(false);
    setChatOpen((value) => !value);
  }

  function sendChat(lineId: string) {
    client.chat(lineId);
    setChatOpen(false);
  }

  function closeOwnerPanel() {
    setOwnerOpen(false);
    if (xray) {
      setXray(false);
      client.ownerAction({ type: "peek", enabled: false });
    }
  }

  function toggleXray() {
    const next = !xray;
    setXray(next);
    if (next && gameView) ownerRoundRef.current = gameView.startedAt;
    client.ownerAction({ type: "peek", enabled: next });
  }

  function openEditor(card: Card) {
    const wild = card.kind === "wild" || card.kind === "wild4" || card.kind === "swap";
    setEditId(card.id);
    setEditKind(card.kind);
    setEditColor(wild ? null : (card.color ?? sideColors[0] ?? "red"));
    setEditValue(card.value ?? 1);
  }

  function changeEditKind(kind: CardKind) {
    const wild = kind === "wild" || kind === "wild4" || kind === "swap";
    setEditKind(kind);
    setEditColor(wild ? null : (editColor ?? sideColors[0] ?? "red"));
  }

  function applyEdit() {
    if (!editId) return;
    const wild = editKind === "wild" || editKind === "wild4" || editKind === "swap";
    client.ownerAction({
      type: "replace",
      cardId: editId,
      card: {
        color: wild ? null : (editColor ?? sideColors[0] ?? "red"),
        kind: editKind,
        value: editKind === "number" ? editValue : null,
      },
    });
    setEditId(null);
  }

  function draw() {
    if (!canDraw || colorCard || swapCard) return;
    client.action({ type: "draw" });
  }

  function pass() {
    if (!canPass || colorCard || swapCard) return;
    client.action({ type: "pass" });
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${room.code}`);
      toast.success(t("Invite link copied."));
    } catch {
      toast.error(t("Room code: {code}", { code: room.code }));
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
    if (last.kind === "play" || last.kind === "jump") {
      if (last.kind === "jump") playSound("jump");
      else if (last.card?.kind === "swap") playSound("swap");
      else if (last.card?.kind === "wild" || last.card?.kind === "wild4") playSound("wild");
      else if (last.card?.kind === "draw2") playSound("stack");
      else playSound("play");
    } else if (last.kind === "draw" || last.kind === "no_play") playSound("draw");
    else if (last.kind === "draw_penalty") playSound("stack");
    else if (last.kind === "deal") playSound("deal");
    else if (last.kind === "swap" || last.kind === "rotate") playSound("swap");
    else if (last.kind === "skip" || last.kind === "reverse") playSound("play");
    else if (last.kind === "reshuffle") playSound("shuffle");
    else if (last.kind === "timeout") playSound("tick");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameView?.log[gameView.log.length - 1]?.id]);

  useEffect(() => {
    setColorCard(null);
    setSwapCard(null);
    setSwapTargetId(null);
    setEditId(null);
  }, [gameView?.startedAt, gameView?.phase]);

  // An out-of-turn swap has to land inside the jump window.
  useEffect(() => {
    if (!swapCard || swapMode !== "jump") return;
    const remaining = (gameView?.lastPlayAt ?? 0) + 5000 - (Date.now() + offset);
    if (remaining <= 0) {
      setSwapCard(null);
      setSwapTargetId(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setSwapCard(null);
      setSwapTargetId(null);
    }, remaining + 60);
    return () => window.clearTimeout(timer);
  }, [swapCard, swapMode, gameView?.lastPlayAt, offset]);

  useEffect(() => {
    if (!isMyTurn || gameView?.phase !== "playing") return;
    playSound("turn");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, gameView?.turnId, gameView?.phase]);

  // Let the winner's effect breathe before the results panel covers the table.
  useEffect(() => {
    if (gameView?.phase !== "ended") {
      setResultsVisible(false);
      return;
    }
    const delay = winnerEffect === "prism-burst" ? 1700 : winnerEffect === "beta-burst" ? 1300 : 250;
    const timer = window.setTimeout(() => setResultsVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [gameView?.phase, gameView?.startedAt, winnerEffect]);

  // The server clears x-ray on every new round; re-request it if still on.
  useEffect(() => {
    if (status !== "open") {
      ownerRoundRef.current = null;
      return;
    }
    if (!me?.owner || !prefs.ownerCheats || !xray || !gameView) return;
    if (ownerRoundRef.current === gameView.startedAt) return;
    ownerRoundRef.current = gameView.startedAt;
    client.ownerAction({ type: "peek", enabled: true });
  }, [status, me?.owner, prefs.ownerCheats, xray, gameView?.startedAt]);

  // Keep the x-ray lease alive; the server re-checks the owner flag each time.
  useEffect(() => {
    if (!me?.owner || !prefs.ownerCheats || !xray || !gameView) return;
    const timer = window.setInterval(() => client.ownerAction({ type: "peek", enabled: true }), 45_000);
    return () => window.clearInterval(timer);
  }, [me?.owner, prefs.ownerCheats, xray, gameView?.startedAt]);

  // Turning the master switch off drops x-ray immediately.
  useEffect(() => {
    if (!me?.owner || prefs.ownerCheats || !xray || !gameView) return;
    setXray(false);
    client.ownerAction({ type: "peek", enabled: false });
  }, [me?.owner, prefs.ownerCheats, xray, gameView?.startedAt]);

  useEffect(() => {
    if (!availableChatPacks.some((entry) => entry.id === chatPackId)) {
      setChatPackId(availableChatPacks[0]?.id ?? DEFAULT_CHAT_PACK_ID);
    }
  }, [availableChatPacks, chatPackId]);

  if (!gameView) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">
        {t("Waiting for the first card…")}
      </div>
    );
  }

  const overlap = hand.length > 16 ? 52 : hand.length > 12 ? 42 : hand.length > 9 ? 30 : hand.length > 6 ? 16 : 5;
  const currentColor = COLOR_META[gameView.color];
  const banner = banners[0];
  const detonating = gameView.phase === "ended" && winnerEffect === "prism-burst";
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
        className={cn("game-stage", room.spectator && "is-spectator")}
        data-side={gameView?.side ?? "light"}
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: easeOutExpo }}
      >
        <div className={cn("table-surface table-surface-live", `felt-${tableId}`, detonating && "table-detonate")}>
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
              <span className="eyebrow hidden sm:inline">{t("table")}</span>
              <button
                type="button"
                onClick={copyInvite}
                className="table-code"
                title={t("Copy invite link")}
              >
                {room.code}
                <Share2 className="size-3" />
              </button>
              <Badge variant="outline" className="hidden items-center gap-1 sm:inline-flex">
                <Users className="size-3" /> {room.players.length}
              </Badge>
              <span className="live-chip">
                <span className="live-dot" /> {t("live")}
              </span>
              {room.frozen ? (
                <Badge variant="warning" className="hidden items-center gap-1 sm:inline-flex">
                  {t("Frozen")}
                </Badge>
              ) : null}
              {room.spectator ? (
                <Badge variant="info" className="hidden items-center gap-1 sm:inline-flex">
                  <Eye className="size-3" /> {t("Spectator")}
                </Badge>
              ) : null}
              {room.rules.wager > 0 ? (
                <Badge variant="warning" className="hidden items-center gap-1 sm:inline-flex">
                  <Coins className="size-3" /> {t("{n} coin wager", { n: room.rules.wager })}
                </Badge>
              ) : null}
              {room.rules.gameMode === "doubly" ? (
                <Badge
                  variant={gameView?.side === "dark" ? "brand" : "outline"}
                  className="inline-flex items-center gap-1"
                  title={t("In Doubly Stacked, opponents see the other side of your hand.")}
                >
                  <Repeat2 className="size-3" /> {t(gameView?.side === "dark" ? "Flipped side" : "Normal side")}
                </Badge>
              ) : null}
              {room.rules.teamMode === "2v2" && me?.team !== null && me?.team !== undefined ? (
                <Badge
                  variant={me.team === 0 ? "brand" : "info"}
                  className="inline-flex items-center gap-1"
                >
                  {t(me.team === 0 ? "Team A" : "Team B")}
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setPrefs({ sound: !prefs.sound })}
                title={prefs.sound ? t("Mute sound") : t("Unmute sound")}
                aria-label={prefs.sound ? t("Mute sound") : t("Unmute sound")}
                className="text-white/60 hover:text-white"
              >
                {prefs.sound ? <Volume2 /> : <VolumeX />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onLeave}
                title={t("Leave table")}
                aria-label={t("Leave table")}
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
                selectable={Boolean(swapCard) && !colorCard && player.cardCount > 0}
                selected={swapTargetId === player.id}
                onSelect={() => pickSwapTarget(player.id)}
                revealedHand={revealedHands?.[player.id]}
                chat={chatFor(player.id)}
                className="table-rail-seat"
              />
            ))}
          </div>

          <div className="play-zone">
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
                          label={localizedCardLabel(banner.entry.card)}
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
              className={cn("direction-orbit", gameView.dir === -1 && "is-reverse")}
              aria-hidden
              animate={{ rotate: gameView.dir === 1 ? 360 : -360 }}
              transition={{ duration: 46, repeat: Infinity, ease: "linear" }}
            >
              <span className="direction-orbit-arrow is-top">
                <svg
                  className="direction-orbit-arrow-glyph"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.2"
                >
                  <path d="M4 12h14M12 6l6 6-6 6" />
                </svg>
              </span>
              <span className="direction-orbit-arrow is-bottom">
                <svg
                  className="direction-orbit-arrow-glyph"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.2"
                >
                  <path d="M4 12h14M12 6l6 6-6 6" />
                </svg>
              </span>
            </motion.div>

            <div className="play-piles">
              <div className="pile-column">
                <span className="pile-label">{t("draw")}</span>
                <div className="deck-wrap">
                  <motion.button
                    ref={deckRef}
                    type="button"
                    onClick={draw}
                    disabled={!canDraw}
                    className={cn("deck-button", canDraw && "deck-ready", gameView.pending > 0 && "deck-stacked")}
                    animate={!reducedMotion && gameView.pending > 0 ? { rotate: [0, -1.4, 1.4, 0] } : { rotate: 0 }}
                    transition={!reducedMotion && gameView.pending > 0 ? { duration: 1.9, repeat: Infinity, ease: "easeInOut" } : { duration: 0.25 }}
                    aria-label={gameView.pending > 0 ? t("Take {n} cards", { n: gameView.pending }) : t("Draw a card")}
                    title={gameView.pending > 0 ? t("Take {n} cards", { n: gameView.pending }) : t("Draw a card")}
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
                        animate={reducedMotion ? { opacity: 0.35, scale: 1 } : { opacity: [0.65, 0.15, 0.65], scale: [1, 1.12, 1] }}
                        transition={reducedMotion ? { duration: 0 } : { duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
                        aria-hidden
                      />
                    ) : null}
                  </motion.button>
                  <span className="deck-hint">
                    {canDraw ? t("tap to draw") : t("{n} left", { n: gameView.drawCount })}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={canPass ? "brand" : "ghost"}
                    disabled={!canPass}
                    onClick={pass}
                    className="deck-pass"
                    title={canPass ? t("Pass your turn") : t("Draw first, then you can pass")}
                  >
                    {t("Pass")}
                  </Button>
                </div>
              </div>

              <div className="pile-column pile-discard" ref={discardRef}>
                <span className="pile-label">{t("discard")}</span>
                <div className="discard-wrap">
                  <motion.span
                    className="discard-aura"
                    animate={
                      reducedMotion
                        ? { backgroundColor: currentColor.hex, opacity: 0.2 }
                        : { backgroundColor: currentColor.hex, opacity: [0.16, 0.28, 0.16] }
                    }
                    transition={reducedMotion ? { duration: 0 } : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
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
                      label={localizedCardLabel(gameView.top)}
                    />
                  </motion.div>
                </div>
                <span className="pile-hint">
                  <ColorLabel color={gameView.color} />
                </span>
              </div>
            </div>

            <TurnStatus
              room={room}
              isMyTurn={isMyTurn}
              currentName={current?.name ?? t("someone")}
              offset={offset}
              mustDraw={mustDraw}
            />

            {targetingSwap ? (
              <TableSwapPrompt
                card={swapCard}
                title={
                  swapMode === "jump"
                    ? t("Swap in! Pick a player before the window closes.")
                    : t("Pick a player to swap hands with")
                }
                onCancel={clearTableChoice}
              />
            ) : null}

            {pickerCard ? (
              <TableColorPicker
                card={pickerCard}
                eyebrow={swapCard ? t("Swap hands") : t("Choose a colour")}
                subtitle={pickerSubtitle}
                colors={sideColors}
                onPick={pickColor}
                onCancel={clearTableChoice}
              />
            ) : null}
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
                {selfChat ? (
                  <span key={selfChat.key} className="self-chat">
                    {selfChat.text}
                  </span>
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <NameEffect effect={me?.nameEffect} className="max-w-[180px] text-sm font-semibold">
                    {me?.name ?? t("You")}
                  </NameEffect>
                  {me?.host ? <Badge variant="outline" className="hidden sm:inline-flex">{t("host")}</Badge> : null}
                </div>
                <div className="hand-meta">
                  <span>{t(hand.length === 1 ? "{n} card" : "{n} cards", { n: hand.length })}</span>
                  <span className="text-white/15">·</span>
                  <span>{t("Lv {n}", { n: me?.level ?? 1 })}</span>
                  {isMyTurn ? <span className="hand-turn">{t("your turn")}</span> : null}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Button
                  variant={chatOpen ? "brand" : "ghost"}
                  size="sm"
                  onClick={toggleChat}
                  title={t("Quick chat")}
                  className="gap-1.5"
                >
                  <MessageCircle /> <span className="hidden sm:inline">{t("Chat")}</span>
                </Button>
                {chatOpen ? (
                  <div className="chat-popover" role="dialog" aria-label={t("Quick chat")}>
                    <div className="chat-popover-head">
                      <div>
                        <p className="text-base font-semibold tracking-[-0.02em]">{t("Quick chat")}</p>
                        <p className="text-[11px] text-muted-foreground">{t("Only preset lines. No free text.")}</p>
                      </div>
                      <Button size="icon-sm" variant="ghost" onClick={() => setChatOpen(false)} aria-label={t("Close")}>
                        <X />
                      </Button>
                    </div>
                    <label className="chat-pack-field">
                      <span className="eyebrow">{t("Pack")}</span>
                      <select value={activeChatPack.id} onChange={(event) => setChatPackId(event.target.value)}>
                        {availableChatPacks.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {t(entry.name)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="chat-lines">
                      {activeChatPack.lines.map((line) => (
                        <button
                          key={line.id}
                          type="button"
                          className="chat-line-button"
                          onClick={() => sendChat(line.id)}
                        >
                          {t(line.text)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              {ownerMode ? (
                <Button
                  variant={ownerOpen ? "brand" : "ghost"}
                  size="sm"
                  onClick={() => (ownerOpen ? closeOwnerPanel() : (setChatOpen(false), setOwnerOpen(true)))}
                  title={t("Owner tools")}
                  className="gap-1.5"
                >
                  <FlaskConical /> <span className="hidden sm:inline">{t("Owner")}</span>
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setSorted((value) => !value)} title={t("Sort hand")}>
                <ArrowUpDown /> <span className="hidden sm:inline">{t("Sort")}</span>
              </Button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {!isMyTurn && gameView.lastCard && jumpWindow > 0 ? (
              <JumpPrompt key="jump" room={room} hand={hand} offset={offset} />
            ) : null}
          </AnimatePresence>

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
                    data-jumpable={jumpable}
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
                      label={localizedCardLabel(card)}
                    />
                  </motion.div>
                );
              })}
              {hand.length === 0 ? (
                <div className="py-10 text-xs text-muted-foreground">{t("No cards. Either you won or something went very wrong.")}</div>
              ) : null}
            </div>
          </div>

          <div className="hand-footer">
            <div className="hand-context">
              <span className={cn("hand-context-dot", isMyTurn && "is-live")} />
              {isMyTurn
                ? gameView.drawnCardId
                  ? t("Play the card you drew, or pass.")
                  : mustDraw
                    ? t("Nothing matches — the deck is waiting.")
                    : t("Pick a highlighted card.")
                : jumpableIds.size > 0 && jumpWindow > 0
                  ? t("Intervention! Play your matching card now.")
                  : t("{name} is choosing…", { name: current?.name ?? t("Someone") })}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <AnimatePresence initial={false}>
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
                      onClick={() => beginSwap(swapInCard, "jump")}
                    >
                      <Zap className="size-3.5" /> {t("Swap in")}
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
                  title={t(emote.label)}
                  aria-label={t(emote.label)}
                  className="emote-button"
                >
                  {emote.glyph}
                </button>
              ))}
            </div>
          </div>
        </div>

        {ownerMode && ownerOpen ? (
          <div className="owner-panel" role="dialog" aria-label={t("Owner tools")}>
            <div className="owner-panel-head">
              <div>
                <p className="eyebrow">{t("Owner tools")}</p>
                <p className="owner-panel-sub">
                  {t("Silent to the table. Cheat-assisted rounds do not pay you XP or coins.")}
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" onClick={closeOwnerPanel} aria-label={t("Close")}>
                <X />
              </Button>
            </div>

            <div className="owner-panel-section">
              <p className="eyebrow">{t("Table controls")}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="xs"
                  variant={room.frozen ? "brand" : "outline"}
                  onClick={() => client.ownerAction({ type: "freeze", frozen: !room.frozen })}
                >
                  {room.frozen ? t("Resume") : t("Freeze")}
                </Button>
                <Button size="xs" variant="outline" onClick={() => client.ownerAction({ type: "lobby" })}>
                  {t("Return to lobby")}
                </Button>
                <Button
                  size="xs"
                  variant="destructive"
                  onClick={() => client.ownerAction({ type: "close" })}
                >
                  {t("Close table")}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sideColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={cn("owner-swatch", COLOR_META[color].className)}
                    onClick={() => client.ownerAction({ type: "color", color })}
                    aria-label={t(COLOR_META[color].label)}
                    title={t(COLOR_META[color].label)}
                  />
                ))}
              </div>
            </div>

            <div className="owner-panel-row">
              <span className="flex items-center gap-2 text-xs">
                {xray ? <EyeOff className="size-3.5 text-info" /> : <Eye className="size-3.5 text-muted-foreground" />}
                {t("X-ray hands")}
              </span>
              <Button size="xs" variant={xray ? "brand" : "outline"} onClick={toggleXray}>
                {xray ? t("On") : t("Off")}
              </Button>
            </div>

            <div className="owner-panel-section">
              <p className="eyebrow">{t("Edit your hand")}</p>
              {!canEditHand ? (
                <p className="owner-panel-hint">{t("Available during play, except after you draw.")}</p>
              ) : null}
              <div className="owner-hand-list">
                {room.you.hand.map((card) => (
                  <div key={card.id} className={cn("owner-hand-row", editId === card.id && "is-editing")}>
                    <CardFace card={card} style={{ "--cw": "30px" } as CSSProperties} />
                    <span className="owner-hand-label">{localizedCardLabel(card)}</span>
                    <Button size="xs" variant="outline" disabled={!canEditHand} onClick={() => openEditor(card)}>
                      <Pencil /> {t("Edit")}
                    </Button>
                  </div>
                ))}
              </div>

              {editId ? (
                <div className="owner-editor">
                  <label className="owner-editor-field">
                    <span>{t("Card")}</span>
                    <select value={editKind} onChange={(event) => changeEditKind(event.target.value as CardKind)}>
                      {(Object.keys(KIND_LABEL) as CardKind[])
                        .filter((kind) => room.rules.gameMode === "doubly" || !isDoublyOnlyKind(kind))
                        .map((kind) => (
                          <option key={kind} value={kind}>
                            {t(KIND_LABEL[kind])}
                          </option>
                        ))}
                    </select>
                  </label>

                  {editKind === "number" ? (
                    <label className="owner-editor-field">
                      <span>{t("Value")}</span>
                      <select value={editValue} onChange={(event) => setEditValue(Number(event.target.value))}>
                        {Array.from({ length: 10 }, (_, value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {editKind === "number" || editKind === "skip" || editKind === "reverse" || editKind === "draw2" || editKind === "draw10" || editKind === "skipAll" || editKind === "flip" ? (
                    <div className="owner-editor-colors">
                      {sideColors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={cn("owner-swatch", COLOR_META[color].className, editColor === color && "is-on")}
                          onClick={() => setEditColor(color)}
                          aria-label={t(COLOR_META[color].label)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="owner-panel-hint">{t("Wild cards keep their colour call for the table.")}</p>
                  )}

                  <div className="owner-editor-actions">
                    <Button size="xs" variant="ghost" onClick={() => setEditId(null)}>
                      {t("Cancel")}
                    </Button>
                    <Button size="xs" variant="brand" onClick={applyEdit}>
                      {t("Replace card")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            {xray ? (
              <div className="owner-panel-section">
                <p className="eyebrow">{t("Opponents")}</p>
                <div className="owner-hand-list">
                  {opponents.map((player) => (
                    <div key={player.id} className="owner-xray-row">
                      <span className="owner-hand-label">{player.name}</span>
                      <div className="owner-xray-cards">
                        {(room.ownerHands?.[player.id] ?? []).map((card) => (
                          <span
                            key={card.id}
                            className="owner-xray-card"
                            data-color={card.color ?? "wild"}
                          >
                            {localizedCardLabel(card)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

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

      {gameView.phase === "ended" && resultsVisible ? (
        room.spectator ? (
          <div className="spectator-overlay" role="dialog" aria-label={t("Game over")}>
            <div className="panel rounded-2xl p-6 text-center">
              <p className="eyebrow">{t("Game over")}</p>
              <p className="mt-2 text-xl font-semibold">
                {winnerPlayer ? t("{name} won", { name: winnerPlayer.name }) : t("No winner")}
              </p>
              <Button variant="outline" className="mt-4" onClick={onLeave}>
                {t("Leave table")}
              </Button>
            </div>
          </div>
        ) : (
          <GameOverDialog
            room={room}
            onLeave={onLeave}
            onRematch={() => client.rematch()}
            onLobby={() => client.toLobby()}
          />
        )
      ) : null}
    </LayoutGroup>
  );
}
