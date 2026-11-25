import type { AdminAuditView, AdminUserView } from "@stacked/shared";
import {
  Ban,
  Coins,
  Crown,
  Gavel,
  HandCoins,
  RefreshCw,
  Search,
  Shield,
  ShieldOff,
  Sparkles,
  Trash2,
  UserRound,
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { compactNumber, formatRelative } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { playSound } from "@/lib/sound";

export default function AdminPage() {
  const { session, refresh } = useSession();
  const t = useT();
  const [users, setUsers] = useState<AdminUserView[] | null>(null);
  const [audit, setAudit] = useState<AdminAuditView[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<AdminUserView | null>(null);
  const [banReason, setBanReason] = useState("");

  const me = session?.kind === "user" ? session.user : null;
  const isOwner = Boolean(me?.owner);

  async function load(q = query) {
    if (!isOwner) return;
    setError(null);
    try {
      const [list, log] = await Promise.all([
        api.get<AdminUserView[]>(`/api/admin/users?q=${encodeURIComponent(q)}`),
        api.get<AdminAuditView[]>("/api/admin/audit"),
      ]);
      setUsers(list);
      setAudit(log);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Could not load the owner console."));
    }
  }

  useEffect(() => {
    if (!isOwner) return;
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

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

  function cheat(patch: { coins?: number; xp?: number; unlockAll?: boolean }, sound: Parameters<typeof playSound>[0] = "coin") {
    return act(`cheat:${JSON.stringify(patch)}`, () => api.post<AdminUserView>("/api/admin/cheat", patch), sound);
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

  function toggleOwner(user: AdminUserView) {
    void act(
      `owner:${user.id}`,
      () => api.post<AdminUserView>(`/api/admin/users/${user.id}/owner`, { owner: !user.owner }),
      "equip",
    );
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
            {t("Bans, owner flags and cheats. Every action is logged.")}
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

      <div className="grid gap-4 lg:grid-cols-[0.92fr_0.08fr]">
        <div className="flex flex-col gap-4">
          <section className="panel rounded-2xl p-5">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="size-4 text-warning" />
              <h2 className="text-sm font-semibold">{t("Cheats")}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
              <Avatar id={me?.avatar ?? "rook"} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  <NameEffect effect={me?.nameEffect}>{me?.displayName}</NameEffect>
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {t("level {n}", { n: me?.level ?? 1 })} · {compactNumber(me?.coins ?? 0)} {t("coins")} ·{" "}
                  {compactNumber(me?.xp ?? 0)} xp
                </p>
              </div>
              <Badge variant="warning" className="gap-1">
                <Crown className="size-3" /> {t("owner")}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" loading={busy === 'cheat:{"coins":1000}'} onClick={() => void cheat({ coins: 1000 })}>
                <Coins /> {t("+1 000 coins")}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" loading={busy === 'cheat:{"coins":10000}'} onClick={() => void cheat({ coins: 10000 })}>
                <Coins /> {t("+10 000 coins")}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" loading={busy === 'cheat:{"xp":1000}'} onClick={() => void cheat({ xp: 1000 })}>
                <Sparkles /> {t("+1 000 XP")}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" loading={busy === 'cheat:{"xp":10000}'} onClick={() => void cheat({ xp: 10000 })}>
                <Sparkles /> {t("+10 000 XP")}
              </Button>
              <Button
                size="sm"
                variant="brand"
                className="gap-1.5"
                loading={busy === 'cheat:{"unlockAll":true}'}
                onClick={() => void cheat({ unlockAll: true }, "reward")}
              >
                <HandCoins /> {t("Unlock every cosmetic")}
              </Button>
            </div>
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
                        {user.owner && (
                          <Badge variant="warning" className="gap-1">
                            <Crown className="size-3" /> {t("Owner")}
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
                          loading={busy === `owner:${user.id}`}
                          onClick={() => toggleOwner(user)}
                          className="gap-1"
                        >
                          <Crown /> {user.owner ? t("Remove owner") : t("Make owner")}
                        </Button>
                      )}
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
                      <Button
                        size="xs"
                        variant="ghost"
                        loading={busy === `grant:${user.id}:coins`}
                        onClick={() =>
                          void act(
                            `grant:${user.id}:coins`,
                            () => api.post<AdminUserView>(`/api/admin/users/${user.id}/grant`, { coins: 1000 }),
                            "coin",
                          )
                        }
                        className="gap-1"
                      >
                        <Coins /> {t("+1k")}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        loading={busy === `grant:${user.id}:xp`}
                        onClick={() =>
                          void act(
                            `grant:${user.id}:xp`,
                            () => api.post<AdminUserView>(`/api/admin/users/${user.id}/grant`, { xp: 1000 }),
                            "reward",
                          )
                        }
                        className="gap-1"
                      >
                        <Sparkles /> {t("+1k XP")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="panel h-fit rounded-2xl p-5 lg:sticky lg:top-20">
          <div className="mb-3 flex items-center gap-2">
            <Gavel className="size-4 text-warning" />
            <h2 className="text-sm font-semibold">{t("Recent actions")}</h2>
          </div>
          {audit.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("No actions yet.")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {audit.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-white/6 bg-white/[0.015] px-2.5 py-2">
                  <p className="text-[11px] text-foreground/85">
                    <span className="font-medium">{entry.actorName}</span> → {entry.targetName ?? "—"}{" "}
                    <span className="text-brand">{t(entry.action)}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">{formatRelative(entry.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

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
