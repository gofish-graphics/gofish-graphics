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
const LOWLEVEL_HELPERS_PY = join(PYTHON_STORIES_DIR, "_lowlevel_helpers.py");
const VEGA_URLS_PY = join(PYTHON_STORIES_DIR, "vega_data_urls.py");
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
function mapJsToPython(jsFileRelToRepo: string): string {
  const absPath = join(REPO_ROOT, jsFileRelToRepo);
  let title: string | null = null;
  try {
    const content = readFileSync(absPath, "utf-8");
    const m = content.match(/title:\s*["'](.+?)["']/);
    if (m) title = m[1];
  } catch {
    /* unreadable — no python file possible */
  }
  if (!title) return "";
  const segments = title.split("/").map(toKebab);
  const dirPath = segments.slice(0, -1).join("/");
  const basePart = segments[segments.length - 1].replace(/-/g, "_");
  return `tests/python-stories/${dirPath}/test_${basePart}.py`;
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

/** Remove common leading indentation and trim blank edges. */
function dedent(text: string): string {
  const lines = text.replace(/\t/g, "    ").split("\n");
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  const indents = lines
    .filter((l) => l.trim() !== "")
    .map((l) => l.match(/^ */)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n");
}

function indentBlock(text: string, pad: string): string {
  return text
    .split("\n")
    .map((l) => (l.trim() === "" ? l : pad + l))
    .join("\n");
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

/** Given text[openIndex] === an opening bracket, returns the index of its
 * matching close, skipping over string literals and `#` comments. -1 if
 * unbalanced. */
function scanBalanced(text: string, openIndex: number): number {
  let depth = 0;
  let i = openIndex;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === "#") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const triple = text.slice(i, i + 3) === quote.repeat(3);
      let j = i + (triple ? 3 : 1);
      while (j < n) {
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
      i = j;
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
    if (ch === "#") {
      while (i < end && text[i] !== "\n") i++;
      continue;
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
      i = j;
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

/** Transitive closure of data.py names, rendered as standalone Python source
 * (JSON-backed names inlined as Python literals; others kept verbatim). */
function buildDatasetCode(names: string[]): string | null {
  const mod = loadDataModule();
  const closure = new Set<string>();
  const worklist = [...names];
  while (worklist.length) {
    const name = worklist.pop()!;
    if (closure.has(name)) continue;
    const block = mod.byName.get(name);
    if (!block) continue; // not a data.py name — ignore (handled elsewhere or missing)
    closure.add(name);
    for (const dep of referencedIdentifiers(block.text)) {
      if (dep !== name && mod.byName.has(dep) && !closure.has(dep))
        worklist.push(dep);
    }
  }
  if (closure.size === 0) return null;

  const parts: string[] = [];
  for (const block of mod.blocks) {
    if (!block.name || !closure.has(block.name)) continue;
    const jsonName = jsonLoadName(block);
    if (jsonName) {
      const jsonPath = join(LOWLEVEL_DATA_DIR, `${jsonName}.json`);
      const parsed = JSON.parse(readFileSync(jsonPath, "utf-8"));
      parts.push(`${block.name} = ${pyRepr(parsed)}`);
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
// _lowlevel_helpers.py / vega_data_urls.py — small internal modules that get
// inlined wholesale (dropping their own docstring/imports handling is done
// generically below via the same import-classification pass).
// ---------------------------------------------------------------------------

let lowlevelHelpersCache: string | undefined;
function lowlevelHelpersSource(): string {
  if (lowlevelHelpersCache !== undefined) return lowlevelHelpersCache;
  const blocks = splitTopLevelBlocks(
    readFileSync(LOWLEVEL_HELPERS_PY, "utf-8")
  );
  // Keep everything but the module docstring — the helpers' own imports
  // (`typing`) and the `_Key` type alias are needed by the function bodies.
  lowlevelHelpersCache = blocks
    .filter(
      (b) => b.kind === "import" || b.kind === "assign" || b.kind === "def"
    )
    .map((b) => stripTrailingCommentLines(b.text).trim())
    .join("\n\n\n");
  return lowlevelHelpersCache;
}

let vegaUrlsCache: string | undefined;
function vegaUrlsSource(): string {
  if (vegaUrlsCache !== undefined) return vegaUrlsCache;
  const blocks = splitTopLevelBlocks(readFileSync(VEGA_URLS_PY, "utf-8"));
  const kept = blocks.filter((b) => b.kind === "assign" || b.kind === "def");
  vegaUrlsCache =
    "import io\nfrom urllib.request import urlopen\n\nimport pandas as pd\n\n" +
    kept.map((b) => stripTrailingCommentLines(b.text).trim()).join("\n\n\n");
  return vegaUrlsCache;
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
  storyFn: string
): TransformResult {
  const blocks = splitTopLevelBlocks(fileSource);
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
  const bodyDedented = dedent(rawBody);

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
  const exprText = dedent(stripLeadingCommentLines(segments[0]));
  const optsText = dedent(stripLeadingCommentLines(segments[1]));

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
    ? "(\n" + indentBlock(exprText, "    ") + "\n)"
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
  const closure = new Set<string>();
  const worklist = [...referenced];
  while (worklist.length) {
    const name = worklist.pop()!;
    if (closure.has(name)) continue;
    const decl = topDecls.get(name);
    if (!decl) continue;
    closure.add(name);
    for (const dep of referencedIdentifiers(decl.text)) {
      if (!closure.has(dep)) worklist.push(dep);
    }
  }
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
  let needsLowlevelHelpers = false;
  let needsVegaUrls = false;

  for (const b of blocks) {
    if (b.kind !== "import") continue;
    // An import-kind block may hold more than one import statement (a
    // parenthesized multi-line import's continuation lines are indented, so
    // they stay attached to their own block; but the splitter also glues any
    // trailing comment lines before the *next* top-level statement onto this
    // block — strip those first). Re-split into individual statements at
    // column-0 `import `/`from ` lines.
    const blockText = stripTrailingCommentLines(b.text);
    const stmts: string[] = [];
    let cur: string[] = [];
    for (const line of blockText.split("\n")) {
      if (/^(?:import|from)\s/.test(line)) {
        if (cur.length) stmts.push(cur.join("\n"));
        cur = [line];
      } else if (cur.length) {
        cur.push(line);
      }
    }
    if (cur.length) stmts.push(cur.join("\n"));

    for (const stmt of stmts) {
      const parsed = parseImportStatement(stmt);
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
      if (module === "python_stories._lowlevel_helpers") {
        needsLowlevelHelpers = true;
        continue;
      }
      if (module === "python_stories.vega_data_urls") {
        needsVegaUrls = true;
        continue;
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
  if (needsLowlevelHelpers) parts.push(lowlevelHelpersSource());
  if (needsVegaUrls) parts.push(vegaUrlsSource());
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

    try {
      const result = transformPythonStory(fileSource, storyFn);
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
        const blocks = splitTopLevelBlocks(fileSource);
        const fnBlock = blocks.find(
          (b) => b.kind === "def" && b.name === storyFn
        );
        const code = fnBlock ? dedent(fnBlock.text) + "\n" : null;
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
