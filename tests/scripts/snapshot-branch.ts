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
 *
 * The remote is the source of truth: both reading (`pullSnapshots`) and
 * writing (`commitToSnapshotBranch`) start from what origin has now, and a
 * branch that does not exist yet falls back to snapshots/main.
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, cpSync, rmSync, readdirSync } from "fs";
import { join, dirname } from "path";

export const ROOT = join(import.meta.dirname, "../..");

const GITATTRIBUTES_CONTENT =
  "screenshots/**/*.png filter=lfs diff=lfs merge=lfs -text\n";

const MAIN_SNAPSHOT_BRANCH = "snapshots/main";
const PUSH_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Shared git helpers (also used by capture-diff.ts)
// ---------------------------------------------------------------------------

interface GitOptions {
  cwd?: string;
  input?: string;
  ignoreError?: boolean;
  env?: Record<string, string>;
}

export function git(cmd: string, opts: GitOptions = {}): string {
  const { cwd = ROOT, input, ignoreError = false, env } = opts;
  try {
    return execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      input,
      env: env ? { ...process.env, ...env } : undefined,
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

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Which of `snapshotBranch` and snapshots/main exist on origin, in one
 * ls-remote. Returns the branch to build on: `snapshotBranch` itself, or
 * snapshots/main when it does not exist yet, or null when neither does.
 */
function remoteBase(snapshotBranch: string): string | null {
  const out = git(
    `git ls-remote origin "refs/heads/${snapshotBranch}" "refs/heads/${MAIN_SNAPSHOT_BRANCH}"`
  );
  const refs = new Set(out.split("\n").map((line) => line.split("\t")[1]));
  if (refs.has(`refs/heads/${snapshotBranch}`)) return snapshotBranch;
  if (refs.has(`refs/heads/${MAIN_SNAPSHOT_BRANCH}`))
    return MAIN_SNAPSHOT_BRANCH;
  return null;
}

/**
 * Fetches a branch from origin and returns its head commit. The fetch is
 * shallow (only the head commit) when the clone is already shallow, as CI
 * checkouts are; a full clone is left full, since a shallow fetch would mark
 * a developer's clone as shallow.
 */
function fetchHead(branch: string): string {
  const depth =
    git("git rev-parse --is-shallow-repository") === "true" ? "--depth=1" : "";
  git(`git fetch --quiet --no-tags ${depth} origin "refs/heads/${branch}"`);
  return git("git rev-parse FETCH_HEAD");
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

/**
 * Populates targetDir (__snapshots__/) from the snapshot branch on origin.
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

  const branch = remoteBase(snapshotBranch);
  if (branch === null) {
    console.log("No snapshot branch found; starting with empty baselines.");
    mkdirSync(join(targetDir, "dom"), { recursive: true });
    mkdirSync(join(targetDir, "screenshots"), { recursive: true });
    return;
  }
  if (branch !== snapshotBranch) {
    console.log(
      `Snapshot branch ${snapshotBranch} not found; falling back to ${branch}.`
    );
  }

  const head = fetchHead(branch);
  const wtPath = `/tmp/gofish-snap-pull-${process.pid}`;
  if (existsSync(wtPath)) removeWorktree(wtPath);

  try {
    git(`git worktree add --detach "${wtPath}" ${head}`);

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
 * The one writer of snapshot branches. Checks out the branch's current head
 * from origin, lets `apply` change `dom/` and `screenshots/` in that
 * checkout, and pushes the result as ONE commit.
 *
 * - A branch that does not exist yet starts as a parentless commit on top of
 *   snapshots/main's tree, so it inherits every other baseline.
 * - If the push is rejected because the branch moved, it starts over on the
 *   new head (running `apply` again), up to 5 attempts. It never forces.
 * - PNG baselines stay LFS pointers in the checkout (GIT_LFS_SKIP_SMUDGE):
 *   only the PNGs `apply` writes are uploaded, by object id. The push itself
 *   sets GIT_LFS_SKIP_PUSH, because the LFS pre-push hook would try to upload
 *   every object the tree references, most of which are not downloaded here
 *   (and it does not run at all when husky has moved core.hooksPath).
 *
 * Returns the new commit, or null when `apply` changed nothing. With
 * `dryRun`, builds the commit but pushes nothing.
 */
export function commitToSnapshotBranch(
  snapshotBranch: string,
  message: string,
  apply: (checkoutDir: string) => void,
  { dryRun = false } = {}
): string | null {
  for (let attempt = 1; attempt <= PUSH_ATTEMPTS; attempt++) {
    const base = remoteBase(snapshotBranch);
    const head = base === null ? emptyBaseCommit() : fetchHead(base);
    const parent = base === snapshotBranch ? head : null;
    if (base !== snapshotBranch) {
      console.log(
        base === null
          ? `Creating ${snapshotBranch} with empty baselines.`
          : `${snapshotBranch} does not exist; starting it from ${base}'s tree.`
      );
    }

    const wtPath = `/tmp/gofish-snap-push-${process.pid}`;
    if (existsSync(wtPath)) removeWorktree(wtPath);
    try {
      git(`git worktree add --detach "${wtPath}" ${head}`, {
        env: { GIT_LFS_SKIP_SMUDGE: "1" },
      });
      apply(wtPath);

      // Stage only the data dirs, never anything else in the checkout.
      const dataDirs = ["dom", "screenshots"].filter(
        (dir) =>
          existsSync(join(wtPath, dir)) ||
          git(`git ls-files -- ${dir}`, { cwd: wtPath }) !== ""
      );
      if (dataDirs.length > 0) {
        git(`git add -A -- ${dataDirs.join(" ")}`, { cwd: wtPath });
      }
      if (!git("git diff --cached --name-only", { cwd: wtPath })) {
        console.log("No changes to snapshot baselines.");
        return null;
      }

      const tree = git("git write-tree", { cwd: wtPath });
      const commit = git(
        `git commit-tree ${tree}${parent ? ` -p ${parent}` : ""} -F -`,
        { cwd: wtPath, input: message + "\n" }
      );
      if (dryRun) {
        console.log(`Dry run: built ${commit} (${message}); not pushed.`);
        console.log(
          git(`git diff --stat ${head} ${commit}`, { cwd: wtPath })
            .split("\n")
            .slice(-1)[0]
        );
        return commit;
      }

      pushChangedLfsObjects(wtPath);
      try {
        git(`git push origin ${commit}:refs/heads/${snapshotBranch}`, {
          cwd: wtPath,
          env: { GIT_LFS_SKIP_PUSH: "1" },
        });
        console.log(`Pushed ${commit} to ${snapshotBranch}: ${message}`);
        return commit;
      } catch (e) {
        if (attempt === PUSH_ATTEMPTS) throw e;
        console.log(
          `Push rejected; ${snapshotBranch} moved. Retrying on top of it...`
        );
      }
    } finally {
      removeWorktree(wtPath);
    }
    sleep(attempt * 2000);
  }
  throw new Error(`could not push to ${snapshotBranch}`);
}

/**
 * Commits sourceDir's `dom/` and `screenshots/` as the whole content of the
 * snapshot branch and pushes it.
 */
export function commitAndPushSnapshots(
  snapshotBranch: string,
  sourceDir: string,
  message: string
): void {
  commitToSnapshotBranch(snapshotBranch, message, (checkoutDir) => {
    syncDir(join(sourceDir, "dom"), join(checkoutDir, "dom"));
    syncDir(join(sourceDir, "screenshots"), join(checkoutDir, "screenshots"));
  });
}

/** A parentless commit holding only .gitattributes (no snapshots/main yet). */
function emptyBaseCommit(): string {
  const blob = git("git hash-object -w --stdin", {
    input: GITATTRIBUTES_CONTENT,
  });
  const tree = git("git mktree", {
    input: `100644 blob ${blob}\t.gitattributes\n`,
  });
  return git(`git commit-tree ${tree} -m "Initial snapshot branch"`);
}

/** Uploads the LFS objects of the PNGs staged in the checkout. */
function pushChangedLfsObjects(wtPath: string): void {
  const changed = git(
    "git diff --cached --diff-filter=AM --name-only -- screenshots",
    { cwd: wtPath }
  )
    .split("\n")
    .filter(Boolean);
  const oids = changed
    .map(
      (file) =>
        /^oid sha256:([0-9a-f]{64})$/m.exec(
          git(`git cat-file -p ":${file}"`, { cwd: wtPath })
        )?.[1]
    )
    .filter((oid): oid is string => oid !== undefined);
  if (oids.length > 0) {
    git(`git lfs push --object-id origin ${oids.join(" ")}`, { cwd: wtPath });
  }
}
