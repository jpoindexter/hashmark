import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "server/__tests__/**/*.test.ts",
      "packages/cli/src/**/*.test.ts",
    ],
    exclude: ["node_modules", ".next", ".hashmark", "dist"],
    forceExit: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "server"),
    },
  },
});
