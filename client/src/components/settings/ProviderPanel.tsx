import { useState, useEffect } from "react";
import { fetchApi } from "../../lib/api";
import { SkeletonCard } from "../shared/Skeleton";
import type { EnvVar } from "./SettingsPrimitives";
import ProviderRow, { PROVIDER_ENV_KEYS, type ProviderInfo } from "./ProviderRow";

interface ProvidersData {
  active: string;
  model: string;
  providers: ProviderInfo[];
}

export default function ProviderPanel({ envVars }: { envVars: EnvVar[] }) {
  const [data, setData] = useState<ProvidersData | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [baseUrlInputs, setBaseUrlInputs] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [testStatus, setTestStatus] = useState<Record<string, "idle" | "testing" | "ok" | "fail">>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetchApi("/api/providers").then(r => r.json()).then((d: ProvidersData) => setData(d)).catch(() => {});
  }, []);

  function loadModels(id: string) {
    if (models[id]) return;
    fetchApi(`/api/providers/models/${id}`)
      .then(r => r.json())
      .then((d: { models: string[] }) => setModels(prev => ({ ...prev, [id]: d.models ?? [] })))
      .catch(() => {});
  }

  function toggleExpand(id: string) {
    const next = expanded === id ? null : id;
    setExpanded(next);
    if (next) loadModels(next);
  }

  async function saveKey(providerId: string) {
    const key = keyInputs[providerId] ?? "";
    setSaving(providerId);
    try {
      await fetchApi(`/api/providers/${providerId}/key`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          providers: prev.providers.map(p =>
            p.id === providerId ? { ...p, hasKey: key.length > 0, enabled: key.length > 0 } : p
          ),
        };
      });
      setKeyInputs(prev => ({ ...prev, [providerId]: "" }));
    } finally {
      setSaving(null);
    }
  }

  async function saveBaseUrl(providerId: string) {
    const url = baseUrlInputs[providerId] ?? "";
    if (!url) return;
    setSaving(providerId);
    try {
      await fetchApi(`/api/providers/${providerId}/baseUrl`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: url }),
      });
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          providers: prev.providers.map(p =>
            p.id === providerId ? { ...p, baseUrl: url } : p
          ),
        };
      });
    } finally {
      setSaving(null);
    }
  }

  async function setActive(providerId: string, model?: string) {
    if (!data) return;
    const provModels = models[providerId] ?? [];
    const chosenModel = model ?? provModels[0] ?? data.model;
    await fetchApi("/api/providers/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId, model: chosenModel }),
    });
    setData(prev => prev ? { ...prev, active: providerId, model: chosenModel } : prev);
  }

  async function testConnection(providerId: string) {
    setTestStatus(prev => ({ ...prev, [providerId]: "testing" }));
    try {
      const res = await fetchApi(`/api/providers/models/${providerId}`);
      const d = await res.json() as { models?: string[]; error?: string };
      if (d.models && d.models.length > 0) {
        setModels(prev => ({ ...prev, [providerId]: d.models! }));
        setTestStatus(prev => ({ ...prev, [providerId]: "ok" }));
      } else {
        setTestStatus(prev => ({ ...prev, [providerId]: "fail" }));
      }
    } catch {
      setTestStatus(prev => ({ ...prev, [providerId]: "fail" }));
    }
    setTimeout(() => setTestStatus(prev => ({ ...prev, [providerId]: "idle" })), 3000);
  }

  if (!data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[1, 2, 3].map(i => <SkeletonCard key={i} height={48} />)}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.providers.map(provider => {
        const isActive = data.active === provider.id;
        const needsKey = provider.id !== "claude" && provider.id !== "ollama";
        const hasEnvKey = envVars.some(v => v.key === PROVIDER_ENV_KEYS[provider.id]);
        const effectivelyHasKey = provider.hasKey || hasEnvKey || provider.cliDetected || provider.id === "claude" || provider.id === "ollama";

        return (
          <ProviderRow
            key={provider.id}
            provider={provider}
            isActive={isActive}
            isExpanded={expanded === provider.id}
            needsKey={needsKey}
            hasEnvKey={hasEnvKey}
            effectivelyHasKey={effectivelyHasKey}
            onToggleExpand={() => toggleExpand(provider.id)}
            keyInput={keyInputs[provider.id] ?? ""}
            onKeyInputChange={v => setKeyInputs(prev => ({ ...prev, [provider.id]: v }))}
            showKey={showKeys[provider.id] ?? false}
            onToggleShowKey={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
            baseUrlInput={baseUrlInputs[provider.id] ?? provider.baseUrl ?? "http://localhost:11434"}
            onBaseUrlChange={v => setBaseUrlInputs(prev => ({ ...prev, [provider.id]: v }))}
            provModels={models[provider.id] ?? []}
            currentModel={data.model}
            testStatus={testStatus[provider.id] ?? "idle"}
            saving={saving}
            onSaveKey={() => void saveKey(provider.id)}
            onSaveBaseUrl={() => void saveBaseUrl(provider.id)}
            onSetActive={(m?: string) => void setActive(provider.id, m)}
            onTestConnection={() => void testConnection(provider.id)}
          />
        );
      })}
    </div>
  );
}
