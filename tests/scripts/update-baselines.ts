/**
 * Accept current JS DOM snapshots and screenshots as the new baselines.
 *
 * Copies tmp/js/ → __snapshots__/dom/ and __snapshots__/screenshots/.
 */

import { readdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import {
  acceptStory,
  JS_DIR,
  ROOT,
  BASELINE_DOM,
  BASELINE_SCREENSHOTS,
  listHtmlFiles,
} from "./diff-utils.js";
import {
  getSnapshotBranchName,
  commitAndPushSnapshots,
} from "./snapshot-branch.js";

/** Recursively list files under a directory. */
function listFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...listFiles(join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

/**
 * Delete baseline dom/screenshot files for stories that no longer exist in
 * the current capture. capture-js-dom.ts always renders the *full* story
 * corpus (cleanOutDir: true), so anything in the baseline set but missing
 * from JS_DIR is a genuinely removed (or renamed) story, not a partial
 * capture. Without this, deleted stories' baselines accumulate on
 * snapshots/<branch> forever, and compare.ts would re-report the same
 * removal on every future PR.
 */
function pruneRemovedBaselines(currentHtmlFiles: Set<string>): string[] {
  // An empty capture means something went wrong upstream, not that every
  // story was deleted — never mass-prune on it.
  if (currentHtmlFiles.size === 0) return [];
  const pruned: string[] = [];
  for (const file of listHtmlFiles(BASELINE_DOM)) {
    if (currentHtmlFiles.has(file)) continue;
    rmSync(join(BASELINE_DOM, file), { force: true });
    const pngPath = join(BASELINE_SCREENSHOTS, file.replace(/\.html$/, ".png"));
    if (existsSync(pngPath)) rmSync(pngPath, { force: true });
    pruned.push(file);
  }
  return pruned;
}

function main() {
  console.log("=== Updating baselines ===\n");

  if (!existsSync(JS_DIR)) {
    console.error("No JS snapshots found in tmp/js/. Run capture first.");
    process.exit(1);
  }

  const files = listFiles(JS_DIR);
  let count = 0;
  const currentHtmlFiles = new Set<string>();

  for (const file of files) {
    if (file.endsWith(".html")) {
      acceptStory(file);
      currentHtmlFiles.add(file);
      count++;
    }
  }

  console.log(`Updated ${count} story baseline(s).`);

  const pruned = pruneRemovedBaselines(currentHtmlFiles);
  if (pruned.length > 0) {
    console.log(
      `Pruned ${pruned.length} stale baseline(s) for removed stories:`
    );
    for (const file of pruned) {
      console.log(`    - ${file}`);
    }
  }

  // Push the accepted baselines to the shared snapshots/<branch> ref ONLY in
  // CI: that branch is what CI fetches as its baseline, and CI renders on
  // Linux. A local (macOS) run must never publish its captures there — text
  // metrics differ and every text-bearing story would falsely regress.
  // Locally the accept is still useful: __snapshots__/dom feeds the local
  // parity compare (compare-python.ts).
  if (count > 0) {
    if (process.env.CI) {
      const snapBranch = getSnapshotBranchName();
      commitAndPushSnapshots(
        snapBranch,
        join(ROOT, "__snapshots__"),
        `Accept ${count} visual diff(s)`
      );
    } else {
      console.log(
        "Local run: accepted baselines were NOT pushed to the snapshots " +
          "branch (CI-only). They live in __snapshots__/ for local compares."
      );
    }
  }
}

main();
