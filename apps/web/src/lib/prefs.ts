import { useSyncExternalStore } from "react";

export type Locale = "en" | "fr";

export interface Prefs {
  sound: boolean;
  /** Optional stripped-back mode. Off by default: the game is meant to look alive. */
  lowPower: boolean;
  /** Explicit in-app motion preference. The OS preference is intentionally not forced
   *  so the animations are visible by default; this toggle is the escape hatch. */
  reducedMotion: boolean;
  locale: Locale;
  /** Owner-only in-game cheat panel. Off by default; the server still re-checks. */
  ownerCheats: boolean;
}

const STORAGE_KEY = "stacked:prefs";

function browserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function read(): Prefs {
  const fallback: Prefs = {
    sound: true,
    lowPower: false,
    reducedMotion: false,
    locale: browserLocale(),
    ownerCheats: false,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      sound: typeof parsed.sound === "boolean" ? parsed.sound : fallback.sound,
      lowPower: typeof parsed.lowPower === "boolean" ? parsed.lowPower : fallback.lowPower,
      reducedMotion:
        typeof parsed.reducedMotion === "boolean" ? parsed.reducedMotion : fallback.reducedMotion,
      locale: parsed.locale === "fr" || parsed.locale === "en" ? parsed.locale : fallback.locale,
      ownerCheats: typeof parsed.ownerCheats === "boolean" ? parsed.ownerCheats : fallback.ownerCheats,
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
  document.documentElement.lang = prefs.locale;
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
