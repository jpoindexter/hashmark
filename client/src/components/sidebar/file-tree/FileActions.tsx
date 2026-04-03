import ConfirmDialog from "../../shared/ConfirmDialog.tsx";
import { type DialogState } from "./types";

interface FileActionsProps {
  dialog: DialogState;
  onClose: () => void;
  onCreateFile: (name: string) => void;
  onCreateFolder: (name: string) => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
}

export function FileActions({
  dialog,
  onClose,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
}: FileActionsProps) {
  const dialogOpen = dialog !== null;
  const isInputDialog = dialog?.kind === "new-file" || dialog?.kind === "new-folder" || dialog?.kind === "rename";
  const isDeleteDialog = dialog?.kind === "delete" || dialog?.kind === "delete-bulk";

  const dialogTitle = (() => {
    if (!dialog) return "";
    if (dialog.kind === "new-file") return "New File";
    if (dialog.kind === "new-folder") return "New Folder";
    if (dialog.kind === "rename") return "Rename";
    if (dialog.kind === "delete") return `Delete ${dialog.isDir ? "folder" : "file"}`;
    if (dialog.kind === "delete-bulk") return `Delete ${dialog.paths.length} items`;
    return "";
  })();

  const dialogMessage = (() => {
    if (!dialog) return undefined;
    if (dialog.kind === "delete") {
      return `Are you sure you want to delete "${dialog.name}"?${dialog.isDir ? " This will remove all contents." : ""}`;
    }
    if (dialog.kind === "delete-bulk") {
      return `Are you sure you want to delete ${dialog.paths.length} items? This cannot be undone.`;
    }
    if (dialog.kind === "new-file") {
      return dialog.dir ? `Create file in ${dialog.dir}/` : "Create file in project root";
    }
    if (dialog.kind === "new-folder") {
      return dialog.dir ? `Create folder in ${dialog.dir}/` : "Create folder in project root";
    }
    return undefined;
  })();

  const dialogPlaceholder = (() => {
    if (!dialog) return "";
    if (dialog.kind === "new-file") return "filename.ts";
    if (dialog.kind === "new-folder") return "folder-name";
    if (dialog.kind === "rename") return "new name";
    return "";
  })();

  const dialogDefault = dialog?.kind === "rename" ? dialog.oldName : "";

  return (
    <>
      {isInputDialog && (
        <ConfirmDialog
          open={dialogOpen}
          title={dialogTitle}
          message={dialogMessage}
          confirmLabel={dialog?.kind === "rename" ? "Rename" : "Create"}
          inputMode
          inputPlaceholder={dialogPlaceholder}
          inputDefaultValue={dialogDefault}
          onConfirm={() => {}}
          onConfirmWithValue={(val) => {
            const trimmed = val.trim();
            if (!trimmed) return;
            if (dialog?.kind === "new-file") onCreateFile(trimmed);
            else if (dialog?.kind === "new-folder") onCreateFolder(trimmed);
            else if (dialog?.kind === "rename") onRename(trimmed);
          }}
          onCancel={onClose}
        />
      )}

      {isDeleteDialog && (
        <ConfirmDialog
          open={dialogOpen}
          title={dialogTitle}
          message={dialogMessage}
          confirmLabel="Delete"
          danger
          onConfirm={onDelete}
          onCancel={onClose}
        />
      )}
    </>
  );
}
