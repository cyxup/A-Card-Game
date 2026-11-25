import { ArrowRight, Bot, Layers, Repeat2, SkipForward, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";

const COLORS = [
  { id: "red", bg: "#e4473b", label: "Red" },
  { id: "yellow", bg: "#f5c542", label: "Yellow" },
  { id: "green", bg: "#2fbf71", label: "Green" },
  { id: "blue", bg: "#3b82f6", label: "Blue" },
];

function MiniCard({ children, color = "#17130f", label }: { children: ReactNode; color?: string; label?: string }) {
  return (
    <span
      className="relative grid h-[86px] w-[62px] shrink-0 place-items-center rounded-lg border border-black/30 bg-[#fffdf7] text-2xl font-black shadow-lg"
      style={{ color }}
    >
      {children}
      {label ? <span className="absolute bottom-1 text-[8px] font-mono uppercase text-black/45">{label}</span> : null}
    </span>
  );
}

export function TutorialDialog({
  open,
  onOpenChange,
  onPractice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPractice: () => void;
}) {
  const t = useT();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const steps = [
    {
      title: t("Empty your hand first."),
      body: t("Match a card with the colour or the number on the pile. First player with zero cards wins the round."),
      visual: (
        <div className="flex items-center justify-center gap-2">
          <MiniCard color="#e4473b">7</MiniCard>
          <MiniCard color="#17130f">+2</MiniCard>
          <MiniCard color="#3b82f6">3</MiniCard>
        </div>
      ),
    },
    {
      title: t("Match the colour or the number."),
      body: t("A red 3 can follow a red 7 or a blue 3. Wild cards let you call the next colour."),
      visual: (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {COLORS.map((color) => (
            <span
              key={color.id}
              className="grid size-11 place-items-center rounded-full border-2 border-white/25 text-[10px] font-mono font-bold text-black/65 shadow-lg"
              style={{ background: color.bg }}
            >
              {t(color.label)}
            </span>
          ))}
        </div>
      ),
    },
    {
      title: t("Special cards change the table."),
      body: t("+2 and +4 stack the pain, Skip jumps a seat, Reverse flips the direction, and Oscar's Swap takes another hand."),
      visual: (
        <div className="grid grid-cols-2 gap-2 text-left">
          {[
            [<Layers key="layers" className="size-4" />, t("+2 / +4: stack the pile")],
            [<SkipForward key="skip" className="size-4" />, t("Skip: lose a turn")],
            [<Repeat2 key="reverse" className="size-4" />, t("Reverse: change direction")],
            [<Sparkles key="swap" className="size-4" />, t("Swap: take a hand")],
          ].map(([icon, label]) => (
            <span key={String(label)} className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2 text-xs text-muted-foreground">
              <span className="text-brand">{icon}</span>
              {label}
            </span>
          ))}
        </div>
      ),
    },
    {
      title: t("Jump in after someone plays."),
      body: t("If you hold the exact same card, slam it out of turn during the five-second window. A 7 swaps hands with the next player; a 0 rotates every hand."),
      visual: (
        <div className="flex flex-col items-center gap-2">
          <Badge variant="brand" className="gap-1.5">
            <Layers className="size-3" /> {t("Exact duplicate = jump in")}
          </Badge>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {t("5 second window")}
          </span>
        </div>
      ),
    },
    {
      title: t("You're ready."),
      body: t("Practice against two bots first. No XP or coins, no pressure — then jump into a real table."),
      visual: (
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Bot className="size-8 text-brand" />
          <Bot className="size-8 text-brand/70" />
          <Bot className="size-8 text-brand/45" />
        </div>
      ),
    },
  ];

  const current = steps[step]!;
  const last = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="sm:max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="font-mono">
              {step + 1}/{steps.length}
            </Badge>
            <span className="eyebrow">{t("Tutorial")}</span>
          </div>
          <DialogTitle className="pt-2 text-2xl tracking-[-0.04em]">{current.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">{current.body}</DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-white/8 bg-black/25 px-4 py-6">{current.visual}</div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="ghost"
            size="lg"
            className="sm:flex-1"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep((value) => value - 1))}
          >
            {step === 0 ? t("Maybe later") : t("Back")}
          </Button>
          {last ? (
            <Button
              variant="brand"
              size="lg"
              className="gap-1.5 sm:flex-1"
              onClick={() => {
                onOpenChange(false);
                onPractice();
              }}
            >
              <Bot /> {t("Practice vs bots")}
            </Button>
          ) : (
            <Button variant="brand" size="lg" className="gap-1.5 sm:flex-1" onClick={() => setStep((value) => value + 1)}>
              {t("Next")} <ArrowRight />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
