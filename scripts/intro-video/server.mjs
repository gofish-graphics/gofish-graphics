// Vite dev server for the video page, plus the Playwright/Vite module paths the
// other scripts share. This folder is not a pnpm workspace package, so Vite and
// Playwright are loaded from the workspace packages that already depend on them.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "../..");
export const OUT = join(HERE, "out");
export const TILES_DIR = join(OUT, "tiles");
const GOFISH_PKG = join(REPO, "packages/gofish-graphics");

async function importFrom(pkgDir, name) {
  const require = createRequire(join(pkgDir, "package.json"));
  // Resolve the package's ESM entry through its package.json exports.
  const pkgJson = require.resolve(`${name}/package.json`);
  const root = dirname(pkgJson);
  const meta = require(pkgJson);
  const exp = meta.exports?.["."];
  const entry =
    (typeof exp === "string" ? exp : (exp?.import ?? exp?.default)) ??
    meta.module ??
    meta.main;
  return import(pathToFileURL(join(root, entry)).href);
}

export const loadVite = () => importFrom(GOFISH_PKG, "vite");
export const loadPlaywright = () =>
  importFrom(join(REPO, "tests"), "playwright");

/**
 * Build the page with Vite into out/site, then serve that static build.
 * A static build (not the dev server) means nothing can hot-reload the page
 * halfway through a capture. Returns { url, close }.
 */
export async function startServer(port = 3170) {
  const { build, preview } = await loadVite();
  const shared = {
    configFile: false,
    root: join(HERE, "page"),
    publicDir: TILES_DIR,
    logLevel: "warn",
    cacheDir: join(OUT, ".vite"),
    resolve: {
      // The built library. Its bare `solid-js` imports resolve from
      // packages/gofish-graphics/node_modules, so there is one Solid instance.
      alias: { "gofish-graphics": join(GOFISH_PKG, "dist/index.js") },
    },
    build: {
      outDir: join(OUT, "site"),
      emptyOutDir: true,
      chunkSizeWarningLimit: 4096,
    },
  };
  await build(shared);
  const server = await preview({
    ...shared,
    preview: { port, strictPort: false },
  });
  const url = server.resolvedUrls.local[0];
  return { url, close: () => server.close() };
}
