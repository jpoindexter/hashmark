/**
 * Claude CLI usage tracker.
 * Prevents account bans by enforcing rate limits on CLI invocations.
 *
 * Based on community reports:
 * - 2-3 parallel agents = safe for weeks
 * - 10 parallel agents = banned
 * - Our defaults: max 2 concurrent, max 20/hour, 5s cooldown between spawns
 */

const MAX_INVOCATIONS_PER_HOUR = 20;
const MIN_SPAWN_INTERVAL_MS = 5000; // 5s between spawns

const invocationLog: number[] = []; // timestamps
let lastSpawnTime = 0;

export interface UsageCheck {
  allowed: boolean;
  reason?: string;
  invocationsThisHour: number;
  limit: number;
}

/** Check if we can spawn another Claude process right now. */
export function checkUsage(): UsageCheck {
  const now = Date.now();
  const oneHourAgo = now - 3600_000;

  // Prune old entries
  while (invocationLog.length > 0 && invocationLog[0] < oneHourAgo) {
    invocationLog.shift();
  }

  const count = invocationLog.length;

  if (count >= MAX_INVOCATIONS_PER_HOUR) {
    return {
      allowed: false,
      reason: `Rate limit: ${count}/${MAX_INVOCATIONS_PER_HOUR} invocations this hour. Wait for older invocations to age out.`,
      invocationsThisHour: count,
      limit: MAX_INVOCATIONS_PER_HOUR,
    };
  }

  const timeSinceLast = now - lastSpawnTime;
  if (timeSinceLast < MIN_SPAWN_INTERVAL_MS) {
    const waitMs = MIN_SPAWN_INTERVAL_MS - timeSinceLast;
    return {
      allowed: false,
      reason: `Cooldown: wait ${Math.ceil(waitMs / 1000)}s before next spawn`,
      invocationsThisHour: count,
      limit: MAX_INVOCATIONS_PER_HOUR,
    };
  }

  return { allowed: true, invocationsThisHour: count, limit: MAX_INVOCATIONS_PER_HOUR };
}

/** Record a new Claude invocation. Call this right before spawn. */
export function recordInvocation(): void {
  const now = Date.now();
  invocationLog.push(now);
  lastSpawnTime = now;
}

/** Get current usage stats for the UI. */
export function getUsageStats() {
  const now = Date.now();
  const oneHourAgo = now - 3600_000;
  while (invocationLog.length > 0 && invocationLog[0] < oneHourAgo) {
    invocationLog.shift();
  }
  return {
    invocationsThisHour: invocationLog.length,
    limit: MAX_INVOCATIONS_PER_HOUR,
    lastSpawnTime,
    cooldownMs: Math.max(0, MIN_SPAWN_INTERVAL_MS - (now - lastSpawnTime)),
  };
}
