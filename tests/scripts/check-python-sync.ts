/**
 * check-python-sync.ts
 *
 * Validates Python story synchronization with JS stories.
 *
 * Two modes:
 *   - default (delta): checks only the JS stories changed between base-ref and HEAD.
 *     Used in PRs to catch missing/stale Python counterparts on touched files.
 *   - --all (full coverage): walks every JS story and checks for a Python
 *     counterpart. Exempt entries become *warnings* (not silent passes) so
 *     the gap is visible. Missing-and-not-exempt is a hard error.
 *
 * Usage:
 *   tsx scripts/check-python-sync.ts [base-ref]    # delta mode (default)
 *   tsx scripts/check-python-sync.ts --all          # full coverage
 *
 *   base-ref in delta mode defaults to BASE_REF env var or "origin/main".
 *
 * Writes results to tests/tmp/sync-results.json for parity review site.
 */

import { execSync } from "child_process";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
} from "fs";
import { join, dirname, relative } from "path";
import { mapJsToPython } from "./path-mapping.js";
export { mapJsToPython } from "./path-mapping.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SCRIPTS_DIR = import.meta.dirname;
const TESTS_DIR = dirname(SCRIPTS_DIR);
const ROOT_DIR = dirname(TESTS_DIR);
const EXEMPT_FILE = join(TESTS_DIR, ".python-sync-exempt");
const OUT_DIR = join(TESTS_DIR, "tmp");
const OUT_FILE = join(OUT_DIR, "sync-results.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  jsFile: string;
  pythonFile: string;
  changeType: "added" | "deleted" | "modified";
  status: "ok" | "error" | "warning" | "exempt";
  message: string;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function gitDiff(filter: string, baseRef: string): string[] {
  try {
    const output = execSync(
      `git diff --name-only --diff-filter=${filter} "${baseRef}"...HEAD`,
      { cwd: ROOT_DIR, encoding: "utf-8" }
    );
    return output
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Exempt list
// ---------------------------------------------------------------------------

interface ExemptSet {
  files: Set<string>;
  // file path → set of exempt JS export names (camelCase, as declared)
  exports: Map<string, Set<string>>;
}

function loadExemptSet(): ExemptSet {
  const exempt: ExemptSet = { files: new Set(), exports: new Map() };
  if (!existsSync(EXEMPT_FILE)) return exempt;
  const lines = readFileSync(EXEMPT_FILE, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  for (const line of lines) {
    // Per-export entry: `path/to/file.stories.tsx::ExportName`
    const sep = line.indexOf("::");
    if (sep === -1) {
      exempt.files.add(line);
      continue;
    }
    const file = line.slice(0, sep);
    const exp = line.slice(sep + 2);
    if (!exempt.exports.has(file)) exempt.exports.set(file, new Set());
    exempt.exports.get(file)!.add(exp);
  }
  return exempt;
}

function isFileExempt(set: ExemptSet, file: string): boolean {
  return set.files.has(file);
}

function isExportExempt(
  set: ExemptSet,
  file: string,
  exportName: string
): boolean {
  if (set.files.has(file)) return true;
  return set.exports.get(file)?.has(exportName) === true;
}

// ---------------------------------------------------------------------------
// Spec-neutral change detection.
//
// A modified JS story whose spec-relevant content is unchanged does not
// require a Python update. Two kinds of difference are spec-neutral:
//
//   - **Storybook chrome** — story-level `title`, `tags`, and `parameters`
//     (e.g. the gallery annotation) are presentation metadata. Python stories
//     key off the file path and `story_*` function name, not these.
//   - **API-alias casing** — the v3 fluent surface is lowercase-only
//     (`chart`, `layer`); the capitalized aliases `Chart` / `Layer` resolve to
//     the same factories (and `Chart` was removed outright). A pure
//     `Chart`→`chart` / `Layer`→`layer` rename in a JS story has no Python
//     counterpart, since Python was always lowercase. Canonicalizing the case
//     before comparing folds those renames out.
// ---------------------------------------------------------------------------

function stripStorybookChrome(source: string): string {
  const out: string[] = [];
  let depth = 0; // > 0 while inside a `parameters: {...}` block
  for (const line of source.split("\n")) {
    if (depth > 0) {
      depth += (line.match(/\{/g) ?? []).length;
      depth -= (line.match(/\}/g) ?? []).length;
      continue;
    }
    if (/^\s*tags:\s*\[[^\]]*\],?\s*$/.test(line)) continue;
    if (/^\s*title:\s*.*$/.test(line)) continue; // `meta.title` (nav path)
    if (/^\s*parameters:\s*\{/.test(line)) {
      depth =
        (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Fold the lowercased v3 aliases so a pure casing rename is spec-neutral. */
function canonicalizeApiCasing(source: string): string {
  return source.replace(/\bChart\b/g, "chart").replace(/\bLayer\b/g, "layer");
}

/** True when the file's change between baseRef's merge-base and HEAD touches
 * only spec-neutral content (Storybook chrome and/or `Chart`/`Layer` casing). */
function isSpecNeutralChange(jsFile: string, baseRef: string): boolean {
  try {
    const mergeBase = execSync(`git merge-base "${baseRef}" HEAD`, {
      cwd: ROOT_DIR,
      encoding: "utf-8",
    }).trim();
    const baseContent = execSync(`git show ${mergeBase}:"${jsFile}"`, {
      cwd: ROOT_DIR,
      encoding: "utf-8",
      maxBuffer: 16 * 1024 * 1024,
    });
    const headContent = readFileSync(join(ROOT_DIR, jsFile), "utf-8");
    const normalize = (s: string) =>
      canonicalizeApiCasing(stripStorybookChrome(s));
    return normalize(baseContent) === normalize(headContent);
  } catch {
    return false; // can't prove it — fall through to the strict check
  }
}

// ---------------------------------------------------------------------------
// Walk all JS stories under packages/gofish-graphics/stories/.
// ---------------------------------------------------------------------------

function walkJsStories(): string[] {
  const root = join(ROOT_DIR, "packages/gofish-graphics/stories");
  const out: string[] = [];
  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".stories.tsx")) {
        out.push(relative(ROOT_DIR, p));
      }
    }
  }
  walk(root);
  return out.sort();
}

// ---------------------------------------------------------------------------
// Per-StoryObj coverage helpers.
// ---------------------------------------------------------------------------

function camelToSnake(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/^_/, "")
    .toLowerCase();
}

/** Extract `export const Foo: StoryObj` names from a JS story file. */
function readJsStoryExports(absPath: string): string[] {
  const content = readFileSync(absPath, "utf-8");
  return [...content.matchAll(/^export\s+const\s+(\w+)\s*:\s*StoryObj/gm)].map(
    (m) => m[1]
  );
}

/** Extract `def story_foo` names from a Python parity test file. */
function readPyStoryFns(absPath: string): Set<string> {
  if (!existsSync(absPath)) return new Set();
  const content = readFileSync(absPath, "utf-8");
  return new Set(
    [...content.matchAll(/^def\s+(story_\w+)/gm)].map((m) => m[1])
  );
}

// ---------------------------------------------------------------------------
// Full-coverage mode: walk every JS story file *and* every JS StoryObj
// export, report missing per-export.
//
// Coverage is per-StoryObj — a JS file with 10 exports is only "OK" when
// the matching Python file has 10 corresponding `story_*` functions.
// File-level coverage was misleading: most JS story files export several
// permutations (e.g. axis variants), and a Python file with one
// `story_default` covers only 1 of N.
// ---------------------------------------------------------------------------

function runFullCoverage(): number {
  console.log("Running full-coverage Python parity check (per-StoryObj)...\n");
  const exemptSet = loadExemptSet();
  const jsStories = walkJsStories();
  const results: SyncResult[] = [];

  let exportsTotal = 0;
  let exportsOk = 0;
  let exportsMissing = 0;
  let exportsExempt = 0;
  let filesError = 0;
  let filesWarn = 0;

  for (const jsFile of jsStories) {
    const pythonFile = mapJsToPython(jsFile);
    const pythonAbs = join(ROOT_DIR, pythonFile);
    const fileExempt = isFileExempt(exemptSet, jsFile);
    const jsExports = readJsStoryExports(join(ROOT_DIR, jsFile));
    exportsTotal += jsExports.length;

    if (fileExempt) {
      // Surface as a warning — exempts are not silent passes anymore. The
      // file should be a punch list of "not yet supported", not a hidden
      // dump where things go to be forgotten.
      const pythonExists = existsSync(pythonAbs);
      results.push({
        jsFile,
        pythonFile,
        changeType: "modified",
        status: "warning",
        message: pythonExists
          ? `Exempt but Python counterpart exists — consider removing exemption`
          : `Exempt: Python counterpart not yet implemented (${pythonFile})`,
      });
      console.warn(
        `  WARN (exempt): ${jsFile} (${jsExports.length} export(s))`
      );
      exportsExempt += jsExports.length;
      filesWarn++;
      continue;
    }

    const pyFns = readPyStoryFns(pythonAbs);
    const missing: string[] = [];
    const exemptedExports: string[] = [];
    for (const e of jsExports) {
      const expected = `story_${camelToSnake(e)}`;
      if (pyFns.has(expected)) {
        exportsOk++;
      } else if (isExportExempt(exemptSet, jsFile, e)) {
        exemptedExports.push(e);
        exportsExempt++;
      } else {
        missing.push(`${e} → ${expected}`);
        exportsMissing++;
      }
    }

    if (missing.length === 0) {
      results.push({
        jsFile,
        pythonFile,
        changeType: "modified",
        status: "ok",
        message:
          exemptedExports.length > 0
            ? `${jsExports.length - exemptedExports.length}/${jsExports.length} export(s) covered (${exemptedExports.length} exempt)`
            : `All ${jsExports.length} export(s) covered`,
      });
      continue;
    }

    results.push({
      jsFile,
      pythonFile,
      changeType: "modified",
      status: "error",
      message:
        `Missing ${missing.length}/${jsExports.length} Python ` +
        `counterpart(s) in ${pythonFile}: ${missing.join(", ")}`,
    });
    console.error(
      `  ERROR: ${jsFile} (${missing.length}/${jsExports.length} missing in ${pythonFile})`
    );
    for (const m of missing) console.error(`           ${m}`);
    filesError++;
  }

  console.log(
    `\nFiles:    ${jsStories.length}  (${filesError} with errors, ${filesWarn} exempt-warn)\n` +
      `Exports:  ${exportsTotal}  ` +
      `OK: ${exportsOk}  ` +
      `Missing: ${exportsMissing}  ` +
      `Exempt: ${exportsExempt}`
  );

  // Persist to the same results file the review site uses.
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nResults written to ${OUT_FILE}`);

  // Also merge counts into parity-summary.json so the CI status
  // description can surface coverage info alongside capture/compare
  // stats. Merge (don't overwrite) — capture-python and compare-python
  // also write their counts here.
  const paritySummaryPath = join(OUT_DIR, "parity-summary.json");
  let priorSummary: Record<string, unknown> = {};
  if (existsSync(paritySummaryPath)) {
    try {
      priorSummary = JSON.parse(readFileSync(paritySummaryPath, "utf-8"));
    } catch {
      /* overwrite on parse failure */
    }
  }
  writeFileSync(
    paritySummaryPath,
    JSON.stringify(
      {
        ...priorSummary,
        coverageFilesFail: filesError,
        coverageFilesExempt: filesWarn,
        coverageExportsTotal: exportsTotal,
        coverageExportsCovered: exportsOk,
        coverageExportsMissing: exportsMissing,
        coverageExportsExempt: exportsExempt,
      },
      null,
      2
    )
  );

  if (filesError > 0) {
    console.error(
      `\n${exportsMissing} JS StoryObj export(s) have no Python counterpart and are not on the exempt list.`
    );
    return 1;
  }
  if (filesWarn > 0) {
    console.log(
      `\n${filesWarn} exempt JS story file(s) — visible above as a reminder.`
    );
  }
  console.log("\nFull-coverage check passed.");
  return 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (process.argv.includes("--all")) {
  process.exit(runFullCoverage());
}

const baseRef = process.argv[2] ?? process.env.BASE_REF ?? "origin/main";

console.log(`Checking Python story sync against ${baseRef}...`);

const exemptSet = loadExemptSet();

const addedJs = gitDiff("A", baseRef).filter((f) =>
  f.match(/^packages\/gofish-graphics\/stories\/.*\.stories\.tsx$/)
);
const deletedJs = gitDiff("D", baseRef).filter((f) =>
  f.match(/^packages\/gofish-graphics\/stories\/.*\.stories\.tsx$/)
);
const modifiedJs = gitDiff("M", baseRef).filter((f) =>
  f.match(/^packages\/gofish-graphics\/stories\/.*\.stories\.tsx$/)
);
const allChangedFiles = new Set(gitDiff("ACDMRT", baseRef));

const results: SyncResult[] = [];
let errors = 0;

// ---- Coverage: added JS stories ----
for (const jsFile of addedJs) {
  const pythonFile = mapJsToPython(jsFile);

  if (isFileExempt(exemptSet, jsFile)) {
    results.push({
      jsFile,
      pythonFile,
      changeType: "added",
      status: "exempt",
      message: `Exempt from Python parity requirement`,
    });
    console.log(`  EXEMPT: ${jsFile}`);
    continue;
  }

  const pythonExists = existsSync(join(ROOT_DIR, pythonFile));
  const pythonAdded = allChangedFiles.has(pythonFile);

  if (!pythonExists && !pythonAdded) {
    results.push({
      jsFile,
      pythonFile,
      changeType: "added",
      status: "error",
      message: `JS story added but no Python counterpart created (expected ${pythonFile})`,
    });
    console.error(`  ERROR: ${jsFile} added but ${pythonFile} not created`);
    errors++;
  } else {
    results.push({
      jsFile,
      pythonFile,
      changeType: "added",
      status: "ok",
      message: `Python counterpart present`,
    });
    console.log(`  OK: ${jsFile} ↔ ${pythonFile}`);
  }
}

// ---- Coverage: deleted JS stories ----
for (const jsFile of deletedJs) {
  const pythonFile = mapJsToPython(jsFile);

  if (isFileExempt(exemptSet, jsFile)) {
    results.push({
      jsFile,
      pythonFile,
      changeType: "deleted",
      status: "exempt",
      message: `Exempt from Python parity requirement`,
    });
    continue;
  }

  const pythonStillExists = existsSync(join(ROOT_DIR, pythonFile));
  const pythonDeleted = !pythonStillExists || allChangedFiles.has(pythonFile);

  if (pythonStillExists && !allChangedFiles.has(pythonFile)) {
    results.push({
      jsFile,
      pythonFile,
      changeType: "deleted",
      status: "error",
      message: `JS story deleted but Python counterpart still exists (${pythonFile})`,
    });
    console.error(`  ERROR: ${jsFile} deleted but ${pythonFile} still exists`);
    errors++;
  } else if (existsSync(join(ROOT_DIR, pythonFile)) || pythonDeleted) {
    results.push({
      jsFile,
      pythonFile,
      changeType: "deleted",
      status: "ok",
      message: `Python counterpart also deleted`,
    });
    console.log(`  OK: ${jsFile} deleted ↔ ${pythonFile} deleted`);
  }
}

// ---- Spec sync: modified JS stories ----
for (const jsFile of modifiedJs) {
  const pythonFile = mapJsToPython(jsFile);

  if (isFileExempt(exemptSet, jsFile)) {
    results.push({
      jsFile,
      pythonFile,
      changeType: "modified",
      status: "exempt",
      message: `Exempt from Python parity requirement`,
    });
    console.log(`  EXEMPT: ${jsFile}`);
    continue;
  }

  const pythonExists = existsSync(join(ROOT_DIR, pythonFile));

  if (!pythonExists) {
    // Warning only — coverage check handles missing Python files
    results.push({
      jsFile,
      pythonFile,
      changeType: "modified",
      status: "warning",
      message: `JS story modified but no Python counterpart exists`,
    });
    console.warn(
      `  WARNING: ${jsFile} modified but ${pythonFile} does not exist`
    );
    continue;
  }

  const pythonModified = allChangedFiles.has(pythonFile);

  if (!pythonModified) {
    if (isSpecNeutralChange(jsFile, baseRef)) {
      results.push({
        jsFile,
        pythonFile,
        changeType: "modified",
        status: "ok",
        message: `Only spec-neutral content changed (Storybook chrome / Chart·Layer casing) — no Python update needed`,
      });
      console.log(`  OK (spec-neutral): ${jsFile}`);
      continue;
    }
    results.push({
      jsFile,
      pythonFile,
      changeType: "modified",
      status: "error",
      message: `JS story modified but Python counterpart was not updated (${pythonFile})`,
    });
    console.error(
      `  ERROR: ${jsFile} changed but ${pythonFile} was not updated`
    );
    errors++;
  } else {
    results.push({
      jsFile,
      pythonFile,
      changeType: "modified",
      status: "ok",
      message: `Python counterpart also updated`,
    });
    console.log(`  OK: ${jsFile} ↔ ${pythonFile}`);
  }
}

if (results.length === 0) {
  console.log("No JS story files changed. Python sync check passed.");
}

// ---------------------------------------------------------------------------
// Write sync-results.json
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
console.log(`\nSync results written to ${OUT_FILE}`);

// ---------------------------------------------------------------------------
// Exit
// ---------------------------------------------------------------------------

if (errors > 0) {
  console.error(
    `\n${errors} Python story sync error(s). Update Python stories to match JS changes.`
  );
  process.exit(1);
}

console.log("\nPython sync check passed.");
