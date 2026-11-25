import { useSyncExternalStore } from "react";

export interface Prefs {
  sound: boolean;
  lowPower: boolean;
}

const STORAGE_KEY = "stacked:prefs";

function detectLowPower(): boolean {
  if (typeof navigator === "undefined") return false;
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return cores <= 4 || memory <= 4;
}

function read(): Prefs {
  const fallback: Prefs = { sound: true, lowPower: detectLowPower() };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      sound: typeof parsed.sound === "boolean" ? parsed.sound : fallback.sound,
      lowPower: typeof parsed.lowPower === "boolean" ? parsed.lowPower : fallback.lowPower,
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
