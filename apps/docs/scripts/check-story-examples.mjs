#!/usr/bin/env node
/**
 * check-story-examples.mjs — build-time guard for the gallery data layer.
 *
 * Asserts that loadStoryExamples():
 *   - has unique ids
 *   - every snippet transpiles as TypeScript with no syntax errors
 *   - every snippet contains a `.render(` call
 *   - every snippet imports only from "gofish-graphics", "./dataset", bare npm
 *     packages, or local asset files (no leftover `../src/...`, `../helper`,
 *     or `@storybook/html` imports)
 *   - datasetCode (when present) transpiles
 *
 * Prints a table of id → ok / fallback and exits non-zero on any failure.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { execSync, execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const __dirname = dirname(fileURLToPath(import.meta.url));

// The data module is TypeScript and this package is `type: commonjs`, so raw
// Node won't import it as ESM. Transpile it to a temp `.mjs` *in the same
// directory* (so `import.meta.url` and relative/node_modules resolution stay
// identical) and import that.
function transpileTo(tsPath, tmpPath, rewrites = []) {
  let source = readFileSync(tsPath, "utf-8");
  for (const [from, to] of rewrites) source = source.split(from).join(to);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
    },
    fileName: tsPath,
  });
  writeFileSync(tmpPath, outputText);
}

async function loadModule() {
  const tsPath = resolve(__dirname, "../docs/.vitepress/data/storyExamples.ts");
  const tmpPath = resolve(
    __dirname,
    "../docs/.vitepress/data/storyExamples.__check__.mjs"
  );
  transpileTo(tsPath, tmpPath);
  try {
    return await import(pathToFileURL(tmpPath).href);
  } finally {
    rmSync(tmpPath, { force: true });
  }
}

// pythonExamples.ts statically imports storyExamples.ts (a `.ts` specifier) —
// Node's native type-stripping loader can't resolve that reliably outside a
// tsx-driven entry point (the same reason storyExamples.ts itself gets
// pre-transpiled above), so point the rewritten copy at storyExamples'
// already-transpiled tmp `.mjs` instead of re-deriving the resolution rules.
async function loadPythonModule() {
  const jsTmpPath = resolve(
    __dirname,
    "../docs/.vitepress/data/storyExamples.__check__.mjs"
  );
  const tsPath = resolve(
    __dirname,
    "../docs/.vitepress/data/pythonExamples.ts"
  );
  const tmpPath = resolve(
    __dirname,
    "../docs/.vitepress/data/pythonExamples.__check__.mjs"
  );
  const jsTmpExisted = existsSync(jsTmpPath);
  if (!jsTmpExisted)
    transpileTo(
      resolve(__dirname, "../docs/.vitepress/data/storyExamples.ts"),
      jsTmpPath
    );
  transpileTo(tsPath, tmpPath, [
    ["./storyExamples.ts", "./storyExamples.__check__.mjs"],
  ]);
  try {
    return await import(pathToFileURL(tmpPath).href);
  } finally {
    rmSync(tmpPath, { force: true });
    if (!jsTmpExisted) rmSync(jsTmpPath, { force: true });
  }
}

function transpiles(code, fileName) {
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
  const syntaxErrors = (out.diagnostics ?? []).filter(
    (d) =>
      d.category === ts.DiagnosticCategory.Error &&
      d.code >= 1000 &&
      d.code < 2000
  );
  return syntaxErrors.map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, "\n")
  );
}

const ALLOWED_BARE = new Set([
  "gofish-graphics",
  "lodash",
  "vega-datasets",
  "spectral.js",
  "fast-kde",
  "solid-js",
]);

const ASSET_RE = /\.(png|jpe?g|gif|svg|webp)$/;

function importSpecifiers(code) {
  const specs = [];
  const re = /^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm;
  let m;
  while ((m = re.exec(code)) !== null) specs.push(m[1]);
  // bare side-effect imports
  const re2 = /^\s*import\s+["']([^"']+)["']/gm;
  while ((m = re2.exec(code)) !== null) specs.push(m[1]);
  return specs;
}

function checkImports(code) {
  const problems = [];
  for (const spec of importSpecifiers(code)) {
    if (spec === "gofish-graphics") continue;
    if (spec === "./dataset") continue;
    if (ASSET_RE.test(spec)) continue;
    if (!spec.startsWith(".") && ALLOWED_BARE.has(spec)) continue;
    if (!spec.startsWith(".")) {
      // unknown bare package — allowed but worth noting
      continue;
    }
    problems.push(spec);
  }
  return problems;
}

async function main() {
  const mod = await loadModule();
  const examples = mod.loadStoryExamples();

  let failures = 0;
  const rows = [];

  // unique ids
  const idCounts = new Map();
  for (const ex of examples) {
    idCounts.set(ex.id, (idCounts.get(ex.id) ?? 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      console.error(`DUPLICATE id: ${id} (${count}×)`);
      failures++;
    }
  }

  for (const ex of examples) {
    const issues = [];

    const synErrs = transpiles(ex.code, `${ex.id}.tsx`);
    if (synErrs.length) issues.push(`transpile: ${synErrs[0]}`);

    if (!/\.render\(/.test(ex.code)) issues.push("missing .render(");

    const badImports = checkImports(ex.code);
    if (badImports.length) issues.push(`bad imports: ${badImports.join(", ")}`);

    if (ex.datasetCode) {
      const dsErrs = transpiles(ex.datasetCode, `${ex.id}.dataset.ts`);
      if (dsErrs.length) issues.push(`dataset transpile: ${dsErrs[0]}`);
    }

    if (!ex.storyId) issues.push("missing storyId");
    if (!ex.title) issues.push("missing title");

    const status = issues.length ? "FAIL" : ex.isFallback ? "fallback" : "ok";
    if (issues.length) failures++;
    const deps = Object.entries(ex.npmDeps ?? {})
      .map(([name, version]) => `${name}@${version}`)
      .join(", ");
    rows.push({ id: ex.id, status, deps, issues });
  }

  // table
  const idWidth = Math.max(...rows.map((r) => r.id.length), 2);
  const statusWidth = Math.max(...rows.map((r) => r.status.length), 6);
  console.log("");
  console.log(`${"id".padEnd(idWidth)}  ${"status".padEnd(statusWidth)}  deps`);
  console.log(`${"-".repeat(idWidth)}  ${"-".repeat(statusWidth)}  ----`);
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(idWidth)}  ${r.status.padEnd(statusWidth)}  ${r.deps || "-"}${r.issues.length ? "  :: " + r.issues.join("; ") : ""}`
    );
  }

  const fallbacks = rows.filter((r) => r.status === "fallback");
  console.log("");
  console.log(`Total examples: ${examples.length}`);
  console.log(
    `Fallbacks: ${fallbacks.length}${fallbacks.length ? " (" + fallbacks.map((r) => r.id).join(", ") + ")" : ""}`
  );
  console.log(`Failures: ${failures}`);

  // -------------------------------------------------------------------------
  // Python data layer (pythonExamples.ts) — must load without throwing, cover
  // exactly the same id set as the JS gallery, and every ported/fallback
  // snippet must be syntactically valid Python (checked via `python3 -m py_compile`
  // when a `python3` is on PATH; skipped with a warning otherwise, since the
  // docs build itself doesn't need Python installed).
  // -------------------------------------------------------------------------
  console.log("\n--- Python example data layer ---");
  const pyMod = await loadPythonModule();
  const pyExamples = pyMod.loadPythonExamples();

  const jsIds = new Set(examples.map((ex) => ex.id));
  const pyIds = new Set(pyExamples.map((ex) => ex.id));
  const missingInPy = [...jsIds].filter((id) => !pyIds.has(id));
  const extraInPy = [...pyIds].filter((id) => !jsIds.has(id));
  if (missingInPy.length) {
    console.error(`Python id set is missing: ${missingInPy.join(", ")}`);
    failures++;
  }
  if (extraInPy.length) {
    console.error(
      `Python id set has extra ids not in JS: ${extraInPy.join(", ")}`
    );
    failures++;
  }

  const ported = pyExamples.filter((ex) => ex.pythonCode && !ex.isFallback);
  const pyFallbacks = pyExamples.filter((ex) => ex.isFallback);
  const notPorted = pyExamples.filter((ex) => !ex.pythonCode);
  const diverging = pyExamples.filter((ex) => ex.renderDiverges);

  let pythonAvailable = true;
  try {
    execSync("python3 --version", { stdio: "ignore" });
  } catch {
    pythonAvailable = false;
  }
  let syntaxErrors = 0;
  if (pythonAvailable) {
    const tmpDir = resolve(__dirname, "../.tmp-py-check");
    mkdirSync(tmpDir, { recursive: true });
    try {
      for (const ex of pyExamples) {
        for (const [label, src] of [
          ["code", ex.pythonCode],
          ["dataset", ex.pythonDatasetCode],
        ]) {
          if (!src) continue;
          const f = resolve(tmpDir, `${ex.id}.${label}.py`);
          writeFileSync(f, src);
          try {
            execFileSync(
              "python3",
              ["-c", "import ast, sys; ast.parse(open(sys.argv[1]).read())", f],
              { stdio: "pipe" }
            );
          } catch (err) {
            syntaxErrors++;
            console.error(
              `Python syntax error in ${ex.id} (${label}): ${err.message.split("\n").slice(-2).join(" ")}`
            );
          }
        }
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  } else {
    console.log(
      "(python3 not found on PATH — skipping Python syntax validation)"
    );
  }
  if (syntaxErrors > 0) failures += syntaxErrors;

  console.log(
    `Python examples: ${pyExamples.length} total — ported ${ported.length}, fallback ${pyFallbacks.length}, not ported ${notPorted.length}, diverging ${diverging.length}`
  );
  if (pyFallbacks.length) {
    console.log(`  fallback: ${pyFallbacks.map((ex) => ex.id).join(", ")}`);
  }

  if (failures > 0) {
    console.error(`\nFAILED with ${failures} problem(s).`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
