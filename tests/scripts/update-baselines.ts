/**
 * Accept current JS DOM snapshots and screenshots as the new baselines.
 *
 * Copies tmp/js/ into the baselines' dom/ and screenshots/, and prunes the
 * baselines of stories the capture no longer has. In CI that is one commit to
 * snapshots/main; locally it is the __snapshots__/ cache.
 */

import { existsSync } from "fs";
import { join } from "path";
import {
  acceptStory,
  removeBaselineStory,
  JS_DIR,
  BASELINE_DIR,
  listHtmlFiles,
} from "./diff-utils.js";
import {
  MAIN_SNAPSHOT_BRANCH,
  commitToSnapshotBranch,
  getSnapshotBranchName,
} from "./snapshot-branch.js";

/**
 * Delete baseline dom/screenshot files for stories that no longer exist in
 * the current capture: anything in the baseline set but missing from JS_DIR
 * is treated as a removed (or renamed) story. That holds only when JS_DIR is
 * a capture of the whole corpus: one unfiltered, unsharded capture-js-dom.ts
 * run (cleanOutDir: true), or in CI the merge of every shard's. A story that
 * failed to render writes no `.html` — capture-js-dom.ts still exits 0 — so
 * its baseline is pruned here as if the story had been removed. Without
 * this pruning, deleted stories' baselines accumulate on snapshots/<branch>
 * forever, and compare.ts would re-report the same removal on every future
 * PR. The capture must not be empty (main() checks).
 */
function pruneRemovedBaselines(
  currentHtmlFiles: Set<string>,
  baselineDir: string
): string[] {
  const pruned: string[] = [];
  for (const file of listHtmlFiles(join(baselineDir, "dom"))) {
    if (currentHtmlFiles.has(file)) continue;
    removeBaselineStory(file, baselineDir);
    pruned.push(file);
  }
  return pruned;
}

/** Accepts every capture into `baselineDir`, then prunes it. */
function updateBaselines(htmlFiles: string[], baselineDir: string): void {
  for (const file of htmlFiles) acceptStory(file, { baselineDir });
  console.log(`Updated ${htmlFiles.length} story baseline(s).`);

  const pruned = pruneRemovedBaselines(new Set(htmlFiles), baselineDir);
  if (pruned.length > 0) {
    console.log(
      `Pruned ${pruned.length} stale baseline(s) for removed stories:`
    );
    for (const file of pruned) {
      console.log(`    - ${file}`);
    }
  }
}

function main() {
  console.log("=== Updating baselines ===\n");

  if (!existsSync(JS_DIR)) {
    console.error("No JS snapshots found in tmp/js/. Run capture first.");
    process.exit(1);
  }

  const htmlFiles = listHtmlFiles(JS_DIR);
  // An empty capture means something went wrong upstream, not that every
  // story was deleted: never accept it, which would prune every baseline.
  if (htmlFiles.length === 0) {
    console.log("No story captures found; nothing to update.");
    return;
  }

  // Push the accepted baselines to snapshots/main ONLY in CI, and only from
  // main: that branch is what CI fetches as its baseline, and CI renders on
  // Linux. A local (macOS) run must never publish its captures there — text
  // metrics differ and every text-bearing story would falsely regress.
  // Locally the accept is still useful: __snapshots__/dom feeds the local
  // regression compare (compare.ts).
  if (process.env.CI) {
    const snapshotBranch = getSnapshotBranchName();
    if (snapshotBranch !== MAIN_SNAPSHOT_BRANCH) {
      throw new Error(
        `update-baselines replaces ${MAIN_SNAPSHOT_BRANCH}, so in CI it runs ` +
          `only on main, not for ${snapshotBranch.replace(/^snapshots\//, "")}. ` +
          "Accept a branch's diffs with accept-baselines instead."
      );
    }
    commitToSnapshotBranch(
      MAIN_SNAPSHOT_BRANCH,
      `Accept ${htmlFiles.length} visual diff(s)`,
      (checkoutDir) => updateBaselines(htmlFiles, checkoutDir),
      // Every baseline is replaced: never redo that on a newer head.
      { retryOnMovedBranch: false }
    );
  } else {
    updateBaselines(htmlFiles, BASELINE_DIR);
    console.log(
      "Local run: accepted baselines were NOT pushed to the snapshots " +
        "branch (CI-only). They live in __snapshots__/ for local compares."
    );
  }
}

main();
