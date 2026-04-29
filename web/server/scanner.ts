import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join, extname, basename } from "path";

const IGNORE = new Set(["node_modules", ".git", "dist", ".hashmark", "build", ".next", "coverage", "__pycache__", ".venv", "venv"]);

export interface ScanResult {
  projectDir: string;
  name: string;
  fileCount: number;
  byExtension: Record<string, number>;
  stack: string[];
  frameworks: string[];
  keyFiles: string[];
  packageJson?: Record<string, unknown>;
  scannedAt: number;
}

export async function scanProject(dir: string): Promise<ScanResult> {
  const byExtension: Record<string, number> = {};
  const allFiles: string[] = [];

  function walk(d: string, depth = 0) {
    if (depth > 8) return;
    let entries: string[];
    try { entries = readdirSync(d); } catch { return; }
    for (const entry of entries) {
      if (IGNORE.has(entry) || entry.startsWith(".")) continue;
      const full = join(d, entry);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { walk(full, depth + 1); continue; }
      const ext = extname(entry).toLowerCase() || basename(entry);
      byExtension[ext] = (byExtension[ext] ?? 0) + 1;
      if (allFiles.length < 2000) allFiles.push(full.replace(dir + "/", ""));
    }
  }

  walk(dir);

  // Detect stack
  const stack: string[] = [];
  const frameworks: string[] = [];

  // Language detection
  if ((byExtension[".ts"] ?? 0) + (byExtension[".tsx"] ?? 0) > 0) stack.push("TypeScript");
  else if ((byExtension[".js"] ?? 0) + (byExtension[".jsx"] ?? 0) > 0) stack.push("JavaScript");
  if ((byExtension[".py"] ?? 0) > 0) stack.push("Python");
  if ((byExtension[".go"] ?? 0) > 0) stack.push("Go");
  if ((byExtension[".rs"] ?? 0) > 0) stack.push("Rust");

  // Read package.json
  let packageJson: Record<string, unknown> | undefined;
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try { packageJson = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>; } catch {}
  }

  const deps = {
    ...((packageJson?.dependencies ?? {}) as Record<string, unknown>),
    ...((packageJson?.devDependencies ?? {}) as Record<string, unknown>),
  };

  if (deps.react) frameworks.push("React");
  if (deps.next) frameworks.push("Next.js");
  if (deps.vue) frameworks.push("Vue");
  if (deps.svelte) frameworks.push("Svelte");
  if (deps.express) frameworks.push("Express");
  if (deps.fastify) frameworks.push("Fastify");
  if (deps.hono) frameworks.push("Hono");
  if (deps["@prisma/client"]) frameworks.push("Prisma");
  if (deps.drizzle) frameworks.push("Drizzle");
  if (deps.tailwindcss) frameworks.push("Tailwind");
  if (deps.vite) frameworks.push("Vite");
  if (deps.vitest || deps.jest) frameworks.push("Testing");
  if (deps.stripe) frameworks.push("Stripe");
  if (deps.supabase || deps["@supabase/supabase-js"]) frameworks.push("Supabase");

  // Check for other stack indicators
  if (existsSync(join(dir, "requirements.txt")) || existsSync(join(dir, "pyproject.toml"))) stack.push("Python");
  if (existsSync(join(dir, "go.mod"))) stack.push("Go");
  if (existsSync(join(dir, "Cargo.toml"))) stack.push("Rust");
  if (existsSync(join(dir, "Gemfile"))) { stack.push("Ruby"); frameworks.push("Rails"); }

  // Key files
  const keyFileNames = ["README.md", "CLAUDE.md", "package.json", "pyproject.toml", "go.mod", "Cargo.toml", "Makefile", "docker-compose.yml", "Dockerfile", ".env.example"];
  const keyFiles = keyFileNames.filter(f => existsSync(join(dir, f)));

  return {
    projectDir: dir,
    name: basename(dir),
    fileCount: allFiles.length,
    byExtension,
    stack: [...new Set(stack)],
    frameworks: [...new Set(frameworks)],
    keyFiles,
    packageJson: packageJson ? {
      name: packageJson.name,
      description: packageJson.description,
      scripts: packageJson.scripts,
    } : undefined,
    scannedAt: Date.now(),
  };
}
