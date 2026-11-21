// Browser bundle of browser-entry.ts with the library's own Solid compiler.
// vite and vite-plugin-solid are taken from the library package's node_modules
// so the spike adds no dependency to any repo package.json.
import { fileURLToPath } from "node:url";
const pkg = fileURLToPath(
  new URL("../../../packages/gofish-graphics/", import.meta.url)
);
const { default: solidPlugin } = await import(
  pkg + "node_modules/vite-plugin-solid/dist/esm/index.mjs"
);

export default {
  root: fileURLToPath(new URL(".", import.meta.url)),
  define: { __GOFISH_PERF_INSTRUMENTATION__: "false" },
  plugins: [solidPlugin()],
  logLevel: "warn",
  build: {
    outDir: fileURLToPath(new URL("./out/browser", import.meta.url)),
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: fileURLToPath(new URL("./browser-entry.ts", import.meta.url)),
      formats: ["iife"],
      name: "Spike",
      fileName: () => "browser.js",
    },
  },
};
