/**
 * Exponential backoff retry for Claude CLI spawns.
 *
 * Retryable exit codes:
 *   1  -- generic/API error (transient server issues)
 *   75 -- overloaded (EX_TEMPFAIL from sysexits.h)
 *
 * NOT retryable:
 *   0    -- success
 *   2    -- auth/usage error (won't fix itself)
 *   null -- killed by signal (intentional SIGTERM/SIGKILL)
 */

export interface RetryOptions {
  maxRetries?: number;    // default 3
  baseDelayMs?: number;   // default 1000
  maxDelayMs?: number;    // default 30000
  onRetry?: (attempt: number, error: string, delayMs: number) => void;
  fallbackFn?: () => Promise<unknown>; // called on final retry instead of fn
}

export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

const RETRYABLE_EXIT_CODES = new Set([1, 75]);

export function isRetryableExit(code: number | null, signal: string | null): boolean {
  // Killed by signal (SIGTERM, SIGKILL) -- intentional, don't retry
  if (code === null || signal != null) return false;
  return RETRYABLE_EXIT_CODES.has(code);
}

function computeDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  // Add jitter: random 0-25% of the delay
  const jitter = Math.random() * 0.25 * exponential;
  return Math.floor(exponential + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 1000;
  const maxDelayMs = opts?.maxDelayMs ?? 30000;

  const fallbackFn = opts?.fallbackFn;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // On the final retry, use fallbackFn if provided (e.g. cheaper model)
      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt && fallbackFn) {
        return await fallbackFn() as T;
      }
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry non-retryable errors
      if (lastError instanceof NonRetryableError) throw lastError;

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) throw lastError;

      const delayMs = computeDelay(attempt, baseDelayMs, maxDelayMs);
      opts?.onRetry?.(attempt + 1, lastError.message, delayMs);
      await sleep(delayMs);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError ?? new Error("withRetry exhausted");
}
