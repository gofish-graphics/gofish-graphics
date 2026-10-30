/**
 * Shared utilities for diff collection, story acceptance, and DOM diff formatting.
 *
 * The snapshot model lives here too: what files make up one story's
 * snapshot (`snapshotParts`), how to read one (`readSnapshot`), and how two
 * compare (`diffSnapshot`, `diffSnapshotDirs`). The CI compare, the reports,
 * the review site, accept, the snapshot-branch overlay and capture-diff all
 * use it.
 */

import {
  readFileSync,
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
  parseWarnings,
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
// The snapshot model
// ---------------------------------------------------------------------------

/**
 * The files of one story's snapshot, named by the story's DOM path
 * (`forward-syntax/bar--basic.html`):
 *   - `dom`: the normalized DOM, `<name>.html`
 *   - `warnings`: its warnings, `<name>.warnings.txt` (story-warnings.ts)
 *   - `screenshot`: its screenshot, `<name>.png`
 */
export type SnapshotPart = "dom" | "warnings" | "screenshot";
export type SnapshotParts = Record<SnapshotPart, string>;

const PART_SUFFIX: SnapshotParts = {
  dom: ".html",
  warnings: ".warnings.txt",
  screenshot: ".png",
};
/** Where each part lives in a baseline dir (the snapshot branch layout). */
const BASELINE_SUBDIR: SnapshotParts = {
  dom: "dom",
  warnings: "dom",
  screenshot: "screenshots",
};
const PARTS = Object.keys(PART_SUFFIX) as SnapshotPart[];

/** The parts of the story whose DOM is `path`, relative to a capture dir
 *  (`tmp/js/`, where all three sit side by side). */
export function snapshotParts(path: string): SnapshotParts {
  const stem = path.replace(/\.html$/, "");
  return {
    dom: stem + PART_SUFFIX.dom,
    warnings: stem + PART_SUFFIX.warnings,
    screenshot: stem + PART_SUFFIX.screenshot,
  };
}

/** The same parts relative to a baseline dir (`__snapshots__/`, a
 *  snapshot-branch checkout): DOM and warnings in `dom/`, the screenshot
 *  in `screenshots/`. */
export function baselineParts(path: string): SnapshotParts {
  const parts = snapshotParts(path);
  return {
    dom: `${BASELINE_SUBDIR.dom}/${parts.dom}`,
    warnings: `${BASELINE_SUBDIR.warnings}/${parts.warnings}`,
    screenshot: `${BASELINE_SUBDIR.screenshot}/${parts.screenshot}`,
  };
}

/** The story (its DOM path) that the baseline-dir file `file` is a part
 *  of, or null when it is no part of a snapshot. */
export function storyOfBaselineFile(file: string): string | null {
  for (const part of PARTS) {
    const dir = `${BASELINE_SUBDIR[part]}/`;
    if (file.startsWith(dir) && file.endsWith(PART_SUFFIX[part])) {
      return (
        file.slice(dir.length, -PART_SUFFIX[part].length) + PART_SUFFIX.dom
      );
    }
  }
  return null;
}

/**
 * A story's DOM and warnings, as read from one side of a diff.
 * `warnings` is null when there is no warnings file next to the DOM. On the
 * capture side that is an error (the capture always writes one); on the
 * baseline side it is a baseline recorded before warnings were captured
 * (see `diffSnapshot`).
 */
export interface Snapshot {
  dom: string;
  warnings: string[] | null;
}

/** The snapshot of `path` in `dir` (a capture dir, or a baseline dir's
 *  `dom/`), or null when there is no DOM file for it. */
export function readSnapshot(dir: string, path: string): Snapshot | null {
  const parts = snapshotParts(path);
  const dom = readOptional(join(dir, parts.dom));
  if (dom === null) return null;
  const warnings = readOptional(join(dir, parts.warnings));
  return { dom, warnings: warnings === null ? null : parseWarnings(warnings) };
}

/** What changed between two snapshots of a story that both exist. */
export type SnapshotChange = "dom" | "warnings" | "both";

export interface SnapshotDiff {
  path: string;
  /** `new`: no `before`; `removed`: no `after`; `changed` / `same`. */
  kind: "new" | "removed" | "changed" | "same";
  /** For `changed`, what changed; null otherwise. */
  change: SnapshotChange | null;
  warnings: WarningsDiff;
  before: Snapshot | null;
  after: Snapshot | null;
}

/**
 * Compares a story's `before` (baseline) and `after` (capture) snapshots.
 * A story whose DOM or warnings differ has `changed`, even when the other
 * part is identical.
 *
 * TODO(#1262): a `before` with no warnings file is `unrecorded`: a baseline
 * from before warnings were captured. It compares as no change of warnings,
 * so those baselines do not fail CI on their own. This is a migration state:
 * once snapshots/main and the open branches carry warnings files, a missing
 * baseline warnings file becomes an error like a missing capture one.
 */
export function diffSnapshot(
  path: string,
  before: Snapshot | null,
  after: Snapshot | null
): SnapshotDiff {
  const tag = (lines: string[], kind: "added" | "removed") =>
    lines.map((text) => ({ text, kind }));
  if (after !== null && after.warnings === null) {
    throw new Error(
      `${path}: the capture has a DOM but no warnings file. The capture ` +
        "always writes one, so this capture is incomplete."
    );
  }
  const afterWarnings = after?.warnings ?? [];
  const result = (
    kind: SnapshotDiff["kind"],
    change: SnapshotChange | null,
    warnings: WarningsDiff
  ): SnapshotDiff => ({ path, kind, change, warnings, before, after });

  if (before === null && after === null) {
    throw new Error(`${path}: no snapshot on either side`);
  }
  if (before === null) {
    return result("new", null, {
      state: "new",
      lines: tag(afterWarnings, "added"),
    });
  }
  if (after === null) {
    return result("removed", null, {
      state: "removed",
      lines: tag(before.warnings ?? [], "removed"),
    });
  }
  const warnings: WarningsDiff =
    before.warnings === null
      ? { state: "unrecorded", lines: tag(afterWarnings, "added") }
      : diffWarnings(before.warnings, afterWarnings);
  const dom = before.dom !== after.dom;
  const warned = warnings.state === "changed";
  const change = dom && warned ? "both" : dom ? "dom" : warned ? "warnings" : null;
  return result(change ? "changed" : "same", change, warnings);
}

/** A `SnapshotDiff` of a story that is not the same on both sides. */
export type StoryChange = SnapshotDiff & {
  kind: Exclude<SnapshotDiff["kind"], "same">;
};

/**
 * Every story of `beforeDir` (baselines) and `afterDir` (a capture) whose
 * snapshot is new, removed or changed, sorted by path. The CI regression
 * check (`collectJsDiffs`) and capture-diff both use it.
 */
export function diffSnapshotDirs(
  beforeDir: string,
  afterDir: string
): StoryChange[] {
  const paths = [
    ...new Set([...listHtmlFiles(beforeDir), ...listHtmlFiles(afterDir)]),
  ].sort();
  return paths
    .map((path) =>
      diffSnapshot(
        path,
        readSnapshot(beforeDir, path),
        readSnapshot(afterDir, path)
      )
    )
    .filter((d): d is StoryChange => d.kind !== "same");
}

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
  /** For a regression, what changed (`diffSnapshot`); "dom" for a parity
   *  entry; null for a new or removed story. */
  change: SnapshotChange | null;
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

/** The file's contents, or null when it does not exist. */
export function readOptional(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Collect diffs
// ---------------------------------------------------------------------------

/**
 * The JS capture (`JS_DIR`) against the baselines (`diffSnapshotDirs`): a
 * story with no baseline is "new", one with a baseline but no capture is
 * "removed" (deleted or renamed since the baseline was recorded; accepting
 * it deletes the baseline), and one whose DOM or warnings changed is a
 * "regression". This is the one regression check: compare.ts gates on it
 * and the reports list it.
 */
export function collectJsDiffs(): DiffEntry[] {
  return diffSnapshotDirs(BASELINE_DOM, JS_DIR).map((d) => {
    const png = snapshotParts(d.path).screenshot;
    const beforePng = join(BASELINE_SCREENSHOTS, png);
    const afterPng = join(JS_DIR, png);
    return {
      path: d.path,
      kind: d.kind === "changed" ? "regression" : d.kind,
      status: "pending",
      beforeDom: d.before?.dom ?? null,
      afterDom: d.after?.dom ?? null,
      beforeScreenshotPath:
        d.before && existsSync(beforePng) ? beforePng : null,
      afterScreenshotPath: d.after && existsSync(afterPng) ? afterPng : null,
      diffPercent: null,
      warnings: d.warnings,
      change: d.change,
    };
  });
}

/**
 * Every diff a review lists: the JS diffs (`collectJsDiffs`) followed by the
 * parity diffs. The diff report (with its machine-readable `diff-list.json`),
 * the review site and the local review server all show this one list.
 */
export function collectReviewDiffs(): DiffEntry[] {
  return [...collectJsDiffs(), ...collectParityDiffs()];
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
 * Warnings are not compared (#1263).
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

    const pngFile = snapshotParts(file).screenshot;
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
      change: "dom",
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
 * Copies a story's snapshot (`snapshotParts`) from a capture dir into a
 * baseline directory laid out like the snapshot branch (`baselineParts`).
 * Defaults to the local capture and the local `__snapshots__/` cache.
 *
 * The DOM and warnings files must exist: the capture always writes both. The
 * screenshot is the one optional part, because a DOM-only capture
 * (capture-diff, `screenshot: false`) writes none; then the baseline's is
 * deleted, so a baseline never pairs a new DOM with an old screenshot.
 */
export function acceptStory(
  path: string,
  { captureDir = JS_DIR, baselineDir = BASELINE_DIR } = {}
): void {
  const from = snapshotParts(path);
  const to = baselineParts(path);
  for (const part of PARTS) {
    const src = join(captureDir, from[part]);
    const dest = join(baselineDir, to[part]);
    if (!existsSync(src)) {
      if (part !== "screenshot") {
        throw new Error(`cannot accept ${path}: the capture has no ${src}`);
      }
      rmSync(dest, { force: true });
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
  }
}

// ---------------------------------------------------------------------------
// Accept a removal (delete baseline dom + screenshot)
// ---------------------------------------------------------------------------

/**
 * Accepting a "removed" DiffEntry has no "after" state to copy in — it
 * deletes the stale baseline's parts instead. This is the manual-review
 * analog of the auto-prune in update-baselines.ts (which does the same thing
 * in bulk on every main push).
 */
export function removeBaselineStory(
  path: string,
  baselineDir = BASELINE_DIR
): void {
  for (const file of Object.values(baselineParts(path))) {
    rmSync(join(baselineDir, file), { force: true });
  }
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
// Diff formatting: shared rows, the DOM diff and the warnings panel
// ---------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** How a diff row looks. `baseline` marks a warnings line recorded for the
 *  first time (no baseline warnings to compare against). */
const ROW_STYLE = {
  added: { bg: "#d4edda", fg: "#155724", signFg: "#155724", sign: "+" },
  removed: { bg: "#f8d7da", fg: "#721c24", signFg: "#721c24", sign: "−" },
  context: { bg: "#f8f8f8", fg: "#555", signFg: "#ccc", sign: " " },
  baseline: { bg: "#e8f0fb", fg: "#1f4e8c", signFg: "#1f4e8c", sign: "•" },
};
type RowKind = keyof typeof ROW_STYLE;

/** One row of a diff table: an optional line-number cell (omitted when
 *  `lineNum` is undefined), the sign, and `html` (already escaped). */
function diffRow(kind: RowKind, html: string, lineNum?: number | ""): string {
  const s = ROW_STYLE[kind];
  const num =
    lineNum === undefined
      ? ""
      : `<td style="color:#999;text-align:right;padding:0 8px;user-select:none;min-width:40px;font-size:11px;vertical-align:top;">${lineNum}</td>`;
  return (
    `<tr style="background:${s.bg};">` +
    num +
    `<td style="color:${s.signFg};padding:0 6px;user-select:none;vertical-align:top;">${s.sign}</td>` +
    `<td style="color:${s.fg};white-space:pre-wrap;word-break:break-all;padding:0 8px;">${html}</td>` +
    `</tr>`
  );
}

function diffTable(rows: readonly string[]): string {
  return (
    `<table style="border-collapse:collapse;width:100%;font-family:monospace;font-size:12px;line-height:1.6;">` +
    rows.join("") +
    `</table>`
  );
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

      rows.push(diffRow("removed", removedHtml, ""));
      rows.push(diffRow("added", addedHtml, lineNum));
      lineNum++;
      i += 2;
    } else if (line.type === "removed") {
      rows.push(diffRow("removed", escapeHtml(line.text), ""));
      i++;
    } else {
      rows.push(diffRow(line.type, escapeHtml(line.text), lineNum));
      lineNum++;
      i++;
    }
  }

  const html = diffTable(rows);
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

/** What the DOM diff of a warnings-only change shows. */
export const DOM_IDENTICAL_NOTE = "DOM identical: only the warnings changed.";

/**
 * The DOM part of a diff entry as HTML: the line diff when both sides
 * exist and differ, `DOM_IDENTICAL_NOTE` when they are equal (a
 * warnings-only change, which never runs `formatDomDiff`), and the one side
 * as it is for a new or removed story.
 */
export function formatEntryDomDiff(
  before: string | null,
  after: string | null
): string {
  if (before !== null && after !== null) {
    return before === after
      ? `<div style="padding:8px 12px;color:#888;font-size:13px;">${DOM_IDENTICAL_NOTE}</div>`
      : formatDomDiff(before, after);
  }
  const only = after ?? before;
  return only === null
    ? ""
    : `<pre style="margin:0;white-space:pre-wrap;padding:12px;">${escapeHtml(only)}</pre>`;
}

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
 * Whether a story's warnings panel starts open: when any line is not on
 * both sides, that is, the warnings differ from the baseline's, are recorded
 * for the first time (unrecorded or new), or are going away (removed).
 * Unchanged warnings start collapsed.
 */
export function warningsPanelOpen(diff: WarningsDiff): boolean {
  return diff.lines.some((l) => l.kind !== "kept");
}

/**
 * A story's warnings panel: a `<details>` whose summary is
 * `warningsSummary` and whose body has one row per line, added lines green
 * with `+`, removed red with `−`, kept plain. In an unrecorded or new
 * baseline the lines are not new warnings, only newly recorded ones, so they
 * are marked as the new baseline instead; a removed story's are shown
 * plain. Open as `warningsPanelOpen` says. Empty (no panel) when neither
 * side has a warning, or for a parity entry (`diff` null). Inline styles
 * only, so it drops into every report and the review site alike.
 */
export function formatWarningsPanel(diff: WarningsDiff | null): string {
  if (diff === null || diff.lines.length === 0) return "";
  const rows = diff.lines.map(({ text, kind }) =>
    diffRow(
      diff.state === "unrecorded" || diff.state === "new"
        ? "baseline"
        : diff.state === "removed" || kind === "kept"
          ? "context"
          : kind,
      escapeHtml(text)
    )
  );
  const changed = diff.state === "changed";
  return (
    `<details ${warningsPanelOpen(diff) ? "open " : ""}style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin:0 0 12px;">` +
    `<summary style="cursor:pointer;font-weight:600;font-size:13px;padding:8px 12px;${changed ? "background:#fff8e1;" : ""}">Warnings: ${escapeHtml(warningsSummary(diff))}</summary>` +
    `<div style="max-height:400px;overflow:auto;border-top:1px solid #e0e0e0;">${diffTable(rows)}</div>` +
    `</details>`
  );
}
