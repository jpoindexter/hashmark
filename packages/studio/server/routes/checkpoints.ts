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

  // Create checkpoint
  app.post("/", async (c) => {
    const body = await c.req.json<{ label?: string }>().catch(() => ({}));
    const timestamp = Date.now();
    const label = (body as { label?: string }).label || `checkpoint-${timestamp}`;
    const slug = `${timestamp}-${slugify(label)}`;
    const refName = `refs/studio-checkpoints/${slug}`;

    // 1. write-tree
    const { stdout: treeHash } = await execFile("git", ["write-tree"], opts);

    // 2. commit-tree (with parent if HEAD exists)
    let parentArgs: string[] = [];
    try {
      const { stdout: headHash } = await execFile("git", ["rev-parse", "HEAD"], opts);
      if (headHash.trim()) parentArgs = ["-p", headHash.trim()];
    } catch {
      // no HEAD yet (empty repo)
    }

    const { stdout: commitHash } = await execFile(
      "git",
      ["commit-tree", treeHash.trim(), ...parentArgs, "-m", `studio-checkpoint: ${label}`],
      opts
    );

    // 3. update-ref
    await execFile("git", ["update-ref", refName, commitHash.trim()], opts);

    return c.json({ ok: true, ref: refName, label, timestamp });
  });

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
      // no refs yet
      return c.json({ checkpoints: [] });
    }

    const checkpoints = output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        // format: refs/studio-checkpoints/slug hash date subject
        const parts = line.match(
          /^(refs\/studio-checkpoints\/\S+)\s+(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\S+)\s+(.*)$/
        );
        if (!parts) return null;
        return {
          ref: parts[1],
          hash: parts[2],
          timestamp: parts[3],
          label: parts[4].replace(/^studio-checkpoint:\s*/, ""),
          message: parts[4],
        };
      })
      .filter(Boolean);

    return c.json({ checkpoints });
  });

  // Restore checkpoint
  app.post("/restore", async (c) => {
    const body = await c.req.json<{ ref: string }>();
    const ref = body.ref;

    // Verify it's a commit
    const { stdout: objType } = await execFile("git", ["cat-file", "-t", ref], opts);
    if (objType.trim() !== "commit") {
      return c.json({ error: "ref is not a commit" }, 400);
    }

    // Checkout the tree without moving HEAD
    await execFile("git", ["checkout", ref, "--", "."], opts);

    return c.json({ ok: true });
  });

  // Delete checkpoint
  app.delete("/:refSlug", async (c) => {
    const refSlug = c.req.param("refSlug");
    const refName = `refs/studio-checkpoints/${refSlug}`;

    await execFile("git", ["update-ref", "-d", refName], opts);

    return c.json({ ok: true });
  });

  return app;
}
