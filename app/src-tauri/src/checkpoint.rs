use std::process::Command;

/// Capture the current state of a git worktree as a dangling commit.
/// Returns the commit SHA on success. Returns None if the path isn't a git
/// worktree, git plumbing fails, or the tree is empty.
pub fn create_checkpoint(worktree_path: &str) -> Option<String> {
    if worktree_path.is_empty() {
        return None;
    }

    // Verify it's a git repo/worktree
    let check = Command::new("git")
        .args(["-C", worktree_path, "rev-parse", "--git-dir"])
        .output()
        .ok()?;
    if !check.status.success() {
        return None;
    }

    // Stage everything (tracked changes + untracked files)
    let add = Command::new("git")
        .args(["-C", worktree_path, "add", "-A"])
        .output()
        .ok()?;
    if !add.status.success() {
        return None;
    }

    // Snapshot the index as a tree object
    let tree_out = Command::new("git")
        .args(["-C", worktree_path, "write-tree"])
        .output()
        .ok()?;
    if !tree_out.status.success() {
        return None;
    }
    let tree = String::from_utf8_lossy(&tree_out.stdout).trim().to_string();
    if tree.is_empty() {
        return None;
    }

    // Wrap the tree in a dangling commit. No parent → each checkpoint
    // is a standalone restore point; we don't pollute any branch.
    let commit_out = Command::new("git")
        .args(["-C", worktree_path, "commit-tree", &tree, "-m", "hashmark-checkpoint"])
        .env("GIT_AUTHOR_NAME", "hashmark")
        .env("GIT_AUTHOR_EMAIL", "checkpoint@hashmark.local")
        .env("GIT_COMMITTER_NAME", "hashmark")
        .env("GIT_COMMITTER_EMAIL", "checkpoint@hashmark.local")
        .output()
        .ok()?;
    if !commit_out.status.success() {
        return None;
    }
    let sha = String::from_utf8_lossy(&commit_out.stdout).trim().to_string();
    if sha.is_empty() {
        return None;
    }

    Some(sha)
}

/// Restore the worktree to the state captured by `sha`.
/// Resets tracked files and removes untracked files/dirs that weren't part of the snapshot.
pub fn restore_checkpoint(worktree_path: &str, sha: &str) -> Result<(), String> {
    if worktree_path.is_empty() {
        return Err("no worktree path".to_string());
    }

    let reset = Command::new("git")
        .args(["-C", worktree_path, "reset", "--hard", sha])
        .output()
        .map_err(|e| e.to_string())?;
    if !reset.status.success() {
        return Err(format!(
            "git reset failed: {}",
            String::from_utf8_lossy(&reset.stderr)
        ));
    }

    let clean = Command::new("git")
        .args(["-C", worktree_path, "clean", "-fd"])
        .output()
        .map_err(|e| e.to_string())?;
    if !clean.status.success() {
        return Err(format!(
            "git clean failed: {}",
            String::from_utf8_lossy(&clean.stderr)
        ));
    }

    Ok(())
}
