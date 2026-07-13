/**
 * pythonExamples.ts — build-time data layer for the docs Python example pages.
 *
 * Mirrors storyExamples.ts (see that file's header) but on the Python side: for
 * each gallery-tagged story example, it resolves the matching parity test in
 * `tests/python-stories/**​/test_*.py` (via the same title→path convention as
 * `tests/scripts/path-mapping.ts`'s `mapJsToPython`, duplicated below — this file
 * lives in a different package and pnpm workspace boundaries make a cross-package
 * import brittle for a build-time data loader) and synthesizes a standalone,
 * user-facing Python snippet from the matching `story_*` function's body.
 *
 * For examples with no Python port yet, or whose port can't be cleanly
 * transformed into a standalone snippet (unusual return shape, unrewritable
 * imports), `pythonCode` is `null` or the function's source is shown verbatim
 * (`isFallback: true`) — see loadPythonExamples() below and [id].md, which
 * render the appropriate note in either case.
 *
 * `tests/.python-sync-exempt` entries (file-level or per-export) drive
 * `renderDiverges`: true when the Python port intentionally uses a different
 * algorithm for part of its computation (e.g. ViolinPlot's scipy KDE vs the JS
 * story's fast-kde), so the live render (always the JS engine, since JS and
 * Python serialize to the same IR) may differ slightly from what the shown
 * Python code would itself produce if it could render standalone.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStoryExamples, type StoryExample } from "./storyExamples.ts";
import { dedent, indent } from "./textUtils.ts";

export interface PythonExample {
  id: string;
  /** Standalone user-facing Python snippet, or null when unported. */
  pythonCode: string | null;
  /** Collapsed `dataset.py` content, when the snippet imports named data. */
  pythonDatasetCode: string | null;
  /** True when pythonCode is the story function's source shown verbatim
   *  because the return-tuple transform didn't apply cleanly. */
  isFallback: boolean;
  /** True when this example's export is exempt in .python-sync-exempt — the
   *  Python port intentionally diverges from the JS algorithm. */
  renderDiverges: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// .vitepress/data → repo root is five levels up (same as storyExamples.ts).
const REPO_ROOT = resolve(__dirname, "../../../../..");
const TESTS_DIR = join(REPO_ROOT, "tests");
const PYTHON_STORIES_DIR = join(TESTS_DIR, "python-stories");
const DATA_PY = join(PYTHON_STORIES_DIR, "data.py");
const LOWLEVEL_DATA_DIR = join(PYTHON_STORIES_DIR, "_lowlevel_data");
const EXEMPT_FILE = join(TESTS_DIR, ".python-sync-exempt");

// ---------------------------------------------------------------------------
// path-mapping.ts duplicates (source of truth: tests/scripts/path-mapping.ts).
// Kept in lockstep by hand — both are small and rarely change together.
// ---------------------------------------------------------------------------

/** CamelCase / spaced / underscored → kebab-case. */
function toKebab(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

/** Storybook title + JS file path → the expected Python parity test file. */
const mapJsToPythonCache = new Map<string, string>();
function mapJsToPython(jsFileRelToRepo: string): string {
  const cached = mapJsToPythonCache.get(jsFileRelToRepo);
  if (cached !== undefined) return cached;
  const result = computeMapJsToPython(jsFileRelToRepo);
  mapJsToPythonCache.set(jsFileRelToRepo, result);
  return result;
}

function computeMapJsToPython(jsFileRelToRepo: string): string {
  const absPath = join(REPO_ROOT, jsFileRelToRepo);
  let title: string | null = null;
  try {
    const content = readFileSync(absPath, "utf-8");
    const m = content.match(/title:\s*["'](.+?)["']/);
    if (m) title = m[1];
  } catch {
    /* unreadable — fall through to path-based fallback */
  }

  if (title) {
    const segments = title.split("/").map(toKebab);
    const dirPath = segments.slice(0, -1).join("/");
    const basePart = segments[segments.length - 1].replace(/-/g, "_");
    return `tests/python-stories/${dirPath}/test_${basePart}.py`;
  }

  // Fallback: derive from file path (CamelCase → snake_case, flatten one level)
  let rel = jsFileRelToRepo.replace(
    /^packages\/gofish-graphics\/stories\//,
    ""
  );
  rel = rel.replace(/\.stories\.tsx$/, "");
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

/** JS story export name → the expected `story_*` Python function name. */
function exportToStoryFn(exportName: string): string {
  return "story_" + toKebab(exportName).replace(/-/g, "_");
}

// ---------------------------------------------------------------------------
// .python-sync-exempt
// ---------------------------------------------------------------------------

interface ExemptSet {
  files: Set<string>;
  exports: Map<string, Set<string>>;
}

let exemptCache: ExemptSet | undefined;
function loadExemptSet(): ExemptSet {
  if (exemptCache) return exemptCache;
  const exempt: ExemptSet = { files: new Set(), exports: new Map() };
  if (existsSync(EXEMPT_FILE)) {
    const lines = readFileSync(EXEMPT_FILE, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    for (const line of lines) {
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
  }
  exemptCache = exempt;
  return exempt;
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
// Top-level Python block splitting (shared by data.py and story files).
// ---------------------------------------------------------------------------

interface PyBlock {
  name: string | null;
  kind: "import" | "assign" | "def" | "other";
  text: string;
}

function splitTopLevelBlocks(source: string): PyBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: PyBlock[] = [];
  let current: string[] = [];
  let currentKind: PyBlock["kind"] = "other";
  let currentName: string | null = null;

  const flush = () => {
    if (current.length)
      blocks.push({
        name: currentName,
        kind: currentKind,
        text: current.join("\n"),
      });
    current = [];
  };

  for (const line of lines) {
    if (/^[A-Za-z_]/.test(line)) {
      flush();
      currentKind = "other";
      currentName = null;
      let m: RegExpExecArray | null;
      if ((m = /^(?:async\s+)?def\s+([A-Za-z_]\w*)/.exec(line))) {
        currentKind = "def";
        currentName = m[1];
      } else if (/^(?:import|from)\s/.test(line)) {
        currentKind = "import";
      } else if ((m = /^([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)/.exec(line))) {
        currentKind = "assign";
        currentName = m[1];
      }
    }
    current.push(line);
  }
  flush();
  return blocks;
}

/** Drop trailing blank lines and comment-only lines (see call site). */
function stripTrailingCommentLines(text: string): string {
  const lines = text.split("\n");
  while (lines.length) {
    const last = lines[lines.length - 1];
    if (last.trim() === "" || /^\s*#/.test(last)) lines.pop();
    else break;
  }
  return lines.join("\n");
}

/** Drop leading blank lines and comment-only lines, line-by-line — unlike a
 * blanket leading-whitespace strip, this preserves the first real content
 * line's own indentation (needed so a later dedent() sees every line's true
 * relative indent, instead of only the first line's having been clobbered
 * to column 0). */
function stripLeadingCommentLines(text: string): string {
  const lines = text.split("\n");
  while (lines.length && (lines[0].trim() === "" || /^\s*#/.test(lines[0]))) {
    lines.shift();
  }
  return lines.join("\n");
}

const PY_KEYWORDS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
  "self",
]);

function referencedIdentifiers(text: string): Set<string> {
  const out = new Set<string>();
  const re = /\b[A-Za-z_]\w*\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!PY_KEYWORDS.has(m[0])) out.add(m[0]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Balanced-expression scanning (string/comment aware).
// ---------------------------------------------------------------------------

/** If text[i] starts a `#` comment or a quoted (incl. triple-quoted) string
 * literal, returns the index to resume scanning from (the comment's trailing
 * newline, or just past the string's closing quote — possibly `end` if
 * unterminated). Returns null when text[i] is neither, so the caller falls
 * through to its normal per-character handling. Shared by scanBalanced() and
 * splitTopLevel() so both stay string/comment-aware identically. */
function skipStringOrComment(
  text: string,
  i: number,
  end: number
): number | null {
  const ch = text[i];
  if (ch === "#") {
    let j = i;
    while (j < end && text[j] !== "\n") j++;
    return j;
  }
  if (ch === '"' || ch === "'") {
    const quote = ch;
    const triple = text.slice(i, i + 3) === quote.repeat(3);
    let j = i + (triple ? 3 : 1);
    while (j < end) {
      if (text[j] === "\\") {
        j += 2;
        continue;
      }
      if (triple) {
        if (text.slice(j, j + 3) === quote.repeat(3)) {
          j += 3;
          break;
        }
      } else if (text[j] === quote) {
        j += 1;
        break;
      }
      j++;
    }
    return j;
  }
  return null;
}

/** Given text[openIndex] === an opening bracket, returns the index of its
 * matching close, skipping over string literals and `#` comments. -1 if
 * unbalanced. */
function scanBalanced(text: string, openIndex: number): number {
  let depth = 0;
  let i = openIndex;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    const skip = skipStringOrComment(text, i, n);
    if (skip !== null) {
      i = skip;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** Top-level (depth-0 relative to [start, end)) comma-separated segments. */
function splitTopLevel(text: string, start: number, end: number): string[] {
  const segments: string[] = [];
  let depth = 0;
  let segStart = start;
  let i = start;
  while (i < end) {
    const ch = text[i];
    const skip = skipStringOrComment(text, i, end);
    if (skip !== null) {
      i = skip;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      segments.push(text.slice(segStart, i));
      segStart = i + 1;
    }
    i++;
  }
  const last = text.slice(segStart, end).trim();
  if (last) segments.push(text.slice(segStart, end));
  return segments;
}

// ---------------------------------------------------------------------------
// data.py — dataset extraction
// ---------------------------------------------------------------------------

interface DataModule {
  blocks: PyBlock[];
  byName: Map<string, PyBlock>;
}

let dataModuleCache: DataModule | undefined;
function loadDataModule(): DataModule {
  if (dataModuleCache) return dataModuleCache;
  const source = readFileSync(DATA_PY, "utf-8");
  const blocks = splitTopLevelBlocks(source);
  const byName = new Map<string, PyBlock>();
  for (const b of blocks) {
    if (b.name && (b.kind === "assign" || b.kind === "def"))
      byName.set(b.name, b);
  }
  dataModuleCache = { blocks, byName };
  return dataModuleCache;
}

/** JS→Python literal printer (True/False/None, double-quoted strings). */
function pyRepr(value: unknown, indent = 0): string {
  const pad = "    ".repeat(indent);
  const pad1 = "    ".repeat(indent + 1);
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => pad1 + pyRepr(v, indent + 1));
    return "[\n" + items.join(",\n") + ",\n" + pad + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return "{}";
  const items = keys.map(
    (k) => pad1 + JSON.stringify(k) + ": " + pyRepr(obj[k], indent + 1)
  );
  return "{\n" + items.join(",\n") + ",\n" + pad + "}";
}

/** Resolve a `_load_json("name")` RHS to inlined JSON data, or null. */
function jsonLoadName(block: PyBlock): string | null {
  const m = /=\s*_load_json\(\s*["']([^"']+)["']\s*\)/.exec(block.text);
  return m ? m[1] : null;
}

/** Transitive closure of `byName`'s keys reachable from `seeds` by identifier
 * reference (a name pulls in every other name its block's text mentions).
 * Shared by buildDatasetCode() (data.py names) and transformPythonStory()'s
 * decl closure (story-file top-level names) — same worklist/visited-set
 * shape, different `byName` map. */
function closeOverDecls(
  byName: Map<string, PyBlock>,
  seeds: Iterable<string>
): Set<string> {
  const closure = new Set<string>();
  const worklist = [...seeds];
  while (worklist.length) {
    const name = worklist.pop()!;
    if (closure.has(name)) continue;
    const block = byName.get(name);
    if (!block) continue; // not in this map — ignore (handled elsewhere or missing)
    closure.add(name);
    for (const dep of referencedIdentifiers(block.text)) {
      if (!closure.has(dep)) worklist.push(dep);
    }
  }
  return closure;
}

/** Transitive closure of data.py names, rendered as standalone Python source
 * (JSON-backed names inlined as Python literals; others kept verbatim). */
const jsonReprCache = new Map<string, string>();
function buildDatasetCode(names: string[]): string | null {
  const mod = loadDataModule();
  const closure = closeOverDecls(mod.byName, names);
  if (closure.size === 0) return null;

  const parts: string[] = [];
  for (const block of mod.blocks) {
    if (!block.name || !closure.has(block.name)) continue;
    const jsonName = jsonLoadName(block);
    if (jsonName) {
      let repr = jsonReprCache.get(jsonName);
      if (repr === undefined) {
        const jsonPath = join(LOWLEVEL_DATA_DIR, `${jsonName}.json`);
        const parsed = JSON.parse(readFileSync(jsonPath, "utf-8"));
        repr = pyRepr(parsed);
        jsonReprCache.set(jsonName, repr);
      }
      parts.push(`${block.name} = ${repr}`);
    } else {
      parts.push(stripTrailingCommentLines(block.text).trim());
    }
  }
  return parts.join("\n\n") + "\n";
}

type ParsedImport =
  | { kind: "from"; module: string; names: string[] }
  | { kind: "import"; spec: string };

/** Parse one `import x` / `from m import a, b` / `from m import (\n a,\n b,\n)`
 * statement (comments already stripped by the caller's block trimming). */
function parseImportStatement(stmt: string): ParsedImport | null {
  const collapsed = stmt.replace(/#.*$/gm, "").trim();
  let m = /^from\s+([\w.]+)\s+import\s*\(([\s\S]*)\)\s*$/.exec(collapsed);
  if (m) {
    const names = m[2]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { kind: "from", module: m[1], names };
  }
  m = /^from\s+([\w.]+)\s+import\s+(.+)$/.exec(collapsed);
  if (m) {
    const names = m[2]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { kind: "from", module: m[1], names };
  }
  m = /^import\s+(.+)$/.exec(collapsed);
  if (m) return { kind: "import", spec: m[1].trim() };
  return null;
}

// ---------------------------------------------------------------------------
// Sibling modules (`_lowlevel_helpers.py`, `vega_data_urls.py`, …) — small
// internal `tests/python-stories/<leaf>.py` modules that a story imports from
// as `from python_stories.<leaf> import ...` and that get inlined wholesale
// into the standalone snippet, in place of that import.
// ---------------------------------------------------------------------------

let siblingModuleCache: Map<string, string> | undefined;
function inlineSiblingModule(moduleLeaf: string): string {
  if (!siblingModuleCache) siblingModuleCache = new Map();
  const cached = siblingModuleCache.get(moduleLeaf);
  if (cached !== undefined) return cached;
  const blocks = splitTopLevelBlocks(
    readFileSync(join(PYTHON_STORIES_DIR, `${moduleLeaf}.py`), "utf-8")
  );
  // Keep everything but the module docstring (docstrings land in an "other"
  // block, excluded below) and any self-imports of other python_stories.*
  // siblings (not standalone-inlinable) — the module's own third-party/stdlib
  // imports and its def/assign blocks are what the function bodies need.
  const source = blocks
    .filter((b) => {
      if (b.kind === "def" || b.kind === "assign") return true;
      if (b.kind === "import")
        return !/^\s*from\s+python_stories\./m.test(b.text);
      return false;
    })
    .map((b) => stripTrailingCommentLines(b.text).trim())
    .join("\n\n\n");
  siblingModuleCache.set(moduleLeaf, source);
  return source;
}

// ---------------------------------------------------------------------------
// Per-story transform
// ---------------------------------------------------------------------------

interface TransformResult {
  code: string;
  datasetCode: string | null;
  isFallback: boolean;
}

class FallbackNeeded extends Error {}

function transformPythonStory(
  fileSource: string,
  storyFn: string,
  blocks: PyBlock[]
): TransformResult {
  const fnBlock = blocks.find((b) => b.kind === "def" && b.name === storyFn);
  if (!fnBlock) throw new FallbackNeeded(`function ${storyFn} not found`);

  const fnLines = fnBlock.text.split("\n");
  const headerIdx = fnLines.findIndex((l) => /^def\s/.test(l));
  // Drop trailing blank/comment-only lines (section-header comments before the
  // *next* top-level block get swept into this block's text by the splitter,
  // and — being flush with column 0 — would otherwise poison dedent()'s
  // "minimum indentation" computation).
  const rawBody = stripTrailingCommentLines(
    fnLines.slice(headerIdx + 1).join("\n")
  );
  const bodyDedented = dedent(rawBody, 4);

  // Find the top-level `return` statement — either a parenthesized tuple
  // (`return (\n  expr,\n  {...},\n)`) or a bare one-line tuple
  // (`return expr, {...}`).
  const returnRe = /^return\s*/m;
  const m = returnRe.exec(bodyDedented);
  if (!m) throw new FallbackNeeded("no top-level return statement");
  const afterReturn = m.index + m[0].length;
  let segments: string[];
  if (bodyDedented[afterReturn] === "(") {
    const closeParen = scanBalanced(bodyDedented, afterReturn);
    if (closeParen === -1) throw new FallbackNeeded("unbalanced return tuple");
    segments = splitTopLevel(bodyDedented, afterReturn + 1, closeParen);
  } else {
    // Bare tuple: everything after `return ` to the end of the (already
    // trailing-comment-stripped) body is the tuple's contents.
    segments = splitTopLevel(bodyDedented, afterReturn, bodyDedented.length);
  }
  if (segments.length !== 2) {
    throw new FallbackNeeded(
      `return tuple has ${segments.length} top-level elements, expected 2`
    );
  }
  // dedent() (not trim()) so a multi-line chain's continuation lines
  // (`.flow(...)`, `.mark(...)`, …) stay aligned with its first line — trim()
  // only strips the first line's own leading whitespace, misaligning it.
  const exprText = dedent(stripLeadingCommentLines(segments[0]), 4);
  const optsText = dedent(stripLeadingCommentLines(segments[1]), 4);

  // Build the .render(...) call from the options segment.
  let renderCall: string;
  if (/^[A-Za-z_]\w*$/.test(optsText)) {
    // bare identifier — dict-unpack it (e.g. `_RENDER`)
    renderCall = `.render(**${optsText})`;
  } else if (optsText.startsWith("{")) {
    const closeBrace = scanBalanced(optsText, 0);
    if (closeBrace === -1) throw new FallbackNeeded("unbalanced options dict");
    const kwSegs = splitTopLevel(optsText, 1, closeBrace);
    const kwargs: string[] = [];
    for (const seg of kwSegs) {
      const colon = seg.indexOf(":");
      if (colon === -1)
        throw new FallbackNeeded("options dict entry missing ':'");
      const keyRaw = seg.slice(0, colon).trim();
      const key = keyRaw.replace(/^["']|["']$/g, "");
      if (!/^[A-Za-z_]\w*$/.test(key))
        throw new FallbackNeeded(`non-identifier option key ${keyRaw}`);
      const value = seg.slice(colon + 1).trim();
      kwargs.push(`${key}=${value}`);
    }
    renderCall = `.render(${kwargs.join(", ")})`;
  } else {
    throw new FallbackNeeded(
      "options segment is neither a dict literal nor a bare identifier"
    );
  }

  const preambleText = bodyDedented.slice(0, m.index).trim();
  // A multi-line chain (`chart(...)\n.flow(...)\n.mark(...)`) is only valid
  // as a bare statement when wrapped in parens — Python has no implicit
  // continuation across lines outside brackets. Always wrap (harmless when
  // exprText is already self-bracketed, e.g. a single `spread(...)` call)
  // rather than special-casing which shapes need it.
  const wrappedExpr = exprText.includes("\n")
    ? "(\n" + indent(exprText, "    ") + "\n)"
    : `(${exprText})`;
  const mainStatement = wrappedExpr + renderCall;
  const bodyParts = [preambleText, mainStatement].filter(Boolean);

  // ----- closure over referenced module-level decls (helpers/consts) -----
  const referenced = referencedIdentifiers(bodyDedented);
  const topDecls = new Map<string, PyBlock>();
  for (const b of blocks) {
    if (
      b.name &&
      (b.kind === "assign" || b.kind === "def") &&
      b.name !== storyFn
    ) {
      topDecls.set(b.name, b);
    }
  }
  const closure = closeOverDecls(topDecls, referenced);
  const declLines: string[] = [];
  for (const b of blocks) {
    if (
      b.name &&
      closure.has(b.name) &&
      (b.kind === "assign" || b.kind === "def")
    ) {
      declLines.push(stripTrailingCommentLines(b.text).trim());
    }
  }

  // ----- imports -----
  const gofishNames = new Set<string>();
  const datasetNames = new Set<string>();
  const keepImportLines: string[] = [];
  const inlinedSiblingModules: string[] = [];
  const seenSiblingModules = new Set<string>();

  for (const b of blocks) {
    if (b.kind !== "import") continue;
    // splitTopLevelBlocks() flushes on every column-0 identifier line (see its
    // definition), so an import block can never contain more than one
    // top-level import statement — parse it directly.
    const parsed = parseImportStatement(stripTrailingCommentLines(b.text));
    if (!parsed) continue;
    if (parsed.kind === "import") {
      keepImportLines.push(`import ${parsed.spec}`);
      continue;
    }
    const { module, names } = parsed;
    if (module === "gofish") {
      keepImportLines.push(`from gofish import ${names.join(", ")}`);
      continue;
    }
    if (module === "python_stories.data") {
      for (const n of names) datasetNames.add(n);
      continue;
    }
    const siblingMatch = /^python_stories\.(\w+)$/.exec(module);
    if (siblingMatch) {
      const leaf = siblingMatch[1];
      if (existsSync(join(PYTHON_STORIES_DIR, `${leaf}.py`))) {
        if (!seenSiblingModules.has(leaf)) {
          seenSiblingModules.add(leaf);
          inlinedSiblingModules.push(inlineSiblingModule(leaf));
        }
        continue;
      }
    }
    if (module.startsWith("python_stories")) {
      throw new FallbackNeeded(
        `unrewritable internal import: from ${module} import ...`
      );
    }
    if (module.startsWith(".")) {
      throw new FallbackNeeded(`relative import: from ${module} import ...`);
    }
    // stdlib / third-party import — keep verbatim
    keepImportLines.push(`from ${module} import ${names.join(", ")}`);
  }
  if (/\bsys\.path\b/.test(fileSource)) {
    throw new FallbackNeeded("story file manipulates sys.path");
  }

  if (datasetNames.size) {
    keepImportLines.push(
      `from dataset import ${[...datasetNames].sort().join(", ")}`
    );
  }

  const parts: string[] = [];
  if (keepImportLines.length) parts.push(keepImportLines.join("\n"));
  parts.push(...inlinedSiblingModules);
  if (declLines.length) parts.push(declLines.join("\n\n"));
  parts.push(bodyParts.join("\n\n"));

  const code = parts.join("\n\n") + "\n";
  const datasetCode = datasetNames.size
    ? buildDatasetCode([...datasetNames])
    : null;

  return { code, datasetCode, isFallback: false };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** splitTopLevelBlocks(fileSource), memoized per parity-file path — a story
 * file backs one path but may hold several `story_*` functions (one per
 * gallery example), so this is re-read across map() iterations. */
const storyBlocksCache = new Map<string, PyBlock[]>();
function loadStoryBlocks(path: string, fileSource: string): PyBlock[] {
  let blocks = storyBlocksCache.get(path);
  if (!blocks) {
    blocks = splitTopLevelBlocks(fileSource);
    storyBlocksCache.set(path, blocks);
  }
  return blocks;
}

let cache: PythonExample[] | undefined;

export function loadPythonExamples(): PythonExample[] {
  if (cache) return cache;
  const exempt = loadExemptSet();
  const jsExamples = loadStoryExamples();
  const warnings: string[] = [];

  const examples: PythonExample[] = jsExamples.map((ex: StoryExample) => {
    const renderDiverges = isExportExempt(exempt, ex.storyFile, ex.exportName);
    const pyRelPath = mapJsToPython(ex.storyFile);
    const pyAbsPath = pyRelPath ? join(REPO_ROOT, pyRelPath) : "";
    if (!pyRelPath || !existsSync(pyAbsPath)) {
      return {
        id: ex.id,
        pythonCode: null,
        pythonDatasetCode: null,
        isFallback: false,
        renderDiverges,
      };
    }

    const fileSource = readFileSync(pyAbsPath, "utf-8");
    const storyFn = exportToStoryFn(ex.exportName);
    const blocks = loadStoryBlocks(pyAbsPath, fileSource);

    try {
      const result = transformPythonStory(fileSource, storyFn, blocks);
      return {
        id: ex.id,
        pythonCode: result.code,
        pythonDatasetCode: result.datasetCode,
        isFallback: false,
        renderDiverges,
      };
    } catch (err) {
      if (err instanceof FallbackNeeded) {
        // Function-not-found is not a real port — treat as unported. Any other
        // failure means a port exists but the transform couldn't cleanly
        // standalone-ify it; fall back to verbatim source.
        if (/not found$/.test(err.message)) {
          return {
            id: ex.id,
            pythonCode: null,
            pythonDatasetCode: null,
            isFallback: false,
            renderDiverges,
          };
        }
        warnings.push(`${ex.id} (${pyRelPath}::${storyFn}): ${err.message}`);
        const fnBlock = blocks.find(
          (b) => b.kind === "def" && b.name === storyFn
        );
        const code = fnBlock ? dedent(fnBlock.text, 4) + "\n" : null;
        return {
          id: ex.id,
          pythonCode: code,
          pythonDatasetCode: null,
          isFallback: code !== null,
          renderDiverges,
        };
      }
      throw err;
    }
  });

  if (warnings.length) {
    console.warn(
      `[pythonExamples] ${warnings.length} example(s) fell back to verbatim Python source (transform did not apply cleanly):\n` +
        warnings.map((w) => `  - ${w}`).join("\n")
    );
  }

  cache = examples;
  return examples;
}

export function getPythonExampleById(id: string): PythonExample | undefined {
  return loadPythonExamples().find((ex) => ex.id === id);
}
