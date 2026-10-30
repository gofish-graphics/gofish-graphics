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
import { storyMetaTitle, storyToPath } from "./path-mapping.js";
import {
  diffWarnings,
  readWarnings,
  warningsPathFor,
  type WarningsDiff,
  type WarningsState,
} from "./story-warnings.js";

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
/** Local baseline cache, laid out like the snapshot branch. */
export const BASELINE_DIR = join(ROOT, "__snapshots__");
export const BASELINE_DOM = join(BASELINE_DIR, "dom");
export const BASELINE_SCREENSHOTS = join(BASELINE_DIR, "screenshots");
export const JS_DIR = join(import.meta.dirname, "../tmp/js");
export const PYTHON_DIR = join(import.meta.dirname, "../tmp/python");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiffEntry {
  /** Relative path like "forward-syntax/bar--basic.html" */
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
  /**
   * The story's warnings against its baseline's (see story-warnings.ts).
   * Null for a parity entry, which compares DOM only.
   */
  warnings: WarningsDiff | null;
  /** False for a regression whose DOM is identical: only its warnings
   *  changed. True otherwise. */
  domChanged: boolean;
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

/**
 * The JS capture (`JS_DIR`) against the baselines: a story with no baseline
 * is "new"; one whose DOM differs, or whose warnings changed, is a
 * "regression". A baseline with no warnings file (recorded before warnings
 * were captured) leaves the warnings unrecorded, which on its own is no diff.
 * This is the one regression check: compare.ts gates on it and the reports
 * list it.
 */
export function collectJsDiffs(): DiffEntry[] {
  const entries: DiffEntry[] = [];
  for (const file of listHtmlFiles(JS_DIR)) {
    const jsContent = readFileSync(join(JS_DIR, file), "utf-8");
    const baselineContent = readOptional(join(BASELINE_DOM, file));
    const pngFile = file.replace(/\.html$/, ".png");
    const afterPng = join(JS_DIR, pngFile);
    const hasBaseline = baselineContent !== null;
    const warnings = diffWarnings(
      hasBaseline
        ? readWarnings(join(BASELINE_DOM, warningsPathFor(file)))
        : null,
      readWarnings(join(JS_DIR, warningsPathFor(file))) ?? [],
      hasBaseline
    );
    const domChanged = jsContent !== baselineContent;
    if (!domChanged && warnings.state !== "changed") continue;

    const beforePng = join(BASELINE_SCREENSHOTS, pngFile);
    entries.push({
      path: file,
      kind: hasBaseline ? "regression" : "new",
      status: "pending",
      beforeDom: baselineContent,
      afterDom: jsContent,
      beforeScreenshotPath:
        hasBaseline && existsSync(beforePng) ? beforePng : null,
      afterScreenshotPath: existsSync(afterPng) ? afterPng : null,
      diffPercent: null,
      warnings,
      domChanged,
    });
  }
  return entries;
}

/** The JS diffs (`collectJsDiffs`) followed by the parity diffs. */
export function collectDiffs(): DiffEntry[] {
  return [...collectJsDiffs(), ...collectParityDiffs()];
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
      warnings: diffWarnings(
        readWarnings(join(BASELINE_DOM, warningsPathFor(path))),
        null,
        true
      ),
      domChanged: true,
    };
  });
}

/**
 * Every diff a review lists: `collectDiffs()` followed by the removed
 * stories. The diff report (with its machine-readable `diff-list.json`), the
 * review site and the local review server all show this one list.
 */
export function collectReviewDiffs(): DiffEntry[] {
  return [...collectDiffs(), ...collectRemovedStories()];
}

// ---------------------------------------------------------------------------
// Collect parity diffs: Python output vs the JS capture
// ---------------------------------------------------------------------------

/**
 * Compares Python DOM output (`PYTHON_DIR`) against the JS capture of the
 * same commit (`JS_DIR`), not against the accepted baselines. Parity asks
 * whether a Python port renders what its JS story renders now, which does
 * not depend on whether a JS change has passed visual review yet. A Python
 * story with no JS capture is a parity failure too (`beforeDom` null).
 *
 * This is the one parity comparison: compare.ts, compare-python.ts, the
 * review server, and the parity review site all use it. It does not apply
 * export-level exemptions; gates filter with `loadExportExemptParityPaths()`.
 */
export function collectParityDiffs(): DiffEntry[] {
  const entries: DiffEntry[] = [];
  if (!existsSync(PYTHON_DIR)) return entries;

  for (const file of listHtmlFiles(PYTHON_DIR)) {
    const jsContent = readOptional(join(JS_DIR, file));
    const pythonContent = readFileSync(join(PYTHON_DIR, file), "utf-8");
    if (pythonContent === jsContent) continue;

    const pngFile = file.replace(/\.html$/, ".png");
    const beforePng = join(JS_DIR, pngFile);
    const afterPng = join(PYTHON_DIR, pngFile);
    entries.push({
      path: file,
      kind: "parity",
      status: "pending",
      beforeDom: jsContent,
      afterDom: pythonContent,
      beforeScreenshotPath: existsSync(beforePng) ? beforePng : null,
      afterScreenshotPath: existsSync(afterPng) ? afterPng : null,
      diffPercent: null,
      warnings: null,
      domChanged: true,
    });
  }

  return entries;
}

/**
 * Per-export parity exemptions (`file.stories.tsx::ExportName` lines in
 * .python-sync-exempt), as DOM paths without the `.html` suffix. A
 * file-level exemption skips Python capture entirely (capture-python-dom.ts),
 * so its DOM never reaches a parity gate. A per-export exemption is still
 * captured and IR-validated but must not be byte-gated (for example a port
 * that renders identically through a different construct). The
 * DOM path is keyed by Storybook title and export name, shared by JS and
 * Python capture (see path-mapping.storyToPath).
 */
export function loadExportExemptParityPaths(): Set<string> {
  const exempt = new Set<string>();
  const exemptFile = join(ROOT, "tests/.python-sync-exempt");
  if (!existsSync(exemptFile)) return exempt;
  for (const raw of readFileSync(exemptFile, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf("::");
    if (sep === -1) continue; // file-level: handled at capture time
    const jsFile = line.slice(0, sep);
    const exportName = line.slice(sep + 2);
    const content = readOptional(join(ROOT, jsFile));
    const title = content === null ? undefined : storyMetaTitle(content);
    if (title) exempt.add(storyToPath(title, exportName));
  }
  return exempt;
}

// ---------------------------------------------------------------------------
// Accept a story (copy tmp → baselines)
// ---------------------------------------------------------------------------

/**
 * Copies a story's captured DOM, warnings and screenshot into a baseline
 * directory laid out like the snapshot branch (`dom/` and `screenshots/`). Defaults to
 * the local capture and the local `__snapshots__/` cache.
 */
export function acceptStory(
  path: string,
  { captureDir = JS_DIR, baselineDir = BASELINE_DIR } = {}
): void {
  const htmlDest = join(baselineDir, "dom", path);
  mkdirSync(dirname(htmlDest), { recursive: true });
  writeFileSync(htmlDest, readFileSync(join(captureDir, path)));

  // The warnings file is the capture's or none: a capture without one (made
  // before warnings were captured) leaves the warnings unrecorded rather
  // than keeping a stale baseline's.
  const warningsFile = warningsPathFor(path);
  const warningsSrc = join(captureDir, warningsFile);
  const warningsDest = join(baselineDir, "dom", warningsFile);
  if (existsSync(warningsSrc)) cpSync(warningsSrc, warningsDest);
  else rmSync(warningsDest, { force: true });

  const pngFile = path.replace(/\.html$/, ".png");
  const pngSrc = join(captureDir, pngFile);
  const pngDest = join(baselineDir, "screenshots", pngFile);
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
export function removeBaselineStory(
  path: string,
  baselineDir = BASELINE_DIR
): void {
  rmSync(join(baselineDir, "dom", path), { force: true });
  rmSync(join(baselineDir, "dom", warningsPathFor(path)), { force: true });
  rmSync(join(baselineDir, "screenshots", path.replace(/\.html$/, ".png")), {
    force: true,
  });
}

/**
 * Accepts each entry into a baseline directory: a "removed" entry deletes its
 * baseline (`removeBaselineStory`), any other copies the capture in
 * (`acceptStory`). Same defaults as `acceptStory`.
 */
export function applyEntries(
  entries: Iterable<Pick<DiffEntry, "kind" | "path">>,
  dirs: { captureDir?: string; baselineDir?: string } = {}
): void {
  for (const { kind, path } of entries) {
    if (kind === "removed") removeBaselineStory(path, dirs.baselineDir);
    else acceptStory(path, dirs);
  }
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

  const html =
    `<table style="border-collapse:collapse;width:100%;font-family:monospace;font-size:12px;line-height:1.6;">` +
    rows.join("") +
    `</table>`;
  // Cloudflare Pages refuses any file over 25 MiB, and a diff that size can't
  // be read anyway, so a huge one is replaced by its size (the screenshots
  // still show the change).
  const bytes = Buffer.byteLength(html);
  if (bytes <= MAX_DOM_DIFF_BYTES) return html;
  const mib = (n: number) => (n / 2 ** 20).toFixed(1);
  return `<em>DOM diff too large to show (${mib(bytes)} MiB, limit ${mib(MAX_DOM_DIFF_BYTES)} MiB). Compare the screenshots instead.</em>`;
}

/** Below Cloudflare Pages' 25 MiB per-file limit. */
const MAX_DOM_DIFF_BYTES = 20 * 2 ** 20;
// ---------------------------------------------------------------------------
// Warnings formatting (see story-warnings.ts)
// ---------------------------------------------------------------------------

const STATE_NOTE: Record<WarningsState, string> = {
  same: "unchanged",
  changed: "changed",
  unrecorded:
    "baseline predates warnings capture: these are recorded as the new baseline on accept",
  new: "new story",
  removed: "story removed: the baseline's warnings",
};

/** A one-line summary of `diff`, e.g. `2 warnings, changed (+1 −1)`. */
export function warningsSummary(diff: WarningsDiff): string {
  const count = diff.lines.filter((l) =>
    diff.state === "removed" ? true : l.kind !== "removed"
  ).length;
  const added = diff.lines.filter((l) => l.kind === "added").length;
  const removed = diff.lines.filter((l) => l.kind === "removed").length;
  const counts = diff.state === "changed" ? ` (+${added} −${removed})` : "";
  const noun = count === 1 ? "warning" : "warnings";
  return `${count} ${noun}, ${STATE_NOTE[diff.state]}${counts}`;
}

/**
 * `diff` as a self-contained HTML fragment (inline styles only, so it drops
 * into the review site and the capture-diff report alike): one row per line,
 * added lines green with `+`, removed red with `−`, kept plain. In an
 * unrecorded baseline the "added" lines are not new warnings, only newly
 * recorded ones, so they are marked as the new baseline instead.
 */
export function formatWarningsHtml(diff: WarningsDiff): string {
  if (diff.lines.length === 0) {
    return `<div style="padding:8px 12px;color:#888;font-size:13px;">No warnings.</div>`;
  }
  const style = {
    added: { bg: "#d4edda", fg: "#155724", sign: "+" },
    removed: { bg: "#f8d7da", fg: "#721c24", sign: "−" },
    kept: { bg: "#f8f8f8", fg: "#555", sign: " " },
    baseline: { bg: "#e8f0fb", fg: "#1f4e8c", sign: "•" },
  };
  const rows = diff.lines
    .map(({ text, kind }) => {
      const s =
        diff.state === "unrecorded" || diff.state === "new"
          ? style.baseline
          : diff.state === "removed"
            ? style.kept
            : style[kind];
      return (
        `<tr style="background:${s.bg};">` +
        `<td style="color:${s.fg};padding:0 6px;user-select:none;vertical-align:top;">${s.sign}</td>` +
        `<td style="color:${s.fg};white-space:pre-wrap;word-break:break-word;padding:2px 8px;">${escapeHtml(text)}</td>` +
        `</tr>`
      );
    })
    .join("");
  return `<table style="border-collapse:collapse;width:100%;font-family:monospace;font-size:12px;line-height:1.5;">${rows}</table>`;
}
