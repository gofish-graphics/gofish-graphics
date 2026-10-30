/**
 * story-warnings.ts
 *
 * A story's warnings are part of its snapshot, like its DOM and screenshot.
 * They are what the story printed to the browser console that says something
 * is wrong: every layout warning (a line starting with `[gofish:layout]`, see
 * gofish-graphics' `layoutWarnings.ts`), every `console.error`, and every
 * uncaught page error. The capture (capture-core.ts) writes them, sorted, one
 * per line, to `<path>.warnings.txt` next to the story's `<path>.html`, and
 * the snapshot branch stores that file next to the DOM baseline in `dom/`.
 *
 * A change in a story's warnings is a diff to review exactly like a DOM
 * change, even when the DOM is identical. The one exception: a baseline
 * recorded before warnings were captured has no warnings file. Its warnings
 * are "unrecorded", which is not a diff on its own; the review shows the
 * story's current warnings as the new baseline the next accept records.
 *
 * Used by capture-core.ts (write), diff-utils.ts (the CI compare, the diff
 * report, the review site, and `formatWarningsHtml`) and capture-diff.ts
 * (the local diff).
 */

import { existsSync, readFileSync } from "fs";

/** The prefix of a layout warning's console line (`LAYOUT_WARNING_PREFIX`
 *  in gofish-graphics' `layoutWarnings.ts`). */
export const LAYOUT_WARNING_PREFIX = "[gofish:layout]";

/** `<dir>/<name>.warnings.txt` for the story whose DOM is `<dir>/<name>.html`. */
export function warningsPathFor(htmlPath: string): string {
  return htmlPath.replace(/\.html$/, ".warnings.txt");
}

/**
 * One console message as a warnings line, or null when it is neither a layout
 * warning nor an error. Only the first line of a message is kept: a layout
 * warning is one line by design, and the rest of an error is its stack, whose
 * URLs carry the dev server's port and cache-busting queries. Those are
 * stripped from the first line too, so two captures of the same story on
 * different ports (capture-diff) agree.
 */
export function consoleWarningLine(type: string, text: string): string | null {
  const first = firstLine(text);
  if (first.startsWith(LAYOUT_WARNING_PREFIX)) return first;
  if (type === "error") return `[console.error] ${first}`;
  return null;
}

/** An uncaught page error as a warnings line (see `consoleWarningLine`). */
export function pageErrorLine(message: string): string {
  return `[pageerror] ${firstLine(message)}`;
}

function firstLine(text: string): string {
  return text
    .split("\n")[0]
    .trimEnd()
    .replace(/localhost:\d+/g, "localhost")
    .replace(/[?&](?:v|t)=[0-9a-zA-Z]+/g, "");
}

/** The file contents for `lines`: sorted, one per line. Empty when none. */
export function serializeWarnings(lines: readonly string[]): string {
  return [...lines]
    .sort()
    .map((l) => `${l}\n`)
    .join("");
}

/** The warnings in `file`, or null when there is no such file. */
export function readWarnings(file: string): string[] | null {
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf-8").split("\n").filter(Boolean);
}

/**
 * How a story's warnings compare to its baseline's:
 *   - `same`: equal (possibly both empty)
 *   - `changed`: lines were added or removed
 *   - `unrecorded`: the baseline predates warnings capture (no file), so
 *     there is nothing to compare against; not a diff on its own
 *   - `new`: the story has no baseline at all
 *   - `removed`: the story no longer renders
 */
export type WarningsState =
  | "same"
  | "changed"
  | "unrecorded"
  | "new"
  | "removed";

export interface WarningsDiff {
  state: WarningsState;
  /** Each line of either side, sorted, tagged with the side it is on. A
   *  line on both sides is `kept`; duplicates are matched one for one. */
  lines: { text: string; kind: "added" | "removed" | "kept" }[];
}

/**
 * Compare a story's `before` (baseline) and `after` (capture) warnings.
 * `null` means "no warnings file": for `after`, the story did not render
 * (removed); for `before` it is a new story when `hasBaseline` is false and
 * an unrecorded baseline otherwise.
 */
export function diffWarnings(
  before: string[] | null,
  after: string[] | null,
  hasBaseline: boolean
): WarningsDiff {
  if (after === null) {
    return {
      state: "removed",
      lines: (before ?? []).map((text) => ({ text, kind: "removed" })),
    };
  }
  if (before === null) {
    return {
      state: hasBaseline ? "unrecorded" : "new",
      lines: after.map((text) => ({ text, kind: "added" })),
    };
  }
  // Multiset diff of two sorted lists, kept in sorted order.
  const a = [...before].sort();
  const b = [...after].sort();
  const lines: WarningsDiff["lines"] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i] < b[j])) {
      lines.push({ text: a[i++], kind: "removed" });
    } else if (i >= a.length || b[j] < a[i]) {
      lines.push({ text: b[j++], kind: "added" });
    } else {
      lines.push({ text: a[i++], kind: "kept" });
      j++;
    }
  }
  const changed = lines.some((l) => l.kind !== "kept");
  return { state: changed ? "changed" : "same", lines };
}
