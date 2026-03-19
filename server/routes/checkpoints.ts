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
    let output = "";
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
      output = result.stdout;
    } catch {
      return c.json({ checkpoints: [] });
    }

    const checkpoints = await Promise.all(
      output
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(async (line) => {
          const parts = line.match(
            /^(refs\/studio-checkpoints\/\S+)\s+(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\S+)\s+(.*)$/
          );
          if (!parts) return null;

          const ref = parts[1];
          const hash = parts[2];
          const timestamp = parts[3];
          const subject = parts[4];
          const label = subject.replace(/^studio-checkpoint:\s*/, "");

          // Count files changed vs parent
          let filesChanged = 0;
          try {
            const { stdout: diffStat } = await execFile(
              "git",
              ["diff-tree", "--no-commit-id", "-r", "--name-only", hash],
              opts
            );
            filesChanged = diffStat.trim().split("\n").filter(Boolean).length;
          } catch {}

          // Determine status: check if merged into HEAD
          let status: "active" | "merged" | "abandoned" = "active";
          try {
            const { stdout: mergeBase } = await execFile(
              "git",
              ["merge-base", "--is-ancestor", hash, "HEAD"],
              opts
            );
            void mergeBase;
            status = "merged";
          } catch {
            // not an ancestor of HEAD — could be abandoned or active
            // treat as abandoned if older than 7 days
            try {
              const { stdout: refDate } = await execFile(
                "git",
                ["log", "-1", "--format=%ct", hash],
                opts
              );
              const age = Date.now() / 1000 - parseInt(refDate.trim());
              if (age > 7 * 24 * 3600) status = "abandoned";
            } catch {}
          }

          const slug = ref.replace("refs/studio-checkpoints/", "");

          return { id: slug, ref, hash: hash.slice(0, 7), hashFull: hash, timestamp, label, message: subject, filesChanged, status };
        })
    );

    return c.json({ checkpoints: checkpoints.filter(Boolean) });
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
