import { useState, useEffect } from "react";
import { fetchModelRegistry, type ModelEntry, type ProviderRegistry } from "../lib/models";

export function useModels() {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [providers, setProviders] = useState<ProviderRegistry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModelRegistry()
      .then(({ models: m, providers: p }) => {
        setModels(m);
        setProviders(p);
      })
      .finally(() => setLoading(false));
  }, []);

  // Group models by provider for dropdown rendering
  const grouped = providers.map(p => ({
    provider: p,
    models: models.filter(m => m.providerId === p.id),
  })).filter(g => g.models.length > 0);

  return { models, providers, grouped, loading };
}
