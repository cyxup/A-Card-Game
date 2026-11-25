import { getPrefs } from "./prefs";

type SoundName =
  | "click"
  | "tab"
  | "deal"
  | "play"
  | "draw"
  | "turn"
  | "win"
  | "lose"
  | "error"
  | "emote"
  | "stack"
  | "jump"
  | "swap"
  | "wild"
  | "shuffle"
  | "reward"
  | "coin"
  | "equip"
  | "success"
  | "tick";

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

function noiseBuffer(audio: AudioContext): AudioBuffer {
  if (noise) return noise;
  const length = Math.floor(audio.sampleRate * 0.16);
  noise = audio.createBuffer(1, length, audio.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  return noise;
}

function tone(audio: AudioContext, frequency: number, duration: number, gain: number, type: OscillatorType = "sine"): void {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  const now = audio.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(amp).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function swoosh(audio: AudioContext, gain: number, cutoff: number): void {
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const amp = audio.createGain();
  const now = audio.currentTime;
  source.buffer = noiseBuffer(audio);
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(cutoff, now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff / 3), now + 0.15);
  filter.Q.value = 0.8;
  amp.gain.setValueAtTime(gain, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  source.connect(filter).connect(amp).connect(audio.destination);
  source.start(now);
}

function slide(
  audio: AudioContext,
  from: number,
  to: number,
  duration: number,
  gain: number,
  type: OscillatorType = "triangle",
): void {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  const now = audio.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(from, now);
  osc.frequency.exponentialRampToValueAtTime(to, now + duration);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(amp).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playSound(name: SoundName): void {
  if (!getPrefs().sound) return;
  const audio = ctx();
  if (!audio) return;

  switch (name) {
    case "click":
      tone(audio, 620, 0.05, 0.025, "triangle");
      break;
    case "tab":
      tone(audio, 760, 0.045, 0.02, "sine");
      setTimeout(() => tone(audio, 1020, 0.06, 0.015, "sine"), 35);
      break;
    case "deal":
      swoosh(audio, 0.05, 2400);
      break;
    case "play":
      swoosh(audio, 0.07, 1800);
      tone(audio, 180, 0.1, 0.045, "triangle");
      break;
    case "draw":
      swoosh(audio, 0.045, 1200);
      break;
    case "turn":
      tone(audio, 740, 0.09, 0.03, "sine");
      tone(audio, 988, 0.14, 0.024, "sine");
      break;
    case "win":
      [523, 659, 784, 1046].forEach((frequency, index) => {
        setTimeout(() => tone(audio, frequency, 0.28, 0.045, "triangle"), index * 100);
      });
      break;
    case "lose":
      tone(audio, 220, 0.35, 0.04, "sine");
      setTimeout(() => tone(audio, 175, 0.45, 0.035, "sine"), 120);
      break;
    case "error":
      tone(audio, 140, 0.16, 0.05, "square");
      break;
    case "emote":
      tone(audio, 880, 0.07, 0.03, "sine");
      setTimeout(() => tone(audio, 1175, 0.1, 0.025, "sine"), 60);
      break;
    case "stack":
      swoosh(audio, 0.05, 900);
      tone(audio, 96, 0.16, 0.06, "triangle");
      setTimeout(() => tone(audio, 72, 0.18, 0.045, "triangle"), 60);
      break;
    case "jump":
      slide(audio, 360, 1180, 0.18, 0.045, "sawtooth");
      tone(audio, 1320, 0.09, 0.025, "sine");
      break;
    case "swap":
      swoosh(audio, 0.055, 2000);
      setTimeout(() => swoosh(audio, 0.045, 1500), 90);
      break;
    case "wild":
      [660, 880, 1100, 1320].forEach((frequency, index) => {
        setTimeout(() => tone(audio, frequency, 0.12, 0.02, "sine"), index * 45);
      });
      break;
    case "shuffle":
      swoosh(audio, 0.035, 3200);
      setTimeout(() => swoosh(audio, 0.03, 2600), 70);
      break;
    case "coin":
      tone(audio, 1046, 0.07, 0.03, "triangle");
      setTimeout(() => tone(audio, 1568, 0.12, 0.028, "triangle"), 55);
      break;
    case "reward":
      [659, 880, 1046, 1318].forEach((frequency, index) => {
        setTimeout(() => tone(audio, frequency, 0.2, 0.032, "sine"), index * 85);
      });
      break;
    case "equip":
      tone(audio, 620, 0.08, 0.025, "triangle");
      setTimeout(() => tone(audio, 930, 0.16, 0.03, "sine"), 60);
      break;
    case "success":
      [523, 784, 1046].forEach((frequency, index) => {
        setTimeout(() => tone(audio, frequency, 0.18, 0.035, "triangle"), index * 70);
      });
      break;
    case "tick":
      tone(audio, 420, 0.03, 0.018, "square");
      break;
  }
}

export function primeAudio(): void {
  const audio = ctx();
  if (audio && audio.state === "suspended") void audio.resume();
}
