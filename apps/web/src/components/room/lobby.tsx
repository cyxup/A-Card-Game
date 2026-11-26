import type { FriendRelationship, FriendsPayload, GameRules, RoomView } from "@stacked/shared";
import { Bot, Check, Clock, Coins, Copy, Crown, DoorOpen, Layers, Play, Plus, Settings2, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/brand/avatar";
import { NameEffect } from "@/components/brand/name-effect";
import { UserTags } from "@/components/brand/user-tags";
import { PlayerProfileDialog } from "@/components/social/player-profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { game as client } from "@/lib/game";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";

function RuleToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-white/7 bg-white/[0.015] px-3 py-2.5">
      <span className="flex flex-col gap-0.5">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[11px] leading-snug text-muted-foreground">{description}</span>
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} size="sm" />
    </label>
  );
}

export function Lobby({ room, onLeave }: { room: RoomView; onLeave: () => void }) {
  const t = useT();
  const { session } = useSession();
  const me = room.players.find((player) => player.id === room.you.id);
  const isHost = room.you.isHost;
  const wager = room.rules.wager;
  const coins = session?.kind === "user" ? (session.user?.coins ?? null) : null;
  const shortOnCoins = coins !== null && wager > coins;
  const hasBot = room.players.some((player) => player.isBot);
  const unreadyHumans = room.players.filter((player) => !player.isBot && !player.host && !player.ready);
  const canStart = room.players.length >= 2 && (wager === 0 || !hasBot) && unreadyHumans.length === 0;
  const emptySeats = Math.max(0, room.rules.maxPlayers - room.players.length);
  const locked = !isHost;
  const myId = session?.kind === "user" ? session.user?.id ?? null : null;
  const [relationships, setRelationships] = useState<Record<string, FriendRelationship>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!myId) {
      setRelationships({});
      return;
    }
    let alive = true;
    const refresh = () => {
      api
        .get<FriendsPayload>("/api/friends")
        .then((payload) => {
          if (!alive) return;
          const next: Record<string, FriendRelationship> = {};
          for (const friend of payload.friends) next[friend.id] = "friends";
          for (const friend of payload.outgoing) next[friend.id] = "pending_out";
          for (const friend of payload.incoming) next[friend.id] = "pending_in";
          for (const friend of payload.blocked) next[friend.id] = "blocked";
          setRelationships(next);
        })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener("stacked:friends-changed", refresh);
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      alive = false;
      window.removeEventListener("stacked:friends-changed", refresh);
      window.clearInterval(timer);
    };
  }, [myId]);

  async function addFriend(playerId: string, playerName: string) {
    if (adding) return;
    setAdding(playerId);
    try {
      await api.post("/api/friends/request", { userId: playerId });
      setRelationships((current) => ({ ...current, [playerId]: "pending_out" }));
      toast.success(t("Friend request sent to {name}.", { name: playerName }));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not send that friend request."));
    } finally {
      setAdding(null);
    }
  }

  async function acceptFriend(playerId: string) {
    if (adding) return;
    setAdding(playerId);
    try {
      await api.post(`/api/friends/${playerId}/accept`, {});
      setRelationships((current) => ({ ...current, [playerId]: "friends" }));
      toast.success(t("Friend request accepted."));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not accept that request."));
    } finally {
      setAdding(null);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${room.code}`);
      toast.success(t("Invite link copied."));
    } catch {
      toast.error(t("Could not copy. Share the code instead."));
    }
  }

  function update(patch: Partial<GameRules>) {
    if (!isHost) return;
    client.updateRules(patch);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">
            {room.visibility === "public" ? t("open table") : t("private table")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">{room.code}</h1>
            <Button variant="outline" size="sm" onClick={copyInvite} className="gap-1.5">
              <Copy className="size-3.5" /> {t("Invite")}
            </Button>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" /> {t("{n}/{max} seated", { n: room.players.length, max: room.rules.maxPlayers })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {t("{n}s turns", { n: room.rules.turnSeconds })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3.5" />
              {room.rules.stacking === "off"
                ? t("no stacking")
                : room.rules.stacking === "mixed"
                  ? t("mixed stacking")
                  : t("same-card stacking")}
            </span>
            {room.rules.kingOfTable ? (
              <span className="inline-flex items-center gap-1 text-warning">
                <Crown className="size-3.5" /> {t("King of the table")}
              </span>
            ) : null}
            {coins !== null && (
              <span className={`inline-flex items-center gap-1 ${shortOnCoins ? "text-destructive" : "text-brand"}`}>
                <Coins className="size-3.5" /> {t("{n} coins", { n: coins })}
              </span>
            )}
            {wager > 0 && (
              <span className="inline-flex items-center gap-1 text-warning">
                <Coins className="size-3.5" /> {t("{n} coin wager", { n: wager })}
              </span>
            )}
            <Badge variant={room.visibility === "public" ? "brand" : "outline"} className="ml-1">
              {t(room.visibility)}
            </Badge>
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onLeave} className="gap-1.5 text-muted-foreground">
          <DoorOpen /> {t("Leave")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="panel rounded-2xl p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("The table")}</h2>
            {isHost && emptySeats > 0 && wager === 0 && (
              <Button variant="outline" size="xs" onClick={() => client.addBot()} className="gap-1">
                <Bot className="size-3.5" /> {t("Add bot")}
              </Button>
            )}
          </div>

          <ul className="flex flex-col gap-2">
            {room.players.map((player) => (
              <li
                key={player.id}
                className="flex items-center gap-3 rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (player.registered && !player.isBot) setProfileId(player.id);
                  }}
                  className={`flex min-w-0 flex-1 items-center gap-3 text-left ${
                    player.registered && !player.isBot ? "cursor-pointer" : "cursor-default"
                  }`}
                  title={player.registered && !player.isBot ? t("View profile") : undefined}
                >
                  <Avatar id={player.avatar} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <NameEffect effect={player.nameEffect} className="truncate text-sm font-medium">
                        {player.name}
                      </NameEffect>
                      {player.host && <Crown className="size-3.5 shrink-0 text-warning" />}
                      {player.id === room.you.id && (
                        <span className="text-[10px] uppercase tracking-wider text-brand">{t("you")}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t("level {n}", { n: player.level })}
                      {player.isBot ? ` · ${t("bot")}` : ""}
                      {!player.connected && !player.isBot ? ` · ${t("reconnecting")}` : ""}
                    </p>
                    <UserTags tags={player.tags} max={3} className="mt-1" />
                  </div>
                </button>
                {myId && !player.isBot && player.registered && player.id !== room.you.id ? (
                  relationships[player.id] === "friends" ? (
                    <Badge variant="success" className="gap-1">
                      <Check className="size-3" /> {t("Friends")}
                    </Badge>
                  ) : relationships[player.id] === "pending_out" ? (
                    <Badge variant="outline" className="gap-1">
                      <Clock className="size-3" /> {t("Requested")}
                    </Badge>
                  ) : relationships[player.id] === "pending_in" ? (
                    <Button
                      size="xs"
                      variant="brand"
                      loading={adding === player.id}
                      onClick={() => void acceptFriend(player.id)}
                    >
                      {t("Accept")}
                    </Button>
                  ) : relationships[player.id] === "blocked" ? null : (
                    <Button
                      size="xs"
                      variant="outline"
                      className="gap-1"
                      loading={adding === player.id}
                      onClick={() => void addFriend(player.id, player.name)}
                      aria-label={t("Add friend")}
                    >
                      <UserPlus className="size-3" />
                      <span className="hidden sm:inline">{t("Add friend")}</span>
                    </Button>
                  )
                ) : null}
                {player.isBot && <Badge variant="outline">{t("bot")}</Badge>}
                {player.ready || player.isBot || player.host ? (
                  <Badge variant="success" className="gap-1">
                    <Check className="size-3" /> {t("ready")}
                  </Badge>
                ) : (
                  <Badge variant="outline">{t("waiting")}</Badge>
                )}
                {isHost && player.isBot && (
                  <Button variant="ghost" size="icon-xs" onClick={() => client.removeBot()} title={t("Remove bot")}>
                    <Trash2 />
                  </Button>
                )}
                {isHost && !player.isBot && player.id !== room.you.id && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => client.kick(player.id)}
                    title={t("Remove {name}", { name: player.name })}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}

            {Array.from({ length: Math.min(emptySeats, 8) }).map((_, index) => (
              <li
                key={`empty-${index}`}
                className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-muted-foreground"
              >
                <span className="grid size-[34px] place-items-center rounded-full border border-dashed border-white/15">
                  <Plus className="size-3.5" />
                </span>
                <span className="flex-1 text-xs">{t("Open seat")}</span>
                {isHost && index === 0 && wager === 0 && (
                  <Button variant="ghost" size="xs" onClick={() => client.addBot()}>
                    {t("fill with bot")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <div className="panel rounded-2xl p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Settings2 className="size-4 text-brand" />
              <h2 className="text-sm font-semibold">{t("House rules")}</h2>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow">{t("turn timer")}</span>
                <Select
                  value={String(room.rules.turnSeconds)}
                  disabled={locked}
                  onValueChange={(value) => update({ turnSeconds: Number(value) })}
                >
                  <SelectTrigger className="h-8 text-xs">
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
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow">{t("seats")}</span>
                <Select
                  value={String(room.rules.maxPlayers)}
                  disabled={locked}
                  onValueChange={(value) => update({ maxPlayers: Number(value) })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5, 6, 7, 8].map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-2 flex flex-col gap-1.5">
              <span className="eyebrow">{t("stacking")}</span>
              <Select
                value={room.rules.stacking}
                disabled={locked}
                onValueChange={(value) => update({ stacking: value as GameRules["stacking"] })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="same">{t("Same card only")}</SelectItem>
                  <SelectItem value="mixed">{t("+2 / +4 anywhere")}</SelectItem>
                  <SelectItem value="off">{t("No stacking")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-2 flex flex-col gap-1.5">
              <span className="eyebrow">{t("Wager")}</span>
              <Select
                value={String(wager)}
                disabled={locked}
                onValueChange={(value) => update({ wager: Number(value) })}
              >
                <SelectTrigger className="h-8 text-xs">
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
              {wager > 0 ? (
                <p className="text-[10px] leading-snug text-warning">
                  {t("Registered players only. No bots or guests. Winner takes the pot.")}
                </p>
              ) : null}
              {coins !== null ? (
                <p className={`text-[10px] leading-snug ${shortOnCoins ? "text-destructive" : "text-muted-foreground"}`}>
                  {t("Your balance: {n} coins.", { n: coins })}
                  {shortOnCoins ? ` ${t("Not enough coins for this wager.")}` : ""}
                </p>
              ) : null}
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <RuleToggle
                label={t("Jump in")}
                description={t("Exact duplicates can be played out of turn.")}
                checked={room.rules.jumpIn}
                disabled={locked}
                onChange={(value) => update({ jumpIn: value })}
              />
              <RuleToggle
                label={t("Swap anytime")}
                description={t("Oscar's Swap can be played out of turn.")}
                checked={room.rules.swapAnytime}
                disabled={locked}
                onChange={(value) => update({ swapAnytime: value })}
              />
              <RuleToggle
                label={t("Seven-zero")}
                description={t("7 swaps with the next player. 0 rotates all hands.")}
                checked={room.rules.sevenZero}
                disabled={locked}
                onChange={(value) => update({ sevenZero: value })}
              />
              <RuleToggle
                label={t("Draw until playable")}
                description={t("Keep drawing until you can play. Nasty.")}
                checked={room.rules.drawUntilPlayable}
                disabled={locked}
                onChange={(value) => update({ drawUntilPlayable: value })}
              />
            </div>
          </div>

          <div className="panel rounded-2xl p-4 sm:p-5">
            {isHost ? (
              <>
                <Button
                  variant="brand"
                  size="lg"
                  className="w-full"
                  disabled={!canStart}
                  onClick={() => client.start()}
                >
                  <Play /> {canStart
                    ? t("Deal the first hand")
                    : wager > 0 && hasBot
                      ? t("Remove bots to start")
                      : room.players.length < 2
                        ? t("Need one more player")
                        : t("Waiting for players to be ready")}
                </Button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  {canStart
                    ? t("Everyone in the lobby comes with you. Rules lock when the round starts.")
                    : wager > 0 && (hasBot || room.players.length < 2)
                      ? t("Wager tables need at least two registered players and no bots.")
                      : room.players.length < 2
                        ? t("Add a friend with the code, or fill the table with a bot.")
                        : t("Everyone else needs to be ready before you deal.")}
                </p>
              </>
            ) : (
              <>
                <Button
                  variant={me?.ready ? "secondary" : "brand"}
                  size="lg"
                  className="w-full"
                  onClick={() => client.setReady(!me?.ready)}
                >
                  {me?.ready ? t("Not ready") : t("I'm ready")}
                </Button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  {t("The host starts when the table is ready.")}
                </p>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            <p className="eyebrow mb-1.5">{t("invite link")}</p>
            <button
              type="button"
              onClick={copyInvite}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:border-white/15 hover:text-foreground"
            >
              <span className="truncate">/room/{room.code}</span>
              <Copy className="size-3.5 shrink-0" />
            </button>
          </div>
        </div>
      </div>
      <PlayerProfileDialog
        userId={profileId}
        onClose={() => setProfileId(null)}
        onRelationshipChange={(userId, relationship) =>
          setRelationships((current) => ({ ...current, [userId]: relationship }))
        }
      />
    </div>
  );
}
