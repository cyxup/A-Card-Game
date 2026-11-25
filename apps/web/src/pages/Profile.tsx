import type { CosmeticItem, CosmeticSlot, ProfilePayload } from "@stacked/shared";
import { SLOT_LABEL, SLOT_FALLBACK, COSMETICS_BY_ID } from "@stacked/shared";
import {
  ArrowRight,
  Check,
  Coins,
  Gauge,
  KeyRound,
  Lock,
  LogOut,
  Pencil,
  Sparkles,
  Trophy,
  UserRound,
  Volume2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Avatar } from "@/components/brand/avatar";
import { NameEffect } from "@/components/brand/name-effect";
import { GenerateRecoveryDialog } from "@/components/auth/recovery";
import { CardBack } from "@/components/cards/playing-card";
import { EffectPreviewDialog } from "@/components/game/effect-preview";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { tNow, useT } from "@/lib/i18n";
import { usePrefs, setPrefs } from "@/lib/prefs";
import { playSound } from "@/lib/sound";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const SLOTS: CosmeticSlot[] = ["cardBack", "table", "avatar", "nameEffect", "winEffect"];
const RARITY_STYLE = {
  common: "text-muted-foreground",
  rare: "text-info",
  epic: "text-brand",
  legendary: "text-warning",
} as const;

function unlockText(item: CosmeticItem): string {
  switch (item.unlock.type) {
    case "default":
      return tNow("Default");
    case "shop":
      return tNow("{n} coins", { n: item.unlock.price });
    case "level":
      return tNow("Level {n}", { n: item.unlock.level });
    case "achievement":
      return tNow("Achievement reward");
    case "owner":
      return tNow("Owner only");
  }
}

function ItemPreview({ item }: { item: CosmeticItem }) {
  if (item.slot === "cardBack") {
    return <CardBack back={item.id} style={{ "--cw": "58px" } as React.CSSProperties} />;
  }
  if (item.slot === "table") {
    return (
      <div className={cn("relative h-16 w-32 rounded-xl border border-white/10", `felt-${item.id}`)}>
        <div className="absolute inset-2 rounded-full border border-white/10" />
      </div>
    );
  }
  if (item.slot === "avatar") {
    return <Avatar id={item.id} size={54} />;
  }
  if (item.slot === "nameEffect") {
    return (
      <NameEffect effect={item.id} className="text-xl font-semibold tracking-[-0.03em]">
        {tNow("Your name")}
      </NameEffect>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Sparkles className="size-4 text-warning" />
      {item.id === "none" ? tNow("No effect") : tNow("{name} animation", { name: item.name })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2.5">
      <span className="font-mono text-lg tabular-nums tracking-[-0.03em]">{value}</span>
      <span className="eyebrow">{label}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { session, loading, refresh, logout } = useSession();
  const t = useT();
  const prefs = usePrefs();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [tab, setTab] = useState<CosmeticSlot>("cardBack");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [preview, setPreview] = useState<CosmeticItem | null>(null);

  const userId = session?.kind === "user" ? session.user?.id : null;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let alive = true;
    setError(null);
    api
      .get<ProfilePayload>("/api/me/profile")
      .then((data) => {
        if (alive) setProfile(data);
      })
      .catch((caught) => {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load your profile.");
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  async function equip(item: CosmeticItem) {
    if (busy) return;
    setBusy(item.id);
    try {
      const data = await api.post<ProfilePayload>("/api/me/cosmetics/equip", { itemId: item.id });
      setProfile(data);
      playSound("equip");
      toast.success(t("{name} equipped.", { name: item.name }));
      void refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not equip that."));
    } finally {
      setBusy(null);
    }
  }

  async function buy(item: CosmeticItem) {
    if (busy || item.unlock.type !== "shop") return;
    setBusy(item.id);
    try {
      const data = await api.post<ProfilePayload>("/api/me/cosmetics/buy", { itemId: item.id });
      setProfile(data);
      playSound("coin");
      toast.success(t("{name} unlocked.", { name: item.name }));
      void refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not unlock that."));
    } finally {
      setBusy(null);
    }
  }

  async function rename(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy("rename");
    try {
      await api.patch("/api/me", { displayName: newName });
      const data = await api.get<ProfilePayload>("/api/me/profile");
      setProfile(data);
      setRenameOpen(false);
      playSound("success");
      toast.success(t("Display name updated."));
      void refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not change the name."));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!session || session.kind !== "user") {
    return (
      <div className="grid min-h-[70vh] place-items-center px-4">
        <div className="panel w-full max-w-md rounded-2xl p-7 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-brand/12 text-brand">
            <UserRound className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em]">{t("No collection yet.")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {session?.kind === "guest"
              ? t("You're playing as {name}. Create an account to keep levels, coins and cosmetics.", {
                  name: session.guestName ?? "",
                })
              : t("Sign in or create an account to build a collection.")}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Link href={session?.kind === "guest" ? "/signup" : "/login"}>
              <Button variant="brand" size="lg" className="w-full">
                {session?.kind === "guest" ? t("Create an account") : t("Sign in")} <ArrowRight />
              </Button>
            </Link>
            <Link href="/play">
              <Button variant="ghost" size="lg" className="w-full">
                {t("Back to the tables")}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        {error ? (
          <p className="text-sm text-destructive">{error ?? t("Could not load your profile.")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        )}
      </div>
    );
  }

  const user = profile.user;
  const winRate = user.stats.games > 0 ? Math.round((user.stats.wins / user.stats.games) * 100) : 0;
  const nextXp = 100 * user.level ** 2;
  const levelFloor = 100 * (user.level - 1) ** 2;
  const levelPct = Math.min(100, Math.round(((user.xp - levelFloor) / Math.max(1, nextXp - levelFloor)) * 100));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="panel relative overflow-hidden rounded-2xl p-5 sm:p-7">
        <div className="warm-glow pointer-events-none absolute inset-x-0 top-0 h-40 opacity-60" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <Avatar id={user.avatar} size={76} />
            <div className="min-w-0">
              <p className="eyebrow mb-1">@{user.username}</p>
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                  <NameEffect effect={user.nameEffect}>{user.displayName}</NameEffect>
                </h1>
                <Button variant="ghost" size="icon-xs" onClick={() => {
                  setNewName(user.displayName);
                  setRenameOpen(true);
                }} title={t("Change display name")}>
                  <Pencil />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="brand">{t("level {n}", { n: user.level })}</Badge>
                {user.owner && (
                  <Badge variant="warning" className="gap-1">
                    <Sparkles className="size-3" /> {t("owner")}
                  </Badge>
                )}
                <Badge variant="outline" className="gap-1">
                  <Coins className="size-3 text-brand" /> {compactNumber(user.coins)}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Trophy className="size-3 text-warning" /> {t(user.stats.wins === 1 ? "{n} win" : "{n} wins", { n: user.stats.wins })}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex-1 sm:pl-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t("level {n}", { n: user.level })}</span>
              <span className="font-mono">
                {user.xp - levelFloor}/{nextXp - levelFloor} xp
              </span>
            </div>
            <Progress value={levelPct} variant="brand" />
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
              <Stat label={t("games")} value={String(user.stats.games)} />
              <Stat label={t("win rate")} value={`${winRate}%`} />
              <Stat label={t("jump-ins")} value={String(user.stats.jumps)} />
              <Stat label={t("stacks")} value={String(user.stats.stacks)} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow mb-1">{t("the collection")}</p>
            <h2 className="text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{t("Dress the table.")}</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("{owned} of {total} unlocked", { owned: profile.owned.length, total: profile.items.length })}
          </p>
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as CosmeticSlot)}>
          <TabsList className="w-full overflow-x-auto sm:w-fit">
            {SLOTS.map((slot) => (
              <TabsTrigger key={slot} value={slot} className="shrink-0">
                {t(SLOT_LABEL[slot])}
              </TabsTrigger>
            ))}
          </TabsList>

          {SLOTS.map((slot) => {
            const items = profile.items.filter((item) => item.slot === slot);
            const equippedId = profile.equipped[slot] ?? SLOT_FALLBACK[slot];
            return (
              <TabsContent key={slot} value={slot} className="mt-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => {
                    const owned = profile.owned.includes(item.id);
                    const equipped = equippedId === item.id;
                    const affordable = item.unlock.type === "shop" && user.coins >= item.unlock.price;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "panel flex flex-col overflow-hidden rounded-2xl transition-colors",
                          equipped && "border-brand/35",
                          item.unlock.type === "owner" && "owner-card",
                        )}
                      >
                        <div className="relative flex h-28 items-center justify-center border-b border-white/6 bg-black/20">
                          <ItemPreview item={item} />
                          {!owned && (
                            <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full border border-white/10 bg-black/40 text-muted-foreground">
                              <Lock className="size-3" />
                            </span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-2 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold tracking-[-0.01em]">{t(item.name)}</p>
                              <p className={cn("text-[10px] uppercase tracking-[0.16em]", RARITY_STYLE[item.rarity])}>
                                {t(item.rarity)}
                              </p>
                            </div>
                            {equipped && (
                              <Badge variant="success" className="gap-1">
                                <Check className="size-3" /> {t("equipped")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">{t(item.description)}</p>
                          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                            <span className="text-[11px] text-muted-foreground">{unlockText(item)}</span>
                            <div className="flex items-center gap-1.5">
                              {item.slot === "winEffect" && (
                                <Button size="xs" variant="ghost" onClick={() => setPreview(item)}>
                                  {t("Preview")}
                                </Button>
                              )}
                              {equipped ? (
                                <Button size="xs" variant="secondary" disabled>
                                  {t("Worn")}
                                </Button>
                              ) : owned ? (
                                <Button size="xs" variant="outline" loading={busy === item.id} onClick={() => equip(item)}>
                                  {t("Equip")}
                                </Button>
                              ) : item.unlock.type === "shop" ? (
                                <Button
                                  size="xs"
                                  variant={affordable ? "brand" : "outline"}
                                  disabled={!affordable || Boolean(busy)}
                                  loading={busy === item.id}
                                  onClick={() => buy(item)}
                                  className="gap-1"
                                >
                                  <Coins /> {item.unlock.price}
                                </Button>
                              ) : (
                                <Button size="xs" variant="outline" disabled>
                                  {t("Locked")}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="panel rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="size-4 text-warning" />
            <h2 className="text-sm font-semibold">{t("Achievements")}</h2>
          </div>
          <div className="flex flex-col gap-2">
            {profile.achievements.map((achievement) => {
              const reward = achievement.reward ? COSMETICS_BY_ID.get(achievement.reward) : null;
              return (
                <div key={achievement.id} className="rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{t(achievement.name)}</span>
                      {achievement.unlocked && <Badge variant="success">{t("done")}</Badge>}
                      {reward && <span className="text-[10px] text-muted-foreground">→ {t(reward.name)}</span>}
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {achievement.progress}/{achievement.goal}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{t(achievement.description)}</p>
                  <Progress
                    className="mt-2"
                    size="sm"
                    value={achievement.progress}
                    max={achievement.goal}
                    variant={achievement.unlocked ? "success" : "brand"}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="panel rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <Gauge className="size-4 text-brand" />
              <h2 className="text-sm font-semibold">{t("Performance")}</h2>
            </div>
            <label className="flex items-center justify-between gap-3 py-2">
              <span className="flex items-center gap-2 text-xs">
                <Volume2 className="size-3.5 text-muted-foreground" /> {t("Sound effects")}
              </span>
              <Switch checked={prefs.sound} onCheckedChange={(value) => setPrefs({ sound: value })} />
            </label>
            <label className="flex items-center justify-between gap-3 py-2">
              <span className="flex flex-col gap-0.5 text-xs">
                <span>{t("Low-power mode")}</span>
                <span className="text-[10px] text-muted-foreground">{t("Drops grain and heavy effects.")}</span>
              </span>
              <Switch checked={prefs.lowPower} onCheckedChange={(value) => setPrefs({ lowPower: value })} />
            </label>
            <label className="flex items-center justify-between gap-3 py-2">
              <span className="flex flex-col gap-0.5 text-xs">
                <span>{t("Reduce motion")}</span>
                <span className="text-[10px] text-muted-foreground">{t("Stops the flying cards and springs.")}</span>
              </span>
              <Switch checked={prefs.reducedMotion} onCheckedChange={(value) => setPrefs({ reducedMotion: value })} />
            </label>
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-xs">{t("Language")}</span>
              <div className="flex gap-1">
                <Button
                  size="xs"
                  variant={prefs.locale === "en" ? "brand" : "outline"}
                  onClick={() => setPrefs({ locale: "en" })}
                >
                  EN
                </Button>
                <Button
                  size="xs"
                  variant={prefs.locale === "fr" ? "brand" : "outline"}
                  onClick={() => setPrefs({ locale: "fr" })}
                >
                  FR
                </Button>
              </div>
            </div>
          </div>

          <div className="panel rounded-2xl p-5">
            <h2 className="text-sm font-semibold">{t("Account")}</h2>
            <div className="mt-3 flex flex-col gap-2">
              <Button variant="outline" className="justify-start gap-2" onClick={() => { setNewName(user.displayName); setRenameOpen(true); }}>
                <Pencil /> {t("Change display name")}
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => setRecoveryOpen(true)}>
                <KeyRound /> {t("Recovery code")}
              </Button>
              <Button
                variant="ghost"
                className="justify-start gap-2 text-muted-foreground"
                onClick={() => {
                  void logout().then(() => toast.info(t("You signed out.")));
                }}
              >
                <LogOut /> {t("Sign out")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <GenerateRecoveryDialog open={recoveryOpen} onOpenChange={setRecoveryOpen} />
      <EffectPreviewDialog
        item={preview}
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      />

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t("Display name")}</DialogTitle>
            <DialogDescription>{t("2–20 characters. This is what the table sees.")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={rename} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName">{t("New name")}</Label>
              <Input
                id="displayName"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                maxLength={20}
                autoFocus
              />
            </div>
            <Button type="submit" variant="brand" loading={busy === "rename"} disabled={newName.trim().length < 2}>
              {t("Save name")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
