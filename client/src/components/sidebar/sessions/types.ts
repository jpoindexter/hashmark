import type { ContextMenuItem } from "../../shared/ContextMenu.tsx";
import { fetchApi } from "../../../lib/api";

export interface ChatSession {
  id: string;
  title: string;
  message_count: number;
  updated_at: number;
}

export interface GitStatus {
  branch: string;
  files: { status: string; added: number; removed: number }[];
}

export interface WorkspaceInfo {
  name: string;
  dir: string;
  git: GitStatus | null;
}

export interface DialogState {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  inputMode?: boolean;
  inputPlaceholder?: string;
  inputDefaultValue?: string;
  onConfirm: () => void;
  onConfirmWithValue?: (value: string) => void;
}

// 4 neutral grey avatar backgrounds using design tokens (theme-safe)
const AVATAR_BG_VARIANTS = [
  "var(--surface-muted)",
  "var(--surface-subtle)",
  "var(--surface-dim)",
  "var(--surface-input)",
];

export function avatarBg(name: string): string {
  return AVATAR_BG_VARIANTS[name.charCodeAt(0) % 4];
}

export function avatarColor(): string {
  return "var(--text)";
}

// Builds context menu items for a session row (uses setDialog for confirm/prompt)
export function buildSessionMenuItems(
  session: ChatSession,
  onRefresh: () => void,
  setDialog: (d: DialogState | null) => void,
): ContextMenuItem[] {
  return [
    {
      label: "Rename",
      onClick: () => {
        setDialog({
          open: true,
          title: "Rename mission",
          inputMode: true,
          inputPlaceholder: "Mission name",
          inputDefaultValue: session.title || "Untitled",
          confirmLabel: "Rename",
          onConfirm: () => {},
          onConfirmWithValue: (newTitle: string) => {
            if (!newTitle.trim()) return;
            fetchApi(`/api/sessions/${session.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: newTitle.trim() }),
            }).then(() => { onRefresh(); setDialog(null); }).catch(() => setDialog(null));
          },
        });
      },
    },
    {
      label: "Duplicate",
      onClick: () => {
        fetchApi("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: `${session.title || "Untitled"} (copy)` }),
        }).then(() => onRefresh()).catch(() => {});
      },
    },
    { label: "", onClick: () => {}, separator: true },
    {
      label: "Delete",
      danger: true,
      onClick: () => {
        setDialog({
          open: true,
          title: `Delete "${session.title || "Untitled"}"?`,
          message: "This will permanently delete this mission and all its messages.",
          confirmLabel: "Delete",
          danger: true,
          onConfirm: () => {
            fetchApi(`/api/sessions/${session.id}`, { method: "DELETE" })
              .then(() => { onRefresh(); setDialog(null); })
              .catch(() => setDialog(null));
          },
        });
      },
    },
  ];
}

// Builds context menu items for the workspace row
export function buildWorkspaceMenuItems(
  dir: string,
  setDialog: (d: DialogState | null) => void,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  if (typeof window.studio?.showInFinder === "function") {
    items.push({
      label: "Open in Finder",
      onClick: () => { void window.studio!.showInFinder(dir); },
    });
  }

  items.push({
    label: "Copy Path",
    onClick: () => {
      void navigator.clipboard.writeText(dir);
    },
  });

  items.push({ label: "", onClick: () => {}, separator: true });

  items.push({
    label: "Remove",
    danger: true,
    onClick: () => {
      setDialog({
        open: true,
        title: "Remove workspace?",
        message: "This will remove the workspace from the sidebar. Your files will not be deleted.",
        confirmLabel: "Remove",
        danger: true,
        onConfirm: () => {
          // Workspace removal is not yet supported on the backend
          setDialog(null);
        },
      });
    },
  });

  return items;
}
