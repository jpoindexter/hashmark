import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit } from "../rate-limit";

// Reset module state between tests by importing fresh
beforeEach(async () => {
  // Clear the in-memory store by re-importing won't work since it's cached,
  // so we use unique identifiers per test instead
});

describe("checkRateLimit", () => {
  const opts = { max: 3, windowSeconds: 60 };

  it("allows first request", () => {
    const result = checkRateLimit("user-1", "test-first", opts);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.limit).toBe(3);
  });

  it("tracks remaining count down to zero", () => {
    const id = `user-countdown-${Date.now()}`;
    checkRateLimit(id, "test-countdown", opts);
    checkRateLimit(id, "test-countdown", opts);
    const third = checkRateLimit(id, "test-countdown", opts);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it("rejects after limit exceeded", () => {
    const id = `user-reject-${Date.now()}`;
    checkRateLimit(id, "test-reject", opts);
    checkRateLimit(id, "test-reject", opts);
    checkRateLimit(id, "test-reject", opts);
    const fourth = checkRateLimit(id, "test-reject", opts);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("isolates different buckets", () => {
    const id = `user-buckets-${Date.now()}`;
    checkRateLimit(id, "bucket-a", opts);
    checkRateLimit(id, "bucket-a", opts);
    checkRateLimit(id, "bucket-a", opts);

    // Different bucket should still be allowed
    const result = checkRateLimit(id, "bucket-b", opts);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("isolates different users", () => {
    const ts = Date.now();
    checkRateLimit(`user-a-${ts}`, "test-users", opts);
    checkRateLimit(`user-a-${ts}`, "test-users", opts);
    checkRateLimit(`user-a-${ts}`, "test-users", opts);

    // Different user should still be allowed
    const result = checkRateLimit(`user-b-${ts}`, "test-users", opts);
    expect(result.allowed).toBe(true);
  });

  it("returns resetAt in the future", () => {
    const before = Date.now();
    const result = checkRateLimit(`user-reset-${before}`, "test-reset", opts);
    expect(result.resetAt).toBeGreaterThan(before);
    expect(result.resetAt).toBeLessThanOrEqual(before + 60_000 + 100);
  });
});
