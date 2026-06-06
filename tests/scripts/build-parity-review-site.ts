/**
 * Build a read-only static Cloudflare Pages parity review site.
 *
 * Shows JS vs Python source code side-by-side for each story pair,
 * plus DOM diffs for parity failures.
 *
 * Output: tests/tmp/parity-review-site/
 * Deploy with:
 *   wrangler pages deploy tests/tmp/parity-review-site \
 *     --project-name=gofish-parity-review \
 *     --branch=<branch>
 *
 * Environment variables:
 *   REVIEW_REPO   - GitHub repo (e.g. "owner/repo")
 *   REVIEW_BRANCH - Branch name
 *   REVIEW_SHA    - Commit SHA
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  cpSync,
} from "fs";
import { join, dirname } from "path";
import {
  collectParityDiffs,
  formatDomDiff,
  type DiffEntry,
} from "./diff-utils.js";
import { mapJsToPython, titleToStoryId } from "./path-mapping.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SCRIPTS_DIR = import.meta.dirname;
const TESTS_DIR = dirname(SCRIPTS_DIR);
const ROOT_DIR = dirname(TESTS_DIR);
const OUT_DIR = join(TESTS_DIR, "tmp/parity-review-site");
const STORIES_DIR = join(ROOT_DIR, "packages/gofish-graphics/stories");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function write(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function readOptional(p: string): string | null {
  try {
    return readFileSync(p, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Builds a map from Storybook story ID → relative JS file path.
 * Story ID is the title converted to kebab-case, e.g.
 *   "Forward Syntax V3/Bar/Basic" → "forward-syntax-v3/bar/basic"
 */
function buildStoryIndex(): Map<string, string> {
  const index = new Map<string, string>();
  function scan(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (entry.name.endsWith(".stories.tsx")) {
        const source = readOptional(full);
        if (!source) continue;
        const m = source.match(/title:\s*["']([^"']+)["']/);
        if (!m) continue;
        const storyId = titleToStoryId(m[1]);
        index.set(
          storyId,
          "packages/gofish-graphics/stories/" +
            full.slice(STORIES_DIR.length + 1)
        );
      }
    }
  }
  scan(STORIES_DIR);
  return index;
}

/** Strips imports, type declarations, and Storybook meta boilerplate from a JS story. */
function extractJsCode(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return (
        !t.startsWith("import ") &&
        !t.startsWith("const meta") &&
        t !== "export default meta;" &&
        !t.startsWith("type ") &&
        !t.startsWith("interface ") &&
        !t.includes("initializeContainer()") &&
        t !== "return container;"
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strips imports and module-level docstrings from a Python story. */
function extractPythonCode(source: string): string {
  const lines = source.split("\n");
  const result: string[] = [];
  let inDocstring = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("from ") || t.startsWith("import ")) continue;
    if (t.startsWith('"""') || t.startsWith("'''")) {
      const delim = t.startsWith('"""') ? '"""' : "'''";
      const rest = t.slice(3);
      if (rest.includes(delim)) {
        // Single-line docstring — skip
        continue;
      }
      inDocstring = !inDocstring;
      continue;
    }
    if (inDocstring) continue;
    result.push(line);
  }
  return result
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Derives the Python story file path from a DOM snapshot id.
 * e.g. "forward-syntax-v3/bar/basic--default" → "tests/python-stories/forward-syntax-v3/bar/test_basic.py"
 */
function domIdToPythonFile(id: string): string {
  const storyId = id.replace(/--[^/]*$/, "");
  const lastSlash = storyId.lastIndexOf("/");
  const dir = lastSlash >= 0 ? storyId.slice(0, lastSlash) : "";
  const base = (
    lastSlash >= 0 ? storyId.slice(lastSlash + 1) : storyId
  ).replace(/-/g, "_");
  return `tests/python-stories/${dir}/test_${base}.py`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportEntry {
  /** Camel-cased export name from the JS file, e.g. "Default", "AxesXOnly". */
  name: string;
  /** Story-level id, e.g. "forward-syntax-v3/bar/basic--default". Matches
   * the path produced by capture-python's story-discovery + DOM diffs. */
  id: string;
  /** "story_default", "story_axes_xonly" — what we look for in Python. */
  expected: string;
  status: "pass" | "fail" | "warning";
  /** Specific reason for the status; lets the sidebar show a breakdown
   * like "51 missing, 9 capture failed" instead of one bucket. */
  category:
    | "covered"
    | "missing"
    | "exempt"
    | "capture-failed"
    | "capture-skipped"
    | "parity-mismatch";
  message: string;
  hasDomDiff: boolean;
  hasScreenshots: boolean;
}

interface StoryPair {
  /** File-level id derived from the Storybook title, e.g.
   * "forward-syntax-v3/bar/basic". Shares a prefix with each child's id. */
  id: string;
  jsFile: string;
  pythonFile: string;
  /** "coverage" | "sync" | "dom" | "capture" */
  checkType: string;
  /** Aggregate over children: "pass" if all pass, "warning" if any
   * warning and none fail, "fail" if any fail. */
  status: "pass" | "fail" | "warning";
  message: string;
  /** Aggregate flags — true if any child has a DOM diff / screenshot. */
  hasDomDiff: boolean;
  hasScreenshots: boolean;
  exports: ExportEntry[];
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

console.log("Building parity review site...");

// Build story index: storyId → relative JS file path
const storyIndex = buildStoryIndex();
console.log(`  ${storyIndex.size} JS story file(s) indexed`);

// Collect parity diffs
const parityDiffs: DiffEntry[] = collectParityDiffs();
console.log(`  ${parityDiffs.length} DOM parity diff(s) found`);

// ---------------------------------------------------------------------------
// Assemble story pairs — all stories, not just PR-changed ones
// ---------------------------------------------------------------------------

const pairs: StoryPair[] = [];
const pairById = new Map<string, StoryPair>();

function camelToSnake(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/^_/, "")
    .toLowerCase();
}

/** JS export name → kebab-case path segment. */
function jsExportToKebab(s: string): string {
  return camelToSnake(s).replace(/_/g, "-");
}

// Mirror the per-StoryObj logic in check-python-sync.ts so the viewer's
// file-level counts line up with what the `--all` check reports.
function readJsStoryExports(absPath: string): string[] {
  const content = readOptional(absPath);
  if (!content) return [];
  return [...content.matchAll(/^export\s+const\s+(\w+)\s*:\s*StoryObj/gm)].map(
    (m) => m[1]
  );
}

function readPyStoryFns(absPath: string): Set<string> {
  if (!existsSync(absPath)) return new Set();
  const content = readOptional(absPath);
  if (!content) return new Set();
  return new Set(
    [...content.matchAll(/^def\s+(story_\w+)/gm)].map((m) => m[1])
  );
}

// Load exempt list — entries become viewer warnings, not silent passes
// (matching the --all check's behavior). Supports both whole-file entries
// and per-export entries with `path/to/file.stories.tsx::ExportName`.
interface ExemptSet {
  files: Set<string>;
  exports: Map<string, Set<string>>;
}
function loadExemptSet(): ExemptSet {
  const exempt: ExemptSet = { files: new Set(), exports: new Map() };
  const exemptFile = join(TESTS_DIR, ".python-sync-exempt");
  if (!existsSync(exemptFile)) return exempt;
  for (const raw of readFileSync(exemptFile, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf("::");
    if (sep === -1) {
      exempt.files.add(line);
    } else {
      const file = line.slice(0, sep);
      const exp = line.slice(sep + 2);
      if (!exempt.exports.has(file)) exempt.exports.set(file, new Set());
      exempt.exports.get(file)!.add(exp);
    }
  }
  return exempt;
}
const exemptSet = loadExemptSet();
const isFileExempt = (file: string) => exemptSet.files.has(file);
const isExportExempt = (file: string, exp: string) =>
  exemptSet.files.has(file) || exemptSet.exports.get(file)?.has(exp) === true;

let exportsTotal = 0;
let exportsCovered = 0;
let exportsMissing = 0;
let exportsExempt = 0;
let exportsCaptureFailed = 0;
let exportsCaptureSkipped = 0;
let exportsParityMismatch = 0;

// From all indexed JS stories. Use the Storybook-title-derived id as the
// file-level pair id; DOM-diff / capture-result ids share this prefix.
for (const [fileId, jsFile] of storyIndex) {
  if (pairById.has(fileId)) continue;

  const pythonFile = mapJsToPython(jsFile);
  const pythonAbs = join(ROOT_DIR, pythonFile);
  const fileExempt = isFileExempt(jsFile);

  const jsExports = readJsStoryExports(join(ROOT_DIR, jsFile));
  exportsTotal += jsExports.length;

  const pyFns = fileExempt ? new Set<string>() : readPyStoryFns(pythonAbs);
  const exports: ExportEntry[] = jsExports.map((name) => {
    const expected = `story_${camelToSnake(name)}`;
    const exportId = `${fileId}--${jsExportToKebab(name)}`;
    if (fileExempt || isExportExempt(jsFile, name)) {
      exportsExempt++;
      return {
        name,
        id: exportId,
        expected,
        status: "warning",
        category: "exempt",
        message: "Exempt — not yet implemented in Python",
        hasDomDiff: false,
        hasScreenshots: false,
      };
    }
    if (pyFns.has(expected)) {
      exportsCovered++;
      return {
        name,
        id: exportId,
        expected,
        status: "pass",
        category: "covered",
        message: "Python counterpart present",
        hasDomDiff: false,
        hasScreenshots: false,
      };
    }
    exportsMissing++;
    return {
      name,
      id: exportId,
      expected,
      status: "fail",
      category: "missing",
      message: `Missing Python counterpart (expected ${expected} in ${pythonFile})`,
      hasDomDiff: false,
      hasScreenshots: false,
    };
  });

  let fileStatus: "pass" | "fail" | "warning";
  let fileMessage: string;
  if (fileExempt) {
    fileStatus = "warning";
    fileMessage =
      jsExports.length > 0
        ? `Exempt — ${jsExports.length} export(s) not yet implemented in Python`
        : "Exempt from Python parity";
  } else if (jsExports.length === 0) {
    fileStatus = "warning";
    fileMessage = "No StoryObj exports detected";
  } else {
    const fails = exports.filter((e) => e.status === "fail").length;
    if (fails === 0) {
      fileStatus = "pass";
      fileMessage = `All ${jsExports.length} export(s) covered`;
    } else {
      fileStatus = "fail";
      const failNames = exports
        .filter((e) => e.status === "fail")
        .map((e) => e.name);
      const preview = failNames.slice(0, 3).join(", ");
      const more =
        failNames.length > 3 ? `, +${failNames.length - 3} more` : "";
      fileMessage = `${fails}/${jsExports.length} export(s) missing: ${preview}${more}`;
    }
  }

  const pair: StoryPair = {
    id: fileId,
    jsFile,
    pythonFile,
    checkType: "coverage",
    status: fileStatus,
    message: fileMessage,
    hasDomDiff: false,
    hasScreenshots: false,
    exports,
  };
  pairs.push(pair);
  pairById.set(fileId, pair);
}

// Overlay DOM parity diffs onto specific exports. diff.path is e.g.
// "forward-syntax-v3/bar/basic--default.html"; split into file id +
// export suffix, find the matching pair + export entry.
for (const diff of parityDiffs) {
  const id = diff.path.replace(/\.html$/, "");
  const sep = id.lastIndexOf("--");
  const fileId = sep > 0 ? id.slice(0, sep) : id;
  const exportSlug = sep > 0 ? id.slice(sep + 2) : null;

  const pair = pairById.get(fileId);
  const domMessage =
    diff.beforeDom !== null
      ? "DOM output does not match JS baseline"
      : "No JS baseline exists yet";
  const hasDomDiff = diff.beforeDom !== null;
  const hasScreenshots = diff.afterScreenshotPath !== null;

  if (pair && exportSlug) {
    const exp =
      pair.exports.find((e) => e.id === id) ??
      // Slug-based fallback (case-insensitive). Lets DOM diffs attach
      // even when export name casing differs.
      pair.exports.find((e) => jsExportToKebab(e.name) === exportSlug);
    if (exp) {
      // Decrement whatever category counter the original status used
      // before overwriting it with parity-mismatch.
      if (exp.category === "covered") exportsCovered--;
      else if (exp.category === "missing") exportsMissing--;
      else if (exp.category === "exempt") exportsExempt--;
      else if (exp.category === "capture-failed") exportsCaptureFailed--;
      else if (exp.category === "capture-skipped") exportsCaptureSkipped--;
      exportsParityMismatch++;
      exp.status = "fail";
      exp.category = "parity-mismatch";
      exp.message = domMessage;
      exp.hasDomDiff = hasDomDiff;
      exp.hasScreenshots = hasScreenshots;
      pair.hasDomDiff = pair.hasDomDiff || hasDomDiff;
      pair.hasScreenshots = pair.hasScreenshots || hasScreenshots;
      pair.checkType = "parity";
      pair.status = "fail";
      continue;
    }
  }

  // Fallback: no matching file pair / export. Create a standalone
  // entry so the diff still appears (rare — generally indicates an
  // orphan snapshot whose JS story was deleted).
  if (!pairById.has(fileId)) {
    const jsFile =
      storyIndex.get(fileId) ??
      `packages/gofish-graphics/stories/${id}.stories.tsx`;
    const orphan: StoryPair = {
      id: fileId,
      jsFile,
      pythonFile: domIdToPythonFile(id),
      checkType: "parity",
      status: "fail",
      message: "Orphan DOM diff (no JS story file)",
      hasDomDiff,
      hasScreenshots,
      exports: [
        {
          name: exportSlug ?? "default",
          id,
          expected: `story_${(exportSlug ?? "default").replace(/-/g, "_")}`,
          status: "fail",
          category: "parity-mismatch",
          message: domMessage,
          hasDomDiff,
          hasScreenshots,
        },
      ],
    };
    exportsTotal++;
    exportsParityMismatch++;
    pairs.push(orphan);
    pairById.set(fileId, orphan);
  }
}

// ---------------------------------------------------------------------------
// Overlay capture results (capture-python-dom.ts writes capture-results.json
// with per-story failure/skip records). Without this, capture failures look
// like passes in the viewer because the matching Python file *exists* — but
// no DOM was ever produced. Skips (e.g. LayerBuilder unsupported) similarly
// need to be visible warnings, not silent passes.
// ---------------------------------------------------------------------------

interface CaptureResult {
  id: string;
  story: string;
  reason: string;
}
interface CaptureResults {
  captured: string[];
  failed: CaptureResult[];
  skipped: CaptureResult[];
}

const captureResultsPath = join(TESTS_DIR, "tmp/python/capture-results.json");
const captureResults: CaptureResults | null = (() => {
  if (!existsSync(captureResultsPath)) {
    console.log(`  capture-results.json: NOT FOUND at ${captureResultsPath}`);
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(captureResultsPath, "utf-8"));
    console.log(
      `  capture-results.json: ${parsed.captured?.length ?? 0} captured, ` +
        `${parsed.failed?.length ?? 0} failed, ${parsed.skipped?.length ?? 0} skipped`
    );
    return parsed;
  } catch (err) {
    console.log(
      `  capture-results.json: PARSE FAILURE (${err instanceof Error ? err.message : err})`
    );
    return null;
  }
})();

if (captureResults) {
  const overlay = (
    record: CaptureResult,
    status: "fail" | "warning",
    label: string
  ) => {
    const id = record.id;
    const sep = id.lastIndexOf("--");
    const fileId = sep > 0 ? id.slice(0, sep) : id;
    const exportSlug = sep > 0 ? id.slice(sep + 2) : null;
    const message = `${label}: ${record.reason}`;

    const newCategory =
      status === "fail" ? "capture-failed" : "capture-skipped";

    const pair = pairById.get(fileId);
    if (pair && exportSlug) {
      const exp =
        pair.exports.find((e) => e.id === id) ??
        pair.exports.find((e) => jsExportToKebab(e.name) === exportSlug);
      if (exp) {
        // Don't downgrade an existing fail (e.g. DOM diff already
        // attached); capture is a less specific signal.
        if (exp.status !== "fail") {
          if (exp.category === "covered") exportsCovered--;
          else if (exp.category === "missing") exportsMissing--;
          else if (exp.category === "exempt") exportsExempt--;
          if (newCategory === "capture-failed") exportsCaptureFailed++;
          else if (newCategory === "capture-skipped") exportsCaptureSkipped++;
          exp.status = status;
          exp.category = newCategory;
          exp.message = message;
        }
        if (pair.status !== "fail") {
          pair.status = status;
          pair.message = message;
        }
        if (pair.checkType !== "parity") pair.checkType = "capture";
        return;
      }
    }

    // No matching file pair or export — create an orphan entry so the
    // capture record still surfaces.
    const jsFile =
      storyIndex.get(fileId) ??
      `packages/gofish-graphics/stories/${id}.stories.tsx`;
    const newPair: StoryPair = {
      id: fileId,
      jsFile,
      pythonFile: domIdToPythonFile(id),
      checkType: "capture",
      status,
      message,
      hasDomDiff: false,
      hasScreenshots: false,
      exports: [
        {
          name: exportSlug ?? "default",
          id,
          expected: `story_${(exportSlug ?? "default").replace(/-/g, "_")}`,
          status,
          category: newCategory,
          message,
          hasDomDiff: false,
          hasScreenshots: false,
        },
      ],
    };
    exportsTotal++;
    if (newCategory === "capture-failed") exportsCaptureFailed++;
    else if (newCategory === "capture-skipped") exportsCaptureSkipped++;
    pairs.push(newPair);
    pairById.set(fileId, newPair);
  };

  for (const r of captureResults.failed ?? [])
    overlay(r, "fail", "Capture failed");
  for (const r of captureResults.skipped ?? [])
    overlay(r, "warning", "Capture skipped");

  console.log(
    `  ${captureResults.failed?.length ?? 0} capture failure(s), ${captureResults.skipped?.length ?? 0} capture skip(s) overlaid`
  );
}

console.log(`  ${pairs.length} story pair(s) total`);

// ---------------------------------------------------------------------------
// Write source files and DOM diffs
// ---------------------------------------------------------------------------

for (const pair of pairs) {
  // JS source
  const jsAbsPath = join(ROOT_DIR, pair.jsFile);
  const jsRaw = readOptional(jsAbsPath);
  if (jsRaw !== null) {
    write(
      join(OUT_DIR, "data/sources/js", `${pair.id}.tsx`),
      extractJsCode(jsRaw)
    );
  }

  // Python source
  const pyAbsPath = join(ROOT_DIR, pair.pythonFile);
  const pyRaw = readOptional(pyAbsPath);
  if (pyRaw !== null) {
    write(
      join(OUT_DIR, "data/sources/python", `${pair.id}.py`),
      extractPythonCode(pyRaw)
    );
  }
}

// DOM diffs
for (const diff of parityDiffs) {
  if (diff.beforeDom !== null && diff.afterDom !== null) {
    const html = formatDomDiff(diff.beforeDom, diff.afterDom);
    write(join(OUT_DIR, "data/dom-diffs", diff.path), html);
  }
}

// ---------------------------------------------------------------------------
// data/results.json  (written before screenshots so crashes there don't lose data)
// ---------------------------------------------------------------------------

write(join(OUT_DIR, "data/results.json"), JSON.stringify(pairs, null, 2));

// ---------------------------------------------------------------------------
// Roll up export-level totals into tests/tmp/parity-summary.json so the CI
// workflow status description reflects the same numbers the viewer shows.
// Single source of truth — no recomputation in the workflow YAML.
// ---------------------------------------------------------------------------

const exportsFailures =
  exportsMissing + exportsCaptureFailed + exportsParityMismatch;
const exportsWarnings = exportsExempt + exportsCaptureSkipped;
const exportsPassed = exportsCovered;

const failParts: string[] = [];
if (exportsMissing > 0) failParts.push(`${exportsMissing} missing`);
if (exportsCaptureFailed > 0)
  failParts.push(`${exportsCaptureFailed} capture failed`);
if (exportsParityMismatch > 0)
  failParts.push(`${exportsParityMismatch} parity mismatch`);

const warnParts: string[] = [];
if (exportsExempt > 0) warnParts.push(`${exportsExempt} exempt`);
if (exportsCaptureSkipped > 0)
  warnParts.push(`${exportsCaptureSkipped} capture skipped`);

const paritySummaryPath = join(TESTS_DIR, "tmp/parity-summary.json");
let priorSummary: Record<string, unknown> = {};
if (existsSync(paritySummaryPath)) {
  try {
    priorSummary = JSON.parse(readFileSync(paritySummaryPath, "utf-8"));
  } catch {
    /* overwrite */
  }
}
writeFileSync(
  paritySummaryPath,
  JSON.stringify(
    {
      ...priorSummary,
      exportsTotal,
      exportsFailures,
      exportsFailParts: failParts,
      exportsWarnings,
      exportsWarnParts: warnParts,
      exportsPassed,
    },
    null,
    2
  )
);

// ---------------------------------------------------------------------------
// data/meta.json
// ---------------------------------------------------------------------------

const meta = {
  repo: process.env.REVIEW_REPO ?? "unknown/repo",
  branch: process.env.REVIEW_BRANCH ?? "unknown",
  sha: process.env.REVIEW_SHA ?? "unknown",
  exports: {
    total: exportsTotal,
    // status × category breakdown — viewer rolls up to "failures",
    // "warnings", "passed" totals and shows subcategories underneath.
    covered: exportsCovered,
    missing: exportsMissing,
    exempt: exportsExempt,
    captureFailed: exportsCaptureFailed,
    captureSkipped: exportsCaptureSkipped,
    parityMismatch: exportsParityMismatch,
  },
};

write(join(OUT_DIR, "data/meta.json"), JSON.stringify(meta, null, 2));

// Screenshots (non-fatal — copied after results.json is safely written)
for (const diff of parityDiffs) {
  const pngPath = diff.path.replace(/\.html$/, ".png");
  try {
    if (diff.beforeScreenshotPath && existsSync(diff.beforeScreenshotPath)) {
      const dest = join(OUT_DIR, "data/screenshots/js", pngPath);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(diff.beforeScreenshotPath, dest);
    }
    if (diff.afterScreenshotPath && existsSync(diff.afterScreenshotPath)) {
      const dest = join(OUT_DIR, "data/screenshots/python", pngPath);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(diff.afterScreenshotPath, dest);
    }
  } catch (err) {
    console.warn(`  Warning: failed to copy screenshots for ${pngPath}:`, err);
  }
}

console.log(
  `  Repo: ${meta.repo}, branch: ${meta.branch}, sha: ${meta.sha.slice(0, 8)}`
);

// ---------------------------------------------------------------------------
// index.html — Read-only SPA
// ---------------------------------------------------------------------------

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Python Parity Review</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; height: 100vh; overflow: hidden; color: #222; background: #f5f5f5; }

    /* Sidebar */
    #sidebar { width: 300px; min-width: 300px; background: #1e1e2e; color: #cdd6f4; display: flex; flex-direction: column; overflow: hidden; }
    #sidebar-header { padding: 12px 16px; border-bottom: 1px solid #313244; }
    #sidebar-header h2 { font-size: 14px; font-weight: 600; color: #cba6f7; margin-bottom: 4px; }
    #sidebar-meta { font-size: 11px; color: #6c7086; margin-bottom: 4px; font-family: monospace; }
    #sidebar-stats { font-size: 12px; color: #a6adc8; }
    #sidebar-filters { display: flex; gap: 6px; padding: 8px 16px; flex-wrap: wrap; border-bottom: 1px solid #313244; }
    .filter-btn { padding: 3px 10px; border-radius: 12px; border: 1px solid #45475a; background: transparent; color: #a6adc8; font-size: 11px; cursor: pointer; }
    .filter-btn.active { background: #cba6f7; color: #1e1e2e; border-color: #cba6f7; font-weight: 600; }
    #story-list { flex: 1; overflow-y: auto; }
    .story-item { padding: 8px 16px; cursor: pointer; border-bottom: 1px solid #181825; transition: background 0.1s; }
    .story-item:hover { background: #313244; }
    .story-item.active { background: #45475a; }
    .story-item.export { padding: 4px 16px 4px 32px; border-bottom: none; }
    .story-item.export.active { background: #45475a; }
    .story-name { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: monospace; }
    .story-item.export .story-name { font-size: 11px; font-weight: 400; color: #a6adc8; }
    .story-item.export .story-name::before { content: "↳ "; color: #585b70; }
    .story-meta { font-size: 11px; margin-top: 2px; display: flex; gap: 8px; }
    .story-item.export .story-meta { margin-top: 1px; }
    .status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
    .status-dot-pass { background: #a6e3a1; }
    .status-dot-fail { background: #f38ba8; }
    .status-dot-warning { background: #fab387; }
    .status-pass { color: #a6e3a1; }
    .status-fail { color: #f38ba8; }
    .status-warning { color: #fab387; }
    .check-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; padding: 1px 6px; border-radius: 8px; }
    .check-coverage { background: #313244; color: #89b4fa; }
    .check-sync { background: #313244; color: #cba6f7; }
    .check-dom { background: #313244; color: #fab387; }
    .check-capture { background: #313244; color: #f38ba8; }

    /* Main panel */
    #main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    #main-header { padding: 12px 20px; background: #fff; border-bottom: 1px solid #e0e0e0; }
    #main-title { font-size: 13px; font-weight: 600; font-family: monospace; margin-bottom: 4px; }
    #main-badges { display: flex; gap: 8px; align-items: center; }
    .badge { padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; }

    #main-content { flex: 1; overflow-y: auto; padding: 16px; }

    /* Source comparison */
    #source-section { margin-bottom: 16px; }
    #source-section h3 { font-size: 13px; font-weight: 600; color: #555; margin-bottom: 10px; }
    #source-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .source-panel { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }
    .source-panel-header { padding: 8px 12px; background: #f8f8f8; border-bottom: 1px solid #e0e0e0; font-size: 12px; font-weight: 600; color: #555; }
    .source-panel-content { padding: 12px; overflow-x: auto; font-family: monospace; font-size: 12px; line-height: 1.6; white-space: pre; color: #333; max-height: 500px; overflow-y: auto; }
    .source-missing { color: #aaa; font-style: italic; padding: 32px; text-align: center; }

    /* Screenshot comparison */
    #screenshot-section { margin-bottom: 16px; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }
    #screenshot-header { padding: 10px 16px; font-size: 13px; font-weight: 600; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; gap: 12px; }
    #screenshot-tabs { display: flex; gap: 4px; }
    .sshot-tab { padding: 3px 12px; border-radius: 10px; border: 1px solid #ddd; background: transparent; font-size: 11px; cursor: pointer; color: #666; }
    .sshot-tab.active { background: #3498db; color: #fff; border-color: #3498db; font-weight: 600; }
    #screenshot-body { padding: 12px; }
    #sbs-view, #strobe-view { display: none; }
    #sbs-view.active, #strobe-view.active { display: block; }
    #sbs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .sshot-panel { border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }
    .sshot-panel-header { padding: 6px 12px; background: #f8f8f8; border-bottom: 1px solid #e0e0e0; font-size: 12px; font-weight: 600; color: #555; }
    .sshot-panel-body { padding: 12px; min-height: 80px; display: flex; align-items: flex-start; justify-content: center; background: #fff; }
    .sshot-panel-body img { max-width: 100%; display: block; }
    .sshot-missing { color: #aaa; font-size: 13px; font-style: italic; padding: 24px; }
    #strobe-container { position: relative; display: inline-block; }
    #strobe-container img { max-width: 100%; display: block; }
    #strobe-js { position: absolute; top: 0; left: 0; }
    #strobe-label { margin-top: 6px; font-size: 12px; font-weight: 600; color: #fff; background: #333; display: inline-block; padding: 2px 10px; border-radius: 4px; }

    /* DOM diff */
    #dom-diff-section { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }
    #dom-diff-toggle { padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; border-bottom: 1px solid transparent; }
    #dom-diff-toggle:hover { background: #f8f8f8; }
    #dom-diff-toggle.open { border-bottom-color: #e0e0e0; }
    #dom-diff-content { max-height: 500px; overflow: auto; display: none; }
    #dom-diff-content.open { display: block; }

    /* Empty state */
    #empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #888; font-size: 15px; gap: 8px; }

    /* Read-only banner */
    #readonly-banner { background: #2d2d3f; color: #a6adc8; font-size: 12px; padding: 6px 16px; text-align: center; border-bottom: 1px solid #313244; }
  </style>
</head>
<body>

<!-- SIDEBAR -->
<div id="sidebar">
  <div id="sidebar-header">
    <h2>Python Parity Review</h2>
    <div id="readonly-banner">Read-only diagnostic view</div>
    <div id="sidebar-meta" style="margin-top:8px;"></div>
    <div id="sidebar-stats"></div>
  </div>
  <div id="sidebar-filters">
    <button class="filter-btn active" data-filter="all">All</button>
    <button class="filter-btn" data-filter="fail">Failures</button>
    <button class="filter-btn" data-filter="warning">Warnings</button>
    <button class="filter-btn" data-filter="coverage">Coverage</button>
    <button class="filter-btn" data-filter="sync">Sync</button>
    <button class="filter-btn" data-filter="capture">Capture</button>
    <button class="filter-btn" data-filter="parity">Parity</button>
  </div>
  <div id="story-list"></div>
</div>

<!-- MAIN -->
<div id="main">
  <div id="main-header">
    <div id="main-title">Select a story pair</div>
    <div id="main-badges"></div>
  </div>

  <div id="main-content">
    <div id="empty-state">
      <div>No story selected</div>
      <div style="font-size:13px;">Use ↑/↓ or j/k to navigate</div>
    </div>

    <div id="story-content" style="display:none;">
      <!-- Source comparison -->
      <div id="source-section">
        <h3>Source Comparison</h3>
        <div id="source-grid">
          <div class="source-panel">
            <div class="source-panel-header">JS Story</div>
            <div class="source-panel-content" id="js-source">
              <div class="source-missing">Loading...</div>
            </div>
          </div>
          <div class="source-panel">
            <div class="source-panel-header">Python Story</div>
            <div class="source-panel-content" id="py-source">
              <div class="source-missing">Loading...</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Screenshot comparison -->
      <div id="screenshot-section" style="display:none;">
        <div id="screenshot-header">
          <span>Screenshots</span>
          <div id="screenshot-tabs">
            <button class="sshot-tab active" data-view="sbs">Side by side</button>
            <button class="sshot-tab" data-view="strobe">Strobe</button>
          </div>
        </div>
        <div id="screenshot-body">
          <div id="sbs-view" class="active">
            <div id="sbs-grid">
              <div class="sshot-panel">
                <div class="sshot-panel-header">JS (baseline)</div>
                <div class="sshot-panel-body" id="sbs-js-body">
                  <div class="sshot-missing">No JS screenshot</div>
                </div>
              </div>
              <div class="sshot-panel">
                <div class="sshot-panel-header">Python</div>
                <div class="sshot-panel-body" id="sbs-py-body">
                  <div class="sshot-missing">No Python screenshot</div>
                </div>
              </div>
            </div>
          </div>
          <div id="strobe-view">
            <div id="strobe-container">
              <img id="strobe-py" />
              <img id="strobe-js" />
            </div>
            <div id="strobe-label">Python</div>
          </div>
        </div>
      </div>

      <!-- DOM diff -->
      <div id="dom-diff-section" style="display:none;">
        <div id="dom-diff-toggle">
          <span id="dom-diff-arrow">▶</span> DOM Diff (Python vs JS Baseline)
        </div>
        <div id="dom-diff-content"></div>
      </div>
    </div>
  </div>
</div>

<script>
  let allPairs = [];
  let meta = { repo: '', branch: '', sha: '' };
  let currentId = null;
  let filter = 'all';

  const domDiffCache = {};
  const sourceCache = {};

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  async function init() {
    const [resultsRes, metaRes] = await Promise.all([
      fetch('/data/results.json'),
      fetch('/data/meta.json'),
    ]);
    if (!resultsRes.ok) {
      document.getElementById('sidebar-stats').textContent = 'Error: could not load results.json';
      return;
    }
    allPairs = await resultsRes.json();
    meta = metaRes.ok ? await metaRes.json() : meta;

    const metaEl = document.getElementById('sidebar-meta');
    const shortSha = meta.sha.slice(0, 8);
    metaEl.textContent = meta.branch + ' @ ' + shortSha;

    renderSidebar();
    const first = visibleEntries()[0];
    if (first) selectEntry(first);
  }

  // Resolve an entry by composite id (file id, or file-id--export-slug).
  function findEntry(entryId) {
    if (!entryId) return null;
    for (const p of allPairs) {
      if (p.id === entryId) return { kind: 'file', pair: p };
      const exp = p.exports?.find(e => e.id === entryId);
      if (exp) return { kind: 'export', pair: p, exp };
    }
    return null;
  }

  // Produce a flat list of visible entries (files + their exports),
  // honoring the current filter. Files with exactly one export collapse
  // to a single row (the file IS the entry — no indented child). Files
  // with no visible children stay hidden when filtering to a specific
  // status/checktype.
  function visibleEntries() {
    const out = [];
    for (const p of allPairs) {
      const exports = p.exports || [];
      const fileMatches = entryMatches(p, p.checkType);
      const visibleExports = exports.filter(e =>
        entryMatches({ status: e.status, checkType: p.checkType }, p.checkType)
      );
      const showFile = filter === 'all' ? true : fileMatches || visibleExports.length > 0;
      if (!showFile) continue;
      out.push({ kind: 'file', pair: p });
      // Collapse single-export files: the file row already represents
      // the only export, indenting "↳ Default" under it is just noise.
      if (exports.length <= 1) continue;
      const childrenToShow = filter === 'all' ? exports : visibleExports;
      for (const exp of childrenToShow) out.push({ kind: 'export', pair: p, exp });
    }
    return out;
  }

  function entryMatches(e, checkType) {
    if (filter === 'all') return true;
    if (filter === 'fail') return e.status === 'fail';
    if (filter === 'warning') return e.status === 'warning';
    return checkType === filter;
  }

  function renderSidebar() {
    // Stats are export-level, not file-level. Subcategories
    // (missing / capture-failed / parity-mismatch) roll up into
    // "failures"; (exempt / capture-skipped) into "warnings"; covered
    // is "passed". Subcategories with zero count are omitted.
    const ex = meta.exports || null;
    const stats = document.getElementById('sidebar-stats');
    if (ex && typeof ex.total === 'number') {
      const failParts = [];
      if (ex.missing > 0) failParts.push(ex.missing + ' missing');
      if (ex.captureFailed > 0) failParts.push(ex.captureFailed + ' capture failed');
      if (ex.parityMismatch > 0) failParts.push(ex.parityMismatch + ' parity mismatch');
      const warnParts = [];
      if (ex.exempt > 0) warnParts.push(ex.exempt + ' exempt');
      if (ex.captureSkipped > 0) warnParts.push(ex.captureSkipped + ' capture skipped');
      const failTotal = (ex.missing||0) + (ex.captureFailed||0) + (ex.parityMismatch||0);
      const warnTotal = (ex.exempt||0) + (ex.captureSkipped||0);
      const sub = (n, parts) =>
        n > 0 && parts.length > 0
          ? '<span style="color:#7f849c;">  (' + parts.join(', ') + ')</span>'
          : '';
      stats.innerHTML =
        '<div>' + ex.total + ' tests total</div>' +
        '<div style="margin-top:4px;">' +
          '<span class="status-fail">' + failTotal + ' failures</span>' +
          sub(failTotal, failParts) +
        '</div>' +
        '<div>' +
          '<span class="status-warning">' + warnTotal + ' warnings</span>' +
          sub(warnTotal, warnParts) +
        '</div>' +
        '<div>' +
          '<span class="status-pass">' + (ex.covered||0) + ' passed</span>' +
        '</div>';
    } else {
      stats.textContent = allPairs.length + ' entries';
    }

    const list = document.getElementById('story-list');
    list.innerHTML = '';
    const items = visibleEntries();
    if (items.length === 0) {
      list.innerHTML = '<div style="padding:16px;color:#585b70;font-size:13px;">No items</div>';
      return;
    }
    for (const entry of items) {
      const el = document.createElement('div');
      const isExport = entry.kind === 'export';
      const node = isExport ? entry.exp : entry.pair;
      const cls = ['story-item'];
      if (isExport) cls.push('export');
      if (node.id === currentId) cls.push('active');
      el.className = cls.join(' ');
      el.dataset.id = node.id;
      const name = isExport ? entry.exp.name : entry.pair.id;
      if (isExport) {
        el.innerHTML =
          '<div class="story-name">' +
            '<span class="status-dot status-dot-' + entry.exp.status + '"></span>' +
            escHtml(name) +
          '</div>';
      } else {
        el.innerHTML =
          '<div class="story-name">' +
            '<span class="status-dot status-dot-' + entry.pair.status + '"></span>' +
            escHtml(name) +
          '</div>' +
          '<div class="story-meta">' +
            '<span class="check-badge check-' + entry.pair.checkType + '">' + entry.pair.checkType.toUpperCase() + '</span>' +
          '</div>';
      }
      el.addEventListener('click', () => selectEntry(entry));
      list.appendChild(el);
    }
  }

  async function selectEntry(entry) {
    const node = entry.kind === 'export' ? entry.exp : entry.pair;
    currentId = node.id;
    document.querySelectorAll('.story-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === currentId);
    });
    await renderMain(entry);
  }

  async function renderMain(entry) {
    const pair = entry.pair;
    const exp = entry.kind === 'export' ? entry.exp : null;

    const title = exp ? pair.id + ' :: ' + exp.name : pair.id;
    document.getElementById('main-title').textContent = title;

    const statusColors = { pass: '#27ae60', fail: '#e74c3c', warning: '#e67e22' };
    const checkColors = { coverage: '#3498db', sync: '#9b59b6', parity: '#e67e22', capture: '#e74c3c' };
    const displayStatus = exp ? exp.status : pair.status;
    const displayCheck = exp ? (exp.hasDomDiff ? 'parity' : pair.checkType) : pair.checkType;
    const displayMessage = exp ? exp.message : pair.message;
    const sColor = statusColors[displayStatus] || '#888';
    const cColor = checkColors[displayCheck] || '#888';
    document.getElementById('main-badges').innerHTML =
      '<span class="badge" style="background:' + sColor + '22;color:' + sColor + ';border:1px solid ' + sColor + ';">' + displayStatus.toUpperCase() + '</span>' +
      '<span class="badge" style="background:' + cColor + '22;color:' + cColor + ';border:1px solid ' + cColor + ';">' + displayCheck.toUpperCase() + '</span>' +
      '<span style="font-size:12px;color:#666;">' + escHtml(displayMessage) + '</span>';

    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('story-content').style.display = 'block';

    // Source comparison is per-file — same regardless of which child
    // export is selected.
    await loadSources(pair);

    // Screenshots and DOM diffs scope to the specific export when one
    // is selected; fall back to the file's first export with a diff
    // when only the file header is selected.
    const targetExp =
      exp ??
      (pair.exports || []).find((e) => e.hasDomDiff || e.hasScreenshots);
    const ssSec = document.getElementById('screenshot-section');
    if (targetExp && targetExp.hasScreenshots) {
      ssSec.style.display = 'block';
      renderScreenshots(targetExp.id);
    } else {
      ssSec.style.display = 'none';
      stopStrobe();
    }

    const domSection = document.getElementById('dom-diff-section');
    if (targetExp && targetExp.hasDomDiff) {
      domSection.style.display = 'block';
      await loadDomDiff(targetExp.id + '.html');
    } else {
      domSection.style.display = 'none';
    }
  }

  async function loadSources(pair) {
    const jsEl = document.getElementById('js-source');
    const pyEl = document.getElementById('py-source');

    // JS source
    const jsKey = 'js:' + pair.id;
    if (sourceCache[jsKey] === undefined) {
      try {
        const res = await fetch('/data/sources/js/' + pair.id + '.tsx');
        const ct = res.headers.get('content-type') || '';
        const text = res.ok && !ct.includes('text/html') ? await res.text() : null;
        sourceCache[jsKey] = text !== null ? escHtml(text) : null;
      } catch { sourceCache[jsKey] = null; }
    }
    jsEl.innerHTML = sourceCache[jsKey] !== null
      ? sourceCache[jsKey]
      : '<div class="source-missing">Source not available</div>';

    // Python source
    const pyKey = 'py:' + pair.id;
    if (sourceCache[pyKey] === undefined) {
      try {
        const res = await fetch('/data/sources/python/' + pair.id + '.py');
        const ct = res.headers.get('content-type') || '';
        const text = res.ok && !ct.includes('text/html') ? await res.text() : null;
        sourceCache[pyKey] = text !== null ? escHtml(text) : null;
      } catch { sourceCache[pyKey] = null; }
    }
    pyEl.innerHTML = sourceCache[pyKey] !== null
      ? sourceCache[pyKey]
      : '<div class="source-missing">No Python counterpart found</div>';
  }

  async function loadDomDiff(path) {
    const content = document.getElementById('dom-diff-content');
    if (domDiffCache[path] !== undefined) {
      content.innerHTML = domDiffCache[path];
      return;
    }
    content.innerHTML = '<div style="padding:12px;color:#888;font-size:13px;">Loading...</div>';
    try {
      const res = await fetch('/data/dom-diffs/' + path);
      const html = res.ok ? await res.text() : '<em style="color:#aaa;">DOM diff unavailable.</em>';
      domDiffCache[path] = html;
      content.innerHTML = html;
    } catch {
      content.innerHTML = '<em style="color:#aaa;">Failed to load DOM diff.</em>';
    }
  }

  // ---------------------------------------------------------------------------
  // Screenshots
  // ---------------------------------------------------------------------------

  let strobeInterval = null;
  let strobePhase = 'python';
  let ssView = 'sbs';

  function stopStrobe() {
    if (strobeInterval) { clearInterval(strobeInterval); strobeInterval = null; }
  }

  function renderScreenshots(id) {
    stopStrobe();
    const pngPath = id + '.png';
    const jsUrl = '/data/screenshots/js/' + pngPath;
    const pyUrl = '/data/screenshots/python/' + pngPath;

    // Side-by-side
    const jsBody = document.getElementById('sbs-js-body');
    const pyBody = document.getElementById('sbs-py-body');
    jsBody.innerHTML = '<img src="' + jsUrl + '" onerror="this.parentNode.innerHTML=\\'<div class=sshot-missing>No JS screenshot</div>\\'" />';
    pyBody.innerHTML = '<img src="' + pyUrl + '" onerror="this.parentNode.innerHTML=\\'<div class=sshot-missing>No Python screenshot</div>\\'" />';

    // Strobe
    const strobeJs = document.getElementById('strobe-js');
    const strobePy = document.getElementById('strobe-py');
    strobeJs.src = jsUrl;
    strobePy.src = pyUrl;
    strobeJs.style.opacity = '0';
    document.getElementById('strobe-label').textContent = 'Python';

    if (ssView === 'strobe') startStrobe();
  }

  function startStrobe() {
    stopStrobe();
    strobePhase = 'python';
    const jsImg = document.getElementById('strobe-js');
    const label = document.getElementById('strobe-label');
    strobeInterval = setInterval(() => {
      strobePhase = strobePhase === 'python' ? 'js' : 'python';
      jsImg.style.opacity = strobePhase === 'js' ? '1' : '0';
      label.textContent = strobePhase === 'js' ? 'JS' : 'Python';
    }, 500);
  }

  // Screenshot tab switching
  document.querySelectorAll('.sshot-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      ssView = btn.dataset.view;
      document.querySelectorAll('.sshot-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('sbs-view').classList.toggle('active', ssView === 'sbs');
      document.getElementById('strobe-view').classList.toggle('active', ssView === 'strobe');
      if (ssView === 'strobe' && currentId) {
        const entry = findEntry(currentId);
        if (entry) {
          const target = entry.kind === 'export' ? entry.exp : entry.pair;
          if (target.hasScreenshots) startStrobe();
        }
      } else {
        stopStrobe();
      }
    });
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSidebar();
    });
  });

  // DOM diff toggle
  document.getElementById('dom-diff-toggle').addEventListener('click', () => {
    const content = document.getElementById('dom-diff-content');
    const arrow = document.getElementById('dom-diff-arrow');
    const toggle = document.getElementById('dom-diff-toggle');
    const isOpen = content.classList.contains('open');
    content.classList.toggle('open', !isOpen);
    toggle.classList.toggle('open', !isOpen);
    arrow.textContent = isOpen ? '▶' : '▼';
  });

  // Keyboard nav — walks all visible entries (files + their child exports).
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const items = visibleEntries();
    const idx = items.findIndex(it => {
      const id = it.kind === 'export' ? it.exp.id : it.pair.id;
      return id === currentId;
    });
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      const next = items[Math.min(idx + 1, items.length - 1)];
      if (next) selectEntry(next);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      const prev = items[Math.max(idx - 1, 0)];
      if (prev) selectEntry(prev);
    }
  });

  init();
</script>
</body>
</html>`;

write(join(OUT_DIR, "index.html"), html);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nParity review site built at: ${OUT_DIR}`);
console.log(`  index.html, data/results.json, data/meta.json`);
console.log(`  ${parityDiffs.length} dom-diffs, ${pairs.length} story pairs`);
console.log(`\nTo preview:\n  npx wrangler pages dev ${OUT_DIR}`);
