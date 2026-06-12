/**
 * compare-python.ts
 *
 * Compares Python DOM output (tests/tmp/python/) against baselines (__snapshots__/dom/).
 *
 * - Missing baseline: warn (story not yet accepted on JS side)
 * - Content mismatch: parity failure
 * - Exit 1 on any failures
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { BASELINE_DOM, PYTHON_DIR, ROOT, listHtmlFiles } from "./diff-utils.js";
import { getSnapshotBranchName, pullSnapshots } from "./snapshot-branch.js";
import { storyToPath } from "./path-mapping.js";

const SUMMARY_PATH = join(import.meta.dirname, "../tmp/parity-summary.json");

// Per-export parity exemptions (`file.stories.tsx::ExportName` lines in
// .python-sync-exempt). A file-level exemption skips Python capture entirely
// (capture-python-dom.ts), so its DOM never reaches this gate. A per-export
// exemption is still captured + IR-validated — we just must not byte-gate it
// (e.g. CroissantStack: the Python port renders identically but can't reproduce
// the JS croissant recipe's per-slice spacer rects through the flat IR cut
// expansion). Resolve each exempt `file::Export` to its DOM path (shared by JS
// and Python capture via path-mapping.storyToPath) so the loop can skip it,
// mirroring what a file-level exemption achieves: validated, not byte-gated.
function loadExportExemptParityPaths(): Set<string> {
  const exempt = new Set<string>();
  const exemptFile = join(ROOT, "tests/.python-sync-exempt");
  if (!existsSync(exemptFile)) return exempt;
  for (const raw of readFileSync(exemptFile, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf("::");
    if (sep === -1) continue; // file-level — handled at capture time
    const jsFile = line.slice(0, sep);
    const exportName = line.slice(sep + 2);
    let title: string | null = null;
    try {
      const content = readFileSync(join(ROOT, jsFile), "utf-8");
      const m = content.match(/title:\s*["'](.+?)["']/);
      if (m) title = m[1];
    } catch {
      /* file unreadable — skip */
    }
    if (title) exempt.add(storyToPath(title, exportName));
  }
  return exempt;
}
const exportExemptParityPaths = loadExportExemptParityPaths();

/**
 * Emit a unified-style line diff to stderr for a single failing story so the
 * CI log shows what changed without requiring a parity-review-site download.
 * Both inputs are already normalized by `normalize-dom.ts`, so a line-by-line
 * diff is informative. Capped at `maxLines` total context lines.
 */
function printInlineDiff(
  baseline: string,
  python: string,
  maxLines = 40
): void {
  const a = baseline.split("\n");
  const b = python.split("\n");
  // Trivial line-by-line walk — both files have the same overall structure
  // post-normalization, so an LCS isn't worth the complexity.
  const out: string[] = [];
  const n = Math.max(a.length, b.length);
  let truncated = false;
  for (let i = 0; i < n; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === bv) continue;
    if (out.length >= maxLines) {
      truncated = true;
      break;
    }
    if (av !== undefined) out.push(`    - ${av}`);
    if (out.length >= maxLines) {
      truncated = true;
      break;
    }
    if (bv !== undefined) out.push(`    + ${bv}`);
  }
  for (const line of out) process.stderr.write(line + "\n");
  if (truncated) {
    process.stderr.write(
      "    … (truncated; see parity-review-site artifact for full diff)\n"
    );
  }
}

// Pull baselines from the snapshot branch if not already present locally.
pullSnapshots(getSnapshotBranchName(), join(ROOT, "__snapshots__"));

console.log("Comparing Python DOM output against JS baselines...");

if (!existsSync(PYTHON_DIR)) {
  console.error(
    `ERROR: Python output directory not found: ${PYTHON_DIR}\nRun capture-python first.`
  );
  process.exit(1);
}

const pyFiles = listHtmlFiles(PYTHON_DIR);

let parityMismatches = 0;
let missingBaselines = 0;
let passed = 0;

let exemptSkipped = 0;

for (const file of pyFiles) {
  // Skip per-export parity-exempt stories: captured + IR-validated but
  // intentionally not byte-identical to the JS baseline (.python-sync-exempt
  // `file::Export` entries). `file` is "<dom-path>.html".
  if (exportExemptParityPaths.has(file.replace(/\.html$/, ""))) {
    console.log(`  SKIP (export parity-exempt): ${file}`);
    exemptSkipped++;
    continue;
  }

  const baselinePath = join(BASELINE_DOM, file);
  const pythonPath = join(PYTHON_DIR, file);

  if (!existsSync(baselinePath)) {
    console.error(`  FAIL: No JS baseline for ${file} (not yet accepted)`);
    missingBaselines++;
    continue;
  }

  const pythonContent = readFileSync(pythonPath, "utf-8");
  const baselineContent = readFileSync(baselinePath, "utf-8");

  if (pythonContent !== baselineContent) {
    console.error(`  FAIL: Parity mismatch for ${file}`);
    printInlineDiff(baselineContent, pythonContent);
    parityMismatches++;
  } else {
    console.log(`  PASS: ${file}`);
    passed++;
  }
}

const failures = parityMismatches + missingBaselines;

if (pyFiles.length === 0) {
  console.log("No Python DOM files found. Nothing to compare.");
}

console.log(
  `\nResults: ${passed} passed, ${parityMismatches} parity mismatches, ${missingBaselines} missing baselines, ${exemptSkipped} export-exempt skipped`
);

// Merge into any pre-existing summary (capture-python.ts writes capture
// counts; we add comparison counts here). Always write so the CI status
// reader has something to render even when capture produced no files.
let prior: Record<string, unknown> = {};
if (existsSync(SUMMARY_PATH)) {
  try {
    prior = JSON.parse(readFileSync(SUMMARY_PATH, "utf-8"));
  } catch {
    /* ignore — overwrite */
  }
}
writeFileSync(
  SUMMARY_PATH,
  JSON.stringify(
    { ...prior, passed, parityMismatches, missingBaselines },
    null,
    2
  )
);

if (failures > 0) {
  console.error(
    `\n${failures} parity failure(s). Python DOM output does not match JS baselines.`
  );
  process.exit(1);
}

if (pyFiles.length === 0) {
  // Capture failed entirely — nothing to compare. Don't claim parity
  // passed; the capture script's exit code already signaled the failure.
  process.exit(0);
}

console.log("\nPython DOM parity check passed.");
