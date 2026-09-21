#!/usr/bin/env node
/**
 * check-doc-snippets.mjs — staleness signal for the handwritten docs tier.
 *
 * The docs are split in two tiers. Reference pages are generated from the
 * descriptor table, so they cannot drift. The handwritten learning pages
 * (`handwritten: true` in their frontmatter) are the maintainer's own prose and
 * are never rewritten mechanically — but their *code blocks* still go stale
 * when the library renames an export. This script is the mechanical check for
 * exactly that: it never looks at prose, only at fenced code blocks.
 *
 * For every markdown page under docs/js/ and docs/python/ with
 * `handwritten: true`:
 *   - `js` / `ts` / `jsx` / `tsx` fences must transpile (TypeScript syntax
 *     errors only — no type checking), and every name used as `gf.<name>(`,
 *     `gf.<name>.`, or imported by name from "gofish-graphics" /
 *     "@gofish/graphics" must be a real export of the library.
 *   - `python` / `py` fences must parse as Python (via `python3 -m ast`), and
 *     every `gf.<name>` attribute plus every name imported via
 *     `from gofish import ...` must be a real export of the Python package.
 *     Skipped with a warning when `python3` is not on PATH.
 *
 * A fence tagged `no-check` after the language (```ts no-check) is skipped, so
 * a maintainer can show intentionally partial or pseudo code.
 *
 * Export-list strategy: the JS export list is derived by parsing
 * packages/gofish-graphics/src/lib.ts with the TypeScript AST and following
 * `export * from "./mod"` one level into the referenced module's named exports.
 * Source parsing was chosen over reading a built `dist/lib.d.ts` so the check
 * needs no build step (it can run in a lint job with nothing compiled) and
 * never reports a stale name from a stale `dist/`. lib.ts has only three
 * `export * from` re-exports (./color, ./path, ./util), and those modules
 * re-export nothing further, so one level is exact today; a nested `export *`
 * would only make the list *smaller*, i.e. produce a loud failure rather than
 * a silent pass.
 *
 * Usage: node scripts/check-doc-snippets.mjs   (no flags)
 */
import { createRequire } from "node:module";
import { dirname, resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { execSync, execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const matter = require("gray-matter");

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = resolve(__dirname, "../docs");
const REPO_ROOT = resolve(__dirname, "../../..");
const LIB_SRC = resolve(REPO_ROOT, "packages/gofish-graphics/src");
const LIB_ENTRY = join(LIB_SRC, "lib.ts");
const PY_INIT = resolve(REPO_ROOT, "packages/gofish-python/gofish/__init__.py");

const JS_LANGS = new Set([
  "js",
  "ts",
  "jsx",
  "tsx",
  "javascript",
  "typescript",
]);
const PY_LANGS = new Set(["python", "py"]);
const JS_SPECIFIERS = new Set(["gofish-graphics", "@gofish/graphics"]);

// ---------------------------------------------------------------------------
// JS export list (parsed from lib.ts; `export * from` followed one level)
// ---------------------------------------------------------------------------

function resolveModule(fromFile, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** Named exports declared or re-exported by one module file (no `export *`). */
function namedExports(file) {
  const names = new Set();
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf-8"),
    ts.ScriptTarget.Latest,
    true
  );
  for (const stmt of source.statements) {
    if (ts.isExportDeclaration(stmt)) {
      if (stmt.exportClause && ts.isNamespaceExport(stmt.exportClause)) {
        names.add(stmt.exportClause.name.text);
      } else if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) names.add(el.name.text);
      }
      continue;
    }
    const isExported = (stmt.modifiers ?? []).some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword
    );
    if (!isExported) continue;
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text);
      }
    } else if (
      (ts.isFunctionDeclaration(stmt) ||
        ts.isClassDeclaration(stmt) ||
        ts.isInterfaceDeclaration(stmt) ||
        ts.isTypeAliasDeclaration(stmt) ||
        ts.isEnumDeclaration(stmt) ||
        ts.isModuleDeclaration(stmt)) &&
      stmt.name &&
      ts.isIdentifier(stmt.name)
    ) {
      names.add(stmt.name.text);
    }
  }
  return names;
}

/** `export * from "./mod"` specifiers of one module file. */
function starExports(file) {
  const specs = [];
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf-8"),
    ts.ScriptTarget.Latest,
    true
  );
  for (const stmt of source.statements) {
    if (
      ts.isExportDeclaration(stmt) &&
      !stmt.exportClause &&
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier)
    ) {
      specs.push(stmt.moduleSpecifier.text);
    }
  }
  return specs;
}

function collectLibraryExports() {
  const names = namedExports(LIB_ENTRY);
  const unresolved = [];
  for (const spec of starExports(LIB_ENTRY)) {
    const file = resolveModule(LIB_ENTRY, spec);
    if (!file) {
      unresolved.push(spec);
      continue;
    }
    for (const n of namedExports(file)) names.add(n);
    for (const nested of starExports(file)) {
      const nestedFile = resolveModule(file, nested);
      if (!nestedFile) {
        unresolved.push(nested);
        continue;
      }
      for (const n of namedExports(nestedFile)) names.add(n);
    }
  }
  return { names, unresolved };
}

// ---------------------------------------------------------------------------
// Python export list (parsed from gofish/__init__.py)
// ---------------------------------------------------------------------------

function collectPythonExports() {
  if (!existsSync(PY_INIT)) return new Set();
  const src = readFileSync(PY_INIT, "utf-8");
  const names = new Set();

  const allMatch = src.match(/__all__\s*=\s*\[([\s\S]*?)\]/);
  if (allMatch) {
    for (const m of allMatch[1].matchAll(/["']([A-Za-z_][A-Za-z0-9_]*)["']/g)) {
      names.add(m[1]);
    }
  }

  // `from .mod import (a, b as c)` and `from .mod import a, b`
  const importRe = /^from\s+\.[\w.]*\s+import\s+(\(([\s\S]*?)\)|(.+))$/gm;
  for (const m of src.matchAll(importRe)) {
    const body = m[2] ?? m[3] ?? "";
    for (const part of body.split(",")) {
      const token = part.trim().split(/\s+as\s+/);
      const name = (token[1] ?? token[0]).trim();
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.add(name);
    }
  }
  // Names defined in __init__.py itself.
  for (const m of src.matchAll(/^(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)) {
    names.add(m[1]);
  }
  for (const m of src.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s*[:=][^=]/gm)) {
    names.add(m[1]);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Markdown fence extraction (CommonMark fence rules: a fence closes only on a
// backtick run at least as long as the opener, so ````md blocks that *contain*
// ```js examples are treated as one md fence, not several)
// ---------------------------------------------------------------------------

/** Blank out `<!-- ... -->` spans, preserving line numbering. Fences parked
 *  inside an HTML comment are not published, so they are not checked. */
function stripHtmlComments(markdown) {
  return markdown.replace(/<!--[\s\S]*?-->/g, (block) =>
    "\n".repeat((block.match(/\n/g) ?? []).length)
  );
}

function extractFences(markdown) {
  const lines = stripHtmlComments(markdown).split("\n");
  const fences = [];
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^(\s{0,3})(`{3,})(.*)$/.exec(line);
    if (open) {
      if (m && m[2].length >= open.ticks && m[3].trim() === "") {
        fences.push({
          info: open.info,
          code: lines.slice(open.start, i).join("\n"),
          line: open.start, // 0-based index of the first code line
        });
        open = null;
      }
      continue;
    }
    if (m) open = { ticks: m[2].length, info: m[3].trim(), start: i + 1 };
  }
  return fences;
}

/** "ts index.ts" → {lang: "ts", flags: ["index.ts"]}; "js{4}" → lang "js". */
function parseInfo(info) {
  const tokens = info.split(/\s+/).filter(Boolean);
  const raw = tokens[0] ?? "";
  const lang = raw.replace(/[{:[].*$/, "").toLowerCase();
  return { lang, flags: tokens.slice(1) };
}

// ---------------------------------------------------------------------------
// JS snippet checks
// ---------------------------------------------------------------------------

function transpileErrors(code, fileName) {
  const out = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      noEmitOnError: false,
    },
    reportDiagnostics: true,
    fileName,
  });
  return (out.diagnostics ?? [])
    .filter(
      (d) =>
        d.category === ts.DiagnosticCategory.Error &&
        d.code >= 1000 &&
        d.code < 2000
    )
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

function jsLibraryNames(code) {
  const used = new Set();
  const aliases = new Set(["gf"]);

  const specAlt = [...JS_SPECIFIERS]
    .map((s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))
    .join("|");

  for (const m of code.matchAll(
    new RegExp(
      `import\\s+\\*\\s+as\\s+([A-Za-z_$][\\w$]*)\\s+from\\s+["'](?:${specAlt})["']`,
      "g"
    )
  )) {
    aliases.add(m[1]);
  }

  for (const m of code.matchAll(
    new RegExp(
      `import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s+["'](?:${specAlt})["']`,
      "g"
    )
  )) {
    for (const part of m[1].split(",")) {
      const name = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(name)) used.add(name);
    }
  }

  for (const alias of aliases) {
    for (const m of code.matchAll(
      new RegExp(`\\b${alias}\\.([A-Za-z_$][\\w$]*)\\s*[(.]`, "g")
    )) {
      used.add(m[1]);
    }
  }
  return used;
}

function pythonLibraryNames(code) {
  const used = new Set();
  const aliases = new Set(["gf"]);
  for (const m of code.matchAll(/^import\s+gofish\s+as\s+([A-Za-z_]\w*)/gm)) {
    aliases.add(m[1]);
  }
  for (const m of code.matchAll(
    /^from\s+gofish\s+import\s+(\(([\s\S]*?)\)|(.+))$/gm
  )) {
    const body = m[2] ?? m[3] ?? "";
    for (const part of body.split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (/^[A-Za-z_]\w*$/.test(name)) used.add(name);
    }
  }
  for (const alias of aliases) {
    for (const m of code.matchAll(
      new RegExp(`\\b${alias}\\.([A-Za-z_]\\w*)`, "g")
    )) {
      used.add(m[1]);
    }
  }
  return used;
}

// ---------------------------------------------------------------------------
// Page discovery
// ---------------------------------------------------------------------------

function handwrittenPages() {
  const pages = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".md")) continue;
      const raw = readFileSync(full, "utf-8");
      const fm = matter(raw).data ?? {};
      if (fm.handwritten === true) pages.push({ file: full, raw });
    }
  };
  walk(join(DOCS_DIR, "js"));
  walk(join(DOCS_DIR, "python"));
  return pages.sort((a, b) => a.file.localeCompare(b.file));
}

// ---------------------------------------------------------------------------

function main() {
  const { names: jsExports, unresolved } = collectLibraryExports();
  for (const spec of unresolved) {
    console.warn(
      `warning: could not resolve \`export * from "${spec}"\` in lib.ts — its names are unknown to this check`
    );
  }
  const pyExports = collectPythonExports();

  let pythonAvailable = true;
  try {
    execSync("python3 --version", { stdio: "ignore" });
  } catch {
    pythonAvailable = false;
  }

  const pages = handwrittenPages();
  if (pages.length === 0) {
    console.error(
      "No pages with `handwritten: true` frontmatter found under docs/js or docs/python."
    );
    process.exit(1);
  }

  let failures = 0;
  const pyJobs = [];
  const tmpDir = resolve(__dirname, "../.tmp-doc-snippets");

  const summaries = [];

  for (const page of pages) {
    const rel = relative(DOCS_DIR, page.file).replace(/\\/g, "/");
    const issues = [];
    let checked = 0;
    let skipped = 0;

    for (const fence of extractFences(page.raw)) {
      const { lang, flags } = parseInfo(fence.info);
      const isJs = JS_LANGS.has(lang);
      const isPy = PY_LANGS.has(lang);
      if (!isJs && !isPy) continue;
      if (flags.includes("no-check")) {
        skipped++;
        continue;
      }
      checked++;
      const where = `line ${fence.line + 1}`;

      if (isJs) {
        const errs = transpileErrors(fence.code, `${rel}.${fence.line}.tsx`);
        if (errs.length) issues.push(`${where}: syntax: ${errs[0]}`);
        const unknown = [...jsLibraryNames(fence.code)].filter(
          (n) => !jsExports.has(n)
        );
        if (unknown.length) {
          issues.push(
            `${where}: not exported by gofish-graphics: ${unknown.join(", ")}`
          );
        }
      } else if (pythonAvailable) {
        mkdirSync(tmpDir, { recursive: true });
        const path = resolve(
          tmpDir,
          `${rel.replace(/[^\w]/g, "_")}.${fence.line}.py`
        );
        writeFileSync(path, fence.code);
        pyJobs.push({ path, rel, where, issues });
        const unknown = [...pythonLibraryNames(fence.code)].filter(
          (n) => !pyExports.has(n)
        );
        if (unknown.length) {
          issues.push(
            `${where}: not exported by the gofish Python package: ${unknown.join(", ")}`
          );
        }
      }
    }
    summaries.push({ rel, issues, checked, skipped });
  }

  // One python3 process parses every collected snippet.
  if (pyJobs.length) {
    const driver = `
import ast, sys
with open(sys.argv[1]) as f:
    paths = [line.rstrip("\\n") for line in f if line.strip()]
bad = []
for path in paths:
    try:
        with open(path) as fh:
            ast.parse(fh.read())
    except SyntaxError as e:
        bad.append(path + "\\t" + str(e).replace("\\n", " "))
for line in bad:
    print(line)
sys.exit(1 if bad else 0)
`;
    const manifest = resolve(tmpDir, "manifest.txt");
    writeFileSync(manifest, pyJobs.map((j) => j.path).join("\n") + "\n");
    const byPath = new Map(pyJobs.map((j) => [j.path, j]));
    try {
      execFileSync("python3", ["-c", driver, manifest], {
        stdio: "pipe",
        encoding: "utf-8",
      });
    } catch (err) {
      for (const line of (err.stdout ?? "").split("\n")) {
        if (!line.trim()) continue;
        const [path, ...msg] = line.split("\t");
        const job = byPath.get(path);
        if (job)
          job.issues.push(`${job.where}: python syntax: ${msg.join(" ")}`);
        else console.error(`python syntax error in ${path}: ${msg.join(" ")}`);
      }
    }
    rmSync(tmpDir, { recursive: true, force: true });
  } else if (!pythonAvailable) {
    console.warn(
      "warning: python3 not found on PATH — skipping Python snippet checks"
    );
  }

  const width = Math.max(...summaries.map((s) => s.rel.length), 4);
  console.log("");
  console.log(`${"page".padEnd(width)}  checked  skipped  status`);
  console.log(`${"-".repeat(width)}  -------  -------  ------`);
  for (const s of summaries) {
    console.log(
      `${s.rel.padEnd(width)}  ${String(s.checked).padStart(7)}  ${String(
        s.skipped
      ).padStart(7)}  ${s.issues.length ? "FAIL" : "ok"}`
    );
    for (const issue of s.issues) console.log(`    ${issue}`);
    failures += s.issues.length;
  }

  console.log("");
  console.log(`Handwritten pages: ${pages.length}`);
  console.log(`Problems: ${failures}`);
  if (failures > 0) {
    console.error(`\nFAILED with ${failures} problem(s).`);
    process.exit(1);
  }
  console.log("\nAll snippet checks passed.");
}

main();
