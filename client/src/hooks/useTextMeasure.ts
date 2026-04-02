import { useCallback, useRef, useEffect } from "react";
import { prepare, layout } from "@chenglou/pretext";

/**
 * Uses pretext to estimate text height without DOM reflow.
 * Falls back to a rough estimate if pretext fails.
 *
 * The font string must match the CSS font shorthand used for rendering.
 * Container width should be the actual text container width minus padding.
 */

const preparedCache = new Map<string, ReturnType<typeof prepare>>();
const MAX_CACHE = 500;

function getPrepared(text: string, font: string): ReturnType<typeof prepare> {
  const key = `${font}::${text}`;
  let p = preparedCache.get(key);
  if (!p) {
    // Evict oldest entries if cache is full
    if (preparedCache.size >= MAX_CACHE) {
      const first = preparedCache.keys().next().value;
      if (first) preparedCache.delete(first);
    }
    p = prepare(text, font);
    preparedCache.set(key, p);
  }
  return p;
}

// Strip markdown for measurement (code blocks, headers, etc. affect height differently)
function stripForMeasure(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => {
      // Count lines in code blocks -- they render as fixed-height blocks
      const lines = m.split("\n").length;
      return "\n".repeat(lines);
    })
    .replace(/^#{1,6}\s+/gm, "") // headers rendered differently but similar line count
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

interface UseTextMeasureOptions {
  /** CSS font shorthand, e.g. "13px 'JetBrains Mono Variable'" */
  font: string;
  /** Line height in px */
  lineHeight: number;
  /** Base vertical padding per message bubble (top + bottom + margins) */
  basePadding: number;
}

export function useTextMeasure({ font, lineHeight, basePadding }: UseTextMeasureOptions) {
  const containerWidth = useRef(852); // 900 max - 48px padding

  // Track container width for accurate layout
  const updateWidth = useCallback((el: HTMLElement | null) => {
    if (el) {
      const w = el.clientWidth - 48; // 24px padding each side
      if (w > 0) containerWidth.current = w;
    }
  }, []);

  return {
    updateWidth,
    estimateHeight: useCallback((text: string, role: "user" | "assistant" | "divider"): number => {
      if (role === "divider") return 40;

      // User messages are simpler -- no markdown, just pre-wrap text
      if (role === "user") {
        const maxW = Math.min(containerWidth.current * 0.8, containerWidth.current); // 80% max-width
        try {
          const p = getPrepared(text, font);
          const { height } = layout(p, maxW, lineHeight);
          return height + basePadding + 20; // 20 for timestamp area
        } catch {
          // Fallback: rough estimate
          const charPerLine = Math.floor(maxW / 8);
          const lines = Math.max(1, Math.ceil(text.length / charPerLine));
          return lines * lineHeight + basePadding + 20;
        }
      }

      // Assistant messages: strip markdown, then measure
      const cleaned = stripForMeasure(text);
      try {
        const p = getPrepared(cleaned, font);
        const { height } = layout(p, containerWidth.current - 14, lineHeight); // 14px for border-left + padding
        // Add extra height for code blocks (they have padding + border)
        const codeBlocks = (text.match(/```/g) ?? []).length / 2;
        const codeBlockExtra = codeBlocks * 30; // ~30px extra per code block for padding/border
        return height + basePadding + codeBlockExtra + 20;
      } catch {
        const charPerLine = Math.floor(containerWidth.current / 8);
        const lines = Math.max(1, Math.ceil(cleaned.length / charPerLine));
        return lines * lineHeight + basePadding;
      }
    }, [font, lineHeight, basePadding]),
  };
}
