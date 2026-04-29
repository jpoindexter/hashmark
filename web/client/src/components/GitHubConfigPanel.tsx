import { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";

interface GitHubConfig {
  webhookSecret?: string;
  autoWorkflowId?: string;
  prWorkflowId?: string;
  enabled: boolean;
}

export function GitHubConfigPanel({ workflows }: { workflows: { id: string; name: string }[] }) {
  const [cfg, setCfg] = useState<GitHubConfig>({ enabled: false });
  const [draft, setDraft] = useState<GitHubConfig>({ enabled: false });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchApi<GitHubConfig>("/api/github/config").then(c => { setCfg(c); setDraft(c); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    try {
      const updated = await fetchApi<GitHubConfig>("/api/github/config", { method: "PATCH", body: JSON.stringify(draft) });
      setCfg(updated);
      setDraft(updated);
      toast.success("GitHub config saved");
    } catch { toast.error("Failed to save"); }
  };

  if (!loaded) return <div style={{ padding: 16, fontSize: 12, color: "var(--text-muted)" }}>Loading...</div>;

  const webhookUrl = `${window.location.origin}/api/github/webhook`;

  return (
    <div style={{ padding: 16, maxWidth: 520, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
        Point your GitHub repo webhook at the URL below. Set content type to <code style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>application/json</code> and choose which events to send.
      </div>

      <div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Webhook URL</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input className="input input-mono" readOnly value={webhookUrl} style={{ flex: 1, fontSize: 11 }} />
          <button className="btn btn-secondary btn-sm" onClick={() => { void navigator.clipboard.writeText(webhookUrl); toast.success("Copied"); }}>Copy</button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Webhook Secret</div>
        <input
          className="input input-mono"
          type="password"
          placeholder="github webhook secret"
          value={draft.webhookSecret ?? ""}
          onChange={e => setDraft(d => ({ ...d, webhookSecret: e.target.value }))}
          style={{ width: "100%", fontSize: 12 }}
        />
      </div>

      <div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>On Issue Opened -- Run Workflow</div>
        <select
          className="input"
          value={draft.autoWorkflowId ?? ""}
          onChange={e => setDraft(d => ({ ...d, autoWorkflowId: e.target.value || undefined }))}
          style={{ width: "100%", fontSize: 12 }}
        >
          <option value="">-- none --</option>
          {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      <div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>On PR Opened -- Run Workflow</div>
        <select
          className="input"
          value={draft.prWorkflowId ?? ""}
          onChange={e => setDraft(d => ({ ...d, prWorkflowId: e.target.value || undefined }))}
          style={{ width: "100%", fontSize: 12 }}
        >
          <option value="">-- none --</option>
          {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
          <div
            className={`toggle${draft.enabled ? " on" : ""}`}
            onClick={() => setDraft(d => ({ ...d, enabled: !d.enabled }))}
          >
            <div className="toggle-thumb" />
          </div>
          Enable GitHub adapter
        </label>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={() => void save()}>Save</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setDraft(cfg)}>Reset</button>
      </div>
    </div>
  );
}
