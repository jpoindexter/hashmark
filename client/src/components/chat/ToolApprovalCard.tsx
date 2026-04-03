import { Shield, Check, X, ShieldCheck } from "lucide-react";

interface ToolApprovalCardProps {
  tool: string;
  input: Record<string, unknown>;
  toolUseId?: string;
  onApprove: (toolUseId: string) => void;
  onDeny: (toolUseId: string) => void;
  onApproveAll: () => void;
}

function primaryArg(tool: string, input: Record<string, unknown>): string {
  if (tool === "bash") return String(input.command ?? "");
  if (tool === "write" || tool === "edit" || tool === "read") return String(input.file_path ?? input.path ?? "");
  return Object.values(input).find(v => typeof v === "string") as string ?? "";
}

export default function ToolApprovalCard({
  tool, input, toolUseId, onApprove, onDeny, onApproveAll,
}: ToolApprovalCardProps) {
  const arg = primaryArg(tool, input);
  const id = toolUseId ?? "";

  return (
    <div style={{
      margin: "6px 0",
      padding: "10px 14px",
      background: "var(--yellow-bg)",
      border: "1px solid var(--yellow-border)",
      borderRadius: "var(--radius-lg)",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Shield size={14} style={{ color: "var(--yellow)", flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
          Claude wants to run <strong>{tool}</strong>
        </span>
      </div>

      {arg && (
        <div style={{
          fontFamily: "var(--font)", fontSize: 12, color: "var(--text-dim)",
          padding: "4px 8px", background: "var(--bg-3)", borderRadius: "var(--radius)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {arg}
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn btn-sm" onClick={() => onApprove(id)} style={{
          background: "var(--green-bg)", borderColor: "var(--green)", color: "var(--green)",
        }}>
          <Check size={12} /> Allow
        </button>
        <button className="btn btn-sm" onClick={() => onDeny(id)} style={{
          background: "var(--red-bg)", borderColor: "var(--red)", color: "var(--red)",
        }}>
          <X size={12} /> Deny
        </button>
        <button className="btn btn-sm" onClick={onApproveAll} style={{ color: "var(--text-dim)" }}>
          <ShieldCheck size={12} /> Allow all
        </button>
      </div>
    </div>
  );
}
