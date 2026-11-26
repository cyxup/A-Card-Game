import type {
  AdminAuditView,
  AdminReportView,
  AdminRoomView,
  AdminTagView,
  AdminUserDetail,
  AdminUserView,
} from "@stacked/shared";
import {
  Ban,
  Check,
  Coins,
  Crown,
  DoorOpen,
  FlaskConical,
  Flag,
  Gavel,
  HandCoins,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldOff,
  Snowflake,
  Sparkles,
  Tag,
  Trash2,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Avatar } from "@/components/brand/avatar";
import { NameEffect } from "@/components/brand/name-effect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { compactNumber, formatRelative } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { playSound } from "@/lib/sound";

const TAG_COLORS = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#38bdf8", "#a78bfa", "#f472b6"];

function TagChip({ tag }: { tag: AdminTagView }) {
  return (
    <Badge
      variant="outline"
      className="rounded-full px-1.5 py-0 text-[9px] font-medium"
      style={{
        borderColor: `${tag.color}66`,
        backgroundColor: `${tag.color}14`,
        color: tag.color,
      }}
    >
      {tag.name}
    </Badge>
  );
}

export default function AdminPage() {
  const { session, refresh } = useSession();
  const t = useT();
  const [users, setUsers] = useState<AdminUserView[] | null>(null);
  const [audit, setAudit] = useState<AdminAuditView[]>([]);
  const [rooms, setRooms] = useState<AdminRoomView[]>([]);
  const [reports, setReports] = useState<AdminReportView[]>([]);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [broadcast, setBroadcast] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<AdminUserView | null>(null);
  const [banReason, setBanReason] = useState("");
  const [cheatTarget, setCheatTarget] = useState<AdminUserView | null>(null);
  const [cheatAmount, setCheatAmount] = useState("1000");
  const [tagTarget, setTagTarget] = useState<AdminUserView | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [allTags, setAllTags] = useState<AdminTagView[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[5]);

  const me = session?.kind === "user" ? session.user : null;
  const isOwner = Boolean(me?.owner);

  async function load(q = query) {
    if (!isOwner) return;
    setError(null);
    try {
      const [list, log, liveRooms, reportList] = await Promise.all([
        api.get<AdminUserView[]>(`/api/admin/users?q=${encodeURIComponent(q)}`),
        api.get<AdminAuditView[]>("/api/admin/audit"),
        api.get<AdminRoomView[]>("/api/admin/rooms"),
        api.get<AdminReportView[]>("/api/admin/reports"),
      ]);
      setUsers(list);
      setAudit(log);
      setRooms(liveRooms);
      setReports(reportList);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Could not load the owner console."));
    }
  }

  useEffect(() => {
    if (!isOwner) return;
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  useEffect(() => {
    if (!users?.length) return;
    setCheatTarget((current) => {
      const wanted = current?.id ?? me?.id;
      return users.find((user) => user.id === wanted) ?? current ?? users[0] ?? null;
    });
  }, [users, me?.id]);

  async function act(key: string, run: () => Promise<unknown>, sound: Parameters<typeof playSound>[0] = "success") {
    if (busy) return;
    setBusy(key);
    try {
      await run();
      playSound(sound);
      await Promise.all([load(), refresh()]);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not load the owner console."));
    } finally {
      setBusy(null);
    }
  }

  async function cheat(patch: { coins?: number; xp?: number; unlockAll?: boolean }, sound: Parameters<typeof playSound>[0] = "coin") {
    if (!cheatTarget) return;
    const targetId = cheatTarget.id;
    await act(
      `cheat:${targetId}:${JSON.stringify(patch)}`,
      async () => {
        const updated = await api.post<AdminUserView>(`/api/admin/users/${targetId}/grant`, patch);
        setCheatTarget(updated);
        return updated;
      },
      sound,
    );
  }

  function reportAction(report: AdminReportView, status: "resolved" | "dismissed") {
    void act(
      `report:${status}:${report.id}`,
      () => api.post(`/api/admin/reports/${report.id}/status`, { status }),
      "success",
    );
  }

  function roomAction(action: "lobby" | "close" | "freeze", room: AdminRoomView) {
    const url =
      action === "lobby"
        ? `/api/admin/rooms/${room.code}/lobby`
        : action === "close"
          ? `/api/admin/rooms/${room.code}/close`
          : `/api/admin/rooms/${room.code}/freeze`;
    const body = action === "freeze" ? { frozen: !room.frozen } : {};
    void act(`room:${action}:${room.code}`, () => api.post(url, body), action === "close" ? "success" : "click");
  }

  async function sendBroadcast(event: FormEvent) {
    event.preventDefault();
    if (!broadcast.trim()) return;
    await act("broadcast", () => api.post("/api/admin/broadcast", { message: broadcast.trim() }), "success");
    setBroadcast("");
  }

  async function openDetail(user: AdminUserView) {
    if (busy) return;
    setBusy(`detail:${user.id}`);
    try {
      setDetail(await api.get<AdminUserDetail>(`/api/admin/users/${user.id}`));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not load that account."));
    } finally {
      setBusy(null);
    }
  }

  async function logoutDetail() {
    if (!detail || busy) return;
    await act(
      `logout:${detail.id}`,
      () => api.post(`/api/admin/users/${detail.id}/logout`, {}),
      "success",
    );
    setDetail({ ...detail, sessions: 0 });
  }

  function toggleBan(user: AdminUserView) {
    if (user.banned) {
      void act(`ban:${user.id}`, () => api.post<AdminUserView>(`/api/admin/users/${user.id}/unban`, {}), "success");
    } else {
      setBanTarget(user);
      setBanReason("");
    }
  }

  async function confirmBan(event: FormEvent) {
    event.preventDefault();
    if (!banTarget) return;
    await act(
      `ban:${banTarget.id}`,
      () => api.post<AdminUserView>(`/api/admin/users/${banTarget.id}/ban`, { reason: banReason }),
      "success",
    );
    setBanTarget(null);
  }

  async function openTags(user: AdminUserView) {
    if (busy) return;
    setTagTarget(user);
    setTagOpen(true);
    setSelectedTagIds(user.tags.map((tag) => tag.id));
    setNewTagName("");
    setBusy(`tags:open:${user.id}`);
    try {
      setAllTags(await api.get<AdminTagView[]>("/api/admin/tags"));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not load tags."));
    } finally {
      setBusy(null);
    }
  }

  function toggleTag(id: string) {
    setSelectedTagIds((current) =>
      current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id],
    );
  }

  async function createTag(event: FormEvent) {
    event.preventDefault();
    if (busy || !tagTarget) return;
    const name = newTagName.trim();
    if (!name) return;
    setBusy("tag:create");
    try {
      const created = await api.post<AdminTagView>("/api/admin/tags", { name, color: newTagColor });
      setAllTags((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTagIds((current) => [...current, created.id]);
      setNewTagName("");
      playSound("success");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not create that tag."));
    } finally {
      setBusy(null);
    }
  }

  async function deleteTag(tag: AdminTagView) {
    if (busy) return;
    if (!window.confirm(t("Delete tag {name}? It will be removed from every player.", { name: tag.name }))) {
      return;
    }
    setBusy(`tag:delete:${tag.id}`);
    try {
      await api.post(`/api/admin/tags/${tag.id}/delete`, {});
      setAllTags((current) => current.filter((item) => item.id !== tag.id));
      setSelectedTagIds((current) => current.filter((id) => id !== tag.id));
      playSound("success");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not delete that tag."));
    } finally {
      setBusy(null);
    }
  }

  async function saveTags() {
    if (!tagTarget || busy) return;
    const targetId = tagTarget.id;
    setBusy(`tags:save:${targetId}`);
    try {
      await api.post<AdminUserView>(`/api/admin/users/${targetId}/tags`, { tagIds: selectedTagIds });
      playSound("success");
      setTagOpen(false);
      await Promise.all([load(), refresh()]);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not save those tags."));
    } finally {
      setBusy(null);
    }
  }

  function toggleBeta(user: AdminUserView) {
    void act(
      `beta:${user.id}`,
      () => api.post<AdminUserView>(`/api/admin/users/${user.id}/beta`, { beta: !user.beta }),
      "equip",
    );
  }

  const cheatValue = Math.max(0, Math.min(1_000_000, Math.floor(Number(cheatAmount) || 0)));
  function cheatBusy(patch: { coins?: number; xp?: number; unlockAll?: boolean }) {
    return cheatTarget ? busy === `cheat:${cheatTarget.id}:${JSON.stringify(patch)}` : false;
  }

  if (!isOwner) {
    return (
      <div className="grid min-h-[70vh] place-items-center px-4">
        <div className="panel max-w-md rounded-2xl p-8 text-center">
          <Shield className="mx-auto mb-4 size-7 text-brand" />
          <h1 className="text-2xl font-semibold tracking-[-0.04em]">{t("Access denied.")}</h1>
          <Link href="/play" className="mt-5 inline-flex">
            <Button variant="brand">{t("Back to the tables")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">{t("Admin tools")}</p>
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">
            <Shield className="size-8 text-brand" /> {t("Owner console")}
          </h1>
          <p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
            {t("Bans, beta access and cheats. Every action is logged.")}
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} className="gap-2">
          <RefreshCw /> {t("Refresh")}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-xs text-destructive">
          {error}
        </div>
      )}

      <section className="panel mb-4 rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-brand" />
            <h2 className="text-sm font-semibold">{t("Live tables")}</h2>
            <Badge variant="outline">{rooms.length}</Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void load()} className="gap-1.5">
            <RefreshCw className="size-3.5" /> {t("Refresh")}
          </Button>
        </div>
        {rooms.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-muted-foreground">
            {t("No tables running right now.")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rooms.map((room) => (
              <li key={room.code} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2.5">
                <span className="font-mono text-xs tracking-[0.16em]">{room.code}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {room.hostName ?? t("Open table")} · {room.players.length}/{room.maxPlayers}
                    {room.wager > 0 ? ` · ${t("Wager {n}", { n: room.wager })}` : ""}
                    {room.pot > 0 ? ` · ${t("Pot {n}", { n: room.pot })}` : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {t(room.phase)} · {room.players.filter((player) => !player.isBot).length} {t("humans")} · {room.players.filter((player) => player.isBot).length} {t("bots")}
                  </p>
                </div>
                {room.frozen ? <Badge variant="warning">{t("Frozen")}</Badge> : null}
                <Button
                  size="xs"
                  variant="outline"
                  className="gap-1"
                  loading={busy === `room:freeze:${room.code}`}
                  onClick={() => roomAction("freeze", room)}
                >
                  <Snowflake className="size-3" /> {room.frozen ? t("Resume") : t("Freeze")}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  className="gap-1"
                  loading={busy === `room:lobby:${room.code}`}
                  onClick={() => roomAction("lobby", room)}
                >
                  <DoorOpen className="size-3" /> {t("Lobby")}
                </Button>
                <Button
                  size="xs"
                  variant="destructive"
                  className="gap-1"
                  loading={busy === `room:close:${room.code}`}
                  onClick={() => roomAction("close", room)}
                >
                  <Trash2 className="size-3" /> {t("Close")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={sendBroadcast} className="panel mb-4 flex flex-wrap items-center gap-2 rounded-2xl p-4">
        <Zap className="size-4 text-warning" />
        <Input
          value={broadcast}
          onChange={(event) => setBroadcast(event.target.value)}
          placeholder={t("Broadcast a message to every connected player")}
          maxLength={240}
          className="h-9 min-w-[220px] flex-1"
        />
        <Button type="submit" size="sm" variant="brand" disabled={!broadcast.trim()} loading={busy === "broadcast"}>
          {t("Broadcast")}
        </Button>
      </form>

      <section className="panel mb-4 rounded-2xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <Flag className="size-4 text-warning" />
          <h2 className="text-sm font-semibold">{t("Reports")}</h2>
          <Badge variant="outline">{reports.filter((report) => report.status === "pending").length}</Badge>
        </div>
        {reports.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("No reports yet.")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reports.slice(0, 12).map((report) => (
              <li key={report.id} className="flex flex-wrap items-start gap-2 rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs">
                    <span className="font-medium">{report.reporterName}</span> →{" "}
                    <span className="font-medium text-brand">{report.targetName}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{report.reason}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{formatRelative(report.createdAt)}</p>
                </div>
                {report.status === "pending" ? (
                  <div className="flex gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      className="gap-1"
                      loading={busy === `report:resolved:${report.id}`}
                      onClick={() => reportAction(report, "resolved")}
                    >
                      <Check className="size-3" /> {t("Resolve")}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="gap-1"
                      loading={busy === `report:dismissed:${report.id}`}
                      onClick={() => reportAction(report, "dismissed")}
                    >
                      <X className="size-3" /> {t("Dismiss")}
                    </Button>
                  </div>
                ) : (
                  <Badge variant={report.status === "resolved" ? "success" : "outline"}>{t(report.status)}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <section className="panel rounded-2xl p-5">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="size-4 text-warning" />
              <h2 className="text-sm font-semibold">{t("Cheats")}</h2>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <Label
                  htmlFor="cheat-target"
                  className="mb-1.5 block text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  {t("Apply cheats to")}
                </Label>
                <Select
                  value={cheatTarget?.id ?? ""}
                  onValueChange={(id) => {
                    const next = users?.find((user) => user.id === id);
                    if (next) setCheatTarget(next);
                  }}
                  disabled={!users?.length}
                >
                  <SelectTrigger id="cheat-target" className="h-9 w-full">
                    <SelectValue placeholder={t("Pick a player")} />
                  </SelectTrigger>
                  <SelectContent>
                    {cheatTarget && !(users ?? []).some((user) => user.id === cheatTarget.id) ? (
                      <SelectItem value={cheatTarget.id}>
                        {cheatTarget.displayName} @{cheatTarget.username}
                      </SelectItem>
                    ) : null}
                    {(users ?? []).map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.displayName} <span className="text-muted-foreground">@{user.username}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {cheatTarget && cheatTarget.id !== me?.id ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    const self = users?.find((user) => user.id === me?.id);
                    if (self) setCheatTarget(self);
                  }}
                >
                  <UserRound /> {t("Me")}
                </Button>
              ) : null}
            </div>

            {cheatTarget ? (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
                  <Avatar
                    id={cheatTarget.id === me?.id ? me?.avatar ?? "rook" : cheatTarget.owner ? "ace" : "rook"}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-semibold">
                      <NameEffect
                        effect={cheatTarget.id === me?.id ? me?.nameEffect : cheatTarget.owner ? "spectrum" : undefined}
                      >
                        {cheatTarget.displayName}
                      </NameEffect>
                      {cheatTarget.id === me?.id ? (
                        <span className="text-[10px] font-normal text-muted-foreground">({t("you")})</span>
                      ) : null}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {t("level {n}", { n: cheatTarget.level })} · {compactNumber(cheatTarget.coins)} {t("coins")} ·{" "}
                      {compactNumber(cheatTarget.xp)} xp
                    </p>
                  </div>
                  {cheatTarget.owner ? (
                    <Badge variant="warning" className="gap-1">
                      <Crown className="size-3" /> {t("owner")}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{t("Target")}</Badge>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busy !== null}
                    loading={cheatBusy({ coins: 1000 })}
                    onClick={() => void cheat({ coins: 1000 })}
                  >
                    <Coins /> {t("+1 000 coins")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busy !== null}
                    loading={cheatBusy({ coins: 10000 })}
                    onClick={() => void cheat({ coins: 10000 })}
                  >
                    <Coins /> {t("+10 000 coins")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busy !== null}
                    loading={cheatBusy({ xp: 1000 })}
                    onClick={() => void cheat({ xp: 1000 })}
                  >
                    <Sparkles /> {t("+1 000 XP")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busy !== null}
                    loading={cheatBusy({ xp: 10000 })}
                    onClick={() => void cheat({ xp: 10000 })}
                  >
                    <Sparkles /> {t("+10 000 XP")}
                  </Button>
                  <Button
                    size="sm"
                    variant="brand"
                    className="gap-1.5"
                    disabled={busy !== null}
                    loading={cheatBusy({ unlockAll: true })}
                    onClick={() => void cheat({ unlockAll: true }, "reward")}
                  >
                    <HandCoins /> {t("Unlock every cosmetic")}
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-white/7 bg-white/[0.015] p-3">
                  <div>
                    <Label
                      htmlFor="cheat-amount"
                      className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground"
                    >
                      {t("Custom amount")}
                    </Label>
                    <Input
                      id="cheat-amount"
                      type="number"
                      min={1}
                      max={1_000_000}
                      value={cheatAmount}
                      onChange={(event) => setCheatAmount(event.target.value)}
                      className="h-9 w-32 font-mono text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busy !== null || cheatValue <= 0}
                    loading={cheatBusy({ coins: cheatValue })}
                    onClick={() => void cheat({ coins: cheatValue })}
                  >
                    <Coins /> {t("Add coins")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busy !== null || cheatValue <= 0}
                    loading={cheatBusy({ xp: cheatValue })}
                    onClick={() => void cheat({ xp: cheatValue })}
                  >
                    <Sparkles /> {t("Add XP")}
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-muted-foreground">
                {t("Pick a player to apply cheats.")}
              </p>
            )}
          </section>

          <section className="panel rounded-2xl p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <UserRound className="size-4 text-brand" />
                <h2 className="text-sm font-semibold">{t("Players")}</h2>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void load(query);
                }}
                className="flex items-center gap-2"
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("Search users")}
                    className="h-8 w-52 pl-8 text-xs"
                  />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  {t("Search")}
                </Button>
              </form>
            </div>

            {!users && (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
              </div>
            )}

            {users && users.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-muted-foreground">
                {t("No users found.")}
              </p>
            )}

            {users && users.length > 0 && (
              <ul className="divide-y divide-white/6">
                {users.map((user) => (
                  <li key={user.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Avatar id={user.owner ? "ace" : "rook"} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          <NameEffect effect={user.owner ? "spectrum" : undefined}>{user.displayName}</NameEffect>
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">@{user.username}</span>
                        {user.tags.map((tag) => (
                          <TagChip key={tag.id} tag={tag} />
                        ))}
                        {user.owner && (
                          <Badge variant="warning" className="gap-1">
                            <Crown className="size-3" /> {t("Owner")}
                          </Badge>
                        )}
                        {user.beta && (
                          <Badge variant="outline" className="gap-1 border-info/40 text-info">
                            <FlaskConical className="size-3" /> {t("Beta tester")}
                          </Badge>
                        )}
                        {user.banned && (
                          <Badge variant="destructive" className="gap-1">
                            <Ban className="size-3" /> {t("Banned")}
                          </Badge>
                        )}
                      </div>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {t("level {n}", { n: user.level })} · {compactNumber(user.coins)} {t("coins")} ·{" "}
                        {compactNumber(user.xp)} xp · {t(user.games === 1 ? "{n} game" : "{n} games", { n: user.games })}
                        {user.banReason ? ` · ${user.banReason}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="xs"
                        variant="outline"
                        loading={busy === `detail:${user.id}`}
                        onClick={() => void openDetail(user)}
                        className="gap-1"
                      >
                        <UserRound /> {t("Details")}
                      </Button>
                      <Button
                        size="xs"
                        variant={user.banned ? "brand" : "outline"}
                        loading={busy === `ban:${user.id}`}
                        disabled={user.id === me?.id}
                        onClick={() => toggleBan(user)}
                        className="gap-1"
                      >
                        {user.banned ? <ShieldOff /> : <Gavel />}
                        {user.banned ? t("Unban") : t("Ban")}
                      </Button>
                      {user.id !== me?.id && (
                        <Button
                          size="xs"
                          variant="outline"
                          loading={busy === `beta:${user.id}`}
                          onClick={() => toggleBeta(user)}
                          className="gap-1"
                        >
                          <FlaskConical /> {user.beta ? t("Remove beta") : t("Make beta")}
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="outline"
                        loading={busy === `tags:open:${user.id}`}
                        onClick={() => void openTags(user)}
                        className="gap-1"
                      >
                        <Tag /> {user.tags.length > 0 ? t("Tags") : t("Add tag")}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        loading={busy === `kick:${user.id}`}
                        onClick={() =>
                          void act(
                            `kick:${user.id}`,
                            () => api.post(`/api/admin/users/${user.id}/kick`, {}),
                            "success",
                          )
                        }
                        disabled={user.id === me?.id}
                        className="gap-1"
                      >
                        <Trash2 /> {t("Kick")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="panel h-fit rounded-2xl p-4 lg:sticky lg:top-20">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Gavel className="size-4 text-warning" />
              <h2 className="text-sm font-semibold">{t("Recent actions")}</h2>
            </div>
            {audit.length > 0 ? <Badge variant="outline">{audit.length}</Badge> : null}
          </div>
          {audit.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("No actions yet.")}</p>
          ) : (
            <ul className="flex max-h-[45vh] flex-col divide-y divide-white/6 overflow-y-auto overscroll-contain pr-1">
              {audit.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 py-1.5 leading-snug">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand/60" />
                  <p className="min-w-0 flex-1 break-words text-[10px] text-foreground/85">
                    <span className="font-medium">{entry.actorName}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span>{entry.targetName ?? "—"}</span>{" "}
                    <span className="text-brand">{t(entry.action)}</span>
                  </p>
                  <time className="shrink-0 whitespace-nowrap text-[9px] text-muted-foreground">
                    {formatRelative(entry.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => (!open ? setDetail(null) : undefined)}>
        <DialogContent size="lg" className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.displayName ?? t("Account details")}</DialogTitle>
            <DialogDescription>
              {detail ? `@${detail.username} · ${t("level {n}", { n: detail.level })}` : null}
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2">
                  <p className="font-mono text-lg">{compactNumber(detail.coins)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("coins")}</p>
                </div>
                <div className="rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2">
                  <p className="font-mono text-lg">{compactNumber(detail.xp)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">XP</p>
                </div>
                <div className="rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2">
                  <p className="font-mono text-lg">{detail.games}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("games")}</p>
                </div>
                <div className="rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2">
                  <p className="font-mono text-lg">{detail.wins}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("wins")}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {detail.tags.map((tag) => (
                  <TagChip key={tag.id} tag={tag} />
                ))}
                {detail.tags.length > 0 ? <span className="h-3 w-px bg-white/10" /> : null}
                <Badge variant="outline">{detail.sessions} {t("sessions")}</Badge>
                <Badge variant="outline">{detail.ownedCosmetics.length} {t("cosmetics")}</Badge>
                <Badge variant="outline">{detail.chatPacks.length} {t("chat packs")}</Badge>
                <Button
                  size="xs"
                  variant="outline"
                  className="ml-auto gap-1"
                  loading={busy === `logout:${detail.id}`}
                  onClick={() => void logoutDetail()}
                >
                  <DoorOpen className="size-3" /> {t("Sign out everywhere")}
                </Button>
              </div>

              <div>
                <p className="eyebrow mb-2">{t("Recent matches")}</p>
                {detail.recentMatches.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("No matches yet.")}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {detail.recentMatches.map((match) => (
                      <li key={match.id} className="flex items-center gap-2 rounded-lg border border-white/6 px-2.5 py-1.5 text-xs">
                        <span className="font-mono text-[10px]">{match.roomCode}</span>
                        <span className="text-muted-foreground">#{match.placement}</span>
                        <span className="min-w-0 flex-1 truncate">{match.winnerName ?? t("No winner")}</span>
                        <span className="text-muted-foreground">{formatRelative(match.endedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogContent size="lg" className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("Tags for {name}", { name: tagTarget?.displayName ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("Tags are visible to everyone. They do not affect gameplay.")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <p className="eyebrow mb-2">{t("Applied tags")}</p>
              {selectedTagIds.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("No tags applied.")}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {allTags
                    .filter((tag) => selectedTagIds.includes(tag.id))
                    .map((tag) => (
                      <TagChip key={tag.id} tag={tag} />
                    ))}
                </div>
              )}
            </div>

            <div>
              <p className="eyebrow mb-2">{t("Available tags")}</p>
              {allTags.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("No tags yet. Create one below.")}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => {
                    const active = selectedTagIds.includes(tag.id);
                    return (
                      <div key={tag.id} className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition-[background-color,opacity] disabled:opacity-50"
                          style={{
                            borderColor: `${tag.color}66`,
                            color: tag.color,
                            backgroundColor: active ? `${tag.color}22` : "transparent",
                            opacity: active ? 1 : 0.62,
                          }}
                          disabled={busy !== null}
                        >
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                          {active ? <Check className="size-3" /> : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteTag(tag)}
                          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                          aria-label={t("Delete tag")}
                          disabled={busy !== null}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <form onSubmit={createTag} className="flex flex-wrap items-end gap-2 rounded-xl border border-white/7 bg-white/[0.015] p-3">
              <div className="min-w-[180px] flex-1">
                <Label
                  htmlFor="new-tag-name"
                  className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  {t("New tag")}
                </Label>
                <Input
                  id="new-tag-name"
                  value={newTagName}
                  onChange={(event) => setNewTagName(event.target.value)}
                  placeholder={t("Tag name")}
                  maxLength={20}
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("Colour")}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {TAG_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewTagColor(color)}
                      className={
                        newTagColor === color
                          ? "size-6 rounded-full border-2 border-white"
                          : "size-6 rounded-full border-2 border-transparent"
                      }
                      style={{ backgroundColor: color }}
                      aria-label={color}
                    />
                  ))}
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(event) => setNewTagColor(event.target.value)}
                    aria-label={t("Custom colour")}
                    className="size-7 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                  />
                </div>
              </div>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={busy !== null || !newTagName.trim()}
                loading={busy === "tag:create"}
              >
                <Plus className="size-3.5" /> {t("Create tag")}
              </Button>
            </form>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setTagOpen(false)}>
                {t("Cancel")}
              </Button>
              <Button
                variant="brand"
                onClick={() => void saveTags()}
                loading={busy === `tags:save:${tagTarget?.id}`}
              >
                {t("Apply tags")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(banTarget)} onOpenChange={(open) => (!open ? setBanTarget(null) : undefined)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t("Ban {name}", { name: banTarget?.username ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("Their sessions will be closed immediately. You can unban them from this console.")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmBan} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ban-reason">{t("Ban reason")}</Label>
              <Input
                id="ban-reason"
                value={banReason}
                onChange={(event) => setBanReason(event.target.value)}
                placeholder={t("Reason (optional)")}
                maxLength={240}
                autoFocus
              />
            </div>
            <Button type="submit" variant="destructive" loading={busy === `ban:${banTarget?.id}`}>
              <Gavel /> {t("Confirm ban")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
