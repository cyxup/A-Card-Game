import { Loader2, LogIn, UserRound, WifiOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useLocation, useParams } from "wouter";
import { askForName } from "@/components/auth/guest-prompt";
import { GameTable } from "@/components/game/game-table";
import { Lobby } from "@/components/room/lobby";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { game, useGame } from "@/lib/game";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";

function LoadingTable({ code }: { code: string }) {
  const t = useT();
  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="size-5 animate-spin text-brand" />
        <p className="text-sm font-medium">{t("Opening table {code}", { code })}</p>
        <p className="text-xs text-muted-foreground">{t("Shuffling. It takes a second.")}</p>
      </div>
    </div>
  );
}

function GuestGate({ code }: { code: string }) {
  const t = useT();
  return (
    <div className="grid min-h-[70vh] place-items-center px-4">
      <div className="panel w-full max-w-md rounded-2xl p-7 text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-brand/12 text-brand">
          <UserRound className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em]">
          {t("Sit at table {code}?", { code })}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("Pick a display name to join. You can create a proper account later and keep your unlocks.")}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="brand" size="lg" onClick={() => askForName()}>
            {t("Choose a name")}
          </Button>
          <Link href="/login">
            <Button variant="ghost" size="lg" className="w-full gap-2">
              <LogIn /> {t("Sign in instead")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const t = useT();
  const code = (params.code ?? "").toUpperCase();
  const { session, loading } = useSession();
  const { room, status } = useGame();
  const [, navigate] = useLocation();
  const joined = useRef<string | null>(null);
  const hadRoom = useRef(false);

  useEffect(() => {
    if (room?.code === code) hadRoom.current = true;
  }, [room?.code, code]);

  useEffect(() => {
    if (hadRoom.current && !room) {
      hadRoom.current = false;
      toast.info(t("You left the table."));
      navigate("/play");
    }
  }, [room, navigate]);

  useEffect(() => {
    if (loading) return;
    if (!code) {
      navigate("/play");
      return;
    }
    if (!session || session.kind === "anon") return;
    if (room?.code === code) return;
    if (joined.current === code) return;
    joined.current = code;
    game.join(code).catch((error: Error) => {
      joined.current = null;
      toast.error(error.message || t("Could not open that table."));
      navigate("/play");
    });
  }, [code, loading, session, room?.code, navigate]);

  function leave() {
    game.leaveRoom();
    navigate("/play");
  }

  if (loading) return <LoadingTable code={code || "…"} />;
  if (!session || session.kind === "anon") return <GuestGate code={code || "…"} />;
  if (!room || room.code !== code) return <LoadingTable code={code || "…"} />;

  return (
    <div className="relative">
      {status === "reconnecting" && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-warning/25 bg-warning/[0.08] px-4 py-1.5 text-[11px] text-warning backdrop-blur">
          <WifiOff className="size-3.5" />
          {t("Connection lost — reconnecting. Your seat is still warm.")}
        </div>
      )}
      {status === "closed" && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b border-destructive/25 bg-destructive/[0.08] px-4 py-2 text-[11px] text-destructive">
          {t("Disconnected")}.
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              joined.current = null;
              void game.connect().catch(() => toast.error(t("Still offline.")));
            }}
          >
            {t("Retry")}
          </Button>
        </div>
      )}

      {room.phase === "lobby" ? <Lobby room={room} onLeave={leave} /> : <GameTable room={room} onLeave={leave} />}
    </div>
  );
}
