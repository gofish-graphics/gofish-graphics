// SCRATCH: which playground benches and scratch-bumps scripts still bundle (esbuild reports a
// missing import as an error).   node playground/bench/bundlecheck.mjs <files…>
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const store = join(here, "../../node_modules/.pnpm");
const hit = readdirSync(store)
  .filter((d) => /^esbuild@0\.2\d/.test(d))
  .sort()
  .at(-1);
const esbuild = await import(
  pathToFileURL(join(store, hit, "node_modules/esbuild/lib/main.js")).href
);
for (const f of process.argv.slice(2)) {
  try {
    await esbuild.build({
      entryPoints: [f],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      logLevel: "silent",
      external: ["playwright", "solid-js"],
    });
  } catch (e) {
    console.log(`BROKEN ${f}: ${e.errors?.[0]?.text ?? e.message}`);
  }
}
