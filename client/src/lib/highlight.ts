export interface Token {
  type: "keyword" | "string" | "comment" | "number" | "function" | "type" | "operator" | "punctuation" | "plain";
  value: string;
}

const TS_KEYWORDS = new Set([
  "import", "export", "from", "default", "const", "let", "var", "function",
  "class", "extends", "implements", "interface", "type", "enum", "namespace",
  "return", "if", "else", "for", "while", "do", "switch", "case", "break",
  "continue", "try", "catch", "finally", "throw", "new", "delete", "typeof",
  "instanceof", "void", "null", "undefined", "true", "false", "this", "super",
  "async", "await", "yield", "static", "public", "private", "protected",
  "readonly", "abstract", "override", "as", "in", "of", "keyof", "infer",
]);

const TS_TYPES = new Set([
  "string", "number", "boolean", "any", "unknown", "never", "object",
  "symbol", "bigint", "Array", "Promise", "Record", "Partial", "Required",
  "Pick", "Omit", "Exclude", "Extract", "ReturnType", "Parameters",
]);

export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    if (line[i] === "/" && line[i + 1] === "/") {
      tokens.push({ type: "comment", value: line.slice(i) });
      break;
    }

    if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === "\\") j++;
        j++;
      }
      tokens.push({ type: "string", value: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    if (/\d/.test(line[i]) && (i === 0 || !/\w/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[\d._xboe]/.test(line[j])) j++;
      tokens.push({ type: "number", value: line.slice(i, j) });
      i = j;
      continue;
    }

    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /\w/.test(line[j])) j++;
      const word = line.slice(i, j);
      const afterWord = line[j];

      let type: Token["type"] = "plain";
      if (TS_KEYWORDS.has(word)) type = "keyword";
      else if (TS_TYPES.has(word) && afterWord !== "(") type = "type";
      else if (afterWord === "(") type = "function";
      else if (/^[A-Z]/.test(word)) type = "type";

      tokens.push({ type, value: word });
      i = j;
      continue;
    }

    if (/[{}()[\];,.]/.test(line[i])) {
      tokens.push({ type: "punctuation", value: line[i] });
      i++;
      continue;
    }

    if (/[=<>!&|+\-*/%^~?:@]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[=<>!&|+\-*/%^~?:]/.test(line[j])) j++;
      tokens.push({ type: "operator", value: line.slice(i, j) });
      i = j;
      continue;
    }

    let j = i;
    while (j < line.length && !/[a-zA-Z_$\d"'`/{}()[\];,. =<>!&|+\-*/%^~?:@]/.test(line[j])) j++;
    if (j === i) j = i + 1;
    tokens.push({ type: "plain", value: line.slice(i, j) });
    i = j;
  }

  return tokens;
}

export const TOKEN_COLORS: Record<Token["type"], string> = {
  keyword:     "#7dd3fc",
  string:      "#86efac",
  comment:     "#52525b",
  number:      "#fbbf24",
  function:    "#c4b5fd",
  type:        "#67e8f9",
  operator:    "#94a3b8",
  punctuation: "#71717a",
  plain:       "#e4e4e7",
};

export function getLang(ext: string): "ts" | "js" | "json" | "css" | "md" | "other" {
  const map: Record<string, "ts" | "js" | "json" | "css" | "md"> = {
    ts: "ts", tsx: "ts", js: "js", jsx: "js", mjs: "js",
    json: "json", css: "css", scss: "css",
    md: "md", mdx: "md",
  };
  return map[ext.toLowerCase()] ?? "other";
}
