import { Check, Copy, KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
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
import { PasswordInput } from "@/components/auth/password-input";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { playSound } from "@/lib/sound";
import { useSession } from "@/lib/session";

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const t = useT();

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      playSound("success");
      toast.success(t("Recovery code copied."));
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("Copy failed. Select the code and copy it manually."));
    }
  }

  return (
    <div className="rounded-2xl border border-brand/25 bg-brand/[0.055] p-4">
      <p className="eyebrow mb-2">{t("your recovery code")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="select-all break-all font-mono text-[13px] font-semibold tracking-[0.06em] text-foreground sm:text-sm">
          {code}
        </code>
        <Button type="button" size="xs" variant="outline" className="ml-auto gap-1.5" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />} {copied ? t("Copied") : t("Copy")}
        </Button>
      </div>
    </div>
  );
}

export function RecoveryCodeDialog({
  open,
  onOpenChange,
  code,
  title = "Keep this code safe.",
  description = "If you lose your password, this is the only way back into your account.",
  confirmLabel = "I stored it safely",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string | null;
  title?: string;
  description?: string;
  confirmLabel?: string;
}) {
  const t = useT();
  if (!code) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" showCloseButton={false}>
        <DialogHeader>
          <div className="mb-2 grid size-11 place-items-center rounded-2xl bg-brand/12 text-brand">
            <KeyRound className="size-5" />
          </div>
          <DialogTitle>{title ?? t("Keep this code safe.")}</DialogTitle>
          <DialogDescription>
            {description ?? t("If you lose your password, this is the only way back into your account.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <CodeBlock code={code} />

          <div className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t("Write it down or put it in a password manager. It is shown once and cannot be recovered later. Anyone with this code can reset your password.")}
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-success" />
            {t("Stored as a hash on the server. Not even the house can read it.")}
          </div>

          <Button type="button" variant="brand" size="lg" className="w-full" onClick={() => onOpenChange(false)}>
            {confirmLabel ?? t("I stored it safely")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RecoverAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { recover } = useSession();
  const t = useT();
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);

  function close(next: boolean) {
    if (!next) {
      setUsername("");
      setToken("");
      setPassword("");
      setConfirm("");
      setError(null);
      setNewCode(null);
    }
    onOpenChange(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      setError(t("The new password needs at least 8 characters."));
      return;
    }
    if (password !== confirm) {
      setError(t("Those passwords don't match."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await recover(username, token, password);
      playSound("success");
      toast.success(t("Password reset. Save your new recovery code."));
      setNewCode(data.recoveryCode ?? null);
      if (!data.recoveryCode) close(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("Could not recover that account.");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  if (newCode) {
    return <RecoveryCodeDialog open={open} onOpenChange={close} code={newCode} title={t("Your new recovery code.")} />;
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t("Recover an account")}</DialogTitle>
          <DialogDescription>
            {t("Use the recovery code you saved when you created the account. Your old password stops working immediately.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="recover-username">{t("Username")}</Label>
            <Input
              id="recover-username"
              value={username}
              onChange={(event) => setUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16))}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="lucky_ace"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recover-token">{t("Recovery code")}</Label>
            <Input
              id="recover-token"
              value={token}
              onChange={(event) => setToken(event.target.value.toUpperCase().slice(0, 40))}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
              className="font-mono tracking-[0.08em]"
              autoComplete="one-time-code"
              spellCheck={false}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recover-password">{t("New password")}</Label>
            <PasswordInput
              id="recover-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
              minLength={8}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recover-confirm">{t("Confirm new password")}</Label>
            <PasswordInput
              id="recover-confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              placeholder="Same again"
              required
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" variant="brand" size="lg" className="w-full" loading={busy}>
            {t("Reset password")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GenerateRecoveryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const t = useT();

  function close(next: boolean) {
    if (!next) {
      setPassword("");
      setError(null);
      setCode(null);
    }
    onOpenChange(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || password.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{ recoveryCode: string }>("/api/me/recovery", { password });
      playSound("success");
      toast.success(t("New recovery code generated."));
      setCode(data.recoveryCode);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("Could not generate a code.");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  if (code) {
    return <RecoveryCodeDialog open={open} onOpenChange={close} code={code} title={t("Your new recovery code.")} />;
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t("New recovery code")}</DialogTitle>
          <DialogDescription>
            {t("Confirm your password. The previous code stops working as soon as a new one is generated.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="recovery-password">{t("Current password")}</Label>
            <PasswordInput
              id="recovery-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" variant="brand" size="lg" className="w-full" loading={busy} disabled={!password}>
            {t("Generate code")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
