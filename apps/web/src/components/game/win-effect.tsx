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

export function WinEffect({
  effect,
  force = false,
}: {
  effect: string | null | undefined;
  /** Owner previews should play even when low-power mode is on. */
  force?: boolean;
}) {
  const { lowPower, reducedMotion } = usePrefs();
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
  if (reducedMotion && !force) return null;

  if (effect === "shockwave") {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        <span className="shockwave" />
        <span className="shockwave" style={{ animationDelay: ".35s" }} />
      </div>
    );
  }

  if (effect === "prism-burst") {
    const shards = Array.from({ length: 20 }, (_, index) => {
      const angle = (index / 20) * Math.PI * 2 + (index % 2 ? 0.16 : -0.12);
      const distance = 90 + ((index * 37) % 170);
      return {
        tx: Math.cos(angle) * distance,
        ty: Math.sin(angle) * distance,
        rot: ((index * 53) % 360) - 180,
        hue: (index * 41) % 360,
        delay: (index % 5) * 0.02,
      };
    });

    return (
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        <span className="detonate-flash" />
        <span className="detonate-core" />
        {Array.from({ length: 14 }).map((_, index) => (
          <span
            key={`ray-${index}`}
            className="detonate-ray"
            style={
              {
                "--angle": `${index * (360 / 14)}deg`,
                "--ray-hue": `${(index * 29) % 360}`,
                animationDelay: `${(index % 4) * 0.015}s`,
              } as React.CSSProperties
            }
          />
        ))}
        <span className="prism-burst-ring" />
        <span className="prism-burst-ring" style={{ animationDelay: ".18s" }} />
        <span className="prism-burst-ring" style={{ animationDelay: ".38s" }} />
        {shards.map((shard, index) => (
          <span
            key={`shard-${index}`}
            className="detonate-shard"
            style={
              {
                "--tx": `${shard.tx}px`,
                "--ty": `${shard.ty}px`,
                "--rot": `${shard.rot}deg`,
                background: `hsl(${shard.hue} 95% 66%)`,
                boxShadow: `0 0 12px hsl(${shard.hue} 95% 66% / 0.8)`,
                animationDelay: `${shard.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}
        {particles.map((particle, index) => (
          <span
            key={index}
            className="win-confetti"
            style={
              {
                left: `${particle.left}%`,
                background: `hsl(${(index * 37) % 360} 92% 66%)`,
                width: 7,
                height: 12,
                animationDelay: `${particle.delay + 0.2}s`,
                animationDuration: `${particle.duration}s`,
                "--drift": `${particle.drift}px`,
                "--spin": `${particle.spin}deg`,
                scale: String(particle.scale),
                boxShadow: `0 0 12px hsl(${(index * 37) % 360} 92% 66% / 0.7)`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    );
  }

  if (effect === "beta-burst") {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        <span className="beta-scan" />
        <span className="beta-ring" />
        <span className="beta-ring" style={{ animationDelay: ".28s" }} />
        <span className="beta-ring" style={{ animationDelay: ".56s" }} />
        {particles.map((particle, index) => (
          <span
            key={index}
            className="win-confetti"
            style={
              {
                left: `${particle.left}%`,
                background: index % 3 === 0 ? "#ff6ad5" : index % 3 === 1 ? "#7ef9ff" : "#c9a7ff",
                width: 5,
                height: 5,
                animationDelay: `${particle.delay}s`,
                animationDuration: `${particle.duration - 0.4}s`,
                "--drift": `${particle.drift}px`,
                "--spin": `${particle.spin}deg`,
                scale: String(particle.scale),
                boxShadow: `0 0 10px ${index % 3 === 0 ? "#ff6ad5" : "#7ef9ff"}`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    );
  }

  if (lowPower && effect !== "confetti" && !force) return null;

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
