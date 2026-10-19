/**
 * path-mapping.ts
 *
 * Pure utilities for mapping between story identities and file paths.
 * Extracted so they can be imported without triggering a script's top-level
 * imperative code.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";

const SCRIPTS_DIR = import.meta.dirname;
const TESTS_DIR = dirname(SCRIPTS_DIR);
const ROOT_DIR = dirname(TESTS_DIR);

/** CamelCase / spaced → kebab-case (one source of truth for path generation).
 *
 * Underscores fold to dashes like whitespace: Storybook's own name derivation
 * (lodash startCase) treats `_` as a word break, so the JS DOM capture path for
 * an export like `SpreadX_CenterToCenter` is `spread-x-center-to-center` — and
 * the Python capture's snake→kebab rule (capture-python-dom.ts) agrees. Without
 * this fold, resolving a `.python-sync-exempt` `file::Export` line through
 * `storyToPath` kept the underscore (`spread-x_center-to-center`) and the
 * parity-skip set never matched the captured DOM path.
 *
 * A digit before a capitalized word is a word break too (`Inner45Outer0` →
 * `inner45-outer0`), matching the export → Python name rule in
 * check-python-sync.ts (`story_…_inner45_outer0`). A digit before an acronym
 * stays joined, so the title `1D Strip Plot` is still `1d-strip-plot`.
 *
 * Whitespace around a segment is dropped first: a title written with spaces
 * around its slashes (`"GoTree / Gallery / arc-tree"`) has the same segments
 * as one written without them (`go-tree/gallery/arc-tree`). */
export const toKebab = (s: string) =>
  s
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([0-9])([A-Z][a-z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();

/**
 * Storybook title → file-level story id used by capture + parity review.
 * e.g. "atom/TitanicUnitDots" → "atom/titanic-unit-dots"
 */
export function titleToStoryId(title: string): string {
  return title.split("/").map(toKebab).join("/");
}

/**
 * Convert a Storybook story title + export name into a stable file-system path
 * used for snapshots/screenshots.
 *
 * e.g. ("Forward Syntax/Bar/Basic", "Default") → "forward-syntax/bar/basic--default"
 *
 * Shared by capture-js-dom.ts (full corpus) and capture-one.ts (single story) so
 * the two stay in lockstep if the kebab-casing rule ever changes.
 */
export function storyToPath(title: string, name: string): string {
  const segments = title.split("/").map(toKebab);
  return `${segments.join("/")}--${toKebab(name)}`;
}

/** The directories holding JS Storybook stories, relative to the repo root:
 * the main library and the gofish-gotree tree-DSL package (#792). */
export const JS_STORY_ROOTS = [
  "packages/gofish-graphics/stories",
  "packages/gofish-gotree/stories",
];

/** True for a repo-relative path to a story file under one of the roots. */
export const isJsStoryFile = (f: string) =>
  JS_STORY_ROOTS.some((r) => f.startsWith(r + "/")) &&
  f.endsWith(".stories.tsx");

/** The Storybook title of a story file's text: the one on the `Meta` object.
 * A gallery story also has a `parameters.gallery.title` (its card caption),
 * which must not be read instead. */
export function storyMetaTitle(content: string): string | undefined {
  const afterMeta = content.slice(Math.max(content.search(/:\s*Meta\b/), 0));
  return afterMeta.match(/title:\s*["'](.+?)["']/)?.[1];
}

function readOrNull(absPath: string): string | null {
  try {
    return readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Maps a JS story file path to the expected Python test file path.
 *
 * e.g. "packages/gofish-graphics/stories/forwardsyntax/Bar/BarBasic.stories.tsx"
 *   →  "tests/python-stories/forwardsyntax/bar/test_bar_basic.py"
 *
 * `content` is the story file's text, read from disk when not given; null
 * (unreadable) falls through to the path-based fallback.
 */
export function mapJsToPython(
  jsFile: string,
  content: string | null = readOrNull(join(ROOT_DIR, jsFile))
): string {
  // Read the Storybook title from the JS file and derive the Python path from it.
  // e.g. title: "Forward Syntax/Bar/Basic" → "tests/python-stories/forward-syntax/bar/test_basic.py"
  const title = content === null ? undefined : storyMetaTitle(content);

  if (title) {
    const segments = title.split("/").map(toKebab);
    const dirPath = segments.slice(0, -1).join("/");
    const basePart = segments[segments.length - 1].replace(/-/g, "_");
    return `tests/python-stories/${dirPath}/test_${basePart}.py`;
  }

  // Fallback: derive from file path (CamelCase → snake_case, flatten one level)
  const root = JS_STORY_ROOTS.find((r) => jsFile.startsWith(r + "/"));
  const rel = (root ? jsFile.slice(root.length + 1) : jsFile).replace(
    /\.stories\.tsx$/,
    ""
  );
  const lastSlash = rel.lastIndexOf("/");
  const dirPart = lastSlash >= 0 ? rel.slice(0, lastSlash) : ".";
  const basePart = lastSlash >= 0 ? rel.slice(lastSlash + 1) : rel;
  const toSnake = (s: string) =>
    s.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  const snakeBase = toSnake(basePart);
  let snakeDir = toSnake(dirPart);
  if (snakeDir.includes("/")) {
    snakeDir = snakeDir.replace(/\/[^/]*$/, "");
  }
  const prefix = snakeDir && snakeDir !== "." ? `${snakeDir}/` : "";
  return `tests/python-stories/${prefix}test_${snakeBase}.py`;
}
