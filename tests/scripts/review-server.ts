/**
 * Interactive visual diff review server.
 *
 * Builds the same review site CI deploys (`buildReviewSite` in
 * build-review-site.ts) from the local capture and baselines, serves it on
 * port 3005, and answers the one request the page makes, `POST /api/commit`,
 * locally: the accepted stories are copied from the local capture (tmp/js/)
 * into the local baseline cache (__snapshots__/) and committed to the
 * snapshot branch of the current branch; accepted removals delete the
 * baseline. On Cloudflare Pages the same request goes to
 * cf-functions/api/commit.ts, which hands it to a GitHub workflow instead.
 *
 * Usage: tsx scripts/review-server.ts [--dry-run] [--no-open]
 *   --dry-run  update __snapshots__/ and build the snapshot-branch commit,
 *              but push nothing
 *   --no-open  do not open the page in a browser
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { join } from "path";
import { exec } from "child_process";
import { collectReviewDiffs, applyEntries, ROOT } from "./diff-utils.js";
import { buildReviewSite } from "./build-review-site.js";
import { siteFile, serveFile, respond } from "./static-server.js";
import {
  getSnapshotBranchName,
  pullSnapshots,
  commitToSnapshotBranch,
  git,
} from "./snapshot-branch.js";

const PORT = 3005;
const SITE_DIR = join(import.meta.dirname, "../tmp/review-site-local");
const dryRun = process.argv.includes("--dry-run");
const openBrowser = !process.argv.includes("--no-open");

// ---------------------------------------------------------------------------
// Build the site
// ---------------------------------------------------------------------------

const snapshotBranch = getSnapshotBranchName();
pullSnapshots(snapshotBranch, join(ROOT, "__snapshots__"));

// The list the page shows. Its entries' kinds tell accept from removal.
const diffs = collectReviewDiffs();
const kindOf = new Map(diffs.map((d) => [d.path, d.kind]));

await buildReviewSite(SITE_DIR, diffs, {
  repo:
    git("git remote get-url origin", { ignoreError: true })
      .replace(/^.*github\.com[:/]/, "")
      .replace(/\.git$/, "") || "local",
  branch: snapshotBranch.replace(/^snapshots\//, ""),
  sha: git("git rev-parse HEAD", { ignoreError: true }) || "unknown",
  runId: "",
  liveNote:
    "Live runs this working tree's stories and library, which may be newer than the capture in tmp/js/. Before is the static baseline.",
});

// ---------------------------------------------------------------------------
// POST /api/commit
// ---------------------------------------------------------------------------

/** Same request and response as cf-functions/api/commit.ts. */
function handleCommit(body: string): { status: number; json: unknown } {
  let paths: string[];
  let removals: string[];
  try {
    const raw = JSON.parse(body) as { paths?: unknown; removals?: unknown };
    paths = (raw.paths ?? []) as string[];
    removals = (raw.removals ?? []) as string[];
  } catch {
    return { status: 400, json: { ok: false, error: "Invalid JSON body" } };
  }
  // Only stories this review lists, each as what it is.
  const unknown = [
    ...paths.filter((p) => !kindOf.has(p) || kindOf.get(p) === "removed"),
    ...removals.filter((p) => kindOf.get(p) !== "removed"),
  ];
  if (unknown.length > 0) {
    return {
      status: 400,
      json: { ok: false, error: `Not in this review: ${unknown.join(", ")}` },
    };
  }
  const entries = [
    ...paths.map((path) => ({ kind: kindOf.get(path)!, path })),
    ...removals.map((path) => ({ kind: "removed" as const, path })),
  ];
  try {
    applyEntries(entries);
    commitToSnapshotBranch(
      snapshotBranch,
      `Accept ${entries.length} visual diff(s)`,
      (checkoutDir) => applyEntries(entries, { baselineDir: checkoutDir }),
      { retryOnMovedBranch: true, dryRun }
    );
  } catch (e) {
    return { status: 500, json: { ok: false, error: String(e) } };
  }
  return {
    status: 200,
    json: {
      ok: true,
      message: dryRun
        ? `Updated __snapshots__/; dry run, so nothing was pushed to ${snapshotBranch}.`
        : `Updated __snapshots__/ and pushed one commit to ${snapshotBranch}.`,
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP server: the built site, plus /api/commit
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const { pathname } = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (req.method === "POST" && pathname === "/api/commit") {
    const { status, json } = handleCommit(await readBody(req));
    return respond(res, status, "application/json", JSON.stringify(json));
  }
  // functions/ holds the Cloudflare Pages Functions, not site files.
  serveFile(
    res,
    req.method === "GET" ? siteFile(SITE_DIR, pathname, ["functions"]) : null
  );
}

createServer((req, res) => {
  handleRequest(req, res).catch((e) =>
    respond(res, 500, "text/plain", String(e))
  );
}).listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\nReview server running at ${url}${dryRun ? " (dry run)" : ""}`);
  console.log("Keyboard shortcuts: ↑/↓ navigate, A accept, R reject\n");
  if (!openBrowser) return;
  const cmd =
    process.platform === "darwin"
      ? `open ${url}`
      : process.platform === "win32"
        ? `start ${url}`
        : `xdg-open ${url}`;
  exec(cmd, () => {});
});
