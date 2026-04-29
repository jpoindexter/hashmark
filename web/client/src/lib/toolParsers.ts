export type TodoItem = { status: string; content: string; id?: string };
export type GrepGroup = { file: string; matches: Array<{ line: number | null; text: string }> };

export function parseBashStatus(result: string | undefined): "running" | "completed" | null {
  if (!result) return null;
  const lower = result.toLowerCase();
  if (lower.includes("running in background") || lower.includes("process started") || /pid\s+\d+/i.test(result)) return "running";
  if (lower.includes("completed") || lower.includes("finished") || lower.includes("process exited")) return "completed";
  return null;
}

export function computeDiffStats(content: string): { added: number; removed: number } {
  let added = 0, removed = 0;
  for (const line of content.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

export function parseGrepResult(content: string): GrepGroup[] {
  const lines = content.trim().split("\n").filter(Boolean);
  const groups: GrepGroup[] = [];
  let current: GrepGroup | null = null;

  for (const line of lines) {
    const m = line.match(/^([^:]+):(\d+):(.*)$/) ?? line.match(/^([^:]+):([^0-9].*)$/);
    if (m) {
      const file = m[1];
      const isLineNum = /^\d+$/.test(m[2]);
      const lineNum = isLineNum ? parseInt(m[2], 10) : null;
      const text = isLineNum ? m[3] : m[2];
      if (!current || current.file !== file) {
        current = { file, matches: [] };
        groups.push(current);
      }
      current.matches.push({ line: lineNum, text });
    } else {
      if (!current) { current = { file: "", matches: [] }; groups.push(current); }
      current.matches.push({ line: null, text: line });
    }
  }
  return groups;
}

export function parseTodosFromResult(result: string): TodoItem[] | null {
  try {
    const m = result.match(/\[[\s\S]*\]/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as TodoItem[];
  } catch { return null; }
}
