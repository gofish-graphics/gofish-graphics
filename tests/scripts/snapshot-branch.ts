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
const NETWORK_ATTEMPTS = 3;

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

function stderrOf(e: unknown): string {
  return String((e as { stderr?: unknown }).stderr ?? e);
}

/**
 * Runs a git command that talks to origin, retrying up to 3 times on errors
 * that look like a transient network failure. Other errors throw at once.
 */
function gitNetwork(cmd: string, opts: GitOptions = {}): string {
  for (let attempt = 1; ; attempt++) {
    try {
      return git(cmd, opts);
    } catch (e) {
      const transient =
        /Could not resolve host|Connection (reset|refused|timed out)|timed out|early EOF|RPC failed|unexpected disconnect|HTTP 5\d\d|50[234]/i.test(
          stderrOf(e)
        );
      if (!transient || attempt === NETWORK_ATTEMPTS) throw e;
      sleep(attempt * 2000);
    }
  }
}

/** A snapshot branch and the commit to build on. */
interface Base {
  branch: string;
  sha: string;
}

/**
 * Which of `snapshotBranch` and snapshots/main exist on origin, in one
 * ls-remote. Returns the branch to build on, with its head commit:
 * `snapshotBranch` itself, or snapshots/main when it does not exist yet, or
 * null when neither does.
 */
function remoteBase(snapshotBranch: string): Base | null {
  const out = gitNetwork(
    `git ls-remote origin "refs/heads/${snapshotBranch}" "refs/heads/${MAIN_SNAPSHOT_BRANCH}"`
  );
  const heads = new Map(
    out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, ref] = line.split("\t");
        return [ref.replace(/^refs\/heads\//, ""), sha] as const;
      })
  );
  for (const branch of [snapshotBranch, MAIN_SNAPSHOT_BRANCH]) {
    const sha = heads.get(branch);
    if (sha) return { branch, sha };
  }
  return null;
}

/**
 * Fetches exactly the commit `ls-remote` reported, so a push that lands in
 * between cannot change what we build on. The fetch is shallow (only that
 * commit) when the clone is already shallow, as CI checkouts are; a full
 * clone is left full, since a shallow fetch would mark a developer's clone
 * as shallow.
 */
function fetchCommit(sha: string): void {
  const depth =
    git("git rev-parse --is-shallow-repository") === "true" ? "--depth=1" : "";
  gitNetwork(`git fetch --quiet --no-tags ${depth} origin ${sha}`);
}

/** A local snapshot branch to read when origin cannot be reached. */
function localBase(snapshotBranch: string): Base | null {
  for (const branch of [snapshotBranch, MAIN_SNAPSHOT_BRANCH]) {
    const sha = git(`git rev-parse --verify --quiet "refs/heads/${branch}"`, {
      ignoreError: true,
    });
    if (sha) return { branch, sha };
  }
  return null;
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

  // Read origin; when it cannot be reached (offline, no `origin`), fall back
  // to a local snapshot branch if there is one.
  let base: Base | null;
  try {
    base = remoteBase(snapshotBranch);
    if (base) fetchCommit(base.sha);
  } catch (e) {
    base = localBase(snapshotBranch);
    console.warn(
      `Warning: cannot read snapshot branches from origin (${stderrOf(e).trim().split("\n")[0]}); ` +
        (base
          ? `using local ${base.branch}.`
          : "no local snapshot branch either.")
    );
  }
  if (base === null) {
    console.log("No snapshot branch found; starting with empty baselines.");
    mkdirSync(join(targetDir, "dom"), { recursive: true });
    mkdirSync(join(targetDir, "screenshots"), { recursive: true });
    return;
  }
  const { branch, sha: head } = base;
  if (branch !== snapshotBranch) {
    console.log(
      `Snapshot branch ${snapshotBranch} not found; falling back to ${branch}.`
    );
  }

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
 * - The push never forces. When it is rejected because the branch moved
 *   (non-fast-forward), `retryOnMovedBranch` decides what happens:
 *   - true: start over on the new head, running `apply` again, up to 5
 *     attempts. Only for an `apply` that changes specific files (accepting
 *     some stories), which is still right on top of someone else's commit.
 *   - false: fail. Required for an `apply` that replaces the whole of dom/
 *     and screenshots/ (commitAndPushSnapshots), because redoing it on a
 *     newer head would let older captures overwrite newer baselines.
 *   Any other push failure (auth, branch protection) fails at once.
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
  {
    retryOnMovedBranch,
    dryRun = false,
  }: {
    retryOnMovedBranch: boolean;
    dryRun?: boolean;
  }
): string | null {
  const attempts = retryOnMovedBranch ? PUSH_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const base = remoteBase(snapshotBranch);
    if (base) fetchCommit(base.sha);
    const head = base ? base.sha : emptyBaseCommit();
    const parent = base?.branch === snapshotBranch ? head : null;
    if (base?.branch !== snapshotBranch) {
      console.log(
        base === null
          ? `Creating ${snapshotBranch} with empty baselines.`
          : `${snapshotBranch} does not exist; starting it from ${base.branch}'s tree.`
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

      const lfsObjects = stagedLfsObjects(wtPath);
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

      if (lfsObjects.length > 0) {
        gitNetwork(`git lfs push --object-id origin ${lfsObjects.join(" ")}`, {
          cwd: wtPath,
        });
      }
      try {
        git(`git push origin ${commit}:refs/heads/${snapshotBranch}`, {
          cwd: wtPath,
          env: { GIT_LFS_SKIP_PUSH: "1" },
        });
        console.log(`Pushed ${commit} to ${snapshotBranch}: ${message}`);
        return commit;
      } catch (e) {
        const moved = /\[rejected\].*\((non-fast-forward|fetch first)\)/.test(
          stderrOf(e)
        );
        if (!moved) throw e;
        if (attempt === attempts) {
          throw new Error(
            `${snapshotBranch} moved while committing; not retrying ` +
              (retryOnMovedBranch
                ? `after ${attempts} attempts.`
                : "(a full-tree update must not overwrite newer baselines)."),
            { cause: e }
          );
        }
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
 * snapshot branch and pushes it. Fails, without retrying, if the branch
 * moved since it was read (see commitToSnapshotBranch).
 */
export function commitAndPushSnapshots(
  snapshotBranch: string,
  sourceDir: string,
  message: string
): void {
  commitToSnapshotBranch(
    snapshotBranch,
    message,
    (checkoutDir) => {
      syncDir(join(sourceDir, "dom"), join(checkoutDir, "dom"));
      syncDir(join(sourceDir, "screenshots"), join(checkoutDir, "screenshots"));
    },
    { retryOnMovedBranch: false }
  );
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

/**
 * The LFS object ids of the PNGs staged (added or modified) in the checkout.
 * Throws if one of them was staged as a raw blob instead of an LFS pointer,
 * which means the LFS clean filter is not active.
 */
function stagedLfsObjects(wtPath: string): string[] {
  const files = git(
    "git diff --cached --no-renames --diff-filter=AM --name-only -z -- screenshots",
    { cwd: wtPath }
  )
    .split("\0")
    .filter(Boolean);
  if (files.length === 0) return [];

  // One `cat-file --batch` for all of them: "<sha> <type> <size>\n<content>\n".
  const out = execSync("git cat-file --batch", {
    cwd: wtPath,
    input: files.map((f) => `:${f}\n`).join(""),
    maxBuffer: 1024 * 1024 * 1024,
  });
  const oids: string[] = [];
  let pos = 0;
  for (const file of files) {
    const headerEnd = out.indexOf(0x0a, pos);
    const size = Number(out.subarray(pos, headerEnd).toString().split(" ")[2]);
    const content = out.subarray(headerEnd + 1, headerEnd + 1 + size);
    pos = headerEnd + 1 + size + 1;
    const oid = /^oid sha256:([0-9a-f]{64})$/m.exec(
      content.toString("latin1")
    )?.[1];
    if (!oid || !content.toString("latin1").startsWith("version ")) {
      throw new Error(
        `${file} was staged as a raw file, not a Git LFS pointer: the LFS ` +
          "clean filter is inactive; run `git lfs install`."
      );
    }
    oids.push(oid);
  }
  return oids;
}
