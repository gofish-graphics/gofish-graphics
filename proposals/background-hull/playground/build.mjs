// Build the blob playground: bundle src/main.ts to one minified IIFE and inline it into
// page.html, writing playground.html (no external scripts; the artifact CSP blocks them).
//
//   node proposals/background-hull/playground/build.mjs            # build playground.html
//   node proposals/background-hull/playground/build.mjs --verify   # also run verify.ts in node
//
// esbuild is not a direct dependency, so it is resolved from the pnpm store. delaunator is a
// devDependency of gofish-graphics and is resolved from that package.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const store = join(root, "node_modules/.pnpm");
const pick = (prefix) => {
  const hits = readdirSync(store)
    .filter((d) => d.startsWith(prefix))
    .sort();
  if (!hits.length)
    throw new Error(`no ${prefix}* in ${store}; run pnpm install`);
  return hits[hits.length - 1];
};
const esbuild = await import(
  pathToFileURL(
    join(store, pick("esbuild@"), "node_modules/esbuild/lib/main.js")
  ).href
);
const delaunator = createRequire(
  join(root, "packages/gofish-graphics/package.json")
).resolve("delaunator");
const common = {
  bundle: true,
  alias: { delaunator },
  logLevel: "warning",
  target: "es2020",
};

const js = await esbuild.build({
  ...common,
  entryPoints: [join(here, "src/main.ts")],
  format: "iife",
  minify: true,
  write: false,
});
const code = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const page = readFileSync(join(here, "page.html"), "utf8");
const html = page.replace("<!--SCRIPT-->", () => `<script>${code}</script>`);
writeFileSync(join(here, "playground.html"), html);
console.log(
  `playground.html: ${(html.length / 1024).toFixed(0)} KB (script ${(code.length / 1024).toFixed(0)} KB)`
);

if (process.argv.includes("--verify")) {
  const out = join(mkdtempSync(join(tmpdir(), "blob-verify-")), "verify.mjs");
  await esbuild.build({
    ...common,
    entryPoints: [join(here, "verify.ts")],
    format: "esm",
    platform: "node",
    outfile: out,
  });
  execFileSync(process.execPath, [out], { stdio: "inherit" });
}
