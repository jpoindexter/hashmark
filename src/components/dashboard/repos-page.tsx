"use client";

import { useState } from "react";
import type { Repository, Scan } from "@prisma/client";
import { PageHeader, EmptyState, Button } from "@fabrk/components";
import { GitBranch } from "lucide-react";
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
      <PageHeader
        title="REPOSITORIES"
        totalCount={repos.length}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search repositories..."
        actions={
          <Button onClick={() => setShowConnect(true)}>
            {"> CONNECT REPO"}
          </Button>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title={
            repos.length === 0
              ? "NO REPOSITORIES CONNECTED"
              : "NO MATCHING REPOSITORIES"
          }
          description={
            repos.length === 0
              ? "Connect a GitHub repo to start scanning"
              : undefined
          }
          action={
            repos.length === 0
              ? {
                  label: "> CONNECT REPO",
                  onClick: () => setShowConnect(true),
                }
              : undefined
          }
        />
      ) : (
        <div className="mt-6 space-y-4">
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
