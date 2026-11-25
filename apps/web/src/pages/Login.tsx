import { ArrowRight, LogIn } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { CardBack, CardFace } from "@/components/cards/playing-card";
import { PasswordInput } from "@/components/auth/password-input";
import { RecoverAccountDialog, RecoveryCodeDialog } from "@/components/auth/recovery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";

export default function LoginPage() {
  const { login, session } = useSession();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const loggingIn = useRef(false);

  useEffect(() => {
    if (session?.kind === "user" && !loggingIn.current && !recoveryCode && !recoverOpen) navigate("/play");
  }, [session?.kind, recoveryCode, recoverOpen, navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    loggingIn.current = true;
    try {
      const data = await login(username, password);
      toast.success(`Welcome back, ${data.user?.displayName ?? "player"}.`);
      if (data.recoveryCode) setRecoveryCode(data.recoveryCode);
      else navigate("/play");
    } catch (caught) {
      loggingIn.current = false;
      const message = caught instanceof Error ? caught.message : "Could not sign in.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
      <div className="hidden flex-col items-start gap-6 lg:flex">
        <p className="eyebrow">welcome back</p>
        <h1 className="display text-[clamp(3rem,6.4vw,5.6rem)]">
          <span className="hero-outline block">THE TABLE</span>
          <span className="brand-text block">KEPT YOUR</span>
          <span className="block">SEAT.</span>
        </h1>
        <p className="max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
          Coins, levels, card backs and the unlocked chaos are exactly where you left them.
        </p>
        <div className="relative mt-4 flex gap-3">
          <div className="rotate-[-8deg]">
            <CardBack back="holo" style={{ "--cw": "86px" } as React.CSSProperties} />
          </div>
          <div className="translate-y-4 rotate-[6deg]">
            <CardFace
              card={{ id: "login-a", color: "red", kind: "number", value: 7 }}
              style={{ "--cw": "86px" } as React.CSSProperties}
            />
          </div>
          <div className="rotate-[14deg]">
            <CardBack back="ember" style={{ "--cw": "86px" } as React.CSSProperties} />
          </div>
        </div>
      </div>

      <div className="panel mx-auto w-full max-w-md rounded-2xl p-6 sm:p-8">
        <div className="mb-6">
          <p className="eyebrow mb-2">sign in</p>
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">Back to the cards.</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Use your username, not your display name.</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="lucky_ace"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setRecoverOpen(true)}
              className="self-end text-[11px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
            >
              Lost your password?
            </button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" variant="brand" size="lg" className="w-full" loading={busy}>
            <LogIn /> Sign in
          </Button>
        </form>

        <div className="mt-6 flex flex-col gap-3 border-t border-white/8 pt-5 text-xs text-muted-foreground">
          <p>
            No account?{" "}
            <Link href="/signup" className="text-foreground underline decoration-border underline-offset-4">
              Create one <ArrowRight className="inline size-3" />
            </Link>
          </p>
          <p>
            Or just{" "}
            <Link href="/play" className="text-foreground underline decoration-border underline-offset-4">
              play as a guest
            </Link>{" "}
            first.
          </p>
        </div>
      </div>

      <RecoverAccountDialog open={recoverOpen} onOpenChange={setRecoverOpen} />
      <RecoveryCodeDialog
        open={Boolean(recoveryCode)}
        onOpenChange={(open) => {
          if (!open) {
            setRecoveryCode(null);
            navigate("/play");
          }
        }}
        code={recoveryCode}
        title="We made you a recovery code."
        description="This account did not have one yet. Save it now — it is the only way to reset your password."
      />
    </div>
  );
}
