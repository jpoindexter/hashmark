import { NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

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
 * Uses in-memory store — resets on deploy. Good enough for launch;
 * swap to Redis/Upstash for multi-instance deployments.
 */
export function checkRateLimit(
  identifier: string,
  bucket: string,
  options: RateLimitOptions
): RateLimitResult {
  const key = `${bucket}:${identifier}`;
  const now = Date.now();
  const entry = store.get(key);

  // Window expired or first request
  if (!entry || entry.resetAt <= now) {
    const resetAt = now + options.windowSeconds * 1000;
    store.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: options.max - 1,
      limit: options.max,
      resetAt,
    };
  }

  // Within window
  entry.count++;
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
export function rateLimitResponse(
  identifier: string,
  bucket: string,
  options: RateLimitOptions
): NextResponse | null {
  const result = checkRateLimit(identifier, bucket, options);

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
