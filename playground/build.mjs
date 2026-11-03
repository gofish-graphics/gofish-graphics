// SCRATCH: build the enclose outline playground. Bundles src/main.ts (which imports the
// prototype's geometry straight from packages/gofish-graphics/src/ast/graphicalOperators/
// enclose/) into one minified IIFE and inlines it into page.html, writing dist/index.html: one
// self-contained file, no external scripts.
//
//   node playground/build.mjs           # build dist/index.html
//   node playground/extract.mjs         # first, to refresh src/datasets.json from story dumps
//
// esbuild is not a direct dependency, so it is resolved from the pnpm store. The geometry's
// own imports (d3-delaunay, d3-hierarchy) resolve from gofish-graphics as usual.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const store = join(root, "node_modules/.pnpm");
const hits = readdirSync(store)
  .filter((d) => /^esbuild@0\.2\d/.test(d))
  .sort();
if (!hits.length) throw new Error(`no esbuild in ${store}; run pnpm install`);
const esbuild = await import(
  pathToFileURL(
    join(store, hits[hits.length - 1], "node_modules/esbuild/lib/main.js")
  ).href
);

const js = await esbuild.build({
  entryPoints: [join(here, "src/entry.ts")],
  bundle: true,
  format: "iife",
  minify: true,
  write: false,
  target: "es2020",
  logLevel: "warning",
  metafile: true,
});
const code = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const page = readFileSync(join(here, "page.html"), "utf8");
const html = page.replace("<!--SCRIPT-->", () => `<script>${code}</script>`);
mkdirSync(join(here, "dist"), { recursive: true });
writeFileSync(join(here, "dist/index.html"), html);
const inputs = Object.keys(js.metafile.inputs);
console.log(
  `dist/index.html: ${(html.length / 1024).toFixed(0)} KB (script ${(code.length / 1024).toFixed(0)} KB, ${inputs.length} modules)`
);
if (process.argv.includes("--inputs"))
  for (const i of inputs) console.log("  " + i);
