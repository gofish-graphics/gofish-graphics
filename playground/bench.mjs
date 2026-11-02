// SCRATCH: bundle playground/bench/bench.ts for node and run it: per dataset, the time of a
// convexity change (old bisection vs the filtration, cold and warm cache), the chosen radius and
// the exact closed-area share each reaches.   node playground/bench.mjs
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const store = join(here, "../node_modules/.pnpm");
const hit = readdirSync(store)
  .filter((d) => /^esbuild@0\.2\d/.test(d))
  .sort()
  .at(-1);
const esbuild = await import(
  pathToFileURL(join(store, hit, "node_modules/esbuild/lib/main.js")).href
);
const out = join(here, `bench/out-${process.env.BENCH ?? "bench"}.mjs`);
await esbuild.build({
  entryPoints: [join(here, `bench/${process.env.BENCH ?? "bench"}.ts`)],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: out,
  logLevel: "warning",
});
await import(pathToFileURL(out).href + "?" + Date.now());
