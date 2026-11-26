import type { FriendUserView, FriendsPayload } from "@stacked/shared";
import {
  Ban,
  Check,
  Eye,
  Globe,
  Lock,
  Play,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Avatar } from "@/components/brand/avatar";
import { NameEffect } from "@/components/brand/name-effect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { game as client, useGame } from "@/lib/game";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

function PresenceLine({ friend }: { friend: FriendUserView }) {
  const t = useT();
  const presence = friend.presence;
  if (!presence || presence.status === "offline") {
    return <span className="text-[11px] text-muted-foreground">{t("Offline")}</span>;
  }
  if (!presence.room) {
    return <span className="text-[11px] text-success">{t("Online")}</span>;
  }
  const label =
    presence.status === "playing"
      ? t("In game · {n}/{max}", { n: presence.room.players, max: presence.room.maxPlayers })
      : t("In lobby · {n}/{max}", { n: presence.room.players, max: presence.room.maxPlayers });
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-info">
      {presence.room.visibility === "public" ? <Globe className="size-3" /> : <Lock className="size-3" />}
      {label}
      <span className="text-muted-foreground">· {t(presence.room.visibility)}</span>
    </span>
  );
}

export default function FriendsPage() {
  const { session, loading } = useSession();
  const { room: liveRoom } = useGame();
  const t = useT();
  const [, navigate] = useLocation();
  const [data, setData] = useState<FriendsPayload | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FriendUserView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const payload = await api.get<FriendsPayload>("/api/friends");
      setData(payload);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your friends.");
    }
  }, []);

  useEffect(() => {
    if (session?.kind !== "user") {
      setData(null);
      return;
    }
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [session?.kind, load]);

  useEffect(() => {
    setInvited(new Set());
  }, [data?.you.roomCode]);

  async function act(key: string, run: () => Promise<unknown>, message?: string) {
    if (busy) return;
    setBusy(key);
    try {
      await run();
      if (message) toast.success(message);
      await load();
      if (results) void search({ preventDefault() {} } as FormEvent);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("That action failed."));
    } finally {
      setBusy(null);
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (session?.kind !== "user") return;
    try {
      const found = await api.get<FriendUserView[]>(`/api/friends/search?q=${encodeURIComponent(query)}`);
      setResults(found);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not search."));
    }
  }

  function request(friend: FriendUserView) {
    void act(`request:${friend.id}`, () => api.post("/api/friends/request", { userId: friend.id }), t("Friend request sent."));
  }

  function accept(friend: FriendUserView) {
    void act(`accept:${friend.id}`, () => api.post(`/api/friends/${friend.id}/accept`, {}), t("Friend added."));
  }

  function decline(friend: FriendUserView) {
    void act(`decline:${friend.id}`, () => api.post(`/api/friends/${friend.id}/decline`, {}));
  }

  function remove(friend: FriendUserView) {
    if (!window.confirm(t("Remove {name} from your friends?", { name: friend.displayName }))) return;
    void act(`remove:${friend.id}`, () => api.post(`/api/friends/${friend.id}/remove`, {}), t("Friend removed."));
  }

  function block(friend: FriendUserView) {
    if (!window.confirm(t("Block {name}? They will not be able to add or invite you.", { name: friend.displayName }))) return;
    void act(`block:${friend.id}`, () => api.post(`/api/friends/${friend.id}/block`, {}), t("Player blocked."));
  }

  function unblock(friend: FriendUserView) {
    void act(`unblock:${friend.id}`, () => api.post(`/api/friends/${friend.id}/unblock`, {}), t("Player unblocked."));
  }

  async function invite(friend: FriendUserView) {
    if (busy) return;
    setBusy(`invite:${friend.id}`);
    try {
      await api.post("/api/friends/invite", { userId: friend.id });
      setInvited((current) => new Set(current).add(friend.id));
      toast.success(t("Invite sent to {name}.", { name: friend.displayName }));
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not send that invite."));
    } finally {
      setBusy(null);
    }
  }

  async function watch(friend: FriendUserView) {
    if (busy) return;
    setBusy(`watch:${friend.id}`);
    try {
      const room = await client.spectate(friend.id);
      navigate(`/room/${room.code}`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not watch that game."));
    } finally {
      setBusy(null);
    }
  }

  async function createGroup() {
    if (busy) return;
    setBusy("group");
    try {
      const room = await client.createRoom({ maxPlayers: 8 }, "private");
      setInvited(new Set());
      await load();
      toast.success(t("Group {code} is open. Invite your friends below.", { code: room.code }));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not create the group."));
    } finally {
      setBusy(null);
    }
  }

  const memberIds = new Set(liveRoom?.players.map((player) => player.id) ?? []);
  const groupFriends =
    data?.friends.filter(
      (friend) =>
        friend.presence?.status !== "offline" &&
        friend.presence?.status !== "playing" &&
        !memberIds.has(friend.id),
    ) ?? [];

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="mt-4 h-64 rounded-2xl" />
      </div>
    );
  }

  if (session?.kind !== "user") {
    return (
      <div className="grid min-h-[65vh] place-items-center px-4">
        <div className="panel max-w-md rounded-2xl p-8 text-center">
          <Users className="mx-auto mb-4 size-8 text-brand" />
          <h1 className="text-2xl font-semibold tracking-[-0.04em]">{t("Friends need an account.")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Create a free account to keep a friend list, see who is online and invite them to your table.")}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/signup">
              <Button variant="brand">{t("Create an account")}</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline">{t("Sign in")}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">{t("Your people")}</p>
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">
            <Users className="size-8 text-brand" /> {t("Friends")}
          </h1>
          <p className="mt-2 max-w-[55ch] text-sm text-muted-foreground">
            {t("See who is online, what they are playing, and pull them into your lobby.")}
          </p>
        </div>
        {data?.you.roomCode ? (
          <Badge variant="outline" className="gap-1.5">
            <Play className="size-3" /> {t("Lobby {code}", { code: data.you.roomCode })}
          </Badge>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {data ? (
        <section className="panel mb-4 rounded-2xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow">{t("group")}</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em]">
                {data.you.roomCode ? t("Your group is live") : t("Your group")}
              </h2>
              <p className="mt-1 max-w-[55ch] text-xs text-muted-foreground">
                {data.you.roomCode
                  ? data.you.canInvite
                    ? t("Pick friends from the list below and send them an invite.")
                    : t("The host can invite the rest of the group from the lobby.")
                  : t("Open a private lobby, then pick who you want to invite.")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.you.roomCode ? (
                <Link href={`/room/${data.you.roomCode}`}>
                  <Button variant="brand" className="gap-1.5">
                    <Play className="size-4" /> {t("Open lobby")}
                  </Button>
                </Link>
              ) : (
                <Button
                  variant="brand"
                  loading={busy === "group"}
                  disabled={Boolean(busy)}
                  onClick={() => void createGroup()}
                  className="gap-1.5"
                >
                  <Users className="size-4" /> {t("Create a group")}
                </Button>
              )}
            </div>
          </div>

          {data.you.roomCode && data.you.canInvite ? (
            <div className="mt-4 border-t border-white/8 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{t("Invite friends")}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t("Online friends who are not already in your group.")}
                  </p>
                </div>
                <Badge variant="outline">{groupFriends.length}</Badge>
              </div>

              {groupFriends.length > 0 ? (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {groupFriends.map((friend) => {
                    const pending = invited.has(friend.id);
                    return (
                      <li
                        key={friend.id}
                        className="flex items-center gap-2.5 rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2"
                      >
                        <Avatar id={friend.avatar} size={30} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">
                            <NameEffect effect={friend.nameEffect}>{friend.displayName}</NameEffect>
                          </p>
                          <PresenceLine friend={friend} />
                        </div>
                        <Button
                          size="xs"
                          variant={pending ? "secondary" : "brand"}
                          className="shrink-0 gap-1"
                          disabled={pending || Boolean(busy)}
                          loading={busy === `invite:${friend.id}`}
                          onClick={() => void invite(friend)}
                        >
                          <UserPlus className="size-3" />
                          {pending ? t("Invite sent") : t("Invite")}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-muted-foreground">
                  {t("No available friends right now. Invite them when they are online.")}
                </p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <form onSubmit={search} className="panel mb-5 flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search by username")}
            className="pl-9"
            maxLength={40}
          />
        </div>
        <Button type="submit" variant="brand" disabled={query.trim().length < 2}>
          {t("Search")}
        </Button>
      </form>

      {results ? (
        <section className="panel mb-5 rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t("Search results")}</h2>
            <Button size="xs" variant="ghost" onClick={() => setResults(null)}>
              <X /> {t("Close")}
            </Button>
          </div>
          {results.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("No players found.")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {results.map((friend) => (
                <div key={friend.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2">
                  <Avatar id={friend.avatar} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      <NameEffect effect={friend.nameEffect}>{friend.displayName}</NameEffect>{" "}
                      <span className="font-mono text-[10px] text-muted-foreground">@{friend.username}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">{t("level {n}", { n: friend.level })}</p>
                  </div>
                  {friend.relationship === "friends" ? (
                    <Badge variant="success">{t("Friends")}</Badge>
                  ) : friend.relationship === "pending_out" ? (
                    <Badge variant="outline">{t("Requested")}</Badge>
                  ) : friend.relationship === "pending_in" ? (
                    <Button size="xs" variant="brand" onClick={() => accept(friend)}>
                      <Check /> {t("Accept")}
                    </Button>
                  ) : friend.relationship === "blocked" ? (
                    <Badge variant="destructive">{t("Blocked")}</Badge>
                  ) : (
                    <Button size="xs" variant="outline" loading={busy === `request:${friend.id}`} onClick={() => request(friend)}>
                      <UserPlus /> {t("Add friend")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!data ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {data.incoming.length > 0 ? (
            <section className="panel rounded-2xl p-4">
              <h2 className="mb-3 text-sm font-semibold">{t("Friend requests")}</h2>
              <div className="flex flex-col gap-2">
                {data.incoming.map((friend) => (
                  <div key={friend.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2">
                    <Avatar id={friend.avatar} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        <NameEffect effect={friend.nameEffect}>{friend.displayName}</NameEffect>{" "}
                        <span className="font-mono text-[10px] text-muted-foreground">@{friend.username}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">{t("level {n}", { n: friend.level })}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="xs" variant="brand" loading={busy === `accept:${friend.id}`} onClick={() => accept(friend)}>
                        <Check /> {t("Accept")}
                      </Button>
                      <Button size="xs" variant="outline" loading={busy === `decline:${friend.id}`} onClick={() => decline(friend)}>
                        {t("Decline")}
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => block(friend)} aria-label={t("Block")}>
                        <Ban />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="panel rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t("Your friends")}</h2>
              <span className="text-[11px] text-muted-foreground">
                {t(data.friends.length === 1 ? "{n} friend" : "{n} friends", { n: data.friends.length })}
              </span>
            </div>
            {data.friends.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-muted-foreground">
                {t("No friends yet. Search a username to send a request.")}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.friends.map((friend) => (
                  <div key={friend.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2">
                    <Avatar id={friend.avatar} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        <NameEffect effect={friend.nameEffect}>{friend.displayName}</NameEffect>{" "}
                        <span className="font-mono text-[10px] text-muted-foreground">@{friend.username}</span>
                        {friend.owner ? <Badge variant="warning" className="ml-1.5">{t("owner")}</Badge> : null}
                        {friend.beta ? <Badge variant="outline" className="ml-1.5 border-info/40 text-info">{t("beta")}</Badge> : null}
                      </p>
                      <PresenceLine friend={friend} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {friend.presence?.status === "playing" ? (
                        <Button
                          size="xs"
                          variant="outline"
                          loading={busy === `watch:${friend.id}`}
                          disabled={Boolean(busy)}
                          onClick={() => void watch(friend)}
                          className="gap-1"
                        >
                          <Eye /> {t("Watch")}
                        </Button>
                      ) : null}
                      {friend.presence?.room?.code && friend.presence.room.phase === "lobby" ? (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => navigate(`/room/${friend.presence?.room?.code}`)}
                          className="gap-1"
                        >
                          <Play /> {t("Join")}
                        </Button>
                      ) : null}
                      <Button size="xs" variant="ghost" onClick={() => remove(friend)} aria-label={t("Remove friend")}>
                        <Trash2 />
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => block(friend)} aria-label={t("Block")}>
                        <Ban />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!data.you.canInvite ? (
              <p className="mt-3 text-[11px] text-muted-foreground">
                {t("Create a group or open your lobby to send invites from the panel above.")}
              </p>
            ) : null}
          </section>

          {data.outgoing.length > 0 ? (
            <section className="panel rounded-2xl p-4">
              <h2 className="mb-3 text-sm font-semibold">{t("Sent requests")}</h2>
              <div className="flex flex-col gap-2">
                {data.outgoing.map((friend) => (
                  <div key={friend.id} className="flex items-center gap-3 rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2">
                    <Avatar id={friend.avatar} size={30} />
                    <span className="min-w-0 flex-1 truncate text-sm">{friend.displayName}</span>
                    <Badge variant="outline">{t("Pending")}</Badge>
                    <Button size="xs" variant="ghost" onClick={() => remove(friend)}>
                      {t("Cancel")}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {data.blocked.length > 0 ? (
            <section className="panel rounded-2xl p-4">
              <h2 className="mb-3 text-sm font-semibold">{t("Blocked players")}</h2>
              <div className="flex flex-col gap-2">
                {data.blocked.map((friend) => (
                  <div key={friend.id} className="flex items-center gap-3 rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2">
                    <Avatar id={friend.avatar} size={30} />
                    <span className="min-w-0 flex-1 truncate text-sm">{friend.displayName}</span>
                    <Button size="xs" variant="outline" loading={busy === `unblock:${friend.id}`} onClick={() => unblock(friend)}>
                      {t("Unblock")}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
