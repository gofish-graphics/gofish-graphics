/**
 * capture-diff.ts
 *
 * Local visual-regression signal for agent loops (issue #496): answer the
 * question "did my change move anything I didn't intend?" WITHOUT stored
 * baselines or CI.
 *
 * It captures the normalized DOM and the warnings (layout warnings and console
 * errors, see story-warnings.ts) of every (optionally filtered) story twice —
 * once from the current worktree (HEAD) and once from a throwaway git worktree
 * checked out at <base-ref> — then diffs the two per story. A story whose
 * warnings changed has changed, even when its DOM is identical. Both captures use
 * this tree's capture tooling (driver, harness, normalization; see
 * `withBaseRefHarness`), so only the library and stories differ between them.
 * Because the diff is
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
 *   tests/tmp/capture-diff/head/<path>.warnings.txt   its warnings
 *   tests/tmp/capture-diff/base/...           the same at <base-ref>
 *   tests/tmp/capture-diff/report.html        DOM diff, warnings diff and the
 *                                             highlighted spec (changed stories)
 *
 * Exit code 0 = nothing moved, 1 = at least one story changed/added/removed
 * (a warnings-only change counts)
 * (so it doubles as a pass/fail gate in an inner loop).
 */

import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import {
  captureStories,
  HARNESS_DIR,
  withBaseRefHarness,
} from "./capture-core.js";
import {
  formatDomDiff,
  formatWarningsHtml,
  warningsSummary,
  escapeHtml,
} from "./diff-utils.js";
import {
  diffWarnings,
  readWarnings,
  warningsPathFor,
  type WarningsDiff,
} from "./story-warnings.js";
import { git } from "./snapshot-branch.js";
import {
  loadSpecsByPath,
  createCodeHighlighter,
  specHtml,
  SPEC_CSS,
} from "./story-specs.js";

const TESTS_DIR = join(import.meta.dirname, "..");
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
  warnings: WarningsDiff;
}

function generateReport(
  baseRef: string,
  filter: string | undefined,
  changes: Change[],
  /** path → highlighted spec fragment (HEAD's code; none for removed) */
  specs: Map<string, string>
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
      const domChanged = c.baseDom !== c.headDom;
      const body =
        c.kind === "changed" && c.baseDom && c.headDom
          ? domChanged
            ? formatDomDiff(c.baseDom, c.headDom)
            : `<div style="padding:8px 16px;color:#888;font-size:13px;">DOM identical: only the warnings changed.</div>`
          : `<pre style="margin:0;white-space:pre-wrap;padding:8px;">${escapeHtml(
              c.headDom ?? c.baseDom ?? ""
            )}</pre>`;
      // Open when the warnings changed; collapsed when they are only there.
      const warningsOpen = c.warnings.state === "changed";
      const warningsHtml =
        c.warnings.lines.length === 0
          ? ""
          : `
      <details ${warningsOpen ? "open" : ""} style="padding:0;border-top:1px solid #e0e0e0;">
        <summary style="cursor:pointer;font-weight:bold;font-size:13px;padding:8px 16px;">Warnings: ${escapeHtml(warningsSummary(c.warnings))}</summary>
        <div style="max-height:400px;overflow:auto;border-top:1px solid #e0e0e0;">
          ${formatWarningsHtml(c.warnings)}
        </div>
      </details>`;
      return `
    <div style="border:1px solid #ddd;margin:16px 0;border-radius:6px;overflow:hidden;">
      <div style="padding:12px 16px;background:${kindColor[c.kind]}22;border-bottom:1px solid #ddd;">
        <span style="font-weight:bold;color:${kindColor[c.kind]};">${kindLabel[c.kind]}${
          c.kind === "changed" && !domChanged ? " (warnings only)" : ""
        }</span>
        <span style="margin-left:12px;font-family:monospace;">${escapeHtml(c.path)}</span>
      </div>
      <details ${c.kind === "changed" && domChanged ? "open" : ""} style="padding:0;">
        <summary style="cursor:pointer;font-weight:bold;font-size:13px;padding:8px 16px;">DOM diff (− ${escapeHtml(baseRef)}, + HEAD)</summary>
        <div style="max-height:600px;overflow:auto;border-top:1px solid #e0e0e0;">
          ${body}
        </div>
      </details>${warningsHtml}${
        specs.has(c.path)
          ? `
      <details style="padding:0;border-top:1px solid #e0e0e0;">
        <summary style="cursor:pointer;font-weight:bold;font-size:13px;padding:8px 16px;">Spec (HEAD)</summary>
        <div style="max-height:600px;overflow:auto;border-top:1px solid #e0e0e0;">
          ${specs.get(c.path)}
        </div>
      </details>`
          : ""
      }
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
    ${SPEC_CSS}
  </style>
</head>
<body>
  <h1>capture-diff: HEAD vs ${escapeHtml(baseRef)}</h1>
  <p>${changes.length} story(ies) moved${filter ? ` (filter: <code>${escapeHtml(filter)}</code>)` : ""}. Diff is over normalized geometry/DOM and each story's warnings (layout warnings and console errors), so it is platform-stable.</p>
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

  // 2. Capture <base-ref>'s stories, with this tree's harness, from a
  //    throwaway worktree.
  console.log(
    `\n=== Checking out ${baseRef} (${baseShort}) into a temp worktree ===`
  );
  const baseResult = await withBaseRefHarness(baseSha, (harnessDir) => {
    console.log(`\n=== Capturing ${baseRef} (${baseShort}) ===\n`);
    return captureStories({
      harnessDir,
      port: BASE_PORT,
      outDir: BASE_DIR,
      filter,
    });
  });

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
    // Both sides are captured by this tree's tooling, so each captured story
    // has its warnings file.
    const warnings = diffWarnings(
      baseDom === null
        ? null
        : readWarnings(join(BASE_DIR, warningsPathFor(path))),
      headDom === null
        ? null
        : readWarnings(join(HEAD_DIR, warningsPathFor(path))),
      baseDom !== null
    );

    if (baseDom === null)
      changes.push({ path, kind: "added", baseDom, headDom, warnings });
    else if (headDom === null)
      changes.push({ path, kind: "removed", baseDom, headDom, warnings });
    else if (headDom !== baseDom || warnings.state === "changed")
      changes.push({ path, kind: "changed", baseDom, headDom, warnings });
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
      for (const c of changed) {
        const what =
          c.headDom === c.baseDom
            ? " (warnings only)"
            : c.warnings.state === "changed"
              ? " (DOM and warnings)"
              : "";
        console.log(`    ~ ${c.path}${what}`);
        for (const l of c.warnings.lines) {
          if (l.kind === "added") console.log(`        + ${l.text}`);
          else if (l.kind === "removed") console.log(`        - ${l.text}`);
        }
      }
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

  // Each moved story's spec at HEAD (a removed story has none).
  const specs = new Map<string, string>();
  if (changes.length) {
    const specsByPath = await loadSpecsByPath();
    const highlight = await createCodeHighlighter();
    for (const c of changes) {
      const spec = c.kind === "removed" ? undefined : specsByPath.get(c.path);
      if (spec) specs.set(c.path, specHtml(spec, highlight));
    }
  }
  writeFileSync(
    REPORT_PATH,
    generateReport(baseRef, filter, changes, specs),
    "utf-8"
  );
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
