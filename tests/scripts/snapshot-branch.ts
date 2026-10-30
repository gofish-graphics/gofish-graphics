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
 *   dom/                    — normalized HTML baselines (text, git-diffable),
 *                             each with its `<path>.warnings.txt` (the
 *                             story's layout warnings and console errors;
 *                             see story-warnings.ts)
 *   screenshots/            — PNG screenshots (Git LFS)
 *
 * These map to __snapshots__/dom/ and __snapshots__/screenshots/ locally,
 * but __snapshots__/ is gitignored on code branches — it is a local cache only.
 *
 * The baselines of a code branch B are snapshots/main's current tree,
 * overlaid with only the stories snapshots/B changed since it forked from
 * snapshots/main. The unit is a story's snapshot (`baselineParts` in
 * diff-utils.ts: its DOM, warnings and screenshot): when snapshots/B added,
 * modified or deleted any part of a story, every part of that story is
 * taken from snapshots/B, and a part snapshots/B does not have is deleted.
 * So a story's DOM is never paired with another branch's warnings or
 * screenshot (a DOM accepted on B before warnings were captured has
 * unrecorded warnings, not main's). A story both changed keeps snapshots/B's
 * version. When snapshots/B does not exist, the baselines are snapshots/main.
 * snapshots/B is a branch of snapshots/main (its first commit has
 * snapshots/main's head as parent), which is what gives it a fork point.
 *
 * Snapshot branches made before parents were recorded share no history with
 * snapshots/main. For them the fork point is the snapshots/main commit that
 * was current when the branch's first commit was made (the tree it was copied
 * from), or the empty tree when there was none yet. The writer's next commit
 * on such a branch records snapshots/main as a parent, which migrates it.
 *
 * The remote is the source of truth: both reading (`pullSnapshots`) and
 * writing (`commitToSnapshotBranch`) apply that rule to what origin has now.
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, cpSync, rmSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { baselineParts, storyOfBaselineFile } from "./diff-utils.js";

export const ROOT = join(import.meta.dirname, "../..");

const GITATTRIBUTES_CONTENT =
  "screenshots/**/*.png filter=lfs diff=lfs merge=lfs -text\n";

export const MAIN_SNAPSHOT_BRANCH = "snapshots/main";
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

/**
 * The head commits of snapshots/main and of a snapshot branch (the same
 * commit when the branch is snapshots/main). Null when that branch does not
 * exist.
 */
interface Heads {
  main: string | null;
  branch: string | null;
}

function headsOf(
  snapshotBranch: string,
  lookup: (branch: string) => string | null
): Heads {
  return { main: lookup(MAIN_SNAPSHOT_BRANCH), branch: lookup(snapshotBranch) };
}

/** The heads on origin, in one ls-remote. */
function remoteHeads(snapshotBranch: string): Heads {
  const out = gitNetwork(
    `git ls-remote origin "refs/heads/${snapshotBranch}" "refs/heads/${MAIN_SNAPSHOT_BRANCH}"`
  );
  const shas = new Map(
    out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, ref] = line.split("\t");
        return [ref.replace(/^refs\/heads\//, ""), sha] as const;
      })
  );
  return headsOf(snapshotBranch, (branch) => shas.get(branch) ?? null);
}

/** The local snapshot branches, to read when origin cannot be reached. */
function localHeads(snapshotBranch: string): Heads {
  return headsOf(
    snapshotBranch,
    (branch) =>
      git(`git rev-parse --verify --quiet "refs/heads/${branch}"`, {
        ignoreError: true,
      }) || null
  );
}

/**
 * Fetches exactly the commits `ls-remote` reported, so a push that lands in
 * between cannot change what we build on. The fetch takes their whole
 * history, also in a shallow clone (as the accept workflow's checkout is),
 * because finding where the branch forked from snapshots/main needs it.
 * Snapshot commits hold only DOM files and LFS pointers, so that history is
 * small.
 */
function fetchHeads({ main, branch }: Heads): void {
  const shas = [...new Set([main, branch])].filter((sha) => sha !== null);
  if (shas.length === 0) return;
  gitNetwork(`git fetch --quiet --no-tags origin ${shas.join(" ")}`);
}

/**
 * The overlay of a snapshot branch (the rule at the top of this file), given
 * the baseline files it `changed` since its fork point and the files it
 * has (`onBranch`): every part of each story it changed is taken from the
 * branch (`write`) when the branch has it, and deleted (`remove`) when it
 * does not. A changed file that is no part of a story follows the same rule
 * on its own.
 */
export function overlayFiles(
  changed: readonly string[],
  onBranch: ReadonlySet<string>
): { write: string[]; remove: string[]; stories: number } {
  const files = new Set<string>();
  const stories = new Set<string>();
  for (const file of changed) {
    const story = storyOfBaselineFile(file);
    if (story === null) files.add(file);
    else stories.add(story);
  }
  for (const story of stories) {
    for (const file of Object.values(baselineParts(story))) files.add(file);
  }
  const write: string[] = [];
  const remove: string[] = [];
  for (const file of [...files].sort()) {
    (onBranch.has(file) ? write : remove).push(file);
  }
  return { write, remove, stories: stories.size };
}

/**
 * The baseline files of `branch`'s overlay (`overlayFiles`), from what it
 * changed under dom/ and screenshots/ since it forked from `main`. Also
 * returns the fork point: the merge base, or for a branch that has none,
 * the rule at the top of this file.
 */
function branchChanges(
  main: string,
  branch: string
): { fork: string; write: string[]; remove: string[]; stories: number } {
  const fork =
    git(`git merge-base ${main} ${branch}`, { ignoreError: true }) ||
    unrelatedForkPoint(main, branch);
  const nulList = (cmd: string) => git(cmd).split("\0").filter(Boolean);
  const changed = nulList(
    `git diff --name-only --no-renames -z ${fork} ${branch} -- dom screenshots`
  );
  const onBranch = new Set(
    nulList(`git ls-tree -r --name-only -z ${branch} -- dom screenshots`)
  );
  return { fork, ...overlayFiles(changed, onBranch) };
}

/**
 * The fork point of a branch that shares no history with `main`: the last
 * `main` commit made no later than the branch's first commit, or the empty
 * tree when `main` has none that old.
 */
function unrelatedForkPoint(main: string, branch: string): string {
  const root = git(`git rev-list --max-parents=0 ${branch}`).split("\n").pop();
  const date = git(`git log -1 --format=%cI ${root}`);
  return (
    git(`git rev-list -1 --before="${date}" ${main}`) ||
    git("git hash-object -t tree --stdin", { input: "" })
  );
}

/**
 * Checks out a snapshot branch's baselines (the rule at the top of this
 * file) in a new detached worktree at `wtPath`, whose HEAD holds exactly
 * those files: for an overlay, a temporary commit on no ref, so that
 * `git lfs pull` there downloads the overlaid PNGs too. PNGs stay LFS
 * pointers (GIT_LFS_SKIP_SMUDGE).
 *
 * Returns what the checkout holds, in words, and the parents a new commit of
 * the branch should have: the branch's head, plus snapshots/main's head when
 * it is not in the branch's history yet, so the fork point moves up to the
 * snapshots/main the commit was built on. A branch that does not exist yet
 * gets snapshots/main's head as its only parent.
 */
function checkoutBaselines(
  wtPath: string,
  snapshotBranch: string,
  { main, branch }: Heads
): { parents: string[]; description: string } {
  const env = { GIT_LFS_SKIP_SMUDGE: "1" };
  const start = main ?? branch;
  git(`git worktree add --detach "${wtPath}" ${start ?? emptyBaseCommit()}`, {
    env,
  });
  if (start === null) return { parents: [], description: "empty baselines" };
  if (main === null || branch === null || branch === main) {
    return {
      parents: [start],
      description: main === null ? snapshotBranch : MAIN_SNAPSHOT_BRANCH,
    };
  }

  const { fork, write, remove, stories } = branchChanges(main, branch);
  // Pathspecs on stdin: there can be more files than a command line holds.
  const pathspecs = (files: string[]) => ({
    cwd: wtPath,
    env,
    input: files.join("\0"),
  });
  if (write.length > 0) {
    git(
      `git --literal-pathspecs checkout ${branch} --pathspec-from-file=- --pathspec-file-nul`,
      pathspecs(write)
    );
  }
  if (remove.length > 0) {
    // --ignore-unmatch: snapshots/main may have deleted the file too.
    git(
      "git --literal-pathspecs rm --quiet --ignore-unmatch --pathspec-from-file=- --pathspec-file-nul",
      pathspecs(remove)
    );
  }
  // The reader may run where no git identity is configured.
  const identity = {
    GIT_AUTHOR_NAME: "snapshot-branch.ts",
    GIT_AUTHOR_EMAIL: "snapshot-branch@localhost",
    GIT_COMMITTER_NAME: "snapshot-branch.ts",
    GIT_COMMITTER_EMAIL: "snapshot-branch@localhost",
  };
  const overlay = git(
    `git commit-tree ${git("git write-tree", { cwd: wtPath })} -m "Baselines of ${snapshotBranch}"`,
    { cwd: wtPath, env: identity }
  );
  git(`git checkout --quiet --detach ${overlay}`, { cwd: wtPath, env });
  return {
    parents: fork === main ? [branch] : [branch, main],
    description:
      `${MAIN_SNAPSHOT_BRANCH} with the ${stories} ` +
      `stor${stories === 1 ? "y" : "ies"} ${snapshotBranch} changed`,
  };
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
 * Populates targetDir (__snapshots__/) with the baselines of `snapshotBranch`
 * on origin (the rule at the top of this file). Uses a temporary git
 * worktree so that LFS objects are resolved. When origin cannot be reached,
 * reads the local snapshot branches instead.
 *
 * Starts with empty baselines if no snapshot branch exists anywhere (fresh
 * repo). Skipped if targetDir/dom already has content: a local cache from an
 * earlier pull, which is never refreshed (delete __snapshots__/ to refresh).
 */
export function pullSnapshots(snapshotBranch: string, targetDir: string): void {
  const domDir = join(targetDir, "dom");
  if (existsSync(domDir) && readdirSync(domDir).length > 0) {
    return;
  }

  // Read origin; when it cannot be reached (offline, no `origin`), fall back
  // to the local snapshot branches.
  let heads: Heads;
  try {
    heads = remoteHeads(snapshotBranch);
    fetchHeads(heads);
  } catch (e) {
    heads = localHeads(snapshotBranch);
    console.warn(
      `Warning: cannot read snapshot branches from origin (${stderrOf(e).trim().split("\n")[0]}); ` +
        "using the local ones."
    );
  }
  if (heads.main === null && heads.branch === null) {
    console.log("No snapshot branch found; starting with empty baselines.");
    mkdirSync(join(targetDir, "dom"), { recursive: true });
    mkdirSync(join(targetDir, "screenshots"), { recursive: true });
    return;
  }

  const wtPath = `/tmp/gofish-snap-pull-${process.pid}`;
  if (existsSync(wtPath)) removeWorktree(wtPath);

  try {
    const { description } = checkoutBaselines(wtPath, snapshotBranch, heads);

    // Download the PNGs of the checkout's HEAD, left as LFS pointers.
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

    console.log(`Pulled the baselines of ${snapshotBranch}: ${description}.`);
  } finally {
    removeWorktree(wtPath);
  }
}

/**
 * The one writer of snapshot branches. Checks out the branch's baselines as
 * origin has them now (the same files `pullSnapshots` reads), lets `apply`
 * change `dom/` and `screenshots/` in that checkout, and pushes the result as
 * ONE commit, with the parents `checkoutBaselines` gives.
 *
 * - The push never forces. When it is rejected because the branch moved
 *   (non-fast-forward), `retryOnMovedBranch` decides what happens:
 *   - true: start over on the new head, running `apply` again, up to 5
 *     attempts. Only for an `apply` that changes specific files (accepting
 *     some stories), which is still right on top of someone else's commit.
 *   - false: fail. Required for an `apply` that replaces every baseline
 *     (update-baselines.ts), because redoing it on a newer head would let
 *     older captures overwrite newer baselines.
 *   Any other push failure (auth, branch protection) fails at once.
 * - PNG baselines stay LFS pointers in the checkout: only the PNGs `apply`
 *   changes are uploaded, by object id. The push itself
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
    const heads = remoteHeads(snapshotBranch);
    fetchHeads(heads);

    const wtPath = `/tmp/gofish-snap-push-${process.pid}`;
    if (existsSync(wtPath)) removeWorktree(wtPath);
    try {
      const { parents, description } = checkoutBaselines(
        wtPath,
        snapshotBranch,
        heads
      );
      console.log(`Committing to ${snapshotBranch} on ${description}.`);
      const before = git("git rev-parse HEAD^{tree}", { cwd: wtPath });
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
      const tree = git("git write-tree", { cwd: wtPath });
      if (tree === before) {
        console.log("No changes to snapshot baselines.");
        return null;
      }

      const lfsObjects = stagedLfsObjects(wtPath, before);
      const commit = git(
        `git commit-tree ${tree}${parents.map((p) => ` -p ${p}`).join("")} -F -`,
        { cwd: wtPath, input: message + "\n" }
      );
      if (dryRun) {
        console.log(`Dry run: built ${commit} (${message}); not pushed.`);
        console.log(
          git(`git diff --stat ${before} ${tree}`, { cwd: wtPath })
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
 * The LFS object ids of the PNGs staged (added or modified) in the checkout
 * since the tree `base`. Throws if one of them was staged as a raw blob
 * instead of an LFS pointer, which means the LFS clean filter is not active.
 */
function stagedLfsObjects(wtPath: string, base: string): string[] {
  const files = git(
    `git diff --cached --no-renames --diff-filter=AM --name-only -z ${base} -- screenshots`,
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
