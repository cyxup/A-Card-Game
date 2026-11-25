import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function NameEffect({ effect, children, className }: { effect?: string | null; children: ReactNode; className?: string }) {
  const active = effect && effect !== "plain" ? `name-effect-${effect}` : undefined;
  return <span className={cn("truncate", active, className)}>{children}</span>;
}
