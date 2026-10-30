/**
 * story-warnings.ts
 *
 * A story's warnings are part of its snapshot, like its DOM and screenshot.
 * They are what the story printed to the browser console that says something
 * is wrong: every layout warning (a line starting with `[gofish:layout]`, see
 * gofish-graphics' `layoutWarnings.ts`), every `console.error`, and every
 * uncaught page error. The capture (capture-core.ts) writes them, sorted, one
 * per line, to `<path>.warnings.txt` next to the story's `<path>.html` (see
 * `snapshotParts` in diff-utils.ts), and the snapshot branch stores that file
 * next to the DOM baseline in `dom/`.
 *
 * A change in a story's warnings is a diff to review exactly like a DOM
 * change, even when the DOM is identical (`diffSnapshot` in diff-utils.ts).
 *
 * This module holds the warnings-only parts: turning console messages into
 * lines (capture-core.ts) and diffing two lists of lines.
 */

import { normalizeConsoleText } from "./normalize-dom.js";

/** The prefix of a layout warning's console line (`LAYOUT_WARNING_PREFIX`
 *  in gofish-graphics' `layoutWarnings.ts`). */
export const LAYOUT_WARNING_PREFIX = "[gofish:layout]";

/**
 * One console message as a warnings line, or null when it is neither a layout
 * warning nor an error. Only the first line of a message is kept: a layout
 * warning is one line by design, and the rest of an error is its stack. URLs
 * of the dev server in that line are normalized (`normalizeConsoleText`), so
 * two captures of the same story from different checkouts (capture-diff)
 * agree. `repoRoot` is the checkout the dev server serves.
 */
export function consoleWarningLine(
  type: string,
  text: string,
  repoRoot: string
): string | null {
  const isLayout = text.startsWith(LAYOUT_WARNING_PREFIX);
  if (!isLayout && type !== "error") return null;
  const line = normalizeConsoleText(text, repoRoot);
  return isLayout ? line : `[console.error] ${line}`;
}

/** An uncaught page error as a warnings line (see `consoleWarningLine`). */
export function pageErrorLine(message: string, repoRoot: string): string {
  return `[pageerror] ${normalizeConsoleText(message, repoRoot)}`;
}

/** The file contents for `lines`: sorted, one per line. Empty when none. */
export function serializeWarnings(lines: readonly string[]): string {
  return [...lines]
    .sort()
    .map((l) => `${l}\n`)
    .join("");
}

/** A warnings file's contents as its lines, sorted (the one place they are
 *  sorted on read; `diffWarnings` relies on it). */
export function parseWarnings(contents: string): string[] {
  return contents.split("\n").filter(Boolean).sort();
}

/**
 * How a story's warnings compare to its baseline's:
 *   - `same`: equal (possibly both empty)
 *   - `changed`: lines were added or removed
 *   - `unrecorded`: the baseline has no warnings file, so there is nothing
 *     to compare against; not a diff on its own (see `diffSnapshot`)
 *   - `new`: the story has no baseline at all
 *   - `removed`: the story no longer renders
 */
export type WarningsState =
  | "same"
  | "changed"
  | "unrecorded"
  | "new"
  | "removed";

export interface WarningsLine {
  text: string;
  kind: "added" | "removed" | "kept";
}

export interface WarningsDiff {
  state: WarningsState;
  /** Each line of either side, tagged with the side it is on: the removed
   *  lines, then the added, then the kept, each sorted. A line on both
   *  sides is `kept`; duplicates are matched one for one. */
  lines: WarningsLine[];
}

/**
 * The multiset diff of two sorted lists of warnings lines: `same` when they
 * are equal, else `changed`. The other states have one side missing, which
 * `diffSnapshot` handles.
 */
export function diffWarnings(
  before: readonly string[],
  after: readonly string[]
): WarningsDiff {
  const unmatched = new Map<string, number>();
  for (const text of before) unmatched.set(text, (unmatched.get(text) ?? 0) + 1);
  const added: WarningsLine[] = [];
  const kept: WarningsLine[] = [];
  for (const text of after) {
    const n = unmatched.get(text) ?? 0;
    if (n > 0) {
      unmatched.set(text, n - 1);
      kept.push({ text, kind: "kept" });
    } else {
      added.push({ text, kind: "added" });
    }
  }
  const removed: WarningsLine[] = [...unmatched].flatMap(([text, n]) =>
    Array.from({ length: n }, () => ({ text, kind: "removed" as const }))
  );
  const lines = [...removed, ...added, ...kept];
  return {
    state: removed.length + added.length > 0 ? "changed" : "same",
    lines,
  };
}
