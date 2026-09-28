/**
 * Accept visual-test diffs as new baselines, using the files a CI run captured.
 *
 * Usage (from the repo root):
 *   pnpm --filter @gofish/tests accept-baselines <run-id> <branch> --all [--dry-run]
 *   pnpm --filter @gofish/tests accept-baselines <run-id> <branch> \
 *       --accept-file FILE [--remove-file FILE] [--dry-run]
 *
 *   <branch>        code branch of the run, e.g. "my-feature" (not "snapshots/...")
 *   --all           accept exactly the diffs the run reported, which are the
 *                   ones its review site lists: regressions and new stories
 *                   are accepted, removed stories have their baselines
 *                   deleted. The list is diff-list.json in the run's
 *                   `visual-diff-report` artifact.
 *   --accept-file   file with one story path per line (e.g. "forward-syntax/bar--basic.html")
 *   --remove-file   file with one story path per line whose baseline to delete
 *   --dry-run       build the commit but do not push it
 *
 * The run must be a Visual Tests run of <branch>. Files come from the run's
 * `js-dom-capture` artifact, never from a local capture, so baselines are
 * never rendered on a developer machine. The commit goes to
 * snapshots/<branch> through `commitToSnapshotBranch` (one commit; a new
 * branch inherits snapshots/main).
 *
 * The accept-visual-baselines.yml workflow runs this when someone clicks
 * Accept on the review site. It needs `gh` (authenticated) and git-lfs.
 * Writes `accepted` and `removed` counts to $GITHUB_OUTPUT when set.
 */

import { execFile, execFileSync } from "child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import {
  acceptStory,
  listHtmlFiles,
  removeBaselineStory,
  type DiffEntry,
} from "./diff-utils.js";
import { commitToSnapshotBranch } from "./snapshot-branch.js";

const VISUAL_TESTS_WORKFLOW = ".github/workflows/visual-tests.yml";

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf-8" }).trim();
}

/** A story path is relative, ends in .html, and never leaves its directory. */
function isStoryPath(p: string): boolean {
  return (
    p.endsWith(".html") &&
    !p.startsWith("/") &&
    !`/${p}/`.includes("/../") &&
    !/[\r\n\0"`$\\]/.test(p)
  );
}

function readList(file: string | undefined): string[] {
  if (!file) return [];
  return readFileSync(file, "utf-8").split("\n").filter(Boolean);
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const [runId, branch] = args;
let all = false;
let dryRun = false;
let acceptFile: string | undefined;
let removeFile: string | undefined;
for (let i = 2; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--all") all = true;
  else if (arg === "--dry-run") dryRun = true;
  else if (arg === "--accept-file") acceptFile = args[++i];
  else if (arg === "--remove-file") removeFile = args[++i];
  else fail(`unknown argument '${arg}'`);
}

if (!runId || !/^\d+$/.test(runId)) fail("run id must be numeric");
try {
  execFileSync("git", ["check-ref-format", "--branch", branch ?? ""], {
    stdio: "ignore",
  });
} catch {
  fail(`invalid branch name '${branch}'`);
}
if (all === Boolean(acceptFile || removeFile)) {
  fail("pass either --all, or --accept-file and/or --remove-file");
}

// ---------------------------------------------------------------------------
// Check the run, download its artifacts
// ---------------------------------------------------------------------------

const repo =
  process.env.GH_REPO ??
  gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
const run = JSON.parse(
  gh([
    "api",
    `repos/${repo}/actions/runs/${runId}`,
    "--jq",
    "{path, head_branch}",
  ])
) as { path: string; head_branch: string };
// Only accept files from a Visual Tests run of this same branch, so a request
// can never copy one branch's capture onto another branch's baselines.
if (run.path !== VISUAL_TESTS_WORKFLOW) {
  fail(`run ${runId} is from '${run.path}', not the Visual Tests workflow`);
}
if (run.head_branch !== branch) {
  fail(`run ${runId} is for branch '${run.head_branch}', not '${branch}'`);
}

const work = mkdtempSync(join(tmpdir(), "accept-baselines-"));
// Also runs on fail(), which exits the process.
process.on("exit", () => rmSync(work, { recursive: true, force: true }));
const captureDir = join(work, "capture");
const reportDir = join(work, "report");
const download = (name: string, dir: string) =>
  promisify(execFile)("gh", [
    "run",
    "download",
    runId,
    "-R",
    repo,
    "--name",
    name,
    "--dir",
    dir,
  ]);
console.log(`Downloading artifacts of run ${runId}...`);
const [capture, report] = await Promise.allSettled([
  download("js-dom-capture", captureDir),
  all ? download("visual-diff-report", reportDir) : Promise.resolve(),
]);
if (capture.status === "rejected") {
  fail(`cannot download js-dom-capture: ${String(capture.reason)}`);
}
if (report.status === "rejected") {
  fail(
    `run ${runId} has no visual-diff-report artifact (it reported no diffs, or the artifact expired)`
  );
}
// An empty capture means something went wrong upstream, not that every
// story was deleted; never mass-remove baselines on it.
if (listHtmlFiles(captureDir).length === 0) {
  fail(`the capture of run ${runId} contains no stories`);
}

// -------------------------------------------------------------------------
// What to accept
// -------------------------------------------------------------------------

let accepts: string[];
let removals: string[];
if (all) {
  // diff-list.json is written by diff-report.ts from collectReviewDiffs(),
  // the same list the review site shows.
  const listPath = join(reportDir, "diff-list.json");
  if (!existsSync(listPath)) {
    fail(
      `run ${runId} predates the machine-readable diff list (diff-list.json), ` +
        "so --all cannot tell what it reported; pass --accept-file/--remove-file instead"
    );
  }
  const { diffs } = JSON.parse(readFileSync(listPath, "utf-8")) as {
    diffs: Pick<DiffEntry, "kind" | "path">[];
  };
  accepts = diffs.filter((d) => d.kind !== "removed").map((d) => d.path);
  removals = diffs.filter((d) => d.kind === "removed").map((d) => d.path);
  console.log(
    `Run ${runId} reported ${accepts.length} diff(s) to accept and ${removals.length} removal(s).`
  );
} else {
  accepts = readList(acceptFile);
  removals = readList(removeFile);
}
for (const p of [...accepts, ...removals]) {
  if (!isStoryPath(p)) fail(`invalid story path '${p}'`);
}
for (const p of accepts) {
  if (!existsSync(join(captureDir, p))) {
    fail(`${p} is not in the capture of run ${runId}`);
  }
}
for (const p of accepts) console.log(`  accept: ${p}`);
for (const p of removals) console.log(`  remove: ${p}`);

// -------------------------------------------------------------------------
// Commit
// -------------------------------------------------------------------------

const message = [
  accepts.length > 0 ? `Accept ${accepts.length} visual diff(s)` : "",
  removals.length > 0 ? `remove ${removals.length} stale baseline(s)` : "",
]
  .filter(Boolean)
  .join(", ");
commitToSnapshotBranch(
  `snapshots/${branch}`,
  message,
  (checkoutDir) => {
    for (const p of accepts) {
      acceptStory(p, { captureDir, baselineDir: checkoutDir });
    }
    for (const p of removals) removeBaselineStory(p, checkoutDir);
  },
  { dryRun }
);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `accepted=${accepts.length}\nremoved=${removals.length}\n`
  );
}
