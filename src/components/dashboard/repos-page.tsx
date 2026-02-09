"use client";

import { useState } from "react";
import type { Repository, Scan } from "@prisma/client";
import { RepoCard } from "./repo-card";
import { ConnectRepoDialog } from "./connect-repo-dialog";

type RepoWithLatestScan = Repository & {
  scans: Pick<Scan, "id" | "status" | "createdAt">[];
};

export function ReposPage({ repos }: { repos: RepoWithLatestScan[] }) {
  const [search, setSearch] = useState("");
  const [showConnect, setShowConnect] = useState(false);

  const filtered = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.fullName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold uppercase tracking-wider">
          REPOSITORIES
        </h1>
        <button
          onClick={() => setShowConnect(true)}
          className="border border-accent bg-accent/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {"> CONNECT REPO"}
        </button>
      </div>

      {/* Search */}
      {repos.length > 0 && (
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search repositories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
          />
        </div>
      )}

      {/* Repo list */}
      {filtered.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center">
          <p className="text-2xl font-bold text-accent">#</p>
          <p className="mt-2 text-sm uppercase tracking-wider text-muted-foreground">
            {repos.length === 0
              ? "NO REPOSITORIES CONNECTED"
              : "NO MATCHING REPOSITORIES"}
          </p>
          {repos.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Connect a GitHub repo to start scanning
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((repo) => (
            <RepoCard key={repo.id} repo={repo} />
          ))}
        </div>
      )}

      {showConnect && (
        <ConnectRepoDialog onClose={() => setShowConnect(false)} />
      )}
    </div>
  );
}
