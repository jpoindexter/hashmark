"use client";

import { useEffect, useState } from "react";
import { Input, Button } from "@fabrk/components";
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
        className="absolute inset-0 bg-background/90"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg border border-border bg-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="type-h3">
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
          <Input
            type="text"
            placeholder="Search your GitHub repos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* Repo list */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center type-label text-muted-foreground">
              LOADING REPOSITORIES...
            </div>
          ) : error ? (
            <div className="p-8 text-center type-caption text-destructive">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center type-caption text-muted-foreground">
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
                    <p className="truncate type-body font-medium">
                      {repo.fullName}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 type-caption text-muted-foreground">
                      {repo.language && <span>{repo.language}</span>}
                      {repo.private && <span>PRIVATE</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="ml-4"
                    onClick={() => handleConnect(repo)}
                    disabled={connecting === repo.id}
                    loading={connecting === repo.id}
                    loadingText="..."
                  >
                    {"> CONNECT"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
