import type { CosmeticItem } from "@stacked/shared";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WinEffect } from "@/components/game/win-effect";
import { useT } from "@/lib/i18n";
import { playSound } from "@/lib/sound";

export function EffectPreviewDialog({
  item,
  open,
  onOpenChange,
}: {
  item: CosmeticItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const [run, setRun] = useState(0);

  function replay() {
    setRun((value) => value + 1);
    playSound("reward");
  }

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t(item.name)}</DialogTitle>
          <DialogDescription>{t("Animation preview. Replay it as often as you like.")}</DialogDescription>
        </DialogHeader>

        <div className="felt-noir relative h-64 overflow-hidden rounded-2xl border border-white/10">
          <div className="table-vignette" aria-hidden />
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 opacity-80">
            <span className="h-16 w-11 rounded-md border border-white/20 bg-white/90 shadow-lg" />
            <span className="h-16 w-11 rounded-md border border-brand/40 bg-brand/20 shadow-lg" />
          </div>
          {item.id === "none" ? (
            <div className="absolute inset-0 grid place-items-center">
              <p className="text-sm text-white/55">{t("No effect")}</p>
            </div>
          ) : (
            <WinEffect key={run} effect={item.id} force />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={replay} className="gap-2">
            <RotateCcw /> {t("Replay")}
          </Button>
          <Button variant="brand" onClick={() => onOpenChange(false)}>
            {t("Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
