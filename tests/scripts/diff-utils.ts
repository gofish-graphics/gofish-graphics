/**
 * Shared utilities for diff collection, story acceptance, and DOM diff formatting.
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
  cpSync,
  rmSync,
} from "fs";
import { join, dirname } from "path";
import { diffLines } from "diff";
import DMP from "diff-match-patch";

/**
 * Character-level diff backed by Google's diff-match-patch with a per-pair
 * timeout. DMP's `diff_main` is O(N) average via prefix/suffix/half-match
 * preprocessing; when inputs are pathological (long, scattered changes —
 * SVG paths, base64 image data, big transform attrs — common in DOM
 * snapshots), it bisects until the timeout fires and falls back to a
 * coarser prefix+removed+added+suffix shape. Bounding the worst case
 * here keeps the CI diff-report generation under a few seconds even
 * across hundreds of regressed stories.
 *
 * The previous implementation used the `diff` library's `diffChars` (Myers'
 * O(N·D) algorithm), which hung the visual-tests CI for many minutes on
 * stories with long-line DOM output.
 */
type CharChange = { value: string; added?: boolean; removed?: boolean };
const dmp = new DMP.diff_match_patch();
dmp.Diff_Timeout = 0.5; // seconds; degrades to coarser output past this
function fastCharDiff(a: string, b: string): CharChange[] {
  return dmp
    .diff_main(a, b)
    .map(([op, value]) =>
      op === DMP.DIFF_INSERT
        ? { value, added: true }
        : op === DMP.DIFF_DELETE
          ? { value, removed: true }
          : { value }
    );
}

export const ROOT = join(import.meta.dirname, "../..");
export const BASELINE_DOM = join(ROOT, "__snapshots__/dom");
export const BASELINE_SCREENSHOTS = join(ROOT, "__snapshots__/screenshots");
export const JS_DIR = join(import.meta.dirname, "../tmp/js");
export const PYTHON_DIR = join(import.meta.dirname, "../tmp/python");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiffEntry {
  /** Relative path like "forward-syntax-v3/bar--basic.html" */
  path: string;
  /**
   * "removed" = baseline exists, story no longer captured (deleted/renamed
   * since the baseline was recorded). Has no "after" state — accepting it
   * deletes the baseline instead of writing a new one.
   */
  kind: "regression" | "parity" | "new" | "removed";
  /** "pending" | "accepted" | "rejected" — runtime review state */
  status: "pending" | "accepted" | "rejected";
  beforeDom: string | null;
  afterDom: string | null;
  /** Absolute path to before screenshot PNG (or null) */
  beforeScreenshotPath: string | null;
  /** Absolute path to after screenshot PNG (or null) */
  afterScreenshotPath: string | null;
  /** Pixel diff percentage (0–100), null if not yet computed */
  diffPercent: number | null;
}

// ---------------------------------------------------------------------------
// File listing
// ---------------------------------------------------------------------------

export function listHtmlFiles(dir: string, prefix = ""): string[] {
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

export function readOptional(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Collect diffs
// ---------------------------------------------------------------------------

export function collectDiffs(): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const jsFiles = listHtmlFiles(JS_DIR);

  for (const file of jsFiles) {
    const jsContent = readFileSync(join(JS_DIR, file), "utf-8");
    const baselineContent = readOptional(join(BASELINE_DOM, file));
    const pngFile = file.replace(/\.html$/, ".png");
    const afterPng = join(JS_DIR, pngFile);

    if (baselineContent === null) {
      entries.push({
        path: file,
        kind: "new",
        status: "pending",
        beforeDom: null,
        afterDom: jsContent,
        beforeScreenshotPath: null,
        afterScreenshotPath: existsSync(afterPng) ? afterPng : null,
        diffPercent: null,
      });
    } else if (jsContent !== baselineContent) {
      const beforePng = join(BASELINE_SCREENSHOTS, pngFile);
      entries.push({
        path: file,
        kind: "regression",
        status: "pending",
        beforeDom: baselineContent,
        afterDom: jsContent,
        beforeScreenshotPath: existsSync(beforePng) ? beforePng : null,
        afterScreenshotPath: existsSync(afterPng) ? afterPng : null,
        diffPercent: null,
      });
    }
  }

  // Parity diffs
  if (existsSync(PYTHON_DIR)) {
    const pyFiles = listHtmlFiles(PYTHON_DIR);
    for (const file of pyFiles) {
      const jsPath = join(JS_DIR, file);
      if (!existsSync(jsPath)) continue;
      const pyContent = readFileSync(join(PYTHON_DIR, file), "utf-8");
      const jsContent = readFileSync(jsPath, "utf-8");
      if (pyContent !== jsContent) {
        const pngFile = file.replace(/\.html$/, ".png");
        const beforePng = join(JS_DIR, pngFile);
        const afterPng = join(PYTHON_DIR, pngFile);
        entries.push({
          path: file,
          kind: "parity",
          status: "pending",
          beforeDom: jsContent,
          afterDom: pyContent,
          beforeScreenshotPath: existsSync(beforePng) ? beforePng : null,
          afterScreenshotPath: existsSync(afterPng) ? afterPng : null,
          diffPercent: null,
        });
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Removed stories: baseline exists, story no longer present in JS_DIR
// ---------------------------------------------------------------------------

/**
 * Stories with a baseline but no current JS capture — i.e. deleted (or
 * renamed) since the baseline was recorded. These fail the job exactly like
 * a new/missing-baseline story: a removal must be reviewed and accepted
 * (which deletes the baseline) before CI goes green.
 *
 * Returned as first-class `DiffEntry`s (kind: "removed") so the report and
 * review site can render them as regular reviewable cards: `beforeDom`/
 * `beforeScreenshotPath` hold the old baseline, `afterDom`/
 * `afterScreenshotPath` are always null since there's no new render.
 */
export function collectRemovedStories(): DiffEntry[] {
  const jsFiles = new Set(listHtmlFiles(JS_DIR));
  const removedPaths = listHtmlFiles(BASELINE_DOM)
    .filter((file) => !jsFiles.has(file))
    .sort();

  return removedPaths.map((path) => {
    const pngFile = path.replace(/\.html$/, ".png");
    const beforePng = join(BASELINE_SCREENSHOTS, pngFile);
    return {
      path,
      kind: "removed",
      status: "pending",
      beforeDom: readOptional(join(BASELINE_DOM, path)),
      afterDom: null,
      beforeScreenshotPath: existsSync(beforePng) ? beforePng : null,
      afterScreenshotPath: null,
      diffPercent: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Collect parity diffs: Python output vs JS baselines
// ---------------------------------------------------------------------------

/**
 * Compares Python DOM output (`PYTHON_DIR`) against JS baselines (`BASELINE_DOM`).
 * Used by the parity review site — does NOT re-capture JS.
 */
export function collectParityDiffs(): DiffEntry[] {
  const entries: DiffEntry[] = [];
  if (!existsSync(PYTHON_DIR)) return entries;

  const pyFiles = listHtmlFiles(PYTHON_DIR);
  for (const file of pyFiles) {
    const baselinePath = join(BASELINE_DOM, file);
    const pythonPath = join(PYTHON_DIR, file);

    const baselineContent = readOptional(baselinePath);
    const pythonContent = readFileSync(pythonPath, "utf-8");

    if (baselineContent === null) {
      // No JS baseline yet — treat as a parity failure (same as compare-python.ts)
      const pngFile = file.replace(/\.html$/, ".png");
      const afterPng = join(PYTHON_DIR, pngFile);
      entries.push({
        path: file,
        kind: "parity",
        status: "pending",
        beforeDom: null,
        afterDom: pythonContent,
        beforeScreenshotPath: null,
        afterScreenshotPath: existsSync(afterPng) ? afterPng : null,
        diffPercent: null,
      });
      continue;
    }

    if (pythonContent !== baselineContent) {
      const pngFile = file.replace(/\.html$/, ".png");
      const beforePng = join(BASELINE_SCREENSHOTS, pngFile);
      const afterPng = join(PYTHON_DIR, pngFile);
      entries.push({
        path: file,
        kind: "parity",
        status: "pending",
        beforeDom: baselineContent,
        afterDom: pythonContent,
        beforeScreenshotPath: existsSync(beforePng) ? beforePng : null,
        afterScreenshotPath: existsSync(afterPng) ? afterPng : null,
        diffPercent: null,
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Accept a story (copy tmp → baselines)
// ---------------------------------------------------------------------------

export function acceptStory(path: string): void {
  const htmlSrc = join(JS_DIR, path);
  const htmlDest = join(BASELINE_DOM, path);
  mkdirSync(dirname(htmlDest), { recursive: true });
  writeFileSync(htmlDest, readFileSync(htmlSrc));

  const pngFile = path.replace(/\.html$/, ".png");
  const pngSrc = join(JS_DIR, pngFile);
  const pngDest = join(BASELINE_SCREENSHOTS, pngFile);
  if (existsSync(pngSrc)) {
    mkdirSync(dirname(pngDest), { recursive: true });
    cpSync(pngSrc, pngDest);
  }
}

// ---------------------------------------------------------------------------
// Accept a removal (delete baseline dom + screenshot)
// ---------------------------------------------------------------------------

/**
 * Accepting a "removed" DiffEntry has no "after" state to copy in — it
 * deletes the stale baseline instead. This is the manual-review analog of
 * the auto-prune in update-baselines.ts (which does the same thing in bulk
 * on every main push).
 */
export function removeBaselineStory(path: string): void {
  const htmlPath = join(BASELINE_DOM, path);
  if (existsSync(htmlPath)) rmSync(htmlPath, { force: true });

  const pngPath = join(BASELINE_SCREENSHOTS, path.replace(/\.html$/, ".png"));
  if (existsSync(pngPath)) rmSync(pngPath, { force: true });
}

// ---------------------------------------------------------------------------
// DOM diff formatting
// ---------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Returns an HTML snippet with colored line diff and intra-line char highlighting. */
export function formatDomDiff(before: string, after: string): string {
  const changes = diffLines(before, after);

  // Flatten to a list of tagged lines so we can pair removed+added
  interface TaggedLine {
    text: string;
    type: "added" | "removed" | "context";
  }
  const lines: TaggedLine[] = [];
  for (const change of changes) {
    const parts = change.value.split("\n");
    if (parts[parts.length - 1] === "") parts.pop();
    const type = change.added
      ? "added"
      : change.removed
        ? "removed"
        : "context";
    for (const text of parts) lines.push({ text, type });
  }

  const rows: string[] = [];
  let lineNum = 1;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (
      line.type === "removed" &&
      i + 1 < lines.length &&
      lines[i + 1].type === "added"
    ) {
      // Paired change: show intra-line char diff via `fastCharDiff` (O(N)
      // common-prefix + common-suffix; the diverging middle is reported as
      // one removed + one added block). The `diff` library's `diffChars` is
      // O(N*D) — fine for short lines but degenerates to ~O(N²) on the long
      // SVG paths / transform attrs typical of DOM snapshots, hanging the
      // CI report for many minutes.
      const next = lines[i + 1];
      const charChanges = fastCharDiff(line.text, next.text);

      const removedHtml = charChanges
        .filter((c) => !c.added)
        .map((c) =>
          c.removed
            ? `<mark style="background:#f5a0aa;border-radius:2px;">${escapeHtml(c.value)}</mark>`
            : escapeHtml(c.value)
        )
        .join("");

      const addedHtml = charChanges
        .filter((c) => !c.removed)
        .map((c) =>
          c.added
            ? `<mark style="background:#6ed98a;border-radius:2px;">${escapeHtml(c.value)}</mark>`
            : escapeHtml(c.value)
        )
        .join("");

      rows.push(
        `<tr style="background:#f8d7da;">` +
          `<td style="color:#999;text-align:right;padding:0 8px;user-select:none;min-width:40px;font-size:11px;vertical-align:top;"></td>` +
          `<td style="color:#721c24;padding:0 6px;user-select:none;vertical-align:top;">−</td>` +
          `<td style="color:#721c24;white-space:pre-wrap;word-break:break-all;padding:0 8px;">${removedHtml}</td>` +
          `</tr>`
      );
      rows.push(
        `<tr style="background:#d4edda;">` +
          `<td style="color:#999;text-align:right;padding:0 8px;user-select:none;min-width:40px;font-size:11px;vertical-align:top;">${lineNum}</td>` +
          `<td style="color:#155724;padding:0 6px;user-select:none;vertical-align:top;">+</td>` +
          `<td style="color:#155724;white-space:pre-wrap;word-break:break-all;padding:0 8px;">${addedHtml}</td>` +
          `</tr>`
      );
      lineNum++;
      i += 2;
    } else if (line.type === "removed") {
      rows.push(
        `<tr style="background:#f8d7da;">` +
          `<td style="color:#999;text-align:right;padding:0 8px;user-select:none;min-width:40px;font-size:11px;vertical-align:top;"></td>` +
          `<td style="color:#721c24;padding:0 6px;user-select:none;vertical-align:top;">−</td>` +
          `<td style="color:#721c24;white-space:pre-wrap;word-break:break-all;padding:0 8px;">${escapeHtml(line.text)}</td>` +
          `</tr>`
      );
      i++;
    } else if (line.type === "added") {
      rows.push(
        `<tr style="background:#d4edda;">` +
          `<td style="color:#999;text-align:right;padding:0 8px;user-select:none;min-width:40px;font-size:11px;vertical-align:top;">${lineNum}</td>` +
          `<td style="color:#155724;padding:0 6px;user-select:none;vertical-align:top;">+</td>` +
          `<td style="color:#155724;white-space:pre-wrap;word-break:break-all;padding:0 8px;">${escapeHtml(line.text)}</td>` +
          `</tr>`
      );
      lineNum++;
      i++;
    } else {
      rows.push(
        `<tr style="background:#f8f8f8;">` +
          `<td style="color:#999;text-align:right;padding:0 8px;user-select:none;min-width:40px;font-size:11px;vertical-align:top;">${lineNum}</td>` +
          `<td style="color:#ccc;padding:0 6px;user-select:none;vertical-align:top;"> </td>` +
          `<td style="color:#555;white-space:pre-wrap;word-break:break-all;padding:0 8px;">${escapeHtml(line.text)}</td>` +
          `</tr>`
      );
      lineNum++;
      i++;
    }
  }

  return (
    `<table style="border-collapse:collapse;width:100%;font-family:monospace;font-size:12px;line-height:1.6;">` +
    rows.join("") +
    `</table>`
  );
}
