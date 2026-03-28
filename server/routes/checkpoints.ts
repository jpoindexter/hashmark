import { Hono } from "hono";
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";

const execFile = promisify(execFileCb);

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "checkpoint";
}

export function checkpointRoutes(projectDir: string) {
  const app = new Hono();
  const opts = { cwd: projectDir };

  // List checkpoints
  app.get("/", async (c) => {
    let forEachOutput = "";
    try {
      const result = await execFile(
        "git",
        [
          "for-each-ref",
          "refs/studio-checkpoints",
          "--format=%(refname) %(objectname) %(committerdate:iso8601) %(subject)",
          "--sort=-committerdate",
        ],
        opts
      );
      forEachOutput = result.stdout;
    } catch {
      return c.json({ checkpoints: [] });
    }

    type RawCheckpoint = {
      ref: string; hashFull: string; timestamp: string;
      label: string; subject: string; slug: string;
    };

    const parsed = forEachOutput
      .trim()
      .split("\n")
      .filter(Boolean)
      .reduce<RawCheckpoint[]>((acc, line) => {
        const parts = line.match(
          /^(refs\/studio-checkpoints\/\S+)\s+(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\S+)\s+(.*)$/
        );
        if (!parts) return acc;
        const ref = parts[1];
        acc.push({
          ref,
          hashFull: parts[2],
          timestamp: parts[3],
          label: parts[4].replace(/^studio-checkpoint:\s*/, ""),
          subject: parts[4],
          slug: ref.replace("refs/studio-checkpoints/", ""),
        });
        return acc;
      }, []);

    if (parsed.length === 0) return c.json({ checkpoints: [] });

    const hashes = parsed.map((p) => p.hashFull);

    // Batch 1: file counts — single git log --no-walk call for all hashes at once
    // Output: "==COMMIT <hash>\n\nfile1\nfile2\n\n==COMMIT ..."
    const fileCountMap = new Map<string, number>();
    try {
      const { stdout: logOut } = await execFile(
        "git",
        ["log", "--no-walk=unsorted", "--format===COMMIT %H", "--name-only", ...hashes],
        opts
      );
      let cur = "";
      for (const line of logOut.split("\n")) {
        if (line.startsWith("==COMMIT ")) {
          cur = line.slice(9).trim();
          if (!fileCountMap.has(cur)) fileCountMap.set(cur, 0);
        } else if (cur && line.trim()) {
          fileCountMap.set(cur, (fileCountMap.get(cur) ?? 0) + 1);
        }
      }
    } catch {}

    // Batch 2: HEAD-reachable hashes (capped at 2000) for merge-status check
    const headReachable = new Set<string>();
    try {
      const { stdout: headLog } = await execFile(
        "git",
        ["log", "HEAD", "--format=%H", "--max-count=2000"],
        opts
      );
      for (const h of headLog.trim().split("\n").filter(Boolean)) {
        headReachable.add(h);
      }
    } catch {}

    const nowSeconds = Date.now() / 1000;
    const staleThreshold = 7 * 24 * 3600;

    const checkpoints = parsed.map(({ ref, hashFull, timestamp, label, subject, slug }) => {
      const filesChanged = fileCountMap.get(hashFull) ?? 0;

      let status: "active" | "merged" | "abandoned" = "active";
      if (headReachable.has(hashFull)) {
        status = "merged";
      } else {
        const commitAgeSeconds = nowSeconds - new Date(timestamp).getTime() / 1000;
        if (!isNaN(commitAgeSeconds) && commitAgeSeconds > staleThreshold) {
          status = "abandoned";
        }
      }

      return { id: slug, ref, hash: hashFull.slice(0, 7), hashFull, timestamp, label, message: subject, filesChanged, status };
    });

    return c.json({ checkpoints });
  });

  // Get diff for a checkpoint vs its parent
  app.get("/:id/diff", async (c) => {
    const id = c.req.param("id");
    const refName = `refs/studio-checkpoints/${id}`;

    let hash: string;
    try {
      const { stdout } = await execFile("git", ["rev-parse", refName], opts);
      hash = stdout.trim();
    } catch {
      return c.json({ error: "checkpoint not found" }, 404);
    }

    let diff = "";
    try {
      // diff vs parent (first parent), or vs empty tree if no parent
      const { stdout } = await execFile(
        "git",
        ["show", "--format=", hash],
        { ...opts, maxBuffer: 4 * 1024 * 1024 }
      );
      diff = stdout;
    } catch {}

    return c.json({ diff });
  });

  // Create checkpoint
  app.post("/", async (c) => {
    const body = await c.req.json<{ label?: string }>().catch(() => ({}));
    const timestamp = Date.now();
    const label = (body as { label?: string }).label || `checkpoint-${timestamp}`;
    const slug = `${timestamp}-${slugify(label)}`;
    const refName = `refs/studio-checkpoints/${slug}`;

    const { stdout: treeHash } = await execFile("git", ["write-tree"], opts);

    let parentArgs: string[] = [];
    try {
      const { stdout: headHash } = await execFile("git", ["rev-parse", "HEAD"], opts);
      if (headHash.trim()) parentArgs = ["-p", headHash.trim()];
    } catch {}

    const { stdout: commitHash } = await execFile(
      "git",
      ["commit-tree", treeHash.trim(), ...parentArgs, "-m", `studio-checkpoint: ${label}`],
      opts
    );

    await execFile("git", ["update-ref", refName, commitHash.trim()], opts);

    return c.json({ ok: true, id: slug, ref: refName, label, timestamp });
  });

  // Restore checkpoint — POST /api/checkpoints/:id/restore
  app.post("/:id/restore", async (c) => {
    const id = c.req.param("id");
    const refName = `refs/studio-checkpoints/${id}`;

    // Resolve the ref to a commit hash
    let hash: string;
    try {
      const { stdout } = await execFile("git", ["rev-parse", refName], opts);
      hash = stdout.trim();
    } catch {
      return c.json({ error: "checkpoint not found" }, 404);
    }

    const { stdout: objType } = await execFile("git", ["cat-file", "-t", hash], opts);
    if (objType.trim() !== "commit") {
      return c.json({ error: "ref is not a commit" }, 400);
    }

    // Create a new branch from the checkpoint rather than clobbering working tree
    const branchName = `restore/${id}`;
    await execFile("git", ["branch", "-f", branchName, hash], opts);

    return c.json({ ok: true, branch: branchName });
  });

  // Delete single checkpoint
  app.delete("/:refSlug", async (c) => {
    const refSlug = c.req.param("refSlug");
    if (refSlug === "prune") {
      // handled by the prune route below — shouldn't reach here
      return c.json({ error: "use DELETE /prune" }, 400);
    }
    const refName = `refs/studio-checkpoints/${refSlug}`;
    await execFile("git", ["update-ref", "-d", refName], opts);
    return c.json({ ok: true });
  });

  // Prune merged+abandoned checkpoints older than 7 days
  app.delete("/prune", async (c) => {
    let output = "";
    try {
      const result = await execFile(
        "git",
        [
          "for-each-ref",
          "refs/studio-checkpoints",
          "--format=%(refname) %(objectname) %(committerdate:unix)",
          "--sort=-committerdate",
        ],
        opts
      );
      output = result.stdout;
    } catch {
      return c.json({ pruned: 0 });
    }

    const cutoff = Date.now() / 1000 - 7 * 24 * 3600;
    const lines = output.trim().split("\n").filter(Boolean);
    let pruned = 0;

    for (const line of lines) {
      const parts = line.split(" ");
      if (parts.length < 3) continue;
      const [refName, hash, unixTs] = parts;
      const age = parseFloat(unixTs);
      if (age > cutoff) continue;

      // Only prune if merged into HEAD or not reachable
      let shouldPrune = false;
      try {
        await execFile("git", ["merge-base", "--is-ancestor", hash, "HEAD"], opts);
        shouldPrune = true; // merged
      } catch {
        shouldPrune = true; // not ancestor = abandoned, prune if old
      }

      if (shouldPrune) {
        try {
          await execFile("git", ["update-ref", "-d", refName], opts);
          pruned++;
        } catch {}
      }
    }

    return c.json({ ok: true, pruned });
  });

  // Keep legacy restore endpoint for backwards compat
  app.post("/restore", async (c) => {
    const body = await c.req.json<{ ref: string }>();
    const ref = body.ref;
    const { stdout: objType } = await execFile("git", ["cat-file", "-t", ref], opts);
    if (objType.trim() !== "commit") {
      return c.json({ error: "ref is not a commit" }, 400);
    }
    await execFile("git", ["checkout", ref, "--", "."], opts);
    return c.json({ ok: true });
  });

  return app;
}
