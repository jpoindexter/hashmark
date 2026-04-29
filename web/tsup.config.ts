import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["bin.ts", "server/index.ts"],
  format: ["esm"],
  outDir: "dist",
  splitting: false,
  // Native modules and large CJS packages must not be bundled --
  // they rely on dynamic require() which breaks in ESM bundles.
  external: [
    "node-pty",
    "better-sqlite3",
    "ws",
  ],
});
