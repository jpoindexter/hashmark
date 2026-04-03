#!/usr/bin/env node

/**
 * Security Validation
 *
 * Checks staged files for:
 * 1. Hardcoded secrets (API keys, tokens, passwords)
 * 2. Sensitive files (.env, .pem, .key)
 * 3. Dangerous code patterns (eval, dangerouslySetInnerHTML)
 */

const { execSync } = require("child_process");
const fs = require("fs");

const SENSITIVE_FILE_PATTERNS = [
  /\.env$/,
  /\.env\.local$/,
  /\.env\.production$/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /credentials\.json$/,
  /service-account.*\.json$/,
];

const SECRET_PATTERNS = [
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/, name: "Stripe Live Key" },
  { pattern: /sk_test_[a-zA-Z0-9]{24,}/, name: "Stripe Test Key" },
  { pattern: /AKIA[0-9A-Z]{16}/, name: "AWS Access Key" },
  { pattern: /postgres:\/\/[^:]+:([^@]+)@/, name: "Database Password in URL" },
  {
    pattern: /-----BEGIN (RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----/,
    name: "Private Key",
  },
  {
    pattern: /jwt[_-]?secret['"]?\s*[:=]\s*['"]([a-zA-Z0-9_-]{32,})/,
    name: "JWT Secret",
  },
  {
    pattern: /password['"]?\s*[:=]\s*['"]([^'"]{8,})/,
    name: "Hardcoded Password",
  },
  { pattern: /bearer\s+[a-zA-Z0-9_-]{32,}/i, name: "Bearer Token" },
];

const DANGEROUS_PATTERNS = [
  {
    pattern: /\beval\(/,
    name: "eval() usage",
    message: "Avoid eval() — it can execute arbitrary code",
  },
  {
    pattern: /dangerouslySetInnerHTML/,
    name: "dangerouslySetInnerHTML",
    message: "Sanitize user input before rendering raw HTML",
  },
  {
    pattern: /\$\{.*\}.*INTO\s+/i,
    name: "Potential SQL Injection",
    message: "Use parameterized queries instead of string interpolation",
  },
  {
    pattern: /document\.write\(/,
    name: "document.write()",
    message: "Avoid document.write() — it can be exploited for XSS",
  },
];

function getStagedFiles() {
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf-8",
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function validateSecurity() {
  const stagedFiles = getStagedFiles();
  const sensitiveFiles = [];
  const secretViolations = [];
  const dangerousViolations = [];

  for (const file of stagedFiles) {
    if (SENSITIVE_FILE_PATTERNS.some((p) => p.test(file))) {
      sensitiveFiles.push(file);
      continue;
    }

    if (/^(docs|scripts)\//.test(file)) continue;
    if (!fs.existsSync(file)) continue;
    if (!/\.(ts|tsx|js|jsx|json)$/.test(file)) continue;

    try {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (const { pattern, name } of SECRET_PATTERNS) {
        lines.forEach((line, index) => {
          if (pattern.test(line)) {
            secretViolations.push({
              file,
              line: index + 1,
              type: name,
              snippet: line.trim().substring(0, 80),
            });
          }
        });
      }

      for (const { pattern, name, message } of DANGEROUS_PATTERNS) {
        lines.forEach((line, index) => {
          if (pattern.test(line)) {
            dangerousViolations.push({ file, line: index + 1, type: name, message });
          }
        });
      }
    } catch {
      // Skip unreadable files
    }
  }

  let hasViolations = false;

  if (sensitiveFiles.length > 0) {
    hasViolations = true;
    console.error("\n[ERROR] Sensitive files detected\n");
    sensitiveFiles.forEach((f) => console.error(`  ${f}`));
    console.error("\nAdd these files to .gitignore\n");
  }

  if (secretViolations.length > 0) {
    hasViolations = true;
    console.error("\n[ERROR] Potential secrets detected\n");
    secretViolations.forEach(({ file, line, type, snippet }) => {
      console.error(`  ${file}:${line}  [${type}]`);
      console.error(`    ${snippet}\n`);
    });
    console.error("Use environment variables instead of hardcoded secrets.\n");
  }

  if (dangerousViolations.length > 0) {
    hasViolations = true;
    console.error("\n[ERROR] Dangerous code patterns detected\n");
    dangerousViolations.forEach(({ file, line, type, message }) => {
      console.error(`  ${file}:${line}  [${type}]`);
      console.error(`    ${message}\n`);
    });
  }

  if (hasViolations) process.exit(1);
}

validateSecurity();
