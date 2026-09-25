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
import ts from "typescript";
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
// require a Python update. These kinds of difference are spec-neutral:
//
//   - **Storybook chrome** — story-level `title`, `tags`, and `parameters`
//     (e.g. the gallery annotation) are presentation metadata. Python stories
//     key off the file path and `story_*` function name, not these.
//   - **Retired API names** — the public surface is lowercase-only (#146,
//     #416): the capitalized spellings (`Chart`, `Layer`, `Spread`, `StackY`,
//     `Frame`, ...) were aliases or node-level forms of the lowercase
//     operators and are no longer exported, and `For` was renamed to `map`.
//     A pure `Layer`→`layer` / `For`→`map` rename in a JS story has no Python
//     counterpart, since Python was always lowercase (and uses list
//     comprehensions where JS maps). Rewriting each retired name to its
//     current name before comparing folds such renames out.
//   - **Import declarations** — a Python story mirrors the spec, not the JS
//     module's imports, which Python spells its own way (`from gofish import
//     ...`). Adding, removing, or reordering an import changes no spec: if a
//     spec starts using a new name, the spec body changes too. Dropping whole
//     `ImportDeclaration`s from the parsed file handles multi-line and
//     `import type` forms alike.
//   - **Import aliases** — `import { mask as maskOp }` binds a JS-local name
//     for an exported one, so renaming the alias (or dropping it) changes no
//     spec. Before the imports are dropped, every aliased identifier in the
//     body is renamed back to its exported name; the retired-name fold then
//     canonicalizes it (`MaskOp` → `Mask` → `mask`). Default and namespace
//     imports have no exported name to resolve to and are left alone.
//   - **Type annotations** — TypeScript types have no Python counterpart.
//     `ts.transpileModule` erases them (annotations, `as` casts, type
//     aliases, interfaces) after the imports are gone, so it cannot elide or
//     re-emit any import.
//   - **Comments and whitespace** — a Python story mirrors the spec, not the
//     prose around it, so a comment-only edit needs no Python change.
//     Tokenizing with the TypeScript scanner drops comments without touching
//     string contents (a `//` inside a URL string survives).
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

/** The source with every top-level import declaration removed. */
function stripImports(source: string): string {
  const file = ts.createSourceFile(
    "story.tsx",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TSX
  );
  let out = "";
  let pos = 0;
  for (const stmt of file.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    out += source.slice(pos, stmt.getStart(file));
    pos = stmt.getEnd();
  }
  return out + source.slice(pos);
}

/** The source with each `{ exported as local }` import alias renamed back to
 * `exported` wherever `local` appears as an identifier (strings untouched). */
function resolveImportAliases(source: string): string {
  const file = ts.createSourceFile(
    "story.tsx",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TSX
  );
  const aliases = new Map<string, string>();
  for (const stmt of file.statements) {
    const bindings = ts.isImportDeclaration(stmt)
      ? stmt.importClause?.namedBindings
      : undefined;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      if (el.propertyName) aliases.set(el.name.text, el.propertyName.text);
    }
  }
  if (aliases.size === 0) return source;
  const edits: [start: number, end: number, name: string][] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node) && aliases.has(node.text)) {
      edits.push([node.getStart(file), node.getEnd(), aliases.get(node.text)!]);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  let out = source;
  for (const [start, end, name] of edits.reverse()) {
    out = out.slice(0, start) + name + out.slice(end);
  }
  return out;
}

/** The source with its TypeScript types erased (JSX left as written). */
function eraseTypes(source: string): string {
  return ts.transpileModule(source, {
    fileName: "story.tsx",
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
    },
  }).outputText;
}

/** The source as a whitespace-separated token stream, comments dropped. */
function stripComments(source: string): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ true,
    ts.LanguageVariant.JSX,
    source
  );
  const tokens: string[] = [];
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
    tokens.push(scanner.getTokenText());
  }
  return tokens.join(" ");
}

/** The retired capitalized API spellings (#146, #416); each is now its lowercase form. */
const RETIRED_CAPITALIZED_NAMES = [
  "Chart",
  "Layer",
  "Spread",
  "Stack",
  "Scatter",
  "Treemap",
  "Table",
  "Intersect",
  "Exclude",
  "Subtract",
  "Paint",
  "Mask",
  "StackX",
  "StackY",
  "SpreadX",
  "SpreadY",
  "Enclose",
  "Frame",
  "Position",
  "Arrow",
  "Cut",
  "Offset",
  "GoFish",
];
/** Every retired public API name, mapped to the name that replaced it. */
const RETIRED_API_NAMES: Record<string, string> = {
  ...Object.fromEntries(
    RETIRED_CAPITALIZED_NAMES.map((name) => [
      name,
      name[0].toLowerCase() + name.slice(1),
    ])
  ),
  For: "map",
};
const RETIRED_API_NAMES_RE = new RegExp(
  `\\b(${Object.keys(RETIRED_API_NAMES).join("|")})\\b`,
  "g"
);

/** Rewrite retired API names to their current names so a pure rename is spec-neutral. */
function canonicalizeRetiredApiNames(source: string): string {
  return source.replace(
    RETIRED_API_NAMES_RE,
    (name) => RETIRED_API_NAMES[name]
  );
}

/** True when the file's change between baseRef's merge-base and HEAD touches
 * only spec-neutral content (Storybook chrome, retired API names, imports,
 * import aliases, type annotations, comments, whitespace). */
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
      stripComments(
        eraseTypes(
          canonicalizeRetiredApiNames(
            stripStorybookChrome(stripImports(resolveImportAliases(s)))
          )
        )
      );
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
        message: `Only spec-neutral content changed (Storybook chrome / retired API names / comments) — no Python update needed`,
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
