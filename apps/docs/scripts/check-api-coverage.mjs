#!/usr/bin/env node
/**
 * check-api-coverage — every construct in the gofish-ir descriptor table has an
 * API reference page in both languages, and every `::: gofish-ref` name on a
 * page is a real construct.
 *
 *   node scripts/check-api-coverage.mjs
 *
 * The descriptor table (`packages/gofish-ir/src/frontend/descriptors.ts`) is the
 * single source the options tables are generated from — see the `gofish-ref`
 * container in `docs/.vitepress/markdown-it-gofish-ref.ts`. This script is the
 * other half of that contract: the container fails the build on a name that is
 * not a construct, and this fails CI on a construct that no page documents.
 *
 * It reads the BUILT table (`packages/gofish-ir/dist/frontend/index.js`), so run
 * `pnpm --filter gofish-ir build` first.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const DOCS_ROOT = resolve(HERE, "..", "docs");
const IR_DIST = resolve(REPO_ROOT, "packages/gofish-ir/dist/frontend/index.js");

/**
 * Constructs deliberately without a reference page:
 *  - `mark-fn`: the Python bridge's "a lambda returning a chart" mark. It has no
 *    user-facing factory in either language.
 *  - `over`: internal-only union compositing, not exported from lib.ts (the
 *    public spelling is `layer`), kept only so the deserializer can dispatch
 *    the wire type.
 */
const ALLOWLIST = new Set(["mark-fn", "over"]);

const LANGS = ["js", "python"];

if (!existsSync(IR_DIST)) {
  console.error(
    `Missing ${relative(REPO_ROOT, IR_DIST)} — run \`pnpm --filter gofish-ir build\` first.`
  );
  process.exit(1);
}

const ir = await import(pathToFileURL(IR_DIST).href);
const TABLES = [
  ["operator", ir.OPERATORS],
  ["leaf mark", ir.LEAF_MARKS],
  ["combinator mark", ir.COMBINATOR_MARKS],
  ["coord", ir.COORDS],
];

/** name (the user-facing one: pyName when present) -> kinds it appears as */
const constructs = new Map();
for (const [kind, table] of TABLES) {
  for (const d of Object.values(table)) {
    const name = d.pyName ?? d.type;
    if (!constructs.has(name))
      constructs.set(name, { kinds: [], wire: d.type });
    constructs.get(name).kinds.push(kind);
  }
}

/** Every `::: gofish-ref a b c` name, per language, with the page it came from. */
function collectRefs(lang) {
  const found = new Map(); // name -> page path (docs-relative)
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".md")) continue;
      const src = readFileSync(full, "utf-8");
      for (const m of src.matchAll(/^:::+\s+gofish-ref\s+([^\n]+)$/gm)) {
        for (const name of m[1].trim().split(/\s+/)) {
          if (!found.has(name)) found.set(name, relative(DOCS_ROOT, full));
        }
      }
    }
  };
  const root = join(DOCS_ROOT, lang, "api");
  if (statSync(root).isDirectory()) walk(root);
  return found;
}

const refs = Object.fromEntries(LANGS.map((l) => [l, collectRefs(l)]));

// --- report ----------------------------------------------------------------
const failures = [];

const rows = [...constructs.entries()]
  .filter(([name]) => !ALLOWLIST.has(name))
  .sort(([a], [b]) => a.localeCompare(b));

const pad = (s, n) => String(s).padEnd(n);
const nameW = Math.max(9, ...rows.map(([n]) => n.length));
const kindW = Math.max(4, ...rows.map(([, v]) => v.kinds.join(", ").length));
console.log(
  `${pad("construct", nameW)}  ${pad("kind", kindW)}  ${pad("js page", 34)}  python page`
);
console.log(
  `${"-".repeat(nameW)}  ${"-".repeat(kindW)}  ${"-".repeat(34)}  ${"-".repeat(34)}`
);
for (const [name, { kinds }] of rows) {
  const cells = LANGS.map((lang) => refs[lang].get(name) ?? "MISSING");
  console.log(
    `${pad(name, nameW)}  ${pad(kinds.join(", "), kindW)}  ${pad(cells[0], 34)}  ${cells[1]}`
  );
  LANGS.forEach((lang, i) => {
    if (cells[i] === "MISSING") {
      failures.push(
        `${name}: no \`::: gofish-ref ${name}\` block under docs/${lang}/api/`
      );
    }
  });
}

for (const lang of LANGS) {
  for (const [name, page] of refs[lang]) {
    if (!constructs.has(name)) {
      failures.push(
        `${page}: \`::: gofish-ref ${name}\` names no construct in the descriptor table`
      );
    }
  }
}

console.log("");
if (failures.length) {
  console.error(`${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nAdd a reference page with a `::: gofish-ref <name>` block under its " +
      "`## Parameters` heading, in both docs/js/api/ and docs/python/api/."
  );
  process.exit(1);
}
console.log(
  `All ${rows.length} descriptor constructs are documented in both languages ` +
    `(${ALLOWLIST.size} allowlisted: ${[...ALLOWLIST].join(", ")}).`
);
