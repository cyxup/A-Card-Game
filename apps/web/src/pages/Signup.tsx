import { ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { PasswordInput } from "@/components/auth/password-input";
import { RecoveryCodeDialog } from "@/components/auth/recovery";
import { CardBack, CardFace } from "@/components/cards/playing-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";

export default function SignupPage() {
  const { register, session } = useSession();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const signingUp = useRef(false);

  useEffect(() => {
    if (session?.kind === "user" && !signingUp.current && !recoveryCode) navigate("/play");
  }, [session?.kind, recoveryCode, navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
      setError("Usernames are 3–16 letters, numbers or underscores.");
      return;
    }
    if (password.length < 8) {
      setError("Passwords need at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    signingUp.current = true;
    try {
      const data = await register(username, password, displayName || username);
      toast.success(`Welcome to the table, ${data.user?.displayName ?? username}.`);
      if (data.recoveryCode) setRecoveryCode(data.recoveryCode);
      else navigate("/play");
    } catch (caught) {
      signingUp.current = false;
      const message = caught instanceof Error ? caught.message : "Could not create the account.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
      <div className="hidden flex-col items-start gap-6 lg:flex">
        <p className="eyebrow">make it permanent</p>
        <h1 className="display text-[clamp(3rem,6.4vw,5.6rem)]">
          <span className="hero-outline block">KEEP WHAT</span>
          <span className="brand-text block">YOU WIN.</span>
        </h1>
        <p className="max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
          An account is the difference between a fun night and a collection. Levels, coins, card backs, felts,
          avatars, name effects and win animations all stick.
        </p>
        <ul className="mt-2 flex flex-col gap-2 text-sm text-muted-foreground">
          {[
            "Saved progress and match history",
            "Level and achievement unlocks",
            "Cosmetics visible to everyone at the table",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-brand" /> {item}
            </li>
          ))}
        </ul>
        <div className="relative mt-2 flex gap-3">
          <div className="rotate-[-10deg]">
            <CardFace
              card={{ id: "signup-a", color: null, kind: "wild4", value: null }}
              style={{ "--cw": "84px" } as React.CSSProperties}
            />
          </div>
          <div className="translate-y-3 rotate-[5deg]">
            <CardBack back="aurora" style={{ "--cw": "84px" } as React.CSSProperties} />
          </div>
          <div className="rotate-[15deg]">
            <CardFace
              card={{ id: "signup-b", color: "green", kind: "number", value: 0 }}
              style={{ "--cw": "84px" } as React.CSSProperties}
            />
          </div>
        </div>
      </div>

      <div className="panel mx-auto w-full max-w-md rounded-2xl p-6 sm:p-8">
        <div className="mb-6">
          <p className="eyebrow mb-2">create account</p>
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">Claim a name.</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Free, no email, no nonsense.</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16))}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="lucky_ace"
              required
              minLength={3}
            />
            <p className="text-[11px] text-muted-foreground">For signing in. Letters, numbers, underscores.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value.slice(0, 20))}
              placeholder="Lucky Ace"
              maxLength={20}
            />
            <p className="text-[11px] text-muted-foreground">Shown at the table. You can change it later.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
              minLength={8}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <PasswordInput
              id="confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              placeholder="Same again"
              required
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" variant="brand" size="lg" className="w-full" loading={busy}>
            Create account <ArrowRight />
          </Button>
        </form>

        <p className="mt-6 border-t border-white/8 pt-5 text-xs text-muted-foreground">
          Already have one?{" "}
          <Link href="/login" className="text-foreground underline decoration-border underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>

      <RecoveryCodeDialog
        open={Boolean(recoveryCode)}
        onOpenChange={(open) => {
          if (!open) {
            setRecoveryCode(null);
            navigate("/play");
          }
        }}
        code={recoveryCode}
        title="One last thing."
        description="This is the only way to reset your password. Save it before you sit down."
      />
    </div>
  );
}
