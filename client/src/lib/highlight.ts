import { createHighlighter, type Highlighter } from "shiki";

let highlighter: Highlighter | null = null;
let loading = false;
const queue: Array<() => void> = [];

const SUPPORTED_LANGS = [
  "typescript", "javascript", "json", "css", "html", "markdown",
  "python", "go", "rust", "bash", "yaml", "sql", "tsx", "jsx",
] as const;

async function getHighlighter(): Promise<Highlighter> {
  if (highlighter) return highlighter;
  if (loading) {
    return new Promise((resolve) => {
      queue.push(() => resolve(highlighter!));
    });
  }
  loading = true;
  highlighter = await createHighlighter({
    themes: ["one-dark-pro", "github-light-default"],
    langs: [...SUPPORTED_LANGS],
  });
  loading = false;
  queue.forEach((fn) => fn());
  queue.length = 0;
  return highlighter;
}

const LANG_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "css",
  html: "html",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  go: "go",
  rs: "rust",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yaml: "yaml",
  yml: "yaml",
  sql: "sql",
};

export async function highlightCode(
  code: string,
  lang: string,
  theme?: "dark" | "light",
): Promise<string> {
  const h = await getHighlighter();
  const resolvedLang = LANG_MAP[lang] ?? "text";
  const themeName = theme === "light" ? "github-light-default" : "one-dark-pro";
  try {
    return h.codeToHtml(code, {
      lang: resolvedLang,
      theme: themeName,
    });
  } catch {
    return h.codeToHtml(code, { lang: "text", theme: themeName });
  }
}

export function getLanguageFromPath(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}
