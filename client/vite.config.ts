import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";
import { resolve } from "path";

function studioTokenPlugin() {
  return {
    name: "studio-token-inject",
    transformIndexHtml() {
      try {
        const tokenPath = resolve(__dirname, "../.hashmark/studio.token");
        const token = readFileSync(tokenPath, "utf-8").trim();
        return [{ tag: "script", children: `window.__STUDIO_TOKEN__="${token}"`, injectTo: "head" as const }];
      } catch {
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), studioTokenPlugin()],
  root: ".",
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000, // Monaco editor is ~3.8MB (lazy-loaded, desktop app)
    rollupOptions: {
      output: {
        manualChunks: {
          xterm: ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-web-links", "@xterm/addon-search"],
          react: ["react", "react-dom", "react-router-dom"],
          virtualizer: ["@tanstack/react-virtual"],
        },
      },
    },
  },
  server: {
    port: 3201,
    proxy: {
      "/api": "http://localhost:3200",
    },
  },
});
