/**
 * Framework Detection Scanner
 *
 * Detects the framework, language, and styling solution used in a project
 * by analyzing package.json and other config files.
 *
 * Supported frameworks:
 * - Next.js (with App/Pages Router detection)
 * - Remix, Vite, React, Vue, Svelte
 * - Django, FastAPI, Flask (Python)
 * - Gin, Echo, Fiber (Go)
 * - Actix, Axum, Rocket (Rust)
 * - Rails (Ruby)
 * - Spring Boot (Java/Kotlin)
 * - Laravel, Symfony (PHP)
 *
 * @module scanners/framework
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import type { Framework } from "../types.js";

/**
 * Detects the framework and tech stack used in a project
 *
 * @param dir - Project root directory
 * @returns Framework information including name, version, router type, and dependencies
 */
export async function detectFramework(dir: string): Promise<Framework> {
  const framework: Framework = {
    name: "Unknown",
    language: "JavaScript",
  };

  // Try JavaScript/TypeScript detection first (package.json)
  const jsResult = detectJsFramework(dir, framework);
  if (jsResult.name !== "Unknown") {
    return jsResult;
  }

  // If root package.json had no framework, search subdirectories
  // (monorepo pattern: root is a thin wrapper, framework lives in a subdirectory)
  const subResult = detectFrameworkInSubdirs(dir);
  if (subResult && subResult.name !== "Unknown") {
    return subResult;
  }

  // Try Python detection (pyproject.toml, requirements.txt)
  const pyResult = detectPythonFramework(dir);
  if (pyResult) return pyResult;

  // Try Go detection (go.mod)
  const goResult = detectGoFramework(dir);
  if (goResult) return goResult;

  // Try Rust detection (Cargo.toml)
  const rustResult = detectRustFramework(dir);
  if (rustResult) return rustResult;

  // Try Ruby detection (Gemfile)
  const rubyResult = detectRubyFramework(dir);
  if (rubyResult) return rubyResult;

  // Try Java/Kotlin detection (pom.xml, build.gradle)
  const javaResult = detectJavaFramework(dir);
  if (javaResult) return javaResult;

  // Try PHP detection (composer.json)
  const phpResult = detectPhpFramework(dir);
  if (phpResult) return phpResult;

  // Detect language from file presence even if no framework found
  if (existsSync(join(dir, "tsconfig.json"))) {
    framework.language = "TypeScript";
  } else if (existsSync(join(dir, "pyproject.toml")) || existsSync(join(dir, "requirements.txt"))) {
    framework.language = "Python";
  } else if (existsSync(join(dir, "go.mod"))) {
    framework.language = "Go";
  } else if (existsSync(join(dir, "Cargo.toml"))) {
    framework.language = "Rust";
  } else if (existsSync(join(dir, "Gemfile"))) {
    framework.language = "Ruby";
  } else if (existsSync(join(dir, "composer.json"))) {
    framework.language = "PHP";
  }

  return framework;
}

/** Detects JavaScript/TypeScript frameworks from package.json */
function detectJsFramework(dir: string, framework: Framework): Framework {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    return framework;
  }

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    return framework;
  }

  const deps: Record<string, string> = {
    ...(pkg.dependencies as Record<string, string> || {}),
    ...(pkg.devDependencies as Record<string, string> || {}),
  };

  // Detect TypeScript
  if (deps.typescript || existsSync(join(dir, "tsconfig.json"))) {
    framework.language = "TypeScript";
  }

  // Detect framework
  if (deps.next) {
    framework.name = "Next.js";
    framework.version = deps.next.replace(/[\^~]/, "");

    // Detect router type
    if (existsSync(join(dir, "src/app")) || existsSync(join(dir, "app"))) {
      framework.router = "App Router";
    } else if (existsSync(join(dir, "src/pages")) || existsSync(join(dir, "pages"))) {
      framework.router = "Pages Router";
    }
  } else if (deps["@remix-run/react"] || deps.remix) {
    framework.name = "Remix";
    framework.version = deps["@remix-run/react"] || deps.remix;
  } else if (deps.nuxt) {
    framework.name = "Nuxt";
    framework.version = deps.nuxt?.replace(/[\^~]/, "");
  } else if (deps["@sveltejs/kit"]) {
    framework.name = "SvelteKit";
    framework.version = deps["@sveltejs/kit"]?.replace(/[\^~]/, "");
  } else if (deps.vite) {
    framework.name = "Vite";
    framework.version = deps.vite?.replace(/[\^~]/, "");
  } else if (deps.react) {
    framework.name = "React";
    framework.version = deps.react?.replace(/[\^~]/, "");
  } else if (deps.vue) {
    framework.name = "Vue";
    framework.version = deps.vue?.replace(/[\^~]/, "");
  } else if (deps.svelte) {
    framework.name = "Svelte";
    framework.version = deps.svelte?.replace(/[\^~]/, "");
  } else if (deps.angular || deps["@angular/core"]) {
    framework.name = "Angular";
    framework.version = (deps["@angular/core"] || deps.angular)?.replace(/[\^~]/, "");
  } else if (deps.express) {
    framework.name = "Express";
    framework.version = deps.express?.replace(/[\^~]/, "");
  } else if (deps.fastify) {
    framework.name = "Fastify";
    framework.version = deps.fastify?.replace(/[\^~]/, "");
  }

  // Detect styling
  if (deps.tailwindcss) {
    framework.styling = "Tailwind CSS";
  } else if (deps["styled-components"]) {
    framework.styling = "styled-components";
  } else if (deps["@emotion/react"]) {
    framework.styling = "Emotion";
  }

  // Extract key dependency versions
  framework.versions = {};
  if (deps.react) {
    framework.versions.react = deps.react.replace(/[\^~]/, "");
  }
  if (deps.typescript) {
    framework.versions.typescript = deps.typescript.replace(/[\^~]/, "");
  }
  if (deps.tailwindcss) {
    framework.versions.tailwindcss = deps.tailwindcss.replace(/[\^~]/, "");
  }
  if (deps.prisma || deps["@prisma/client"]) {
    framework.versions.prisma = (deps.prisma || deps["@prisma/client"]).replace(/[\^~]/, "");
  }

  // Get Node.js version from engines
  const engines = pkg.engines as Record<string, string> | undefined;
  if (engines?.node) {
    framework.versions.node = engines.node;
  }

  return framework;
}

/**
 * Searches subdirectories for framework config when root detection fails.
 * Checks immediate children + common monorepo locations (apps/*, packages/*).
 * Returns the best match scored by framework importance.
 */
function detectFrameworkInSubdirs(dir: string): Framework | null {
  const candidates: string[] = [];

  // Collect immediate subdirectories
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const fullPath = join(dir, entry);
      try {
        if (statSync(fullPath).isDirectory()) {
          candidates.push(fullPath);
          // Also check apps/*/  and packages/*/ one level deeper
          if (entry === "apps" || entry === "packages" || entry === "projects") {
            try {
              const nested = readdirSync(fullPath);
              for (const sub of nested) {
                if (sub.startsWith(".")) continue;
                const nestedPath = join(fullPath, sub);
                try {
                  if (statSync(nestedPath).isDirectory()) {
                    candidates.push(nestedPath);
                  }
                } catch {}
              }
            } catch {}
          }
        }
      } catch {}
    }
  } catch {
    return null;
  }

  // Score each candidate — prefer full-stack frameworks in well-named dirs
  let bestResult: Framework | null = null;
  let bestScore = 0;

  for (const candidatePath of candidates) {
    const name = basename(candidatePath);

    // Try JS detection
    const stub: Framework = { name: "Unknown", language: "JavaScript" };
    const jsResult = detectJsFramework(candidatePath, stub);
    if (jsResult.name !== "Unknown") {
      let score = frameworkScore(jsResult.name);
      // Boost well-named directories
      if (["web", "app", "frontend", "client", "site"].includes(name)) score += 5;
      if (score > bestScore) {
        bestScore = score;
        bestResult = jsResult;
      }
      continue;
    }

    // Try non-JS detections
    for (const detectFn of [
      detectPythonFramework,
      detectGoFramework,
      detectRustFramework,
      detectRubyFramework,
      detectJavaFramework,
      detectPhpFramework,
    ]) {
      const result = detectFn(candidatePath);
      if (result && result.name !== "Unknown") {
        let score = frameworkScore(result.name);
        if (["api", "server", "backend", "service"].includes(name)) score += 3;
        if (score > bestScore) {
          bestScore = score;
          bestResult = result;
        }
        break;
      }
    }
  }

  return bestResult;
}

/** Scores frameworks so full-stack/app frameworks rank higher than libraries */
function frameworkScore(name: string): number {
  const scores: Record<string, number> = {
    "Next.js": 20, Nuxt: 20, SvelteKit: 20, Remix: 18,
    "Spring Boot": 16, Rails: 16, Django: 16, Laravel: 16,
    FastAPI: 14, Flask: 14, Gin: 14, Echo: 14, Fiber: 14,
    "Actix Web": 14, Axum: 14, Rocket: 14, Express: 12, Fastify: 12,
    Symfony: 12, Sinatra: 10,
    React: 8, Vue: 8, Svelte: 8, Angular: 8, Vite: 6,
  };
  return scores[name] ?? 4;
}

/** Detects Python frameworks from pyproject.toml or requirements.txt */
function detectPythonFramework(dir: string): Framework | null {
  const framework: Framework = {
    name: "Unknown",
    language: "Python",
    versions: {},
  };

  // Try pyproject.toml first
  const pyprojectPath = join(dir, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    const content = readFileSync(pyprojectPath, "utf-8");

    // Extract Python version requirement
    const pythonMatch = content.match(/python\s*[=><!]+\s*["']?(\d+\.\d+)/);
    if (pythonMatch) {
      framework.versions!.python = pythonMatch[1];
    }

    // Detect frameworks from dependencies
    if (content.includes("django") || content.includes("Django")) {
      framework.name = "Django";
      const versionMatch = content.match(/[Dd]jango[=><!~]+\s*["']?(\d+[\d.]*)/);
      if (versionMatch) framework.version = versionMatch[1];
      return framework;
    }
    if (content.includes("fastapi") || content.includes("FastAPI")) {
      framework.name = "FastAPI";
      const versionMatch = content.match(/fastapi[=><!~]+\s*["']?(\d+[\d.]*)/i);
      if (versionMatch) framework.version = versionMatch[1];
      return framework;
    }
    if (content.includes("flask") || content.includes("Flask")) {
      framework.name = "Flask";
      const versionMatch = content.match(/[Ff]lask[=><!~]+\s*["']?(\d+[\d.]*)/);
      if (versionMatch) framework.version = versionMatch[1];
      return framework;
    }

    // Even if no framework found, it's a Python project
    framework.name = "Python";
    return framework;
  }

  // Try requirements.txt
  const reqPath = join(dir, "requirements.txt");
  if (existsSync(reqPath)) {
    const content = readFileSync(reqPath, "utf-8");

    if (content.match(/^django/im)) {
      framework.name = "Django";
      const versionMatch = content.match(/django==(\d+[\d.]*)/i);
      if (versionMatch) framework.version = versionMatch[1];
      return framework;
    }
    if (content.match(/^fastapi/im)) {
      framework.name = "FastAPI";
      const versionMatch = content.match(/fastapi==(\d+[\d.]*)/i);
      if (versionMatch) framework.version = versionMatch[1];
      return framework;
    }
    if (content.match(/^flask/im)) {
      framework.name = "Flask";
      const versionMatch = content.match(/flask==(\d+[\d.]*)/i);
      if (versionMatch) framework.version = versionMatch[1];
      return framework;
    }

    framework.name = "Python";
    return framework;
  }

  return null;
}

/** Detects Go frameworks from go.mod */
function detectGoFramework(dir: string): Framework | null {
  const goModPath = join(dir, "go.mod");
  if (!existsSync(goModPath)) return null;

  const content = readFileSync(goModPath, "utf-8");
  const framework: Framework = {
    name: "Go",
    language: "Go",
    versions: {},
  };

  // Extract Go version
  const goVersionMatch = content.match(/^go\s+(\d+\.\d+(?:\.\d+)?)/m);
  if (goVersionMatch) {
    framework.versions!.go = goVersionMatch[1];
  }

  // Detect web frameworks
  if (content.includes("github.com/gin-gonic/gin")) {
    framework.name = "Gin";
    const versionMatch = content.match(/github\.com\/gin-gonic\/gin\s+v([\d.]+)/);
    if (versionMatch) framework.version = versionMatch[1];
  } else if (content.includes("github.com/labstack/echo")) {
    framework.name = "Echo";
    const versionMatch = content.match(/github\.com\/labstack\/echo(?:\/v\d+)?\s+v([\d.]+)/);
    if (versionMatch) framework.version = versionMatch[1];
  } else if (content.includes("github.com/gofiber/fiber")) {
    framework.name = "Fiber";
    const versionMatch = content.match(/github\.com\/gofiber\/fiber(?:\/v\d+)?\s+v([\d.]+)/);
    if (versionMatch) framework.version = versionMatch[1];
  } else if (content.includes("github.com/gorilla/mux")) {
    framework.name = "Gorilla Mux";
  } else if (content.includes("net/http")) {
    framework.name = "Go (net/http)";
  }

  return framework;
}

/** Detects Rust frameworks from Cargo.toml */
function detectRustFramework(dir: string): Framework | null {
  const cargoPath = join(dir, "Cargo.toml");
  if (!existsSync(cargoPath)) return null;

  const content = readFileSync(cargoPath, "utf-8");
  const framework: Framework = {
    name: "Rust",
    language: "Rust",
    versions: {},
  };

  // Extract Rust edition
  const editionMatch = content.match(/edition\s*=\s*"(\d+)"/);
  if (editionMatch) {
    framework.versions!.rust = editionMatch[1];
  }

  // Detect web frameworks
  if (content.includes("actix-web")) {
    framework.name = "Actix Web";
    const versionMatch = content.match(/actix-web\s*=\s*"([\d.]+)"/);
    if (versionMatch) framework.version = versionMatch[1];
  } else if (content.includes("axum")) {
    framework.name = "Axum";
    const versionMatch = content.match(/axum\s*=\s*"([\d.]+)"/);
    if (versionMatch) framework.version = versionMatch[1];
  } else if (content.includes("rocket")) {
    framework.name = "Rocket";
    const versionMatch = content.match(/rocket\s*=\s*"([\d.]+)"/);
    if (versionMatch) framework.version = versionMatch[1];
  } else if (content.includes("warp")) {
    framework.name = "Warp";
  }

  return framework;
}

/** Detects Ruby frameworks from Gemfile */
function detectRubyFramework(dir: string): Framework | null {
  const gemfilePath = join(dir, "Gemfile");
  if (!existsSync(gemfilePath)) return null;

  const content = readFileSync(gemfilePath, "utf-8");
  const framework: Framework = {
    name: "Ruby",
    language: "Ruby",
    versions: {},
  };

  // Extract Ruby version
  const rubyMatch = content.match(/ruby\s+['"](\d+\.\d+(?:\.\d+)?)['"]/);
  if (rubyMatch) {
    framework.versions!.ruby = rubyMatch[1];
  }

  // Detect Rails
  if (content.includes("rails") || content.includes("Rails")) {
    framework.name = "Rails";
    const versionMatch = content.match(/gem\s+['"]rails['"],\s*['"]~>\s*([\d.]+)['"]/);
    if (versionMatch) framework.version = versionMatch[1];
  } else if (content.includes("sinatra")) {
    framework.name = "Sinatra";
  }

  return framework;
}

/** Detects Java/Kotlin frameworks from pom.xml or build.gradle */
function detectJavaFramework(dir: string): Framework | null {
  // Check for Gradle (Kotlin DSL first, then Groovy)
  for (const gradleFile of ["build.gradle.kts", "build.gradle"]) {
    const gradlePath = join(dir, gradleFile);
    if (existsSync(gradlePath)) {
      const content = readFileSync(gradlePath, "utf-8");
      const isKotlin = gradleFile.endsWith(".kts") || content.includes("kotlin");
      const framework: Framework = {
        name: isKotlin ? "Kotlin" : "Java",
        language: isKotlin ? "Kotlin" : "Java",
        versions: {},
      };

      if (content.includes("spring-boot") || content.includes("org.springframework.boot")) {
        framework.name = "Spring Boot";
        const versionMatch = content.match(/org\.springframework\.boot['"]\s*version\s*['"](\d+[\d.]*)['"]/);
        if (versionMatch) framework.version = versionMatch[1];
      }

      // Extract Java/Kotlin version
      const javaVersionMatch = content.match(/(?:sourceCompatibility|jvmTarget)\s*=\s*['"]?(\d+)/);
      if (javaVersionMatch) {
        framework.versions!.java = javaVersionMatch[1];
      }

      return framework;
    }
  }

  // Check for Maven (pom.xml)
  const pomPath = join(dir, "pom.xml");
  if (existsSync(pomPath)) {
    const content = readFileSync(pomPath, "utf-8");
    const framework: Framework = {
      name: "Java",
      language: "Java",
      versions: {},
    };

    if (content.includes("spring-boot")) {
      framework.name = "Spring Boot";
      const versionMatch = content.match(/<spring-boot\.version>([\d.]+)<\//);
      if (versionMatch) framework.version = versionMatch[1];
    }

    const javaMatch = content.match(/<java\.version>(\d+)<\//);
    if (javaMatch) {
      framework.versions!.java = javaMatch[1];
    }

    return framework;
  }

  return null;
}

/** Detects PHP frameworks from composer.json */
function detectPhpFramework(dir: string): Framework | null {
  const composerPath = join(dir, "composer.json");
  if (!existsSync(composerPath)) return null;

  let composer: Record<string, unknown>;
  try {
    composer = JSON.parse(readFileSync(composerPath, "utf-8"));
  } catch {
    return null;
  }

  const framework: Framework = {
    name: "PHP",
    language: "PHP",
    versions: {},
  };

  const require = composer.require as Record<string, string> | undefined;
  if (!require) return framework;

  // Extract PHP version
  if (require.php) {
    framework.versions!.php = require.php.replace(/[\^~>=<]*/g, "");
  }

  // Detect frameworks
  if (require["laravel/framework"]) {
    framework.name = "Laravel";
    framework.version = require["laravel/framework"].replace(/[\^~]/, "");
  } else if (require["symfony/framework-bundle"]) {
    framework.name = "Symfony";
    framework.version = require["symfony/framework-bundle"].replace(/[\^~]/, "");
  }

  return framework;
}
