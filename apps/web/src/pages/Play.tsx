import type { GameRules, RoomSummary } from "@stacked/shared";
import { ArrowRight, DoorOpen, Hash, ListFilter, Loader2, Plus, RefreshCw, Settings2, Users, Zap } from "lucide-react";
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

export default function PlayPage() {
  const { session } = useSession();
  const search = useSearch();
  const initialTab = new URLSearchParams(search).get("tab") ?? "quick";
  const [tab, setTab] = useState(initialTab);
  const [, navigate] = useLocation();
  const { room } = useGame();

  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [rules, setRules] = useState<Partial<GameRules>>(DEFAULT_RULES);
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
      const joined = await game.quickPlay();
      navigate(`/room/${joined.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not find a table.");
    } finally {
      setBusy(null);
    }
  }

  async function join() {
    if (busy) return;
    const clean = code.trim().toUpperCase();
    if (clean.length !== 5) {
      toast.error("Room codes are five characters.");
      return;
    }
    setBusy("join");
    try {
      const joined = await game.join(clean);
      navigate(`/room/${joined.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join that table.");
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (busy) return;
    setBusy("create");
    try {
      const created = await game.createRoom(rules, visibility);
      navigate(`/room/${created.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the table.");
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
      toast.error(error instanceof Error ? error.message : "Could not join that table.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">the floor</p>
          <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">Find a table.</h1>
          <p className="mt-2 max-w-[52ch] text-sm text-muted-foreground">
            Quick play with strangers, a code for friends, or a private table with bots while you learn.
          </p>
        </div>
        {room && (
          <Link href={`/room/${room.code}`}>
            <Button variant="outline" className="gap-2">
              <DoorOpen /> Back to {room.code}
            </Button>
          </Link>
        )}
      </div>

      {session?.kind === "guest" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/25 bg-warning/[0.06] px-4 py-3 text-xs text-warning">
          <span>You&apos;re playing as a guest. Coins, XP and cosmetics won&apos;t be saved.</span>
          <Link href="/signup" className="font-medium underline underline-offset-4">
            Create an account
          </Link>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full max-w-xl sm:w-fit">
          <TabsTrigger value="quick">
            <Zap /> Quick
          </TabsTrigger>
          <TabsTrigger value="join">
            <Hash /> Join
          </TabsTrigger>
          <TabsTrigger value="create">
            <Plus /> Create
          </TabsTrigger>
          <TabsTrigger value="browse">
            <ListFilter /> Browse
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
                <h2 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">One click. One open seat.</h2>
                <p className="mt-2 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
                  We put you at the fullest public table that still has room. If the floor is empty, you get a fresh
                  table and can invite people or add bots.
                </p>
              </div>
              <Button variant="brand" size="xl" loading={busy === "quick"} disabled={Boolean(busy)} onClick={() => ensure(quick)}>
                Find me a table <ArrowRight />
              </Button>
              <div className="grid w-full gap-2 pt-2 text-xs text-muted-foreground sm:grid-cols-3">
                <span className="rounded-lg border border-white/7 px-3 py-2">2–8 players</span>
                <span className="rounded-lg border border-white/7 px-3 py-2">30s turn timer</span>
                <span className="rounded-lg border border-white/7 px-3 py-2">guests welcome</span>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="join" className="mt-2">
          <div className="panel rounded-2xl p-6 sm:p-10">
            <h2 className="text-2xl font-semibold tracking-[-0.035em]">Have a code?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Five letters, usually shouted across a voice chat.</p>
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
                aria-label="Room code"
              />
              <Button
                variant="brand"
                size="lg"
                className="h-12 shrink-0 px-6"
                loading={busy === "join"}
                disabled={code.length !== 5 || Boolean(busy)}
                onClick={() => ensure(join)}
              >
                Join table
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              No account needed. You can set a display name when you sit down.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="create" className="mt-2">
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="panel rounded-2xl p-6">
              <div className="mb-5 flex items-center gap-2">
                <Settings2 className="size-4 text-brand" />
                <h2 className="text-lg font-semibold tracking-[-0.02em]">House rules</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label className="eyebrow">Seats</Label>
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
                          {count} players
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="eyebrow">Turn timer</Label>
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
                          {seconds} seconds
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="eyebrow">Starting hand</Label>
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
                          {count} cards
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="eyebrow">Stacking</Label>
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
                      <SelectItem value="same">Same card only</SelectItem>
                      <SelectItem value="mixed">+2 and +4 anywhere</SelectItem>
                      <SelectItem value="off">No stacking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-5 grid gap-2">
                <RuleRow
                  title="Jump in"
                  description="Play an exact duplicate out of turn for five seconds after a card lands."
                  checked={Boolean(rules.jumpIn)}
                  onChange={(value) => setRules((prev) => ({ ...prev, jumpIn: value }))}
                />
                <RuleRow
                  title="Oscar's Swap anytime"
                  description="Swap hands out of turn. Cruel, faithful to Blazing 8s."
                  checked={Boolean(rules.swapAnytime)}
                  onChange={(value) => setRules((prev) => ({ ...prev, swapAnytime: value }))}
                />
                <RuleRow
                  title="Seven-zero"
                  description="Play a 7 to swap with the next player. Play a 0 and every hand rotates."
                  checked={Boolean(rules.sevenZero)}
                  onChange={(value) => setRules((prev) => ({ ...prev, sevenZero: value }))}
                />
                <RuleRow
                  title="Draw until playable"
                  description="Keep drawing until you find something you can play. Meaner games."
                  checked={Boolean(rules.drawUntilPlayable)}
                  onChange={(value) => setRules((prev) => ({ ...prev, drawUntilPlayable: value }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="panel rounded-2xl p-6">
                <h3 className="text-sm font-semibold">Who can join?</h3>
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
                      <DoorOpen className="size-4" /> Private
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">Only people with the code.</span>
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
                      <Users className="size-4" /> Public
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">Shows up in Browse for anyone.</span>
                  </button>
                </div>
              </div>

              <div className="panel rounded-2xl p-6">
                <p className="eyebrow mb-2">the default table</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  You&apos;ll be the host. Add bots from the lobby, drag friends in with the code, and start when
                  you&apos;re ready. You can change every rule until the first card is dealt.
                </p>
                <Button
                  variant="brand"
                  size="lg"
                  className="mt-5 w-full"
                  loading={busy === "create"}
                  disabled={Boolean(busy)}
                  onClick={() => ensure(create)}
                >
                  Create {visibility} table <ArrowRight />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="browse" className="mt-2">
          <div className="panel rounded-2xl p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.02em]">Open tables</h2>
                <p className="text-xs text-muted-foreground">Public lobbies waiting for a player.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setRefresh((value) => value + 1)}>
                <RefreshCw /> Refresh
              </Button>
            </div>

            {rooms === null && !roomsError && (
              <div className="grid place-items-center py-16 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            )}

            {roomsError && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-xs text-destructive">
                Could not load tables. Try refreshing.
              </div>
            )}

            {rooms && rooms.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
                <p className="text-sm font-medium">No open tables right now.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  We can open a fresh public table and put you at it — invite people or add bots once you&apos;re in.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button variant="brand" loading={busy === "quick"} onClick={() => ensure(quick)}>
                    <Zap /> Open a table for me
                  </Button>
                  <Button variant="outline" onClick={() => setTab("create")}>
                    Set my own rules
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
                        {item.players}/{item.maxPlayers} players · {item.turnSeconds}s turns ·{" "}
                        {item.stacking === "off" ? "no stacking" : item.stacking === "mixed" ? "mixed stacks" : "same-card stacks"}
                      </p>
                    </div>
                    <Badge variant={item.players >= item.maxPlayers - 1 ? "warning" : "brand"}>
                      {item.maxPlayers - item.players} seat{item.maxPlayers - item.players === 1 ? "" : "s"} left
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy === `room:${item.code}`}
                      disabled={Boolean(busy)}
                      onClick={() => ensure(() => joinRoom(item.code))}
                    >
                      Join
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
