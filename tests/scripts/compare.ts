/**
 * Compare DOM snapshots:
 *   1. Regression check  — JS DOM and warnings (tmp/js/) vs stored baselines
 *                          (__snapshots__/dom/); a change in a story's
 *                          warnings alone is a regression too
 *   2. Parity check      — Python DOM (tmp/python/) vs JS DOM (tmp/js/)
 *
 * Flags:
 *   --js-only   Skip parity check (useful when Python stories aren't ready)
 *
 * Exit code 0 = all pass, 1 = any failure.
 * On failure, runs diff-report to generate tmp/diff-report.html.
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { getSnapshotBranchName, pullSnapshots } from "./snapshot-branch.js";
import {
  collectJsDiffs,
  collectParityDiffs,
  collectRemovedStories,
  loadExportExemptParityPaths,
} from "./diff-utils.js";

const ROOT = join(import.meta.dirname, "../..");
const SUMMARY_PATH = join(import.meta.dirname, "../tmp/diff-summary.json");

const jsOnly = process.argv.includes("--js-only");

interface Failure {
  kind: "regression" | "parity" | "missing-baseline" | "removed";
  path: string;
  expected?: string;
  actual?: string;
  /** For a regression: false when only its warnings changed. */
  domChanged?: boolean;
}

// ---------------------------------------------------------------------------
// Regression check: JS vs baselines (DOM and warnings; see collectJsDiffs)
// ---------------------------------------------------------------------------

function checkRegressions(): Failure[] {
  return collectJsDiffs().map((d) => ({
    kind: d.kind === "new" ? "missing-baseline" : "regression",
    path: d.path,
    expected: d.beforeDom ?? undefined,
    actual: d.afterDom ?? undefined,
    domChanged: d.domChanged,
  }));
}

// ---------------------------------------------------------------------------
// Parity check: Python vs JS
// ---------------------------------------------------------------------------

// Same comparison as compare-python.ts (collectParityDiffs), including the
// per-export exemptions from .python-sync-exempt.
function checkParity(): Failure[] {
  const failures: Failure[] = [];
  const exempt = loadExportExemptParityPaths();

  for (const diff of collectParityDiffs()) {
    if (exempt.has(diff.path.replace(/\.html$/, ""))) {
      console.log(`  Skipping parity for exempt export: ${diff.path}`);
      continue;
    }
    failures.push({
      kind: "parity",
      path: diff.path,
      expected: diff.beforeDom ?? undefined,
      actual: diff.afterDom ?? undefined,
    });
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log("=== Comparing DOM snapshots ===\n");

  // Pull baselines from the snapshot branch if not already present locally.
  pullSnapshots(getSnapshotBranchName(), join(ROOT, "__snapshots__"));

  const regressions = checkRegressions();
  const parityFailures = jsOnly ? [] : checkParity();
  // Removed stories join the failure set exactly like a new/missing-baseline
  // story: a story with a baseline but no current capture must be reviewed
  // and accepted (which deletes the baseline) before the job goes green.
  const removedFailures: Failure[] = collectRemovedStories().map((entry) => ({
    kind: "removed",
    path: entry.path,
    expected: entry.beforeDom ?? undefined,
  }));

  const rCount = regressions.filter((f) => f.kind === "regression").length;
  const wCount = regressions.filter(
    (f) => f.kind === "regression" && f.domChanged === false
  ).length;
  const mCount = regressions.filter(
    (f) => f.kind === "missing-baseline"
  ).length;
  const pCount = parityFailures.length;
  const remCount = removedFailures.length;

  // Print summary
  if (rCount > 0) {
    console.log(`  ${rCount} regression(s) detected`);
    for (const f of regressions.filter((f) => f.kind === "regression")) {
      console.log(
        `    - ${f.path}${f.domChanged === false ? " (warnings only)" : ""}`
      );
    }
  }

  if (mCount > 0) {
    console.log(`  ${mCount} new story/stories without baselines`);
    for (const f of regressions.filter((f) => f.kind === "missing-baseline")) {
      console.log(`    - ${f.path}`);
    }
  }

  if (pCount > 0) {
    console.log(`  ${pCount} parity failure(s) (Python ≠ JS)`);
    for (const f of parityFailures) {
      console.log(`    - ${f.path}`);
    }
  }

  // Removed stories fail the job like any other unreviewed change: baseline
  // exists but the story is gone, so someone must accept the removal
  // (deleting the baseline) or restore the story.
  if (remCount > 0) {
    console.log(
      `  ${remCount} removed stor${remCount === 1 ? "y" : "ies"} (baseline exists, story no longer present):`
    );
    for (const f of removedFailures) {
      console.log(`    - ${f.path}`);
    }
  }

  const allFailures = [...regressions, ...parityFailures, ...removedFailures];

  // Always emit a structured summary so downstream tooling (CI status
  // descriptions, the review site) can render counts without re-parsing logs.
  writeFileSync(
    SUMMARY_PATH,
    JSON.stringify(
      {
        regressions: rCount,
        /** Of the regressions, those whose DOM is identical: only their
         *  warnings changed. */
        warningsOnly: wCount,
        newStories: mCount,
        parityFailures: pCount,
        removed: remCount,
        removedStories: removedFailures.map((f) => f.path),
      },
      null,
      2
    )
  );

  if (allFailures.length === 0) {
    console.log("  All checks passed!");
    return;
  }

  // Generate diff report
  console.log("\nGenerating diff report...");
  try {
    execSync("tsx scripts/diff-report.ts", {
      cwd: join(import.meta.dirname, ".."),
      stdio: "inherit",
    });
  } catch {
    console.error("  Failed to generate diff report");
  }

  console.log(
    `\n${allFailures.length} failure(s). See tests/tmp/diff-report.html`
  );
  console.log(`Run "pnpm test:visual:review" to interactively review changes.`);
  process.exit(1);
}

main();
