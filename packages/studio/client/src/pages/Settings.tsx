import { useState, useEffect } from "react";

interface InfoData {
  projectName: string;
  projectDir: string;
}

export default function Settings() {
  const [info, setInfo] = useState<InfoData | null>(null);

  useEffect(() => {
    fetch("/api/info").then((r) => r.json()).then(setInfo).catch(() => {});
  }, []);

  return (
    <div style={{ padding: "28px", maxWidth: "600px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "4px" }}>
          Settings
        </h1>
        <div style={{ fontSize: "11px", color: "var(--text-dimmer)" }}>
          Studio configuration and project info
        </div>
      </div>

      <Section title="Project">
        <Field label="Project Directory" value={info?.projectDir ?? "..."} mono />
        <Field label="Project Name" value={info?.projectName ?? "..."} />
        <Field label="Agents Path" value={`${info?.projectDir ?? "~"}/.claude/agents/`} mono />
      </Section>

      <Section title="Studio">
        <Field label="Port" value="3200" mono />
        <Field label="Version" value="0.1.0" mono />
      </Section>

      <Section title="Agent Generation">
        <div style={{ fontSize: "12px", color: "var(--text-dim)", lineHeight: 1.6 }}>
          <p>hashmark studio uses AI to generate agent files from your codebase scan.</p>
          <p style={{ marginTop: "8px" }}>
            API keys are read from environment variables — never stored by the studio:
          </p>
          <ul style={{ marginTop: "8px", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {[
              ["ANTHROPIC_API_KEY", "Claude"],
              ["OPENAI_API_KEY", "GPT / OpenAI-compatible"],
              ["GOOGLE_AI_API_KEY", "Gemini"],
              ["XAI_API_KEY", "Grok"],
              ["MISTRAL_API_KEY", "Mistral"],
              ["GROQ_API_KEY", "Groq"],
            ].map(([key, label]) => (
              <li key={key} style={{ color: "var(--text-dimmer)" }}>
                <code style={{ color: "var(--accent)", fontSize: "11px" }}>{key}</code>
                <span style={{ color: "var(--text-dimmer)", fontSize: "11px" }}> — {label}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Task Execution">
        <div style={{ fontSize: "12px", color: "var(--text-dim)", lineHeight: 1.6 }}>
          Tasks use your locally installed <code style={{ color: "var(--accent)" }}>claude</code> CLI.
          No API key required — reuses your existing Claude authentication.
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{
        fontSize: "10px",
        color: "var(--text-dimmer)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "12px",
        paddingBottom: "8px",
        borderBottom: "1px solid var(--border-dim)",
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ fontSize: "10px", color: "var(--text-dimmer)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{
        fontSize: "12px",
        color: "var(--text-dim)",
        fontFamily: mono ? "var(--font)" : undefined,
        background: "var(--bg-2)",
        border: "1px solid var(--border-dim)",
        borderRadius: "var(--radius)",
        padding: "8px 10px",
      }}>
        {value}
      </div>
    </div>
  );
}
