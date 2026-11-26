import type { FriendRelationship, PlayerCardView } from "@stacked/shared";
import { Check, Clock, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/brand/avatar";
import { NameEffect } from "@/components/brand/name-effect";
import { UserTags } from "@/components/brand/user-tags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { compactNumber } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n";
import { playSound } from "@/lib/sound";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/7 bg-white/[0.015] px-3 py-2">
      <p className="font-mono text-base">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

export function PlayerProfileDialog({
  userId,
  onClose,
  onRelationshipChange,
}: {
  userId: string | null;
  onClose: () => void;
  onRelationshipChange?: (userId: string, relationship: FriendRelationship) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [profile, setProfile] = useState<PlayerCardView | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    setProfile(null);
    api
      .get<PlayerCardView>(`/api/players/${userId}`)
      .then((data) => {
        if (alive) setProfile(data);
      })
      .catch((caught) => {
        if (alive) setError(caught instanceof Error ? caught.message : t("Could not load that player."));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  async function addFriend() {
    if (!profile || busy) return;
    setBusy(true);
    try {
      await api.post("/api/friends/request", { userId: profile.id });
      setProfile({ ...profile, relationship: "pending_out" });
      onRelationshipChange?.(profile.id, "pending_out");
      playSound("success");
      toast.success(t("Friend request sent."));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not send that friend request."));
    } finally {
      setBusy(false);
    }
  }

  async function acceptFriend() {
    if (!profile || busy) return;
    setBusy(true);
    try {
      await api.post(`/api/friends/${profile.id}/accept`, {});
      setProfile({ ...profile, relationship: "friends" });
      onRelationshipChange?.(profile.id, "friends");
      playSound("success");
      toast.success(t("Friend request accepted."));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Could not accept that request."));
    } finally {
      setBusy(false);
    }
  }

  const winRate = profile && profile.stats.games > 0 ? Math.round((profile.stats.wins / profile.stats.games) * 100) : 0;
  const joined = profile
    ? new Date(profile.createdAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <Dialog open={Boolean(userId)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent size="lg" className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{profile?.displayName ?? t("Player profile")}</DialogTitle>
          <DialogDescription>
            {profile ? `@${profile.username}` : t("Their stats and tags at a glance.")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-16 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <Skeleton key={index} className="h-16 rounded-xl" />
              ))}
            </div>
          </div>
        ) : error ? (
          <p className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-xs text-destructive">
            {error}
          </p>
        ) : profile ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar id={profile.avatar} size={64} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-semibold tracking-[-0.03em]">
                  <NameEffect effect={profile.nameEffect}>{profile.displayName}</NameEffect>
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="brand">{t("level {n}", { n: profile.level })}</Badge>
                  <Badge variant="outline">{compactNumber(profile.xp)} xp</Badge>
                  {profile.owner ? (
                    <Badge variant="warning">{t("owner")}</Badge>
                  ) : profile.beta ? (
                    <Badge variant="outline" className="border-info/40 text-info">
                      {t("beta")}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="gap-1">
                    <Users className="size-3" />{" "}
                    {t(profile.friendCount === 1 ? "{n} friend" : "{n} friends", { n: profile.friendCount })}
                  </Badge>
                </div>
                <UserTags tags={profile.tags} max={4} className="mt-1.5" />
              </div>

              {profile.relationship === "self" ? (
                <Badge variant="outline">{t("You")}</Badge>
              ) : profile.relationship === "friends" ? (
                <Badge variant="success" className="gap-1">
                  <Check className="size-3" /> {t("Friends")}
                </Badge>
              ) : profile.relationship === "pending_out" ? (
                <Badge variant="outline" className="gap-1">
                  <Clock className="size-3" /> {t("Requested")}
                </Badge>
              ) : profile.relationship === "pending_in" ? (
                <Button size="sm" variant="brand" loading={busy} onClick={() => void acceptFriend()}>
                  {t("Accept friend")}
                </Button>
              ) : profile.relationship === "blocked" ? (
                <Badge variant="destructive">{t("Blocked")}</Badge>
              ) : (
                <Button size="sm" variant="brand" className="gap-1.5" loading={busy} onClick={() => void addFriend()}>
                  <UserPlus className="size-3.5" /> {t("Add friend")}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label={t("games")} value={String(profile.stats.games)} />
              <Stat label={t("wins")} value={String(profile.stats.wins)} />
              <Stat label={t("win rate")} value={`${winRate}%`} />
              <Stat label={t("jump-ins")} value={String(profile.stats.jumps)} />
              <Stat label={t("stacks")} value={String(profile.stats.stacks)} />
              <Stat label={t("Member since")} value={joined} />
            </div>

            <p className="text-[11px] text-muted-foreground">
              {t("Player stats are updated at the end of each round.")}
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
