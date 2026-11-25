import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8080", changeOrigin: false },
      "/ws": { target: "ws://127.0.0.1:8080", ws: true },
    },
    warmup: {
      clientFiles: ["./src/pages/Home.tsx", "./src/pages/Room.tsx"],
    },
  },
  build: {
    target: "es2020",
    cssTarget: "chrome100",
    reportCompressedSize: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "react";
            if (id.includes("motion") || id.includes("framer")) return "motion";
            if (id.includes("radix")) return "radix";
            if (id.includes("lucide-react")) return "icons";
          }
        },
      },
    },
  },
});
