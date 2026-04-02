import { useState, useEffect, useRef } from "react";
import { fetchApi } from "../../../lib/api";
import { toast } from "../../../hooks/useToast";

export default function CreatePrDialog({
  open,
  onClose,
  currentBranch,
}: {
  open: boolean;
  onClose: () => void;
  currentBranch: string;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [base, setBase] = useState("main");
  const [branches, setBranches] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setError("");
    setCreating(false);
    fetchApi("/api/files/git/branches")
      .then((r) => r.json())
      .then((d: { branches?: string[] }) => {
        const all = d.branches ?? [];
        setBranches(all);
        if (all.includes("main")) setBase("main");
        else if (all.includes("master")) setBase("master");
        else if (all.length > 0) setBase(all[0]);
      })
      .catch(() => setBranches([]));
    requestAnimationFrame(() => titleRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const submit = async () => {
    if (!title.trim()) return;
    setCreating(true);
    setError("");
    try {
      const r = await fetchApi("/api/files/git/create-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim() || undefined,
          base: base || undefined,
        }),
      });
      const d = (await r.json()) as { ok?: boolean; url?: string; error?: string };
      if (d.ok && d.url) {
        toast.success(`PR created: ${d.url}`);
        onClose();
      } else {
        setError(d.error ?? "Failed to create PR.");
      }
    } catch {
      setError("Failed to create PR.");
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  const baseOptions = branches.filter((b) => b !== currentBranch);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-dialog"
        style={{ padding: "20px 24px", width: 380, gap: 12, display: "flex", flexDirection: "column" }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          Create Pull Request
        </div>
        <div className="text-hint" style={{ fontFamily: "var(--font)" }}>
          {currentBranch} {"\u2192"} {base}
        </div>
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
          placeholder="PR title"
          style={{ width: "100%", boxSizing: "border-box" }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
          placeholder="Description (optional)"
          rows={4}
          style={{ width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 60 }}
        />
        <div className="flex-row gap-2">
          <label className="text-hint" style={{ flexShrink: 0 }}>Base:</label>
          <select value={base} onChange={(e) => setBase(e.target.value)} style={{ flex: 1 }}>
            {baseOptions.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        {error && (
          <div style={{ fontSize: 11, color: "var(--red)", lineHeight: 1.4, padding: "4px 0" }}>
            {error}
          </div>
        )}
        <div className="flex-row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className={title.trim() ? "btn btn-primary" : "btn"}
            onClick={() => void submit()}
            disabled={creating || !title.trim()}
            style={{ opacity: creating ? 0.6 : 1 }}
          >
            {creating ? "Creating..." : "Create PR"}
          </button>
        </div>
      </div>
    </div>
  );
}
