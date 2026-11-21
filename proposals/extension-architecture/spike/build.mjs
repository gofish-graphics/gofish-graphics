// Bundle the spike entry points with esbuild straight from library source.
//
// Solid JSX: esbuild cannot run babel-preset-solid, so the library's .tsx files
// are compiled with the `solid-js/h` hyperscript runtime (jsx: automatic). That
// is only for compiling: the scene path never paints JSX. solid-js itself is
// bundled (it is tiny and inert until render() is called).
import { build } from "esbuild";

const common = {
  bundle: true,
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  jsxImportSource: "solid-js/h",
  tsconfigRaw: {
    compilerOptions: { jsx: "react-jsx", jsxImportSource: "solid-js/h" },
  },
  define: { __GOFISH_PERF_INSTRUMENTATION__: "false" },
  logLevel: "warning",
  metafile: true,
};

const targets = process.argv.slice(2);
const want = (t) => targets.length === 0 || targets.includes(t);

if (want("s1")) {
  await build({
    ...common,
    entryPoints: ["s1.ts"],
    outfile: "out/s1.mjs",
    platform: "node",
    external: ["fontkit", "opentype.js"],
  });
}
if (want("engine")) {
  // The single-file engine for embedded runtimes (mini-racer / QuickJS / a
  // subprocess). Platform "neutral": no node builtins, browser conditions for
  // solid-js so we do not pull its server build.
  for (const [fmt, out] of [
    ["iife", "out/engine.iife.js"],
    ["esm", "out/engine.mjs"],
  ]) {
    const r = await build({
      ...common,
      entryPoints: ["engine.ts"],
      outfile: out,
      platform: "neutral",
      mainFields: ["module", "main"],
      conditions: ["browser", "import", "default"],
      format: fmt,
      globalName: fmt === "iife" ? "GoFishEngine" : undefined,
      minify: true,
    });
    const bytes = Object.values(r.metafile.outputs)[0].bytes;
    console.log(`${out}: ${(bytes / 1024).toFixed(0)} KiB`);
  }
}
