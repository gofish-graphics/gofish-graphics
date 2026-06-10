/**
 * capture-diff.ts
 *
 * Local visual-regression signal for agent loops (issue #496): answer the
 * question "did my change move anything I didn't intend?" WITHOUT stored
 * baselines or CI.
 *
 * It captures the normalized DOM of every (optionally filtered) story twice —
 * once from the current worktree (HEAD) and once from a throwaway git worktree
 * checked out at <base-ref> — then diffs the two per story. Because the diff is
 * over normalized geometry/DOM (not rasterized pixels), it is platform-stable:
 * it does not suffer the text-metric drift that makes `update-baselines`
 * unusable on Mac, so it gives a real pass/fail layout signal locally.
 *
 * Usage:
 *   tsx scripts/capture-diff.ts <base-ref> [filter]
 *
 *   tsx scripts/capture-diff.ts main            # whole suite vs main
 *   tsx scripts/capture-diff.ts HEAD~1          # vs the previous commit
 *   tsx scripts/capture-diff.ts main bar        # only stories matching "bar"
 *   tsx scripts/capture-diff.ts main "streamgraph"
 *
 * Output:
 *   tests/tmp/capture-diff/head/<path>.html   normalized DOM at HEAD
 *   tests/tmp/capture-diff/base/<path>.html   normalized DOM at <base-ref>
 *   tests/tmp/capture-diff/report.html        side-by-side DOM diff (changed stories)
 *
 * Exit code 0 = nothing moved, 1 = at least one story changed/added/removed
 * (so it doubles as a pass/fail gate in an inner loop).
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { captureStories } from "./capture-core.js";
import { formatDomDiff, escapeHtml } from "./diff-utils.js";
import { git, removeWorktree } from "./snapshot-branch.js";

const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const OUT_DIR = join(TESTS_DIR, "tmp/capture-diff");
const HEAD_DIR = join(OUT_DIR, "head");
const BASE_DIR = join(OUT_DIR, "base");
const REPORT_PATH = join(OUT_DIR, "report.html");

const HEAD_PORT = 3001; // reuse capture-js-dom's port (it isn't running concurrently)
const BASE_PORT = 3003; // distinct so the base worktree's server can coexist

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

interface Change {
  path: string;
  kind: "changed" | "added" | "removed";
  baseDom: string | null;
  headDom: string | null;
}

function generateReport(
  baseRef: string,
  filter: string | undefined,
  changes: Change[]
): string {
  const kindColor: Record<Change["kind"], string> = {
    changed: "#e74c3c",
    added: "#3498db",
    removed: "#95a5a6",
  };
  const kindLabel: Record<Change["kind"], string> = {
    changed: "CHANGED",
    added: `ADDED (not in ${baseRef})`,
    removed: `REMOVED (only in ${baseRef})`,
  };

  const entryHtml = changes
    .map((c) => {
      const body =
        c.kind === "changed" && c.baseDom && c.headDom
          ? formatDomDiff(c.baseDom, c.headDom)
          : `<pre style="margin:0;white-space:pre-wrap;padding:8px;">${escapeHtml(
              c.headDom ?? c.baseDom ?? ""
            )}</pre>`;
      return `
    <div style="border:1px solid #ddd;margin:16px 0;border-radius:6px;overflow:hidden;">
      <div style="padding:12px 16px;background:${kindColor[c.kind]}22;border-bottom:1px solid #ddd;">
        <span style="font-weight:bold;color:${kindColor[c.kind]};">${kindLabel[c.kind]}</span>
        <span style="margin-left:12px;font-family:monospace;">${escapeHtml(c.path)}</span>
      </div>
      <details ${c.kind === "changed" ? "open" : ""} style="padding:0;">
        <summary style="cursor:pointer;font-weight:bold;font-size:13px;padding:8px 16px;">DOM diff (− ${escapeHtml(baseRef)}, + HEAD)</summary>
        <div style="max-height:600px;overflow:auto;border-top:1px solid #e0e0e0;">
          ${body}
        </div>
      </details>
    </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>capture-diff: HEAD vs ${escapeHtml(baseRef)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 24px; color: #333; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 8px; }
  </style>
</head>
<body>
  <h1>capture-diff: HEAD vs ${escapeHtml(baseRef)}</h1>
  <p>${changes.length} story(ies) moved${filter ? ` (filter: <code>${escapeHtml(filter)}</code>)` : ""}. Diff is over normalized geometry/DOM, so it is platform-stable.</p>
  ${entryHtml}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const baseRef = process.argv[2];
  const filter = process.argv[3];

  if (!baseRef) {
    console.error(
      "Usage: tsx scripts/capture-diff.ts <base-ref> [filter]\n" +
        "  e.g. tsx scripts/capture-diff.ts main\n" +
        "       tsx scripts/capture-diff.ts HEAD~1 bar"
    );
    process.exit(2);
  }

  // Resolve the ref now so we fail fast on a typo (and pin to a sha so the
  // worktree is stable even if the branch moves mid-run).
  const baseSha = git(`git rev-parse "${baseRef}"`, { ignoreError: true });
  if (!baseSha) {
    console.error(
      `Cannot resolve base ref "${baseRef}". Is it a valid commit/branch?`
    );
    process.exit(2);
  }
  const baseShort = baseSha.slice(0, 9);

  // Fresh output dir each run.
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. Capture HEAD from the current worktree.
  console.log(`=== Capturing HEAD (current worktree) ===\n`);
  const headResult = await captureStories({
    harnessDir: HARNESS_DIR,
    port: HEAD_PORT,
    outDir: HEAD_DIR,
    filter,
  });

  // 2. Capture <base-ref> from a throwaway worktree.
  const wtPath = join("/tmp", `gofish-capture-diff-${process.pid}`);
  removeWorktree(wtPath);
  let baseResult;
  try {
    console.log(
      `\n=== Checking out ${baseRef} (${baseShort}) into a temp worktree ===`
    );
    git(`git worktree add --detach "${wtPath}" ${baseSha}`);

    // The worktree has no node_modules — install so its harness can run Vite.
    // --ignore-scripts skips husky/postinstall (not needed for a headless render)
    // and keeps the install fast; the pnpm store is shared so it's mostly links.
    console.log(
      `Installing dependencies in the temp worktree (this can take a minute)...`
    );
    execSync("pnpm install --ignore-scripts", {
      cwd: wtPath,
      stdio: "inherit",
    });

    console.log(`\n=== Capturing ${baseRef} (${baseShort}) ===\n`);
    baseResult = await captureStories({
      harnessDir: join(wtPath, "tests/harness"),
      port: BASE_PORT,
      outDir: BASE_DIR,
      filter,
    });
  } finally {
    removeWorktree(wtPath);
  }

  // 3. Diff per story.
  const headSet = new Set(headResult.captured);
  const baseSet = new Set(baseResult.captured);
  const all = Array.from(new Set([...headSet, ...baseSet])).sort();

  const changes: Change[] = [];
  for (const path of all) {
    const headDom = headSet.has(path)
      ? readFileSync(join(HEAD_DIR, path), "utf-8")
      : null;
    const baseDom = baseSet.has(path)
      ? readFileSync(join(BASE_DIR, path), "utf-8")
      : null;

    if (baseDom === null)
      changes.push({ path, kind: "added", baseDom, headDom });
    else if (headDom === null)
      changes.push({ path, kind: "removed", baseDom, headDom });
    else if (headDom !== baseDom)
      changes.push({ path, kind: "changed", baseDom, headDom });
  }

  // 4. Report.
  console.log(`\n=== Result: HEAD vs ${baseRef} (${baseShort}) ===\n`);

  const changed = changes.filter((c) => c.kind === "changed");
  const added = changes.filter((c) => c.kind === "added");
  const removed = changes.filter((c) => c.kind === "removed");

  if (changes.length === 0) {
    console.log(
      `  No layout changes. ${headResult.captured.length} story(ies) identical.`
    );
  } else {
    if (changed.length) {
      console.log(`  ${changed.length} changed:`);
      for (const c of changed) console.log(`    ~ ${c.path}`);
    }
    if (added.length) {
      console.log(`  ${added.length} added (not in ${baseRef}):`);
      for (const c of added) console.log(`    + ${c.path}`);
    }
    if (removed.length) {
      console.log(`  ${removed.length} removed (only in ${baseRef}):`);
      for (const c of removed) console.log(`    - ${c.path}`);
    }
  }

  // Render failures are worth surfacing — a crash in either ref is a real signal.
  const renderFailures = [
    ...headResult.failed.map((f) => ({ ...f, ref: "HEAD" })),
    ...baseResult.failed.map((f) => ({ ...f, ref: baseRef })),
  ];
  if (renderFailures.length) {
    console.log(`\n  ${renderFailures.length} render failure(s):`);
    for (const f of renderFailures)
      console.log(`    ! [${f.ref}] ${f.path}: ${f.error}`);
  }

  writeFileSync(REPORT_PATH, generateReport(baseRef, filter, changes), "utf-8");
  if (changes.length) {
    console.log(`\n  DOM written to ${HEAD_DIR} and ${BASE_DIR}`);
    console.log(`  Diff report: ${REPORT_PATH}`);
  }

  // Non-zero when anything moved so this can gate an inner loop.
  process.exit(changes.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
