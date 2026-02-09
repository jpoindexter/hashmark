"use client";

import { useEffect, useState } from "react";
import { connectRepo } from "@/app/(dashboard)/dashboard/repos/actions";
import { REPO_ENDPOINTS } from "@/config/api-endpoints";

interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  connected: boolean;
}

export function ConnectRepoDialog({ onClose }: { onClose: () => void }) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [connecting, setConnecting] = useState<number | null>(null);

  useEffect(() => {
    fetch(REPO_ENDPOINTS.LIST)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch repos");
        return res.json();
      })
      .then(setRepos)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = repos.filter(
    (r) =>
      !r.connected &&
      (r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.fullName.toLowerCase().includes(search.toLowerCase()))
  );

  const handleConnect = async (repo: GitHubRepo) => {
    setConnecting(repo.id);
    try {
      const fd = new FormData();
      fd.set("githubRepoId", String(repo.id));
      fd.set("name", repo.name);
      fd.set("fullName", repo.fullName);
      fd.set("defaultBranch", repo.defaultBranch);
      fd.set("private", String(repo.private));
      if (repo.language) fd.set("language", repo.language);
      if (repo.description) fd.set("description", repo.description);
      await connectRepo(fd);
      onClose();
    } catch {
      setError("Failed to connect repository");
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg border border-border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider">
            CONNECT REPOSITORY
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close dialog"
          >
            X
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-border p-4">
          <input
            type="text"
            placeholder="Search your GitHub repos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="w-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
          />
        </div>

        {/* Repo list */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-xs uppercase tracking-wider text-muted-foreground">
              LOADING REPOSITORIES...
            </div>
          ) : error ? (
            <div className="p-8 text-center text-xs text-destructive">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {search
                ? "NO MATCHING REPOSITORIES"
                : "ALL REPOSITORIES CONNECTED"}
            </div>
          ) : (
            <ul>
              {filtered.map((repo) => (
                <li
                  key={repo.id}
                  className="flex items-center justify-between border-b border-border px-4 py-2 last:border-0"
                >
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm font-medium">
                      {repo.fullName}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {repo.language && <span>{repo.language}</span>}
                      {repo.private && <span>PRIVATE</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleConnect(repo)}
                    disabled={connecting === repo.id}
                    className="ml-4 border border-accent px-4 py-2 text-xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                  >
                    {connecting === repo.id ? "..." : "> CONNECT"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
