#!/usr/bin/env node
/**
 * sync-backlinks — projects each internals essay's `covers:` frontmatter into a
 * managed `@wiki` back-link comment at the top of every source file it covers.
 *
 *   node scripts/sync-backlinks.mjs sync    # rewrite the comments in place
 *   node scripts/sync-backlinks.mjs check   # verify they match covers: (CI)
 *
 * `covers:` (doc -> code) is the single source of truth; the `@wiki` comments
 * (code -> doc) are a derived, idempotent projection. The two can never
 * silently disagree: `check` fails the build when they do.
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, relative, extname, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const docsRoot = join(repoRoot, "apps/docs/docs");
const internalsDir = join(docsRoot, "internals");
const sourceRoots = [
  join(repoRoot, "packages/gofish-graphics/src"),
  join(repoRoot, "packages/gofish-python"),
];

const MODE = process.argv[2] === "check" ? "check" : "sync";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "__pycache__",
  ".vitepress",
]);
const TS_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cts", ".mts"]);

/** `//` for TS/JS-family files, `#` for Python — or null if unsupported. */
function commentToken(file) {
  const ext = extname(file);
  if (ext === ".py") return "#";
  if (TS_EXTS.has(ext)) return "//";
  return null;
}

function blockRegex(token) {
  const t = token === "#" ? "#" : "\\/\\/";
  return new RegExp(`${t} <gofish-wiki>[\\s\\S]*?${t} <\\/gofish-wiki>\\n*`);
}

function buildBlock(token, essays) {
  const sorted = [...essays].sort((a, b) => a.route.localeCompare(b.route));
  const lines = [
    `${token} <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run \`pnpm --filter docs sync-backlinks\``,
    ...sorted.map((e) => `${token} @wiki ${e.title} — ${e.route}`),
    `${token} </gofish-wiki>`,
  ];
  return lines.join("\n") + "\n";
}

function walk(dir, match, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, match, acc);
    else if (match(e.name)) acc.push(full);
  }
  return acc;
}

// 1. Read every essay's covers: into a file -> [{route, title}] map.
const coverage = new Map();
for (const md of walk(internalsDir, (n) => n.endsWith(".md"), [])) {
  if (relative(internalsDir, md).split(/[\\/]/)[0] === "api") continue;
  const fm = matter(readFileSync(md, "utf-8")).data;
  const covers = Array.isArray(fm.covers) ? fm.covers : [];
  if (!covers.length) continue;
  let route =
    "/" + relative(docsRoot, md).replace(/\\/g, "/").replace(/\.md$/, "");
  route = route.replace(/\/index$/, "/");
  const title = typeof fm.title === "string" ? fm.title : route;
  for (const c of covers) {
    if (typeof c !== "string") continue;
    const key = c.replace(/^\/+/, "");
    if (!coverage.has(key)) coverage.set(key, []);
    coverage.get(key).push({ route, title });
  }
}

// 2. Find every source file that currently carries a managed block.
const filesWithBlock = new Set();
for (const root of sourceRoots) {
  for (const f of walk(root, (n) => commentToken(n) !== null, [])) {
    if (readFileSync(f, "utf-8").includes("<gofish-wiki>")) {
      filesWithBlock.add(relative(repoRoot, f).replace(/\\/g, "/"));
    }
  }
}

// 3. Reconcile: union of covered files and files with a (possibly stale) block.
const targets = new Set([...coverage.keys(), ...filesWithBlock]);
const changed = [];
const missing = [];

for (const rel of [...targets].sort()) {
  const abs = join(repoRoot, rel);
  const token = commentToken(rel);
  if (!token) {
    missing.push(`${rel} — unsupported file type for a back-link comment`);
    continue;
  }
  let content;
  try {
    content = readFileSync(abs, "utf-8");
  } catch {
    missing.push(`${rel} — listed in covers: but file does not exist`);
    continue;
  }
  const withoutBlock = content
    .replace(blockRegex(token), "")
    .replace(/^\n+/, "");
  const essays = coverage.get(rel);
  const desired = essays
    ? buildBlock(token, essays) + "\n" + withoutBlock
    : withoutBlock;

  if (desired !== content) {
    changed.push(rel);
    if (MODE === "sync") writeFileSync(abs, desired);
  }
}

// 4. Report.
if (MODE === "check") {
  if (changed.length === 0 && missing.length === 0) {
    console.log("sync-backlinks: @wiki comments are in sync with covers:");
    process.exit(0);
  }
  if (changed.length) {
    console.error("sync-backlinks: @wiki comments out of sync in:");
    for (const f of changed) console.error(`  ${f}`);
    console.error(
      "Run `pnpm --filter docs sync-backlinks` and commit the result."
    );
  }
  for (const m of missing) console.error(`sync-backlinks: ${m}`);
  process.exit(1);
}

if (missing.length) {
  for (const m of missing) console.warn(`sync-backlinks: warning — ${m}`);
}
console.log(
  changed.length
    ? `sync-backlinks: updated ${changed.length} file(s):\n${changed
        .map((f) => `  ${f}`)
        .join("\n")}`
    : "sync-backlinks: nothing to update"
);
