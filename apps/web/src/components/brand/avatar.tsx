import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, ReactNode> = {
  rook: (
    <>
      <path d="M7 20h10M8 20V9l4-5 4 5v11" />
      <path d="M10 12h4" />
    </>
  ),
  comet: (
    <>
      <circle cx="14.5" cy="9.5" r="3.2" />
      <path d="M4 20l6.4-6.4M4.5 14.5l2 2M9.5 4.5l2 2" />
    </>
  ),
  fox: (
    <>
      <path d="M4 5l4.2 3h7.6L20 5l-1.2 10L12 21l-6.8-6z" />
      <path d="M9 11.5h.01M15 11.5h.01M11 15h2" />
    </>
  ),
  ghost: (
    <>
      <path d="M6 20V11a6 6 0 0112 0v9l-2-1.8-2 1.8-2-1.8-2 1.8-2-1.8z" />
      <path d="M9.5 11h.01M14.5 11h.01" />
    </>
  ),
  crown: (
    <>
      <path d="M4 18h16M5 8l3 4 4-7 4 7 3-4v9H5z" />
      <path d="M8 13.5h8" />
    </>
  ),
  skull: (
    <>
      <path d="M18 11a6 6 0 10-12 0c0 2 1 3.2 2 4v3h8v-3c1-.8 2-2 2-4z" />
      <path d="M9 11h.01M15 11h.01M10 15v3M14 15v3" />
    </>
  ),
  orb: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" />
    </>
  ),
  flame: (
    <>
      <path d="M12 21c4.2 0 6.4-2.9 6.4-6.2 0-5.2-6.4-9.8-6.4-9.8s1 4.4-2.2 7.3C7.3 14.9 7.8 21 12 21z" />
      <path d="M12 17.5c1.4 0 2.2-1 2.2-2.2 0-1.7-2.2-3.3-2.2-3.3s.2 1.6-.7 2.6-.8 2.9.7 2.9z" />
    </>
  ),
  ace: (
    <>
      <path d="M12 3.5 19 12l-7 8.5L5 12z" />
      <path d="M12 7v10M8.5 12h7" />
    </>
  ),
};

export function Avatar({
  id,
  size = 40,
  className,
  title,
}: {
  id: string;
  size?: number;
  className?: string;
  title?: string;
}) {
  const icon = ICONS[id] ?? ICONS.rook;
  return (
    <div
      className={cn("avatar-chip", `av-${id}`, className)}
      style={{ width: size, height: size }}
      title={title}
      aria-hidden={!title}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
    </div>
  );
}
