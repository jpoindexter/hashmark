import { useState } from "react";
import Toggle from "../../components/shared/Toggle";
import { fetchApi } from "../../lib/api";
import type { Policy, PolicyRule } from "./types";

const RULE_TEMPLATES: { label: string; rule: PolicyRule }[] = [
  {
    label: "No secrets in commits",
    rule: { type: "block", pattern: "(?i)(password|secret|api[_-]?key|token)\\s*=\\s*['\"][^'\"]+['\"]", message: "Potential secret detected in commit" },
  },
  {
    label: "No force push",
    rule: { type: "warn", pattern: "git push --force|git push -f", message: "Force push requires review" },
  },
  {
    label: "Require tests",
    rule: { type: "require", pattern: "\\.(test|spec)\\.(ts|tsx|js|jsx)$", message: "Tests required before merge" },
  },
  {
    label: "No prod deploys on Friday",
    rule: { type: "block", pattern: "deploy.*prod|prod.*deploy", message: "Production deploys blocked on Fridays" },
  },
];

interface PolicyDrawerProps {
  policy: Policy | null;
  onSave: () => void;
  onClose: () => void;
}

export function PolicyDrawer({ policy, onSave, onClose }: PolicyDrawerProps) {
  const [name, setName] = useState(policy?.name ?? "");
  const [description, setDescription] = useState(policy?.description ?? "");
  const [scope, setScope] = useState<"session" | "project" | "global">(
    (policy?.scope as "session" | "project" | "global") ?? "project"
  );
  const [rulesRaw, setRulesRaw] = useState(
    policy ? JSON.stringify(policy.rules, null, 2) : "[]"
  );
  const [rulesErr, setRulesErr] = useState("");
  const [enabled, setEnabled] = useState(policy ? Boolean(policy.enabled) : true);
  const [saving, setSaving] = useState(false);

  const isEdit = policy !== null;

  const validateRules = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("must be array");
      setRulesErr("");
      return parsed as PolicyRule[];
    } catch {
      setRulesErr("Rules must be a valid JSON array");
      return null;
    }
  };

  const addTemplate = (rule: PolicyRule) => {
    try {
      const current = JSON.parse(rulesRaw);
      const next = Array.isArray(current) ? [...current, rule] : [rule];
      setRulesRaw(JSON.stringify(next, null, 2));
      setRulesErr("");
    } catch {
      setRulesRaw(JSON.stringify([rule], null, 2));
      setRulesErr("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rules = validateRules(rulesRaw);
    if (!rules) return;
    setSaving(true);
    if (isEdit) {
      await fetchApi(`/api/governance/policies/${policy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, scope, rules, enabled }),
      });
    } else {
      await fetchApi("/api/governance/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, scope, rules, enabled }),
      });
    }
    setSaving(false);
    onSave();
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--bg)",
    border: "1px solid var(--border-dim)",
    color: "var(--text)",
    fontFamily: "var(--font)",
    fontSize: 12,
    padding: "6px 8px",
    outline: "none",
    boxSizing: "border-box",
    borderRadius: 0,
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 10,
    letterSpacing: "0.06em",
    color: "var(--text-dimmer)",
    marginBottom: 4,
    textTransform: "uppercase",
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 200,
        }}
      />
      <div style={{
        position: "fixed",
        top: 0, right: 0, bottom: 0,
        width: 480,
        background: "var(--bg-2)",
        borderLeft: "1px solid var(--border)",
        zIndex: 201,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-dim)",
          background: "var(--bg-3)",
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", letterSpacing: "0.06em" }}>
            {isEdit ? "EDIT POLICY" : "NEW POLICY"}
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-dimmer)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <form
          onSubmit={e => void handleSubmit(e)}
          style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input
                style={inputStyle}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. no-shell-exec"
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Scope</label>
              <select
                style={{ ...inputStyle, appearance: "none" }}
                value={scope}
                onChange={e => setScope(e.target.value as "session" | "project" | "global")}
              >
                <option value="session">session</option>
                <option value="project">project</option>
                <option value="global">global</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Description <span style={{ opacity: 0.5, textTransform: "none", fontSize: 9 }}>(optional)</span></label>
            <input
              style={inputStyle}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this policy enforce?"
            />
          </div>

          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--text-dimmer)", marginBottom: 6, textTransform: "uppercase" }}>
              Quick-add templates
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {RULE_TEMPLATES.map(t => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => addTemplate(t.rule)}
                  style={{
                    background: "var(--bg-3)",
                    border: "1px solid var(--border-dim)",
                    color: "var(--text-dim)",
                    padding: "3px 9px",
                    fontFamily: "var(--font)",
                    fontSize: 10,
                    cursor: "pointer",
                    letterSpacing: "0.03em",
                    borderRadius: 0,
                    transition: "border-color 0.1s, color 0.1s",
                  }}
                  className="hoverable"
                >
                  + {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Rules (JSON array)</label>
            <textarea
              style={{
                ...inputStyle,
                height: 180,
                resize: "vertical",
                borderColor: rulesErr ? "var(--red)" : "var(--border-dim)",
              }}
              value={rulesRaw}
              onChange={e => setRulesRaw(e.target.value)}
              onBlur={() => validateRules(rulesRaw)}
              spellCheck={false}
            />
            {rulesErr
              ? <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>{rulesErr}</div>
              : <div style={{ fontSize: 10, color: "var(--text-dimmer)", marginTop: 4 }}>
                  Each rule: <code style={{ color: "var(--text-dim)" }}>{"{ type, pattern, message }"}</code> — type: block | warn | require
                </div>
            }
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Toggle checked={enabled} onChange={setEnabled} />
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </form>

        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border-dim)",
          background: "var(--bg-3)",
          display: "flex",
          gap: 8,
        }}>
          <button
            className="btn btn-primary"
            onClick={e => void handleSubmit(e as unknown as React.FormEvent)}
            disabled={saving || !name.trim()}
            style={{ fontSize: 11 }}
          >
            {saving ? "Saving..." : isEdit ? "Update policy" : "Save policy"}
          </button>
          <button
            className="btn"
            type="button"
            onClick={onClose}
            style={{ fontSize: 11 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
