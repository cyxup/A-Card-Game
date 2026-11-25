import { cn } from "@/lib/utils";
import { Link } from "wouter";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link
      href="/"
      className={cn("group flex items-center gap-2.5", className)}
      aria-label={compact ? "stacked home" : undefined}
    >
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect x="4" y="9" width="15" height="21" rx="3.4" fill="#22262e" transform="rotate(-9 11.5 19.5)" />
        <rect
          x="12"
          y="5"
          width="16"
          height="22"
          rx="3.6"
          fill="#f4eee2"
          transform="rotate(7 20 16)"
          stroke="rgba(0,0,0,.18)"
        />
        <rect x="20.2" y="9.4" width="3.2" height="3.2" rx=".7" fill="#ff5a2b" transform="rotate(7 21.8 11)" />
        <text
          x="19.8"
          y="22.6"
          fill="#14100d"
          fontFamily="Geist Variable, sans-serif"
          fontWeight="700"
          fontSize="9.4"
          textAnchor="middle"
          transform="rotate(7 19.8 20)"
        >
          S
        </text>
      </svg>
      {!compact && <span className="text-[15px] font-semibold tracking-[-0.04em]">stacked</span>}
    </Link>
  );
}
