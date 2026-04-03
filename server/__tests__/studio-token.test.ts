import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Each test resets modules so the module-level _cached variable is cleared
describe("getStudioToken", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), "hashmark-token-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates a 64-char hex token on first call", async () => {
    const { getStudioToken } = await import("../lib/studio-token.js");
    const token = getStudioToken(tmpDir);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("writes token to studio.token in the data dir", async () => {
    const { getStudioToken } = await import("../lib/studio-token.js");
    getStudioToken(tmpDir);
    const tokenPath = join(tmpDir, "studio.token");
    expect(existsSync(tokenPath)).toBe(true);
    const written = readFileSync(tokenPath, "utf-8").trim();
    expect(written).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns the same token on repeated calls (in-memory cache)", async () => {
    const { getStudioToken } = await import("../lib/studio-token.js");
    const first = getStudioToken(tmpDir);
    const second = getStudioToken(tmpDir);
    expect(first).toBe(second);
  });

  it("reads an existing token file instead of generating a new one", async () => {
    const existing = "deadbeef".repeat(8); // 64 hex chars
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, "studio.token"), existing);

    const { getStudioToken } = await import("../lib/studio-token.js");
    const token = getStudioToken(tmpDir);
    expect(token).toBe(existing);
  });

  it("creates the data dir if it does not exist", async () => {
    const nested = join(tmpDir, "sub", "data");
    const { getStudioToken } = await import("../lib/studio-token.js");
    getStudioToken(nested);
    expect(existsSync(join(nested, "studio.token"))).toBe(true);
  });
});
