import { getPrefs } from "./prefs";

type SoundName = "click" | "deal" | "play" | "draw" | "turn" | "win" | "lose" | "error" | "emote";

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

export function playSound(name: SoundName): void {
  if (!getPrefs().sound) return;
  const audio = ctx();
  if (!audio) return;

  switch (name) {
    case "click":
      tone(audio, 620, 0.05, 0.025, "triangle");
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
  }
}

export function primeAudio(): void {
  const audio = ctx();
  if (audio && audio.state === "suspended") void audio.resume();
}
