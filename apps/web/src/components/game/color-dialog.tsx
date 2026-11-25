import type { Card, Color } from "@stacked/shared";
import { COLORS } from "@stacked/shared";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/brand/avatar";
import { NameEffect } from "@/components/brand/name-effect";
import { CardFace } from "@/components/cards/playing-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const COLOR_META: Record<Color, { label: string; className: string; hex: string }> = {
  red: { label: "Red", className: "bg-[#e24242]", hex: "#e24242" },
  yellow: { label: "Yellow", className: "bg-[#edb70a]", hex: "#edb70a" },
  green: { label: "Green", className: "bg-[#2f9d58]", hex: "#2f9d58" },
  blue: { label: "Blue", className: "bg-[#2f6ad0]", hex: "#2f6ad0" },
};

export function ColorDialog({
  card,
  open,
  onOpenChange,
  onPick,
}: {
  card: Card | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (color: Color) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.03em]">Call a colour.</DialogTitle>
          <DialogDescription>The next player has to match it, unless they can stack something worse.</DialogDescription>
        </DialogHeader>
        {card && (
          <div className="flex justify-center py-1">
            <CardFace card={card} style={{ "--cw": "78px" } as React.CSSProperties} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onPick(color)}
              className={cn(
                "group flex h-20 items-center justify-center rounded-xl border border-white/10 text-sm font-semibold text-black/75 shadow-inner transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]",
                COLOR_META[color].className,
              )}
            >
              {COLOR_META[color].label}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SwapDialog({
  card,
  open,
  onOpenChange,
  players,
  meId,
  outOfTurn = false,
  onConfirm,
}: {
  card: Card | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: { id: string; name: string; avatar: string; nameEffect: string; cardCount: number; isBot: boolean }[];
  meId: string;
  outOfTurn?: boolean;
  onConfirm: (targetId: string, color: Color) => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [color, setColor] = useState<Color | null>(null);

  useEffect(() => {
    if (open) {
      setTarget(null);
      setColor(null);
    }
  }, [open, card?.id]);

  const others = players.filter((player) => player.id !== meId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-[-0.03em]">
            {outOfTurn ? "Swap in!" : "Oscar's Swap"}
          </DialogTitle>
          <DialogDescription>
            {outOfTurn
              ? "You are jumping the queue. Pick a victim and a colour before the window closes."
              : "Take someone else's hand. Pick the victim, then the colour that follows."}
          </DialogDescription>
        </DialogHeader>
        {card && (
          <div className="flex justify-center">
            <CardFace card={card} style={{ "--cw": "64px" } as React.CSSProperties} />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="eyebrow">Swap with</p>
          <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
            {others.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => setTarget(player.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                  target === player.id
                    ? "border-brand/50 bg-brand/[0.08]"
                    : "border-white/8 hover:border-white/16",
                )}
              >
                <Avatar id={player.avatar} size={26} />
                <span className="min-w-0 flex-1">
                  <NameEffect effect={player.nameEffect} className="block text-xs font-medium">
                    {player.name}
                  </NameEffect>
                  <span className="block font-mono text-[10px] text-muted-foreground">{player.cardCount} cards</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="eyebrow">Colour after</p>
          <div className="grid grid-cols-4 gap-1.5">
            {COLORS.map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setColor(entry)}
                aria-label={COLOR_META[entry].label}
                className={cn(
                  "h-9 rounded-lg border transition-all",
                  COLOR_META[entry].className,
                  color === entry ? "border-white/80 ring-2 ring-white/40" : "border-white/10 opacity-80 hover:opacity-100",
                )}
              />
            ))}
          </div>
        </div>

        <Button
          variant="brand"
          size="lg"
          disabled={!target || !color}
          onClick={() => {
            if (target && color) onConfirm(target, color);
          }}
        >
          Swap hands
        </Button>
      </DialogContent>
    </Dialog>
  );
}
