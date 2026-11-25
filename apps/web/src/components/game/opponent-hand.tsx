import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import { CardBack } from "@/components/cards/playing-card";
import { useT } from "@/lib/i18n";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The opponent's hand, UNO-style: a tiny fan of card backs and a count.
 * Cards animate in/out when the server says their hand changed.
 */
export function OpponentHand({
  count,
  back,
  size = 28,
  max = 7,
  compact = false,
  className,
}: {
  count: number;
  back: string;
  size?: number;
  max?: number;
  compact?: boolean;
  className?: string;
}) {
  const shown = Math.min(count, max);
  const overlap = Math.round(size * (compact ? 0.58 : 0.54));
  const indexes = Array.from({ length: shown }, (_, index) => index);
  const t = useT();

  return (
    <div
      className={cn("opp-hand", className)}
      style={{ height: Math.round(size * 1.4) + 8 }}
      aria-label={t(count === 1 ? "{n} card in hand" : "{n} cards in hand", { n: count })}
    >
      <div className="opp-hand-fan" style={{ paddingInline: Math.round(size * 0.22) }}>
        <AnimatePresence initial={false}>
          {indexes.map((index) => {
            const middle = (shown - 1) / 2;
            return (
              <motion.div
                key={index}
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
                <CardBack back={back} style={{ "--cw": `${size}px` } as CSSProperties} />
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
