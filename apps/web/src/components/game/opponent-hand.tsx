import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import type { Card } from "@stacked/shared";
import { CardBack, CardFace } from "@/components/cards/playing-card";
import { useT } from "@/lib/i18n";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The opponent's hand: a tiny fan of card backs (or, in Doubly Stacked, the
 * actual far-side faces) and a count. Cards animate when the hand changes.
 */
export function OpponentHand({
  count,
  back,
  cards,
  size = 28,
  max = 7,
  compact = false,
  farSide = false,
  className,
}: {
  count: number;
  back: string;
  /** Owner x-ray faces or the far side of a Doubly Stacked hand. */
  cards?: Card[];
  size?: number;
  max?: number;
  compact?: boolean;
  /** True when these faces are the far side of the table (Doubly Stacked). */
  farSide?: boolean;
  className?: string;
}) {
  const revealed = cards && cards.length > 0 ? cards : null;
  const shown = Math.min(revealed ? revealed.length : count, max);
  const overlap = revealed
    ? Math.round(size * 0.3)
    : Math.round(size * (compact ? 0.58 : 0.54));
  const indexes = Array.from({ length: shown }, (_, index) => index);
  const t = useT();

  return (
    <div
      className={cn("opp-hand", farSide && "opp-hand-far", className)}
      style={{ height: Math.round(size * 1.4) + 8 }}
      aria-label={t(count === 1 ? "{n} card in hand" : "{n} cards in hand", { n: count })}
    >
      <div className="opp-hand-fan" style={{ paddingInline: Math.round(size * 0.22) }}>
        <AnimatePresence initial={false}>
          {indexes.map((index) => {
            const middle = (shown - 1) / 2;
            const face = revealed?.[index];
            return (
              <motion.div
                key={face ? face.id : index}
                layout
                initial={{ opacity: 0, y: -14, scale: 0.7, rotate: -8 }}
                animate={{
                  opacity: 1,
                  y: Math.abs(index - middle) * 1.6,
                  scale: 1,
                  rotate: (index - middle) * 4.5,
                }}
                exit={{ opacity: 0, y: 14, scale: 0.7, rotate: 6, transition: { duration: 0.16 } }}
                transition={{ ...spring.snappy, delay: index * 0.025 }}
                style={{ marginLeft: index === 0 ? 0 : -overlap, zIndex: index }}
                className="opp-hand-card"
              >
                {face ? (
                  <CardFace card={face} style={{ "--cw": `${size}px` } as CSSProperties} />
                ) : (
                  <CardBack back={back} style={{ "--cw": `${size}px` } as CSSProperties} />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <motion.span
        key={count}
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={spring.bouncy}
        className="opp-hand-count"
      >
        {count}
      </motion.span>
    </div>
  );
}
