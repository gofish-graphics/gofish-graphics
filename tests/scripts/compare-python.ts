/**
 * compare-python.ts
 *
 * Compares Python DOM output (tests/tmp/python/) against the JS capture of
 * the same commit (tests/tmp/js/), via the shared `collectParityDiffs`.
 * Baselines play no part: parity does not wait on the JS visual review.
 *
 * - No JS capture for a Python story: parity failure (`missingJsCapture`)
 * - Content mismatch: parity failure (`parityMismatches`)
 * - Per-export exemptions (.python-sync-exempt `file::Export`): skipped
 * - Exit 1 on any failures
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import {
  JS_DIR,
  PYTHON_DIR,
  collectParityDiffs,
  listHtmlFiles,
  loadExportExemptParityPaths,
} from "./diff-utils.js";

const SUMMARY_PATH = join(import.meta.dirname, "../tmp/parity-summary.json");

/**
 * Emit a unified-style line diff to stderr for a single failing story so the
 * CI log shows what changed without requiring a parity-review-site download.
 * Both inputs are already normalized by `normalize-dom.ts`, so a line-by-line
 * diff is informative. Capped at `maxLines` total context lines.
 */
function printInlineDiff(js: string, python: string, maxLines = 40): void {
  const a = js.split("\n");
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

console.log("Comparing Python DOM output against the JS capture...");

if (!existsSync(PYTHON_DIR)) {
  console.error(
    `ERROR: Python output directory not found: ${PYTHON_DIR}\nRun capture-python first.`
  );
  process.exit(1);
}
if (!existsSync(JS_DIR)) {
  console.error(
    `ERROR: JS capture directory not found: ${JS_DIR}\nRun capture-js first.`
  );
  process.exit(1);
}

const pyFiles = listHtmlFiles(PYTHON_DIR);
const exempt = loadExportExemptParityPaths();
const isExempt = (file: string) => exempt.has(file.replace(/\.html$/, ""));
const diffs = new Map(collectParityDiffs().map((d) => [d.path, d]));

let parityMismatches = 0;
let missingJsCapture = 0;
let passed = 0;
let exemptSkipped = 0;

for (const file of pyFiles) {
  // Per-export parity-exempt stories are captured + IR-validated but
  // intentionally not byte-gated against the JS capture.
  if (isExempt(file)) {
    console.log(`  SKIP (export parity-exempt): ${file}`);
    exemptSkipped++;
    continue;
  }

  const diff = diffs.get(file);
  if (!diff) {
    console.log(`  PASS: ${file}`);
    passed++;
  } else if (diff.beforeDom === null) {
    console.error(`  FAIL: No JS capture for ${file}`);
    missingJsCapture++;
  } else {
    console.error(`  FAIL: Parity mismatch for ${file}`);
    printInlineDiff(diff.beforeDom, diff.afterDom ?? "");
    parityMismatches++;
  }
}

const failures = parityMismatches + missingJsCapture;

if (pyFiles.length === 0) {
  console.log("No Python DOM files found. Nothing to compare.");
}

console.log(
  `\nResults: ${passed} passed, ${parityMismatches} parity mismatches, ${missingJsCapture} missing JS capture, ${exemptSkipped} export-exempt skipped`
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
    { ...prior, passed, parityMismatches, missingJsCapture },
    null,
    2
  )
);

if (failures > 0) {
  console.error(
    `\n${failures} parity failure(s). Python DOM output does not match the JS capture.`
  );
  process.exit(1);
}

if (pyFiles.length === 0) {
  // Capture failed entirely — nothing to compare. Don't claim parity
  // passed; the capture script's exit code already signaled the failure.
  process.exit(0);
}

console.log("\nPython DOM parity check passed.");
