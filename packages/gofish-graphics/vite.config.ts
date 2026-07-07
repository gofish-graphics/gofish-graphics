import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import dts from "vite-plugin-dts";

export default defineConfig(({ command, mode }) => {
  // `build:bench` (`vite build --mode bench`) produces an instrumented, minified,
  // production-codegen bundle in `dist-bench/` that the bench driver aliases
  // `gofish-graphics` to — identical to the published build but with perf kept in.
  const isBench = mode === "bench";
  const outDir = isBench ? "dist-bench" : "dist";
  return {
    // Strip the render-pass perf instrumentation (src/ast/perf.ts) from the
    // published library build via dead-code elimination: replacing this constant
    // with a literal `false` lets the minifier fold `perfEnabled()` to `false`
    // and drop every guarded section. Left `true` for `pnpm dev`, the bench harness
    // (via its own Vite config), and the `build:bench` bundle, which keep it live.
    define: {
      __GOFISH_PERF_INSTRUMENTATION__:
        command === "build" && !isBench ? "false" : "true",
    },
    plugins: [
      solidPlugin(),
      dts({
        entryRoot: "src",
        include: ["src/**/*.ts", "src/**/*.tsx"],
        exclude: [
          "src/tests/**",
          "src/**/*.test.ts",
          "src/**/*.spec.ts",
          "src/index.tsx",
        ],
        insertTypesEntry: true,
        rollupTypes: false,
        staticImport: true,
        tsconfigPath: "./tsconfig.json",
        outDir,
        logLevel: "warn",
      }),
    ],
    server: {
      port: 3000,
    },
    build: {
      target: "esnext",
      outDir,
      lib: {
        entry: "src/lib.ts",
        name: "GoFishGraphics",
        fileName: "index",
        formats: ["es"],
      },
      rollupOptions: {
        external: ["solid-js"],
        output: {
          globals: {
            "solid-js": "SolidJS",
          },
        },
      },
    },
  };
});
