import { Play, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { game, useGame } from "@/lib/game";
import { useT } from "@/lib/i18n";

export function FriendInvites() {
  const { invites } = useGame();
  const t = useT();
  if (invites.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[60] flex w-[min(340px,calc(100vw-2rem))] flex-col gap-2">
      {invites.map((invite) => (
        <div
          key={invite.key}
          className="rounded-2xl border border-brand/35 bg-background/95 p-3 shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/12 text-brand">
              <Users className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-[-0.02em]">{t("Table invite")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("{name} invited you to {code}.", { name: invite.fromName, code: invite.roomCode })}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {t("{n}/{max} players", { n: invite.players, max: invite.maxPlayers })}
              </p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => game.dismissInvite(invite.key)}
              aria-label={t("Dismiss")}
            >
              <X />
            </Button>
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="brand"
              className="flex-1 gap-1.5"
              onClick={() => {
                game.dismissInvite(invite.key);
                window.location.assign(`/room/${invite.roomCode}`);
              }}
            >
              <Play /> {t("Join table")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
