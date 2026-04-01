import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import langTypescript from "@shikijs/langs/typescript";
import langJavascript from "@shikijs/langs/javascript";
import langTsx from "@shikijs/langs/tsx";
import langJsx from "@shikijs/langs/jsx";
import langJson from "@shikijs/langs/json";
import langCss from "@shikijs/langs/css";
import langHtml from "@shikijs/langs/html";
import langMarkdown from "@shikijs/langs/markdown";
import langPython from "@shikijs/langs/python";
import langGo from "@shikijs/langs/go";
import langRust from "@shikijs/langs/rust";
import langBash from "@shikijs/langs/bash";
import langYaml from "@shikijs/langs/yaml";
import langSql from "@shikijs/langs/sql";
import themeOneDarkPro from "@shikijs/themes/one-dark-pro";

const LANGS = [
  langTypescript, langJavascript, langTsx, langJsx,
  langJson, langCss, langHtml, langMarkdown,
  langPython, langGo, langRust, langBash, langYaml, langSql,
];

let highlighter: HighlighterCore | null = null;
let loading = false;
const queue: Array<() => void> = [];

async function getHighlighter(): Promise<HighlighterCore> {
  if (highlighter) return highlighter;
  if (loading) {
    return new Promise((resolve) => {
      queue.push(() => resolve(highlighter!));
    });
  }
  loading = true;
  highlighter = await createHighlighterCore({
    engine: createOnigurumaEngine(),
    themes: [themeOneDarkPro],
    langs: LANGS,
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
  _theme?: "dark" | "light",
): Promise<string> {
  const h = await getHighlighter();
  const resolvedLang = LANG_MAP[lang] ?? "text";
  try {
    return h.codeToHtml(code, {
      lang: resolvedLang,
      theme: "one-dark-pro",
    });
  } catch {
    try {
      return h.codeToHtml(code, { lang: "text", theme: "one-dark-pro" });
    } catch {
      return "";
    }
  }
}

export function getLanguageFromPath(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}
