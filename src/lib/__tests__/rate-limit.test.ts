import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit } from "../rate-limit";

// Reset module state between tests by importing fresh
beforeEach(async () => {
  // Clear the in-memory store by re-importing won't work since it's cached,
  // so we use unique identifiers per test instead
});

describe("checkRateLimit", () => {
  const opts = { max: 3, windowSeconds: 60 };

  it("allows first request", async () => {
    const result = await checkRateLimit("user-1", "test-first", opts);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.limit).toBe(3);
  });

  it("tracks remaining count down to zero", async () => {
    const id = `user-countdown-${Date.now()}`;
    await checkRateLimit(id, "test-countdown", opts);
    await checkRateLimit(id, "test-countdown", opts);
    const third = await checkRateLimit(id, "test-countdown", opts);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it("rejects after limit exceeded", async () => {
    const id = `user-reject-${Date.now()}`;
    await checkRateLimit(id, "test-reject", opts);
    await checkRateLimit(id, "test-reject", opts);
    await checkRateLimit(id, "test-reject", opts);
    const fourth = await checkRateLimit(id, "test-reject", opts);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("isolates different buckets", async () => {
    const id = `user-buckets-${Date.now()}`;
    await checkRateLimit(id, "bucket-a", opts);
    await checkRateLimit(id, "bucket-a", opts);
    await checkRateLimit(id, "bucket-a", opts);

    // Different bucket should still be allowed
    const result = await checkRateLimit(id, "bucket-b", opts);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("isolates different users", async () => {
    const ts = Date.now();
    await checkRateLimit(`user-a-${ts}`, "test-users", opts);
    await checkRateLimit(`user-a-${ts}`, "test-users", opts);
    await checkRateLimit(`user-a-${ts}`, "test-users", opts);

    // Different user should still be allowed
    const result = await checkRateLimit(`user-b-${ts}`, "test-users", opts);
    expect(result.allowed).toBe(true);
  });

  it("returns resetAt in the future", async () => {
    const before = Date.now();
    const result = await checkRateLimit(`user-reset-${before}`, "test-reset", opts);
    expect(result.resetAt).toBeGreaterThan(before);
    expect(result.resetAt).toBeLessThanOrEqual(before + 60_000 + 100);
  });
});
