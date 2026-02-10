"use client";

import { useState, useEffect, useRef } from "react";

export interface SearchResult {
  id: string;
  repositoryId: string;
  repoFullName: string;
  repoName: string;
  sectionHeading: string;
  sectionType: string;
  chunkIndex: number;
  rank: number;
  snippet: string;
}

interface SearchState {
  results: SearchResult[];
  total: number;
  isLoading: boolean;
  error: string | null;
}

export function useSearch(
  query: string,
  options?: { repoId?: string; sectionType?: string }
): SearchState {
  const [state, setState] = useState<SearchState>({
    results: [],
    total: 0,
    isLoading: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear previous debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Reset on empty query
    if (!query.trim() || query.trim().length < 2) {
      setState({ results: [], total: 0, isLoading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    debounceRef.current = setTimeout(async () => {
      // Abort previous in-flight request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (options?.repoId) params.set("repoId", options.repoId);
        if (options?.sectionType) params.set("sectionType", options.sectionType);

        const res = await fetch(`/api/search?${params}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Search failed (${res.status})`);
        }

        const data = await res.json();
        if (!controller.signal.aborted) {
          setState({
            results: data.results ?? [],
            total: data.total ?? 0,
            isLoading: false,
            error: null,
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : "Search failed",
          }));
        }
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [query, options?.repoId, options?.sectionType]);

  return state;
}
