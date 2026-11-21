// Builds demo/tooltip-demos.js, the proposal page's live demos. See
// demo/src/entry.ts for the command. Vite and vite-plugin-solid are resolved
// from packages/gofish-graphics, the build's root, as are the library sources
// and solid-js.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "../../../packages/gofish-graphics");
const require = createRequire(path.join(pkg, "package.json"));
const solid = (await import(require.resolve("vite-plugin-solid"))).default;

export default {
  root: pkg,
  logLevel: "warn",
  publicDir: false,
  define: {
    __GOFISH_PERF_INSTRUMENTATION__: "false",
    "process.env.NODE_ENV": '"production"',
  },
  plugins: [solid()],
  build: {
    outDir: here,
    emptyOutDir: false,
    minify: true,
    target: "es2020",
    lib: {
      entry: path.join(here, "src/entry.ts"),
      formats: ["iife"],
      name: "TooltipDemosBundle",
      fileName: () => "tooltip-demos.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        // The bundle is build output, so the linter skips it.
        banner: "/* eslint-disable */",
      },
    },
  },
};
