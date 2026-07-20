import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import { resolve } from "path";

// Bench gates (set by tests/scripts/bench.ts when spawning this server):
//   GOFISH_BENCH=1       — emit COOP/COEP so the page is cross-origin isolated,
//                          unlocking 5µs `performance.now()` in Chromium (vs
//                          100µs). Off by default: COEP:require-corp blocks the
//                          remote-dataset fetches other harness consumers (the
//                          visual capture) rely on.
//   GOFISH_BENCH_PROD=1  — alias `gofish-graphics` to the pre-built, instrumented
//                          production bundle (dist-bench) and resolve solid-js in
//                          production mode, so we bench code users actually run
//                          rather than the SolidJS dev build of package source.
const BENCH = process.env.GOFISH_BENCH === "1";
const BENCH_PROD = process.env.GOFISH_BENCH_PROD === "1";

const gofishAlias = BENCH_PROD
  ? resolve(__dirname, "../../packages/gofish-graphics/dist-bench/index.js")
  : resolve(__dirname, "../../packages/gofish-graphics/src/lib.ts");

export default defineConfig({
  // In prod-bench mode, keep the SolidJS dev export condition from being picked
  // (dev mode adds reactivity bookkeeping no user pays for).
  plugins: [solidPlugin(BENCH_PROD ? { dev: false } : {})],
  root: resolve(__dirname),
  define: BENCH_PROD ? { "process.env.NODE_ENV": '"production"' } : {},
  server: {
    port: 3001,
    strictPort: false,
    headers: BENCH
      ? {
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
        }
      : {},
  },
  resolve: {
    // Drop the "development" condition so solid-js resolves its production
    // export in prod-bench mode; the default set is unchanged otherwise.
    conditions: BENCH_PROD
      ? ["browser", "module", "import", "default"]
      : undefined,
    alias: {
      "gofish-graphics": gofishAlias,
      // gofish-gotree and gofish-neo are never built (no dist/) in the CI jobs
      // that spin up this harness (visual-test, bench, docs' capture-gallery-
      // thumbnails step) — only gofish-graphics gets a prerelease build there.
      // Bare imports of these two packages (e.g. gofish-neo's confusionMatrix.tsx
      // importing `gofish-gotree`) resolve straight to source instead, same as
      // the gofishAlias above. Unconditional (not BENCH_PROD-gated): bench only
      // instruments gofish-graphics.
      "gofish-gotree": resolve(
        __dirname,
        "../../packages/gofish-gotree/src/index.ts"
      ),
      "gofish-neo": resolve(
        __dirname,
        "../../packages/gofish-neo/src/index.ts"
      ),
    },
  },
});
