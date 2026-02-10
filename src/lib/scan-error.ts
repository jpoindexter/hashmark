import { db } from "./db";

/** Redact sensitive values from error messages before storing */
function sanitizeErrorMessage(msg: string, token: string): string {
  return msg
    .replaceAll(token, "[REDACTED]")
    .replace(/\/tmp\/hashmark-scan-\w+/g, "[SCAN_DIR]");
}

/** Map raw errors to user-friendly messages, stripping sensitive data */
export function formatScanError(error: unknown, token?: string): string {
  // Detect killed processes (e.g. execFile timeout)
  const killed = (error as { killed?: boolean })?.killed;
  const signal = (error as { signal?: string })?.signal;
  if (killed || signal === "SIGTERM") {
    return "Scan timed out. This can happen with very large repositories. Try again or contact support.";
  }

  // execFile errors store the actual error in .stderr, not .message
  const stderr = (error as { stderr?: string })?.stderr?.trim();
  const stdout = (error as { stdout?: string })?.stdout?.trim();
  let msg = stderr || stdout || (error instanceof Error ? error.message : String(error));

  // Strip token and internal paths from any error before further processing
  if (token) msg = sanitizeErrorMessage(msg, token);

  if (msg.includes("Authentication failed") || msg.includes("could not read Username")) {
    return "GitHub authentication failed. Your access token may have expired — try signing out and back in.";
  }
  if (msg.includes("not found") && msg.includes("repository")) {
    return "Repository not found. It may have been deleted or made private without granting access.";
  }
  if (msg.includes("Permission denied") || msg.includes("403")) {
    return "Permission denied. Ensure Hashmark has access to this repository in your GitHub settings.";
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timed out") || msg.includes("timeout")) {
    return "Scan timed out. This can happen with very large repositories. Try again or contact support.";
  }
  if (msg.includes("ENOMEM") || msg.includes("out of memory")) {
    return "Scan ran out of memory. This repository may be too large for the current plan.";
  }
  if (msg.length > 500) {
    return msg.slice(0, 500) + "...";
  }

  return msg || "An unexpected error occurred during the scan.";
}

/** Max age (ms) before an active scan is considered orphaned */
const ORPHAN_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Recover orphaned scans that have been stuck in PENDING/SCANNING
 * for longer than ORPHAN_THRESHOLD_MS. Called from the polling endpoint
 * to self-heal without a separate cron job.
 */
export async function recoverOrphanedScans() {
  const cutoff = new Date(Date.now() - ORPHAN_THRESHOLD_MS);
  await db.scan.updateMany({
    where: {
      status: { in: ["PENDING", "SCANNING"] },
      createdAt: { lt: cutoff },
    },
    data: {
      status: "FAILED",
      error: "Scan timed out — the server may have restarted during this scan. Please try again.",
    },
  });
}
