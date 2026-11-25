import type { Card, Color } from "@stacked/shared";
import { COLORS } from "@stacked/shared";
import { ArrowRightLeft, X } from "lucide-react";
import { CardFace } from "@/components/cards/playing-card";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const COLOR_META: Record<Color, { label: string; className: string; hex: string }> = {
  red: { label: "Red", className: "bg-[#e24242]", hex: "#e24242" },
  yellow: { label: "Yellow", className: "bg-[#edb70a]", hex: "#edb70a" },
  green: { label: "Green", className: "bg-[#2f9d58]", hex: "#2f9d58" },
  blue: { label: "Blue", className: "bg-[#2f6ad0]", hex: "#2f6ad0" },
};

/**
 * Colour call rendered on the table itself: four swatches around the card that
 * card that is being played. No dialog, nothing that covers the table.
 */
export function TableColorPicker({
  card,
  eyebrow,
  subtitle,
  onPick,
  onCancel,
}: {
  card: Card | null;
  eyebrow?: string;
  subtitle?: string | null;
  onPick: (color: Color) => void;
  onCancel: () => void;
}) {
  const t = useT();
  if (!card) return null;

  return (
    <div className="table-picker-layer">
      <div className="table-picker" role="group" aria-label={eyebrow ?? t("Choose a colour")}>
        <div className="table-picker-head">
          <p className="eyebrow">{eyebrow ?? t("Choose a colour")}</p>
          {subtitle ? <p className="table-picker-sub">{subtitle}</p> : null}
        </div>

        <div className="table-picker-wheel">
          <div className="table-picker-card">
            <CardFace card={card} style={{ "--cw": "74px" } as React.CSSProperties} />
          </div>
          {COLORS.map((color, index) => (
            <button
              key={color}
              type="button"
              onClick={() => onPick(color)}
              className={cn(
                "table-picker-swatch",
                `picker-slot-${index}`,
                COLOR_META[color].className,
              )}
              aria-label={t(COLOR_META[color].label)}
            >
              <span className="table-picker-swatch-label">{t(COLOR_META[color].label)}</span>
            </button>
          ))}
        </div>

        <button type="button" className="table-picker-cancel" onClick={onCancel}>
          <X className="size-3.5" /> {t("Cancel")}
        </button>
      </div>
    </div>
  );
}

/**
 * Targeting hint shown while the player has to pick a seat for Oscar's Swap.
 * The seats themselves light up; this only explains the interaction and offers
 * a way out.
 */
export function TableSwapPrompt({
  card,
  title,
  subtitle,
  onCancel,
}: {
  card: Card | null;
  title?: string;
  subtitle?: string;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="table-swap-layer">
      <div className="table-swap-pop" role="status">
        {card ? (
          <span className="table-swap-card">
            <CardFace card={card} style={{ "--cw": "46px" } as React.CSSProperties} />
          </span>
        ) : (
          <span className="table-swap-icon">
            <ArrowRightLeft className="size-4" />
          </span>
        )}
        <div className="table-swap-copy">
          <p className="eyebrow">{t("Oscar's Swap")}</p>
          <p className="table-swap-title">{title ?? t("Pick a player to swap hands with")}</p>
          <p className="table-swap-sub">
            {subtitle ?? t("Tap a highlighted seat at the top — their hand becomes yours.")}
          </p>
        </div>
        <Button size="xs" variant="ghost" onClick={onCancel} className="shrink-0 gap-1">
          <X className="size-3.5" /> {t("Cancel")}
        </Button>
      </div>
    </div>
  );
}
