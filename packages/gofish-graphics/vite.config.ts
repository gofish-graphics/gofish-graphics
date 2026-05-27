import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import dts from "vite-plugin-dts";

export default defineConfig({
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
});
