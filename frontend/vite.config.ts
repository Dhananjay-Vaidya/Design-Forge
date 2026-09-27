/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    // Docker Desktop bind mounts on Windows/macOS don't deliver file-change events into the
    // container, so the Compose frontend sets VITE_USE_POLLING=true to see edits.
    watch: process.env.VITE_USE_POLLING === "true" ? { usePolling: true, interval: 300 } : undefined,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    css: true,
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
