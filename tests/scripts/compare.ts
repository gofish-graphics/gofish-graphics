/**
 * Compare DOM snapshots:
 *   1. Regression check  — JS DOM (tmp/js/) vs stored baselines (__snapshots__/dom/)
 *   2. Parity check      — Python DOM (tmp/python/) vs JS DOM (tmp/js/)
 *
 * Flags:
 *   --js-only   Skip parity check (useful when Python stories aren't ready)
 *
 * Exit code 0 = all pass, 1 = any failure.
 * On failure, runs diff-report to generate tmp/diff-report.html.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from "fs";
import { join, relative } from "path";
import { execSync } from "child_process";
import { getSnapshotBranchName, pullSnapshots } from "./snapshot-branch.js";
import { storyToPath } from "./path-mapping.js";

const ROOT = join(import.meta.dirname, "../..");
const BASELINE_DIR = join(ROOT, "__snapshots__/dom");
const JS_DIR = join(import.meta.dirname, "../tmp/js");
const PYTHON_DIR = join(import.meta.dirname, "../tmp/python");
const TESTS_DIR = join(import.meta.dirname, "..");
const SUMMARY_PATH = join(import.meta.dirname, "../tmp/diff-summary.json");

const jsOnly = process.argv.includes("--js-only");

// Per-export parity exemptions (`file.stories.tsx::ExportName` lines in
// .python-sync-exempt). A file-level exemption already skips capture entirely
// (see capture-python-dom.ts), so its DOM never reaches the parity check. But a
// per-export exemption still gets captured + IR-validated — we just must not
// byte-gate it (e.g. CroissantStack: the Python port renders identically but
// can't reproduce the JS croissant recipe's per-slice spacer rects through the
// flat IR cut expansion). Build the set of exempt DOM paths so checkParity can
// skip them, mirroring what a file-level exemption achieves: validated, not
// byte-gated.
function loadExportExemptParityPaths(): Set<string> {
  const exempt = new Set<string>();
  const exemptFile = join(TESTS_DIR, ".python-sync-exempt");
  if (!existsSync(exemptFile)) return exempt;
  for (const raw of readFileSync(exemptFile, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf("::");
    if (sep === -1) continue; // file-level — handled at capture time
    const jsFile = line.slice(0, sep);
    const exportName = line.slice(sep + 2);
    // The DOM path is keyed by the Storybook title + export name, shared by JS
    // and Python capture (see path-mapping.storyToPath).
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively list .html files under a directory. */
function listHtmlFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...listHtmlFiles(join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".html")) {
      results.push(rel);
    }
  }
  return results;
}

interface Failure {
  kind: "regression" | "parity" | "missing-baseline";
  path: string;
  expected?: string;
  actual?: string;
}

// ---------------------------------------------------------------------------
// Regression check: JS vs baselines
// ---------------------------------------------------------------------------

function checkRegressions(): Failure[] {
  const failures: Failure[] = [];
  const jsFiles = listHtmlFiles(JS_DIR);

  for (const file of jsFiles) {
    const baselinePath = join(BASELINE_DIR, file);
    const jsPath = join(JS_DIR, file);
    const jsContent = readFileSync(jsPath, "utf-8");

    if (!existsSync(baselinePath)) {
      failures.push({
        kind: "missing-baseline",
        path: file,
        actual: jsContent,
      });
      continue;
    }

    const baselineContent = readFileSync(baselinePath, "utf-8");
    if (jsContent !== baselineContent) {
      failures.push({
        kind: "regression",
        path: file,
        expected: baselineContent,
        actual: jsContent,
      });
    }
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Parity check: Python vs JS
// ---------------------------------------------------------------------------

function checkParity(): Failure[] {
  const failures: Failure[] = [];
  const pythonFiles = listHtmlFiles(PYTHON_DIR);

  for (const file of pythonFiles) {
    // Skip per-export parity-exempt stories: they're captured + IR-validated
    // but intentionally not byte-identical to the JS DOM (.python-sync-exempt
    // `file::Export` entries). `file` is "<dom-path>.html".
    if (exportExemptParityPaths.has(file.replace(/\.html$/, ""))) {
      console.log(`  Skipping parity for exempt export: ${file}`);
      continue;
    }

    const jsPath = join(JS_DIR, file);
    const pyPath = join(PYTHON_DIR, file);
    const pyContent = readFileSync(pyPath, "utf-8");

    if (!existsSync(jsPath)) {
      // No matching JS story — might be fine, just warn
      console.warn(`  Warning: Python story ${file} has no JS counterpart`);
      continue;
    }

    const jsContent = readFileSync(jsPath, "utf-8");
    if (pyContent !== jsContent) {
      failures.push({
        kind: "parity",
        path: file,
        expected: jsContent,
        actual: pyContent,
      });
    }
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

  const rCount = regressions.filter((f) => f.kind === "regression").length;
  const mCount = regressions.filter(
    (f) => f.kind === "missing-baseline"
  ).length;
  const pCount = parityFailures.length;

  // Print summary
  if (rCount > 0) {
    console.log(`  ${rCount} regression(s) detected`);
    for (const f of regressions.filter((f) => f.kind === "regression")) {
      console.log(`    - ${f.path}`);
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

  const allFailures = [...regressions, ...parityFailures];

  // Always emit a structured summary so downstream tooling (CI status
  // descriptions, the review site) can render counts without re-parsing
  // logs.
  writeFileSync(
    SUMMARY_PATH,
    JSON.stringify(
      { regressions: rCount, newStories: mCount, parityFailures: pCount },
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
