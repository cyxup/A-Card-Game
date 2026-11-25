import { useMemo } from "react";
import { usePrefs } from "@/lib/prefs";

interface Particle {
  left: number;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
  color: string;
  scale: number;
}

export function WinEffect({ effect }: { effect: string | null | undefined }) {
  const { lowPower } = usePrefs();
  const particles = useMemo<Particle[]>(() => {
    const count = 26;
    const colors = ["#ff5a2b", "#ffd166", "#ff2d55", "#7fdcff", "#9fe6b8", "#f4eee2"];
    return Array.from({ length: count }, (_, index) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.7,
      duration: 2.3 + Math.random() * 1.6,
      drift: (Math.random() - 0.5) * 160,
      spin: 180 + Math.random() * 540,
      color: colors[index % colors.length] ?? "#ff5a2b",
      scale: 0.7 + Math.random() * 0.9,
    }));
  }, [effect]);

  if (!effect || effect === "none") return null;

  if (effect === "shockwave") {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        <span className="shockwave" />
        <span className="shockwave" style={{ animationDelay: ".35s" }} />
      </div>
    );
  }

  if (lowPower && effect !== "confetti") return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {particles.map((particle, index) => (
        <span
          key={index}
          className={effect === "snow" ? "win-snow" : effect === "embers" ? "win-ember" : "win-confetti"}
          style={
            {
              left: `${particle.left}%`,
              background:
                effect === "confetti"
                  ? particle.color
                  : effect === "snow"
                    ? undefined
                    : "linear-gradient(180deg,#ffe6b8,#ff5a2b)",
              width: effect === "snow" ? 6 : 6,
              height: effect === "snow" ? 6 : 11,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
              "--drift": `${particle.drift}px`,
              "--spin": `${particle.spin}deg`,
              scale: String(particle.scale),
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
