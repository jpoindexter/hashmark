import { useState, useEffect } from "react";
import Toggle from "../shared/Toggle";
import { SectionView, SettingRow } from "./SettingsPrimitives";

function persist(key: string, val: unknown) {
  try { localStorage.setItem(`studio:${key}`, JSON.stringify(val)); } catch {}
}
function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`studio:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function dispatch(key: string, value: unknown) {
  window.dispatchEvent(new CustomEvent("studio:settings-change", { detail: { key, value } }));
}

export default function ChatSection() {
  const [defaultModel, setDefaultModel] = useState<string>(() => restore("selectedModel", "claude-sonnet-4-6"));
  const [thinkingMode, setThinkingMode] = useState<boolean>(() => restore("thinking", false));
  const [streamingUI, setStreamingUI] = useState<boolean>(() => restore("streaming_ui", true));
  const [systemPrompt, setSystemPrompt] = useState<string>(() => restore("system_prompt", ""));
  const [restoreSession, setRestoreSession] = useState<boolean>(() => restore("restoreSession", true));

  useEffect(() => { persist("selectedModel", defaultModel); dispatch("selectedModel", defaultModel); }, [defaultModel]);
  useEffect(() => { persist("thinking", thinkingMode); dispatch("thinking", thinkingMode); }, [thinkingMode]);
  useEffect(() => { persist("streaming_ui", streamingUI); dispatch("streaming_ui", streamingUI); }, [streamingUI]);
  useEffect(() => { persist("system_prompt", systemPrompt); dispatch("system_prompt", systemPrompt); }, [systemPrompt]);
  useEffect(() => { persist("restoreSession", restoreSession); dispatch("restoreSession", restoreSession); }, [restoreSession]);

  return (
    <SectionView title="Chat" description="Configure the AI chat behavior and defaults.">
      <SettingRow label="Default Model" hint="Model used for new chat sessions">
        <select
          value={defaultModel}
          onChange={e => setDefaultModel(e.target.value)}
          style={{
            background: "var(--bg-3)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", color: "var(--text)",
            fontSize: 12, padding: "5px 10px", fontFamily: "var(--font-ui)",
          }}
        >
          <option value="claude-opus-4-6">Claude Opus 4.6 -- 1M ctx</option>
          <option value="claude-sonnet-4-6">Claude Sonnet 4.6 -- default</option>
          <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 -- fast</option>
        </select>
      </SettingRow>
      <SettingRow label="Extended Thinking" hint="Enable deep reasoning by default (slower, more thorough)">
        <Toggle checked={thinkingMode} onChange={setThinkingMode} />
      </SettingRow>
      <SettingRow label="Streaming UI" hint="Stream responses as they arrive rather than waiting">
        <Toggle checked={streamingUI} onChange={setStreamingUI} />
      </SettingRow>
      <SettingRow label="Restore Session on Startup" hint="Automatically resume last session when the app opens. Disable to see the welcome page.">
        <Toggle checked={restoreSession} onChange={setRestoreSession} />
      </SettingRow>
      <SettingRow label="System Prompt" hint="Injected into every session. Use for persistent context." vertical>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          placeholder="e.g. You are working in a TypeScript monorepo. Always follow CLAUDE.md instructions."
          rows={5}
          style={{
            width: "100%", background: "var(--bg-3)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", color: "var(--text)", fontSize: 12,
            fontFamily: "var(--font)", padding: "8px 10px", resize: "vertical",
            lineHeight: 1.5,
          }}
        />
      </SettingRow>
    </SectionView>
  );
}
