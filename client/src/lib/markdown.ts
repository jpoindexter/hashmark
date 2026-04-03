import { createElement } from "react";
import type { ReactNode } from "react";

export function renderInline(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return createElement("code", {
        key: i,
        style: {
          background: "var(--bg-3)",
          border: "1px solid var(--border-dim)",
          padding: "1px 5px",
          fontSize: "11px",
          color: "var(--accent)",
          fontFamily: "var(--font)",
        },
      }, part.slice(1, -1));
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return createElement("strong", {
        key: i,
        style: { color: "var(--text)", fontWeight: 600 },
      }, part.slice(2, -2));
    }
    return part;
  });
}
