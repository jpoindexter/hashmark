import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: ".",
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000, // Monaco editor is ~3.8MB (lazy-loaded, desktop app)
    rollupOptions: {
      output: {
        manualChunks: {
          xterm: ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-web-links", "@xterm/addon-search", "xterm"],
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
