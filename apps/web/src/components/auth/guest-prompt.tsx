import { useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n";
import { useSession } from "@/lib/session";

let snapshot = { open: false };
let pending: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function askForName(after?: () => void): void {
  pending = after ?? null;
  snapshot = { open: true };
  emit();
}

function close(): void {
  snapshot = { open: false };
  pending = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function GuestPrompt() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const { becomeGuest } = useSession();
  const t = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const fieldId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (clean.length < 2) {
      toast.error(t("Use at least two characters."));
      return;
    }
    setBusy(true);
    try {
      await becomeGuest(clean);
      toast.success(t("You're in, {name}.", { name: clean }));
      const after = pending;
      snapshot = { open: false };
      pending = null;
      emit();
      setName("");
      after?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not set your name."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => (!open ? close() : undefined)}>
      <DialogContent size="sm" className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.03em]">{t("What should we call you?")}</DialogTitle>
          <DialogDescription>
            {t("Guests can sit at normal tables. XP, coins and cosmetics stay on an account.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId} className="eyebrow">
              {t("Display name")}
            </Label>
            <Input
              id={fieldId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("e.g. lucky ace")}
              maxLength={20}
              autoFocus
              autoComplete="nickname"
            />
            <p className="text-xs text-muted-foreground">{t("2–20 characters. You can sign up later.")}</p>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Link
              href="/signup"
              onClick={close}
              className="text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
            >
              {t("Create an account instead")}
            </Link>
            <Button type="submit" variant="brand" loading={busy} disabled={name.trim().length < 2}>
              {t("Sit down")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
