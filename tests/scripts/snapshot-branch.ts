/**
 * snapshot-branch.ts
 *
 * Utilities for managing snapshot orphan branches.
 *
 * Convention: code branch "main" → snapshot branch "snapshots/main"
 *
 * The snapshot branch is a git orphan (no shared history with code branches)
 * containing only:
 *   .gitattributes          — LFS tracking rule for PNGs
 *   dom/                    — normalized HTML baselines (text, git-diffable)
 *   screenshots/            — PNG screenshots (Git LFS)
 *
 * These map to __snapshots__/dom/ and __snapshots__/screenshots/ locally,
 * but __snapshots__/ is gitignored on code branches — it is a local cache only.
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, cpSync, rmSync, readdirSync } from "fs";
import { join, dirname } from "path";

export const ROOT = join(import.meta.dirname, "../..");

const GITATTRIBUTES_CONTENT =
  "screenshots/**/*.png filter=lfs diff=lfs merge=lfs -text\n";

// ---------------------------------------------------------------------------
// Shared git helpers (also used by capture-diff.ts)
// ---------------------------------------------------------------------------

interface GitOptions {
  cwd?: string;
  input?: string;
  ignoreError?: boolean;
}

export function git(cmd: string, opts: GitOptions = {}): string {
  const { cwd = ROOT, input, ignoreError = false } = opts;
  try {
    return execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      input,
    }).trim();
  } catch (e) {
    if (ignoreError) return "";
    throw e;
  }
}

export function removeWorktree(wtPath: string): void {
  try {
    git(`git worktree remove --force "${wtPath}"`);
  } catch {
    try {
      rmSync(wtPath, { recursive: true, force: true });
      git("git worktree prune", { ignoreError: true });
    } catch {
      // Best-effort cleanup; ignore remaining errors.
    }
  }
}

/** Recursively copy src → dest, replacing dest entirely. */
function syncDir(src: string, dest: string): void {
  if (!existsSync(src)) return;
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the snapshot branch name for the current (or given) code branch.
 * e.g. "main" → "snapshots/main"
 *
 * Falls back to REVIEW_BRANCH / GITHUB_HEAD_REF / GITHUB_REF_NAME env vars
 * for detached HEAD in CI.
 */
export function getSnapshotBranchName(codeBranch?: string): string {
  const branch =
    codeBranch ??
    process.env.REVIEW_BRANCH ??
    (() => {
      const raw = git("git rev-parse --abbrev-ref HEAD", {
        ignoreError: true,
      });
      return raw === "HEAD" || raw === ""
        ? (process.env.GITHUB_HEAD_REF ?? process.env.GITHUB_REF_NAME ?? "main")
        : raw;
    })();
  return `snapshots/${branch}`;
}

/** Returns true if the snapshot branch exists on the remote. */
export function snapshotBranchExistsRemote(snapshotBranch: string): boolean {
  const result = git(`git ls-remote --heads origin "${snapshotBranch}"`, {
    ignoreError: true,
  });
  return result.length > 0;
}

/** Returns true if the snapshot branch exists locally. */
export function snapshotBranchExistsLocal(snapshotBranch: string): boolean {
  const result = git(`git show-ref --verify "refs/heads/${snapshotBranch}"`, {
    ignoreError: true,
  });
  return result.length > 0;
}

/**
 * Ensures the snapshot branch exists locally.
 * - If already local: no-op.
 * - If on remote only: fetches to create a local tracking branch.
 * - If nowhere: creates a new orphan branch with .gitattributes (LFS config).
 */
export function ensureSnapshotBranch(snapshotBranch: string): void {
  if (snapshotBranchExistsLocal(snapshotBranch)) return;

  if (snapshotBranchExistsRemote(snapshotBranch)) {
    git(`git fetch origin "${snapshotBranch}:${snapshotBranch}"`);
    return;
  }

  // Create new orphan branch via git plumbing (no worktree switching).
  // 1. Blob for .gitattributes
  const blobSha = git("git hash-object -w --stdin", {
    input: GITATTRIBUTES_CONTENT,
  });

  // 2. Tree containing .gitattributes
  const treeSha = git("git mktree", {
    input: `100644 blob ${blobSha}\t.gitattributes\n`,
  });

  // 3. Orphan commit (no parents)
  const commitSha = git(
    `git commit-tree ${treeSha} -m "Initial snapshot branch"`
  );

  // 4. Create the branch ref
  git(`git update-ref "refs/heads/${snapshotBranch}" ${commitSha}`);

  console.log(`Created orphan snapshot branch: ${snapshotBranch}`);
}

/**
 * Populates targetDir (__snapshots__/) from the snapshot branch.
 * Uses a temporary git worktree so that LFS objects are resolved.
 *
 * Falls back to snapshots/main if the specific branch doesn't exist.
 * No-op if no snapshot branch exists anywhere (fresh repo, empty baselines).
 *
 * Skipped automatically if targetDir already has content (assumes CI pre-populated it).
 */
export function pullSnapshots(snapshotBranch: string, targetDir: string): void {
  // If baselines already exist (e.g. CI pre-populated), skip the pull.
  const domDir = join(targetDir, "dom");
  if (existsSync(domDir) && readdirSync(domDir).length > 0) {
    return;
  }

  // Determine which branch to use (with main fallback).
  let branch = snapshotBranch;
  if (
    !snapshotBranchExistsRemote(branch) &&
    !snapshotBranchExistsLocal(branch)
  ) {
    if (branch === "snapshots/main") {
      console.log("No snapshot branch found; starting with empty baselines.");
      mkdirSync(join(targetDir, "dom"), { recursive: true });
      mkdirSync(join(targetDir, "screenshots"), { recursive: true });
      return;
    }
    console.log(
      `Snapshot branch ${branch} not found; falling back to snapshots/main.`
    );
    branch = "snapshots/main";
    if (
      !snapshotBranchExistsRemote(branch) &&
      !snapshotBranchExistsLocal(branch)
    ) {
      console.log("No snapshot branch found; starting with empty baselines.");
      mkdirSync(join(targetDir, "dom"), { recursive: true });
      mkdirSync(join(targetDir, "screenshots"), { recursive: true });
      return;
    }
  }

  // Ensure local branch exists (fetch from remote if needed).
  if (!snapshotBranchExistsLocal(branch)) {
    console.log(`Fetching ${branch}...`);
    git(`git fetch origin "${branch}:${branch}"`);
  }

  const wtPath = `/tmp/gofish-snap-pull-${process.pid}`;
  if (existsSync(wtPath)) removeWorktree(wtPath);

  try {
    git(`git worktree add --detach "${wtPath}" "${branch}"`);

    // Resolve LFS objects for PNG screenshots.
    try {
      git("git lfs pull", { cwd: wtPath });
    } catch {
      console.warn(
        "Warning: git-lfs not available or no LFS objects. " +
          "PNG baselines may be LFS pointer files."
      );
    }

    // Copy dom/ and screenshots/ into targetDir.
    mkdirSync(targetDir, { recursive: true });
    syncDir(join(wtPath, "dom"), join(targetDir, "dom"));
    syncDir(join(wtPath, "screenshots"), join(targetDir, "screenshots"));

    console.log(`Pulled baselines from ${branch}.`);
  } finally {
    removeWorktree(wtPath);
  }
}

/**
 * Commits local snapshot files to the snapshot branch and pushes to origin.
 *
 * Maps:
 *   sourceDir/dom/*         → dom/*         (on snapshot branch)
 *   sourceDir/screenshots/* → screenshots/* (on snapshot branch, LFS for PNGs)
 *
 * Creates the snapshot branch if it doesn't exist yet.
 */
export function commitAndPushSnapshots(
  snapshotBranch: string,
  sourceDir: string,
  message: string
): void {
  ensureSnapshotBranch(snapshotBranch);

  const wtPath = `/tmp/gofish-snap-push-${process.pid}`;
  if (existsSync(wtPath)) removeWorktree(wtPath);

  try {
    git(`git worktree add "${wtPath}" "${snapshotBranch}"`);

    // Sync files from sourceDir into the worktree.
    syncDir(join(sourceDir, "dom"), join(wtPath, "dom"));
    syncDir(join(sourceDir, "screenshots"), join(wtPath, "screenshots"));

    // Stage only the data dirs. Avoid `git add -A` so husky/lfs-installed
    // hook files in .husky/_/ (created during pnpm install) don't get
    // committed to the data-only snapshot branch.
    git("git add -A dom screenshots", { cwd: wtPath });

    // Check if there's anything staged. Use --cached so untracked files
    // like .husky/ (created by pnpm install) don't fool us into running
    // `git commit` with an empty index.
    const staged = git("git diff --cached --name-only", { cwd: wtPath });
    if (!staged) {
      console.log("No changes to snapshot baselines.");
      return;
    }

    // Commit using -F - to avoid shell-quoting the message.
    git("git commit -F -", { cwd: wtPath, input: message + "\n" });
    git(`git push origin "${snapshotBranch}"`, { cwd: wtPath });

    console.log(`Pushed snapshot baselines to ${snapshotBranch}.`);
  } finally {
    removeWorktree(wtPath);
  }
}
