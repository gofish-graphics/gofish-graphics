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
  loadExportExemptParityPaths,
  type DiffEntry,
} from "./diff-utils.js";

const ROOT = join(import.meta.dirname, "../..");
const SUMMARY_PATH = join(import.meta.dirname, "../tmp/diff-summary.json");

const jsOnly = process.argv.includes("--js-only");

// ---------------------------------------------------------------------------
// Parity check: Python vs JS
// ---------------------------------------------------------------------------

// Same comparison as compare-python.ts (collectParityDiffs), including the
// per-export exemptions from .python-sync-exempt.
function checkParity(): DiffEntry[] {
  const exempt = loadExportExemptParityPaths();
  return collectParityDiffs().filter((diff) => {
    if (!exempt.has(diff.path.replace(/\.html$/, ""))) return true;
    console.log(`  Skipping parity for exempt export: ${diff.path}`);
    return false;
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printList(
  header: string,
  entries: readonly DiffEntry[],
  note: (d: DiffEntry) => string = () => ""
): void {
  if (entries.length === 0) return;
  console.log(`  ${header}`);
  for (const d of entries) console.log(`    - ${d.path}${note(d)}`);
}

function main() {
  console.log("=== Comparing DOM snapshots ===\n");

  // Pull baselines from the snapshot branch if not already present locally.
  pullSnapshots(getSnapshotBranchName(), join(ROOT, "__snapshots__"));

  // Regressions, new stories and removed stories (collectJsDiffs). A removed
  // story fails the job like a new one: a story with a baseline but no
  // current capture must be reviewed and accepted (which deletes the
  // baseline) or restored before the job goes green.
  const jsDiffs = collectJsDiffs();
  const parityFailures = jsOnly ? [] : checkParity();

  const ofKind = (kind: DiffEntry["kind"]) =>
    jsDiffs.filter((d) => d.kind === kind);
  const regressions = ofKind("regression");
  const newStories = ofKind("new");
  const removed = ofKind("removed");
  const warningsOnly = regressions.filter((d) => d.change === "warnings");

  printList(`${regressions.length} regression(s) detected`, regressions, (d) =>
    d.change === "warnings" ? " (warnings only)" : ""
  );
  printList(`${newStories.length} new story/stories without baselines`, newStories);
  printList(
    `${parityFailures.length} parity failure(s) (Python ≠ JS)`,
    parityFailures
  );
  printList(
    `${removed.length} removed stor${removed.length === 1 ? "y" : "ies"} (baseline exists, story no longer present):`,
    removed
  );

  const failureCount = jsDiffs.length + parityFailures.length;

  // Always emit a structured summary so downstream tooling (CI status
  // descriptions, the review site) can render counts without re-parsing logs.
  writeFileSync(
    SUMMARY_PATH,
    JSON.stringify(
      {
        regressions: regressions.length,
        /** Of the regressions, those whose DOM is identical: only their
         *  warnings changed. */
        warningsOnly: warningsOnly.length,
        newStories: newStories.length,
        parityFailures: parityFailures.length,
        removed: removed.length,
        removedStories: removed.map((d) => d.path),
      },
      null,
      2
    )
  );

  if (failureCount === 0) {
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

  console.log(`\n${failureCount} failure(s). See tests/tmp/diff-report.html`);
  console.log(`Run "pnpm test:visual:review" to interactively review changes.`);
  process.exit(1);
}

main();
