import { useState } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";

interface Props {
  onComplete: () => void;
}

const MODELS = ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5"];
const PROVIDERS = ["anthropic", "openai", "groq"];

export function OnboardingFlow({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [provider, setProvider] = useState("anthropic");
  const [agentName, setAgentName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [saving, setSaving] = useState(false);

  const finish = () => {
    localStorage.setItem("hm-onboarding-complete", "1");
    onComplete();
  };

  const saveKey = async () => {
    if (!apiKey.trim()) { setStep(3); return; }
    setSaving(true);
    try {
      await fetchApi("/api/settings/provider", {
        method: "POST",
        body: JSON.stringify({ provider, apiKey }),
      });
      setStep(3);
    } catch {
      toast.error("Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  const createAgent = async () => {
    if (!agentName.trim()) { finish(); return; }
    setSaving(true);
    try {
      await fetchApi("/api/agents", {
        method: "POST",
        body: JSON.stringify({ name: agentName, systemPrompt, model }),
      });
      toast.success("You're all set! Start a new session to begin.");
      finish();
    } catch {
      toast.error("Failed to create agent");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    color: "var(--text)",
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    boxSizing: "border-box",
    outline: "none",
  };

  const btnPrimary: React.CSSProperties = {
    padding: "9px 20px",
    background: "var(--accent)",
    border: "none",
    borderRadius: "var(--radius-md)",
    color: "var(--bg)",
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    fontWeight: 600,
  };

  const btnGhost: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    padding: "6px 0",
    textDecoration: "underline",
    textUnderlineOffset: 3,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        width: 440,
        padding: "36px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
      }}>

        {/* Step dots */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{
              width: n === step ? 20 : 7, height: 7,
              borderRadius: 4,
              background: n === step ? "var(--accent)" : n < step ? "var(--accent-dim)" : "var(--border)",
              transition: "width 0.2s, background 0.2s",
            }} />
          ))}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✦</div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-sans)" }}>
                Welcome to Hashmark
              </h2>
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, fontFamily: "var(--font-sans)" }}>
                A local AI agent harness. Let's get you set up in 3 steps.
              </p>
            </div>
            <button style={btnPrimary} onClick={() => setStep(2)}>
              Get Started
            </button>
          </>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <>
            <div>
              <h2 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-sans)" }}>
                Connect your AI provider
              </h2>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}>
                Add an API key to start running agents.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <select
                value={provider}
                onChange={e => setProvider(e.target.value)}
                style={{ ...inputStyle }}
              >
                {PROVIDERS.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>

              <div style={{ position: "relative" }}>
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  style={{ ...inputStyle, paddingRight: 40 }}
                  onKeyDown={e => e.key === "Enter" && void saveKey()}
                />
                <button
                  onClick={() => setShowKey(v => !v)}
                  style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-sans)",
                  }}
                >
                  {showKey ? "hide" : "show"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
              <button style={btnPrimary} onClick={() => void saveKey()} disabled={saving}>
                {saving ? "Saving..." : "Save & Continue"}
              </button>
              <button style={{ ...btnGhost, alignSelf: "center" }} onClick={() => setStep(3)}>
                Skip for now
              </button>
            </div>
          </>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <>
            <div>
              <h2 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-sans)" }}>
                Create an agent
              </h2>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}>
                Agents are reusable AI personas with custom instructions.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                type="text"
                value={agentName}
                onChange={e => setAgentName(e.target.value)}
                placeholder="My Assistant"
                style={inputStyle}
              />
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="You are a helpful assistant..."
                rows={4}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
              />
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                style={inputStyle}
              >
                {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
              <button style={btnPrimary} onClick={() => void createAgent()} disabled={saving}>
                {saving ? "Creating..." : "Create Agent"}
              </button>
              <button style={{ ...btnGhost, alignSelf: "center" }} onClick={finish}>
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
