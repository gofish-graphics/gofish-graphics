// Build demos.js: one self-contained IIFE (GoFish, solid, the engine, the
// datasets). Run from the repo root: `node proposals/dragology/demo/build.mjs`.
// Vite and vite-plugin-solid are resolved from packages/gofish-graphics.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "../../../packages/gofish-graphics");
const require = createRequire(path.join(pkg, "package.json"));
const { build } = await import(require.resolve("vite"));
const solid = (await import(require.resolve("vite-plugin-solid"))).default;

await build({
  configFile: false,
  root: pkg,
  logLevel: "warn",
  define: {
    __GOFISH_PERF_INSTRUMENTATION__: "false",
    "process.env.NODE_ENV": '"production"',
  },
  plugins: [solid()],
  build: {
    outDir: here,
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: path.join(here, "entry.ts"),
      formats: ["iife"],
      name: "GofishDragDemosBundle",
      fileName: () => "demos.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
console.log("built", path.join(here, "demos.js"));
