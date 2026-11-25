import { useEffect, useState } from "react";

/** Milliseconds left on a server deadline, adjusted for clock skew. */
export function useCountdown(deadline: number | undefined, offset: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now() + offset);

  useEffect(() => {
    setNow(Date.now() + offset);
    if (!active || !deadline) return;
    const timer = window.setInterval(() => setNow(Date.now() + offset), 500);
    return () => window.clearInterval(timer);
  }, [deadline, offset, active]);

  if (!deadline) return 0;
  return Math.max(0, deadline - now);
}
