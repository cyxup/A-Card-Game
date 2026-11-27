import type { GameRules, RoomSummary } from "@stacked/shared";
import { ArrowRight, Coins, DoorOpen, Hash, Layers, ListFilter, Loader2, Plus, RefreshCw, Repeat2, Settings2, Users, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { askForName } from "@/components/auth/guest-prompt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { game, useGame } from "@/lib/game";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const DEFAULT_RULES: Partial<GameRules> = {
  maxPlayers: 8,
  turnSeconds: 30,
  startingHand: 7,
  stacking: "same",
  jumpIn: true,
  swapAnytime: true,
  sevenZero: false,
  drawUntilPlayable: false,
  wager: 0,
  finishAll: false,
  teamMode: "off" as const,
};

function RuleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-white/7 bg-white/[0.015] p-4 transition-colors hover:border-white/12">
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  );
}

function QuickToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-lg border border-white/7 bg-white/[0.015] px-2.5 py-2 text-[11px]">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} size="sm" />
    </label>
  );
}

function GameModePicker({
  mode,
  onChange,
}: {
  mode: GameRules["gameMode"];
  onChange: (mode: GameRules["gameMode"]) => void;
}) {
  const t = useT();
  return (
    <section className="mb-5 grid gap-3 sm:grid-cols-2" aria-label={t("Game mode")}>
      <button
        type="button"
        onClick={() => onChange("classic")}
        aria-pressed={mode === "classic"}
        className={cn(
          "panel group flex items-start gap-3 rounded-2xl p-4 text-left transition-colors",
          mode === "classic" ? "border-brand/45 bg-brand/[0.055]" : "hover:border-white/15",
        )}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/6 text-foreground">
          <Layers className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{t("Classic")}</span>
            {mode === "classic" ? <Badge variant="brand">{t("selected")}</Badge> : null}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {t("The normal deck. Everyone keeps their cards hidden until they play them.")}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange("doubly")}
        aria-pressed={mode === "doubly"}
        className={cn(
          "panel group flex items-start gap-3 rounded-2xl p-4 text-left transition-colors",
          mode === "doubly" ? "border-brand/45 bg-brand/[0.055]" : "hover:border-white/15",
        )}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand">
          <Repeat2 className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{t("Doubly Stacked")}</span>
            {mode === "doubly" ? <Badge variant="brand">{t("selected")}</Badge> : null}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {t("Two-sided deck with pink, teal, orange and purple. The dark side turns +2 into +5, +4 into +9, and Wild into Wild Draw Color; Flip turns every hand over and opponents see the far side of your cards.")}
          </span>
        </span>
      </button>
    </section>
  );
}

export default function PlayPage() {
  const { session } = useSession();
  const t = useT();
  const search = useSearch();
  const initialTab = new URLSearchParams(search).get("tab") ?? "quick";
  const initialMode: GameRules["gameMode"] =
    new URLSearchParams(search).get("mode") === "doubly" ? "doubly" : "classic";
  const [tab, setTab] = useState(initialTab);
  const [mode, setMode] = useState<GameRules["gameMode"]>(initialMode);
  const [, navigate] = useLocation();
  const { room } = useGame();

  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [rules, setRules] = useState<Partial<GameRules>>(DEFAULT_RULES);
  const [quickRules, setQuickRules] = useState<Partial<GameRules>>({ ...DEFAULT_RULES });
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [roomsError, setRoomsError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (tab !== "browse") return;
    let alive = true;
    setRooms(null);
    setRoomsError(false);
    api
      .get<RoomSummary[]>("/api/rooms")
      .then((data) => {
        if (alive) setRooms(data);
      })
      .catch(() => {
        if (alive) setRoomsError(true);
      });
    return () => {
      alive = false;
    };
  }, [tab, refresh]);

  function ensure(fn: () => Promise<void>) {
    if (!session || session.kind === "anon") {
      askForName(() => void fn());
      return;
    }
    void fn();
  }

  async function quick() {
    if (busy) return;
    setBusy("quick");
    try {
      const joined = await game.quickPlay({ ...quickRules, gameMode: mode });
      navigate(`/room/${joined.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not find a table."));
    } finally {
      setBusy(null);
    }
  }

  async function join() {
    if (busy) return;
    const clean = code.trim().toUpperCase();
    if (clean.length !== 5) {
      toast.error(t("Room codes are five characters."));
      return;
    }
    setBusy("join");
    try {
      const joined = await game.join(clean);
      navigate(`/room/${joined.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not join that table."));
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (busy) return;
    setBusy("create");
    try {
      const created = await game.createRoom({ ...rules, gameMode: mode }, visibility);
      navigate(`/room/${created.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not create the table."));
    } finally {
      setBusy(null);
    }
  }

  async function joinRoom(roomCode: string) {
    setBusy(`room:${roomCode}`);
    try {
      const joined = await game.join(roomCode);
      navigate(`/room/${joined.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not join that table."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">{t("the floor")}</p>
          <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">{t("Find a table.")}</h1>
          <p className="mt-2 max-w-[52ch] text-sm text-muted-foreground">
            {t("Quick play with strangers, a code for friends, or a private table with bots while you learn.")}
          </p>
        </div>
        {room && (
          <Link href={`/room/${room.code}`}>
            <Button variant="outline" className="gap-2">
              <DoorOpen /> {t("Back to {code}", { code: room.code })}
            </Button>
          </Link>
        )}
      </div>

      <GameModePicker mode={mode} onChange={setMode} />

      {session?.kind === "guest" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/25 bg-warning/[0.06] px-4 py-3 text-xs text-warning">
          <span>{t("You're playing as a guest. Guests don't earn XP or coins.")}</span>
          <Link href="/signup" className="font-medium underline underline-offset-4">
            {t("Create an account")}
          </Link>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full max-w-xl sm:w-fit">
          <TabsTrigger value="quick">
            <Zap /> {t("Quick")}
          </TabsTrigger>
          <TabsTrigger value="join">
            <Hash /> {t("Join")}
          </TabsTrigger>
          <TabsTrigger value="create">
            <Plus /> {t("Create")}
          </TabsTrigger>
          <TabsTrigger value="browse">
            <ListFilter /> {t("Browse")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quick" className="mt-2">
          <div className="panel relative overflow-hidden rounded-2xl p-6 sm:p-10">
            <div className="warm-glow pointer-events-none absolute inset-x-0 top-0 h-48 opacity-60" />
            <div className="relative flex flex-col items-start gap-5">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand/12 text-brand">
                <Zap className="size-6" />
              </span>
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{t("One click. One open seat.")}</h2>
                <p className="mt-2 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
                  {t("We put you at the fullest public table that still has room. If the floor is empty, you get a fresh table and can invite people or add bots.")}
                </p>
              </div>

              <div className="w-full rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <ListFilter className="size-4 text-brand" />
                  <h3 className="text-sm font-semibold">{t("Quick play rules")}</h3>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="eyebrow">{t("Players")}</span>
                    <Select
                      value={String(quickRules.maxPlayers ?? 8)}
                      onValueChange={(value) => setQuickRules((prev) => ({ ...prev, maxPlayers: Number(value) }))}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[2, 3, 4, 5, 6, 7, 8].map((count) => (
                          <SelectItem key={count} value={String(count)}>
                            {t("{n} players", { n: count })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="eyebrow">{t("Turn timer")}</span>
                    <Select
                      value={String(quickRules.turnSeconds ?? 30)}
                      onValueChange={(value) => setQuickRules((prev) => ({ ...prev, turnSeconds: Number(value) }))}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[15, 20, 30, 45, 60, 90].map((seconds) => (
                          <SelectItem key={seconds} value={String(seconds)}>
                            {seconds}s
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="eyebrow">{t("Stacking")}</span>
                    <Select
                      value={quickRules.stacking ?? "same"}
                      onValueChange={(value) =>
                        setQuickRules((prev) => ({ ...prev, stacking: value as GameRules["stacking"] }))
                      }
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="same">{t("Same card only")}</SelectItem>
                        <SelectItem value="mixed">{t("+2 / +4 anywhere")}</SelectItem>
                        <SelectItem value="off">{t("No stacking")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <QuickToggle
                    label={t("Jump in")}
                    checked={Boolean(quickRules.jumpIn)}
                    onChange={(value) => setQuickRules((prev) => ({ ...prev, jumpIn: value }))}
                  />
                  <QuickToggle
                    label={t("Swap anytime")}
                    checked={Boolean(quickRules.swapAnytime)}
                    onChange={(value) => setQuickRules((prev) => ({ ...prev, swapAnytime: value }))}
                  />
                  <QuickToggle
                    label={t("Seven-zero")}
                    checked={Boolean(quickRules.sevenZero)}
                    onChange={(value) => setQuickRules((prev) => ({ ...prev, sevenZero: value }))}
                  />
                  <QuickToggle
                    label={t("Draw until playable")}
                    checked={Boolean(quickRules.drawUntilPlayable)}
                    onChange={(value) => setQuickRules((prev) => ({ ...prev, drawUntilPlayable: value }))}
                  />
                  <QuickToggle
                    label={t("Finish all")}
                    checked={Boolean(quickRules.finishAll)}
                    onChange={(value) =>
                      setQuickRules((prev) => ({
                        ...prev,
                        finishAll: value,
                        teamMode: value ? "off" : prev.teamMode,
                      }))
                    }
                  />
                  <QuickToggle
                    label={t("2v2 teams")}
                    checked={quickRules.teamMode === "2v2"}
                    onChange={(value) =>
                      setQuickRules((prev) => ({
                        ...prev,
                        teamMode: value ? "2v2" : "off",
                        maxPlayers: value ? 4 : prev.maxPlayers,
                        finishAll: value ? false : prev.finishAll,
                      }))
                    }
                  />
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                  {t("We look for a table with these rules first. If none matches, we open one for you.")}
                </p>
              </div>

              <Button variant="brand" size="xl" loading={busy === "quick"} disabled={Boolean(busy)} onClick={() => ensure(quick)}>
                {t("Find me a table")} <ArrowRight />
              </Button>
              <div className="grid w-full gap-2 pt-2 text-xs text-muted-foreground sm:grid-cols-3">
                <span className="rounded-lg border border-white/7 px-3 py-2">{t("2-8 players")}</span>
                <span className="rounded-lg border border-white/7 px-3 py-2">{t("30s turn timer")}</span>
                <span className="rounded-lg border border-white/7 px-3 py-2">{t("guests welcome")}</span>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="join" className="mt-2">
          <div className="panel rounded-2xl p-6 sm:p-10">
            <h2 className="text-2xl font-semibold tracking-[-0.035em]">{t("Have a code?")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Five letters, usually shouted across a voice chat.")}
            </p>
            <div className="mt-6 flex max-w-md flex-col gap-3 sm:flex-row">
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") ensure(join);
                }}
                placeholder="A B C D E"
                className="h-12 text-center font-mono text-xl tracking-[0.4em] uppercase"
                maxLength={5}
                autoComplete="off"
                spellCheck={false}
                aria-label={t("Room code")}
              />
              <Button
                variant="brand"
                size="lg"
                className="h-12 shrink-0 px-6"
                loading={busy === "join"}
                disabled={code.length !== 5 || Boolean(busy)}
                onClick={() => ensure(join)}
              >
                {t("Join table")}
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {t("No account needed. You can set a display name when you sit down.")}
            </p>
          </div>
        </TabsContent>

        <TabsContent value="create" className="mt-2">
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="panel rounded-2xl p-6">
              <div className="mb-5 flex items-center gap-2">
                <Settings2 className="size-4 text-brand" />
                <h2 className="text-lg font-semibold tracking-[-0.02em]">{t("House rules")}</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label className="eyebrow">{t("Seats")}</Label>
                  <Select
                    value={String(rules.maxPlayers)}
                    onValueChange={(value) => setRules((prev) => ({ ...prev, maxPlayers: Number(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2, 3, 4, 5, 6, 7, 8].map((count) => (
                        <SelectItem key={count} value={String(count)}>
                          {t("{n} players", { n: count })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="eyebrow">{t("Turn timer")}</Label>
                  <Select
                    value={String(rules.turnSeconds)}
                    onValueChange={(value) => setRules((prev) => ({ ...prev, turnSeconds: Number(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[15, 20, 30, 45, 60, 90].map((seconds) => (
                        <SelectItem key={seconds} value={String(seconds)}>
                          {t("{n} seconds", { n: seconds })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="eyebrow">{t("Starting hand")}</Label>
                  <Select
                    value={String(rules.startingHand)}
                    onValueChange={(value) => setRules((prev) => ({ ...prev, startingHand: Number(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[5, 6, 7, 8, 9, 10].map((count) => (
                        <SelectItem key={count} value={String(count)}>
                          {t("{n} cards", { n: count })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="eyebrow">{t("Stacking")}</Label>
                  <Select
                    value={rules.stacking}
                    onValueChange={(value) =>
                      setRules((prev) => ({ ...prev, stacking: value as GameRules["stacking"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="same">{t("Same card only")}</SelectItem>
                      <SelectItem value="mixed">{t("+2 and +4 anywhere")}</SelectItem>
                      <SelectItem value="off">{t("No stacking")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="eyebrow">{t("Wager")}</Label>
                  <Select
                    value={String(rules.wager ?? 0)}
                    onValueChange={(value) => setRules((prev) => ({ ...prev, wager: Number(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 25, 50, 100, 250, 500, 1000].map((amount) => (
                        <SelectItem key={amount} value={String(amount)}>
                          {amount === 0 ? t("No wager") : t("{n} coins each", { n: amount })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(rules.wager ?? 0) > 0 ? (
                <p className="mt-3 rounded-lg border border-warning/25 bg-warning/[0.06] px-3 py-2 text-[11px] leading-relaxed text-warning">
                  {t("Wager tables need registered players only - no bots or guests. The winner takes the pot.")}
                </p>
              ) : null}

              <div className="mt-5 grid gap-2">
                <RuleRow
                  title={t("Jump in")}
                  description={t("Play an exact duplicate out of turn for five seconds after a card lands.")}
                  checked={Boolean(rules.jumpIn)}
                  onChange={(value) => setRules((prev) => ({ ...prev, jumpIn: value }))}
                />
                <RuleRow
                  title={t("Oscar's Swap anytime")}
                  description={t("Swap hands out of turn. Cruel, and completely legal here.")}
                  checked={Boolean(rules.swapAnytime)}
                  onChange={(value) => setRules((prev) => ({ ...prev, swapAnytime: value }))}
                />
                <RuleRow
                  title={t("Seven-zero")}
                  description={t("Play a 7 to swap with the next player. Play a 0 and every hand rotates.")}
                  checked={Boolean(rules.sevenZero)}
                  onChange={(value) => setRules((prev) => ({ ...prev, sevenZero: value }))}
                />
                <RuleRow
                  title={t("Draw until playable")}
                  description={t("Keep drawing until you find something you can play. Meaner games.")}
                  checked={Boolean(rules.drawUntilPlayable)}
                  onChange={(value) => setRules((prev) => ({ ...prev, drawUntilPlayable: value }))}
                />
                <RuleRow
                  title={t("Finish all")}
                  description={t("The first player out wins, but play continues for placements until only one player still has cards.")}
                  checked={Boolean(rules.finishAll)}
                  onChange={(value) =>
                    setRules((prev) => ({
                      ...prev,
                      finishAll: value,
                      teamMode: value ? "off" : prev.teamMode,
                    }))
                  }
                />
                <RuleRow
                  title={t("2v2 teams")}
                  description={t("Four seats, alternating teams. The first team with both hands empty wins.")}
                  checked={rules.teamMode === "2v2"}
                  onChange={(value) =>
                    setRules((prev) => ({
                      ...prev,
                      teamMode: value ? "2v2" : "off",
                      maxPlayers: value ? 4 : prev.maxPlayers,
                      finishAll: value ? false : prev.finishAll,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="panel rounded-2xl p-6">
                <h3 className="text-sm font-semibold">{t("Who can join?")}</h3>
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility("private")}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      visibility === "private"
                        ? "border-brand/40 bg-brand/[0.06]"
                        : "border-white/8 hover:border-white/15",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <DoorOpen className="size-4" /> {t("Private")}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{t("Only people with the code.")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility("public")}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      visibility === "public"
                        ? "border-brand/40 bg-brand/[0.06]"
                        : "border-white/8 hover:border-white/15",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Users className="size-4" /> {t("Public")}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{t("Shows up in Browse for anyone.")}</span>
                  </button>
                </div>
              </div>

              <div className="panel rounded-2xl p-6">
                <p className="eyebrow mb-2">{t("the default table")}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("You'll be the host. Add bots from the lobby, drag friends in with the code, and start when you're ready. You can change every rule until the first card is dealt.")}
                </p>
                <Button
                  variant="brand"
                  size="lg"
                  className="mt-5 w-full"
                  loading={busy === "create"}
                  disabled={Boolean(busy)}
                  onClick={() => ensure(create)}
                >
                  {t("Create {visibility} table", { visibility: t(visibility) })} <ArrowRight />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="browse" className="mt-2">
          <div className="panel rounded-2xl p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.02em]">{t("Open tables")}</h2>
                <p className="text-xs text-muted-foreground">{t("Public lobbies waiting for a player.")}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setRefresh((value) => value + 1)}>
                <RefreshCw /> {t("Refresh")}
              </Button>
            </div>

            {rooms === null && !roomsError && (
              <div className="grid place-items-center py-16 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            )}

            {roomsError && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-xs text-destructive">
                {t("Could not load tables. Try refreshing.")}
              </div>
            )}

            {rooms && rooms.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
                <p className="text-sm font-medium">{t("No open tables right now.")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("We can open a fresh public table and put you at it - invite people or add bots once you're in.")}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button variant="brand" loading={busy === "quick"} onClick={() => ensure(quick)}>
                    <Zap /> {t("Open a table for me")}
                  </Button>
                  <Button variant="outline" onClick={() => setTab("create")}>
                    {t("Set my own rules")}
                  </Button>
                </div>
              </div>
            )}

            {rooms && rooms.length > 0 && (
              <ul className="divide-y divide-white/6">
                {rooms.map((item) => (
                  <li key={item.code} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-xs tracking-[0.18em]">
                      {item.code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.hostName}&apos;s table</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("{n}/{max} players", { n: item.players, max: item.maxPlayers })} ·{" "}
                        {t("{n}s turns", { n: item.turnSeconds })} ·{" "}
                        {item.stacking === "off"
                          ? t("no stacking")
                          : item.stacking === "mixed"
                            ? t("mixed stacks")
                            : t("same-card stacks")}
                      </p>
                    </div>
                    {item.gameMode === "doubly" ? (
                      <Badge variant="brand" className="gap-1">
                        <Repeat2 className="size-3" /> {t("Doubly Stacked")}
                      </Badge>
                    ) : null}
                    {item.teamMode === "2v2" ? (
                      <Badge variant="outline">{t("2v2 teams")}</Badge>
                    ) : null}
                    <Badge variant={item.players >= item.maxPlayers - 1 ? "warning" : "brand"}>
                      {t(
                        item.maxPlayers - item.players === 1 ? "{n} seat left" : "{n} seats left",
                        { n: item.maxPlayers - item.players },
                      )}
                    </Badge>
                    {item.wager > 0 ? (
                      <Badge variant="outline" className="gap-1 text-warning">
                        <Coins className="size-3" /> {t("{n} coin wager", { n: item.wager })}
                      </Badge>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy === `room:${item.code}`}
                      disabled={Boolean(busy)}
                      onClick={() => ensure(() => joinRoom(item.code))}
                    >
                      {t("Join")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

