import { NextResponse } from "next/server";

// --- Storage Interface ---

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitEntry>;
}

// --- In-Memory Implementation ---

class InMemoryStore implements RateLimitStore {
  private store = new Map<string, RateLimitEntry>();

  constructor() {
    // Clean up expired entries every 5 minutes
    if (typeof setInterval !== "undefined") {
      setInterval(() => this.cleanup(), 5 * 60 * 1000).unref?.();
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }

  async increment(key: string, windowMs: number): Promise<RateLimitEntry> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetAt <= now) {
      const resetAt = now + windowMs;
      const newEntry = { count: 1, resetAt };
      this.store.set(key, newEntry);
      return newEntry;
    }

    entry.count++;
    return entry;
  }
}

// --- Configuration ---

// Swap this out for RedisStore in production
const store: RateLimitStore = new InMemoryStore();

interface RateLimitOptions {
  /** Max requests per window */
  max: number;
  /** Window size in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

/**
 * Check rate limit for a given identifier (e.g., userId or IP).
 * Currently uses in-memory store. Refactored to support async stores (Redis).
 */
export async function checkRateLimit(
  identifier: string,
  bucket: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const key = `${bucket}:${identifier}`;
  const windowMs = options.windowSeconds * 1000;

  const entry = await store.increment(key, windowMs);
  const allowed = entry.count <= options.max;

  return {
    allowed,
    remaining: Math.max(0, options.max - entry.count),
    limit: options.max,
    resetAt: entry.resetAt,
  };
}

/**
 * Apply rate limiting to an API route handler.
 * Returns a 429 response if the limit is exceeded, or null if allowed.
 */
export async function rateLimitResponse(
  identifier: string,
  bucket: string,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  const result = await checkRateLimit(identifier, bucket, options);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: "Too many requests. Please try again later.",
        retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        },
      }
    );
  }

  return null;
}
