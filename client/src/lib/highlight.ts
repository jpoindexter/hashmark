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
  try {
    highlighter = await createHighlighter({
      themes: ["one-dark-pro", "github-light-default"],
      langs: [...SUPPORTED_LANGS],
    });
  } catch {
    // Fallback if preferred themes aren't available
    highlighter = await createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: [...SUPPORTED_LANGS],
    });
  }
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
  const loadedThemes = h.getLoadedThemes();
  const darkTheme = loadedThemes.includes("one-dark-pro") ? "one-dark-pro" : loadedThemes[0] ?? "github-dark";
  const lightTheme = loadedThemes.includes("github-light-default") ? "github-light-default" : loadedThemes.find(t => t.includes("light")) ?? darkTheme;
  const themeName = theme === "light" ? lightTheme : darkTheme;
  try {
    return h.codeToHtml(code, {
      lang: resolvedLang,
      theme: themeName,
    });
  } catch {
    try {
      return h.codeToHtml(code, { lang: "text", theme: themeName });
    } catch {
      return "";
    }
  }
}

export function getLanguageFromPath(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}
