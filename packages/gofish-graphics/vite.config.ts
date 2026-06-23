import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import dts from "vite-plugin-dts";

export default defineConfig(({ command }) => ({
  // Strip the render-pass perf instrumentation (src/ast/perf.ts) from the
  // published library build via dead-code elimination: replacing this constant
  // with a literal `false` lets the minifier fold `perfEnabled()` to `false`
  // and drop every guarded section. Left `true` for `pnpm dev` and (via its own
  // Vite config) the bench harness, which need the instrumentation live.
  define: {
    __GOFISH_PERF_INSTRUMENTATION__: command === "build" ? "false" : "true",
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
      outDir: "dist",
      logLevel: "warn",
    }),
  ],
  server: {
    port: 3000,
  },
  build: {
    target: "esnext",
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
}));
