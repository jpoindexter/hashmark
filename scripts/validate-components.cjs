#!/usr/bin/env node

/**
 * Next.js Server/Client Component Validation
 *
 * Ensures:
 * 1. Components using client features have 'use client' directive
 * 2. 'use client' is the first line
 */

const fs = require("fs");
const { execSync } = require("child_process");

const CLIENT_HOOKS = [
  "useState", "useEffect", "useLayoutEffect", "useReducer",
  "useCallback", "useMemo", "useRef", "useImperativeHandle",
  "useContext", "useSyncExternalStore", "useTransition",
  "useDeferredValue", "useId",
];

function getStagedFiles() {
  try {
    const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf-8",
    });
    return output
      .trim()
      .split("\n")
      .filter((f) => /^src\/(app|components)\/.*\.(tsx|jsx)$/.test(f))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function hasUseClientDirective(content) {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;
    return trimmed === "'use client';" || trimmed === '"use client";';
  }
  return false;
}

function detectClientHooks(content) {
  const hooks = [];
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    CLIENT_HOOKS.forEach((hook) => {
      if (new RegExp(`\\b${hook}\\s*\\(`).test(line)) {
        hooks.push({ hook, line: index + 1 });
      }
    });
  });
  return hooks;
}

function detectEventHandlers(content) {
  const handlers = [];
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (/\bon[A-Z]\w+\s*=\s*\{/.test(line)) {
      handlers.push({ line: index + 1 });
    }
  });
  return handlers;
}

function validateComponents() {
  const files = getStagedFiles();
  if (files.length === 0) return;

  const errors = [];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;

    try {
      const content = fs.readFileSync(file, "utf-8");
      const hasUseClient = hasUseClientDirective(content);
      const clientHooks = detectClientHooks(content);
      const eventHandlers = detectEventHandlers(content);
      const usesClientFeatures = clientHooks.length > 0 || eventHandlers.length > 0;

      if (usesClientFeatures && !hasUseClient) {
        const features = [
          ...clientHooks.map((h) => `${h.hook} (line ${h.line})`),
          ...eventHandlers.map((h) => `event handler (line ${h.line})`),
        ];
        errors.push({ file, features });
      }
    } catch {
      // Skip unreadable
    }
  }

  if (errors.length > 0) {
    console.error("\n[ERROR] Server/Client component violations\n");
    errors.forEach(({ file, features }) => {
      console.error(`  ${file}`);
      console.error(`    Missing "use client" — found client features:`);
      features.slice(0, 5).forEach((f) => console.error(`      - ${f}`));
      console.error("");
    });
    console.error('Add "use client"; as the first line of the file.\n');
    process.exit(1);
  }
}

validateComponents();
