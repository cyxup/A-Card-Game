import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./styles/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { primeAudio } from "./lib/sound";
import { game } from "./lib/game";

// Dev-only handle for poking at the socket state from the console.
if (import.meta.env.DEV) {
  (window as unknown as { __stacked?: unknown }).__stacked = { game };
}

// Audio can only start after a real gesture. One listener, then it's unlocked.
window.addEventListener("pointerdown", primeAudio, { once: true });

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
