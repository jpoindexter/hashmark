"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Code, Route, Database, FileText, Zap, Terminal, Palette, Settings, BarChart3 } from "lucide-react";
import { useSearch } from "@/hooks/use-search";
import type { SearchResult } from "@/hooks/use-search";

const SECTION_ICONS: Record<string, React.ElementType> = {
  components: Code,
  api_routes: Route,
  database: Database,
  overview: FileText,
  rules: Zap,
  hooks: Code,
  imports: FileText,
  env_vars: Settings,
  patterns: Terminal,
  design_tokens: Palette,
  commands: Terminal,
  complexity: BarChart3,
  custom: FileText,
};

function sectionToRoute(sectionType: string, repoId: string): string {
  switch (sectionType) {
    case "complexity":
      return `/dashboard/${repoId}/complexity`;
    case "env_vars":
    case "commands":
      return `/dashboard/${repoId}/settings`;
    default:
      return `/dashboard/${repoId}`;
  }
}

/** Render snippet with **bold** markers as <strong> elements. */
function SnippetText({ snippet }: { snippet: string }) {
  const parts = snippet.split(/(\*\*.*?\*\*)/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="text-accent font-bold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

/** Individual search result row. */
function SearchResultItem({
  result,
  index,
  isSelected,
  onSelect,
  onHover,
}: {
  result: SearchResult;
  index: number;
  isSelected: boolean;
  onSelect: (result: SearchResult) => void;
  onHover: (index: number) => void;
}) {
  const Icon = SECTION_ICONS[result.sectionType] ?? FileText;
  return (
    <button
      data-index={index}
      role="option"
      aria-selected={isSelected}
      className={`flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors ${
        isSelected ? "bg-accent/10" : "hover:bg-muted/50"
      }`}
      onClick={() => onSelect(result)}
      onMouseEnter={() => onHover(index)}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-xs font-bold uppercase text-foreground">
            {result.sectionHeading}
          </span>
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
            {result.sectionType.replace("_", " ")}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 font-mono text-xs leading-relaxed text-muted-foreground">
          <SnippetText snippet={result.snippet} />
        </p>
        <span className="mt-1 block font-mono text-[10px] text-muted-foreground/60">
          {result.repoFullName}
        </span>
      </div>
    </button>
  );
}

export function SearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { results, total, isLoading, error } = useSearch(query);

  // Adjust state during render (React Compiler safe) — reset on open
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }

  // Adjust state during render — reset selection on new results
  const [prevResults, setPrevResults] = useState(results);
  if (results !== prevResults) {
    setPrevResults(results);
    setSelectedIndex(0);
  }

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selected?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const navigateToResult = useCallback(
    (result: SearchResult) => {
      router.push(sectionToRoute(result.sectionType, result.repositoryId));
      onClose();
    },
    [router, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) navigateToResult(results[selectedIndex]);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, navigateToResult, onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search codebases"
    >
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SEARCH CODEBASES..."
            className="flex-1 bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            aria-label="Search query"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto" role="listbox">
          {isLoading && query.length >= 2 && (
            <div className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">
              SEARCHING...
            </div>
          )}
          {error && (
            <div className="px-4 py-8 text-center font-mono text-xs text-destructive">
              {error}
            </div>
          )}
          {!isLoading && !error && query.length >= 2 && results.length === 0 && (
            <div className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">
              NO RESULTS FOR &quot;{query}&quot;
            </div>
          )}
          {results.map((result, i) => (
            <SearchResultItem
              key={result.id}
              result={result}
              index={i}
              isSelected={i === selectedIndex}
              onSelect={navigateToResult}
              onHover={setSelectedIndex}
            />
          ))}
        </div>

        {results.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              {total} RESULT{total !== 1 ? "S" : ""}
            </span>
            <div className="flex gap-2 font-mono text-[10px] text-muted-foreground">
              <span>↑↓ NAVIGATE</span>
              <span>↵ SELECT</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Trigger button for the search dialog. */
export function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpen();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpen]);

  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2 border border-border bg-muted/50 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
      aria-label="Search codebases"
    >
      <Search className="size-3" />
      <span className="hidden sm:inline">&gt; SEARCH</span>
      <kbd className="hidden rounded border border-border px-1 py-0.5 text-[10px] sm:inline">
        ⌘K
      </kbd>
    </button>
  );
}
