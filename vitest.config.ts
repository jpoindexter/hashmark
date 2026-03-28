import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "packages/cli/src/**/*.test.ts",
    ],
    exclude: ["node_modules", ".next", ".hashmark", "dist"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "server"),
    },
  },
});
