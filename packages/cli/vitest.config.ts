import { defineConfig } from "vitest/config";
import { Button } from '@/components/ui/button'

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
