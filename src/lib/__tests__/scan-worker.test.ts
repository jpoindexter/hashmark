import { describe, it, expect } from "vitest";
import { estimateTokens, FORMAT_MAP } from "../scan-utils";
import { formatScanError } from "../scan-error";

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("abc")).toBe(1); // rounds up
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("formatScanError", () => {
  it("maps auth failures", () => {
    const msg = formatScanError(new Error("Authentication failed for repo"));
    expect(msg).toContain("access token may have expired");
  });

  it("maps repo not found", () => {
    const msg = formatScanError(new Error("repository not found"));
    expect(msg).toContain("may have been deleted");
  });

  it("maps permission denied", () => {
    const msg = formatScanError(new Error("403 Forbidden"));
    expect(msg).toContain("Permission denied");
  });

  it("maps timeout errors", () => {
    const msg = formatScanError(new Error("ETIMEDOUT"));
    expect(msg).toContain("timed out");
  });

  it("maps OOM errors", () => {
    const msg = formatScanError(new Error("ENOMEM: not enough memory"));
    expect(msg).toContain("out of memory");
  });

  it("truncates long messages", () => {
    const longMsg = "x".repeat(600);
    const msg = formatScanError(new Error(longMsg));
    expect(msg.length).toBeLessThanOrEqual(503); // 500 + "..."
    expect(msg.endsWith("...")).toBe(true);
  });

  it("handles non-Error values", () => {
    const msg = formatScanError("raw string error");
    expect(msg).toBe("raw string error");
  });

  it("returns fallback for empty message", () => {
    const msg = formatScanError(new Error(""));
    expect(msg).toBe("An unexpected error occurred during the scan.");
  });

  it("redacts token from error messages", () => {
    const token = "ghs_secret123abc";
    const msg = formatScanError(
      new Error(`fatal: repository https://x-access-token:${token}@github.com/foo/bar.git not found`),
      token
    );
    expect(msg).not.toContain(token);
    expect(msg).toContain("may have been deleted");
  });

  it("redacts token from generic errors", () => {
    const token = "ghs_secret123abc";
    const msg = formatScanError(
      new Error(`some weird error with ${token} in it`),
      token
    );
    expect(msg).not.toContain(token);
    expect(msg).toContain("[REDACTED]");
  });
});

describe("FORMAT_MAP", () => {
  it("maps all 6 well-known file names", () => {
    expect(Object.keys(FORMAT_MAP)).toHaveLength(6);
    expect(FORMAT_MAP["AGENTS.md"]).toBe("AGENTS_MD");
    expect(FORMAT_MAP["CLAUDE.md"]).toBe("CLAUDE_MD");
    expect(FORMAT_MAP[".cursorrules"]).toBe("CURSORRULES");
    expect(FORMAT_MAP[".windsurfrules"]).toBe("WINDSURFRULES");
    expect(FORMAT_MAP["GEMINI.md"]).toBe("GEMINI_MD");
    expect(FORMAT_MAP[".clinerules"]).toBe("CLINE_RULES");
  });
});
