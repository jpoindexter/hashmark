import { FileCode, FileText } from "lucide-react";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
  ext?: string;
}

export type GitStatus = "M" | "A" | "D" | "?" | string;

export type DialogState =
  | null
  | { kind: "new-file"; dir: string }
  | { kind: "new-folder"; dir: string }
  | { kind: "rename"; oldPath: string; oldName: string }
  | { kind: "delete"; path: string; name: string; isDir: boolean }
  | { kind: "delete-bulk"; paths: string[] };

export const CODE_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "py", "go", "rs", "rb", "java",
  "c", "cpp", "h", "cs", "swift", "kt", "sh", "bash", "sql",
]);

export function fileIcon(ext?: string) {
  if (ext && CODE_EXTS.has(ext)) return FileCode;
  return FileText;
}

export function countFiles(nodes: FileNode[]): number {
  let count = 0;
  for (const n of nodes) {
    if (n.type === "file") count++;
    if (n.children) count += countFiles(n.children);
  }
  return count;
}

/** Flatten a sorted tree into a path-ordered list for shift-click range selection */
export function flattenTree(nodes: FileNode[]): string[] {
  const result: string[] = [];
  for (const n of nodes) {
    result.push(n.path);
    if (n.children) {
      const sorted = [...n.children].sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      result.push(...flattenTree(sorted));
    }
  }
  return result;
}

export function gitStatusColor(status: GitStatus): string {
  if (status === "M") return "var(--yellow)";
  if (status === "A" || status === "?") return "var(--accent)";
  if (status === "D") return "var(--red)";
  return "var(--text-dimmer)";
}
