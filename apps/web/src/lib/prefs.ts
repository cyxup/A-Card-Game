import { useSyncExternalStore } from "react";

export interface Prefs {
  sound: boolean;
  /** Optional stripped-back mode. Off by default: the game is meant to look alive. */
  lowPower: boolean;
  /** Explicit in-app motion preference. The OS preference is intentionally not forced
   *  so the animations are visible by default; this toggle is the escape hatch. */
  reducedMotion: boolean;
}

const STORAGE_KEY = "stacked:prefs";

function read(): Prefs {
  const fallback: Prefs = { sound: true, lowPower: false, reducedMotion: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      sound: typeof parsed.sound === "boolean" ? parsed.sound : fallback.sound,
      lowPower: typeof parsed.lowPower === "boolean" ? parsed.lowPower : fallback.lowPower,
      reducedMotion: typeof parsed.reducedMotion === "boolean" ? parsed.reducedMotion : fallback.reducedMotion,
    };
  } catch {
    return fallback;
  }
}

let prefs = read();
const listeners = new Set<() => void>();

function apply(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("perf-low", prefs.lowPower);
  document.documentElement.classList.toggle("reduce-motion", prefs.reducedMotion);
}

apply();

export function getPrefs(): Prefs {
  return prefs;
}

export function setPrefs(patch: Partial<Prefs>): void {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // private mode, fine
  }
  apply();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    subscribe,
    () => prefs,
    () => prefs,
  );
}
