import { defineConfig, type Plugin } from "vite";
import solidPlugin from "vite-plugin-solid";
import { extname, resolve, sep } from "path";
import { readFile } from "fs/promises";

/** Task assets (tests/llm-bench/assets/), served at `/assets/<file>` so a
 *  JS program can load them by URL. The matplotlib arm gets the same folder
 *  as the `ASSET_DIR` environment variable (render.ts). */
const ASSET_DIR = resolve(__dirname, "../../llm-bench/assets");
const ASSET_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function serveAssets(): Plugin {
  return {
    name: "llm-bench-assets",
    configureServer(server) {
      server.middlewares.use("/assets", async (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "").split("?")[0]);
        const file = resolve(ASSET_DIR, "." + name);
        if (!file.startsWith(ASSET_DIR + sep)) return next();
        try {
          const body = await readFile(file);
          res.setHeader(
            "Content-Type",
            ASSET_TYPES[extname(file).toLowerCase()] ??
              "application/octet-stream"
          );
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end();
        }
      });
    },
  };
}

// Vite root for the LLM authoring benchmark (tests/scripts/llm-bench.ts).
//
// The runner writes each program a model produced under tests/tmp/llm-bench/
// and the page imports it through `/@fs/<absolute path>`. `gofish-graphics`
// resolves to live package source, like the main harness. Recharts programs
// are compiled to plain JS (React's automatic JSX runtime) by the runner
// before the page loads them, so the Solid plugin never sees React JSX.
export default defineConfig({
  plugins: [solidPlugin(), serveAssets()],
  root: resolve(__dirname),
  // Its own dependency cache: sharing tests/node_modules/.vite with the main
  // harness (a different config) makes each server re-optimize, and a
  // re-optimization reloads open pages mid-render.
  cacheDir: resolve(__dirname, "../../node_modules/.vite-llm-bench"),
  server: {
    strictPort: true,
    // The model's files live under tests/tmp, outside this root.
    fs: { allow: [resolve(__dirname, "../../..")] },
  },
  // Pre-bundle every library an arm may import, discovered from prewarm.ts,
  // so a model file never triggers a mid-run re-optimization (which reloads
  // the page and would turn into a spurious render error).
  optimizeDeps: {
    entries: ["index.html", "prewarm.ts"],
    esbuildOptions: {
      define: { "process.env.NODE_ENV": '"production"' },
    },
  },
  // Libraries run in their production builds, as users ship them. The
  // harness treats console errors as render errors, and development builds
  // log advice (React's missing-`key` warning, for one) that says nothing
  // about the picture.
  define: { "process.env.NODE_ENV": '"production"' },
  resolve: {
    alias: {
      "gofish-graphics": resolve(
        __dirname,
        "../../../packages/gofish-graphics/src/lib.ts"
      ),
    },
  },
});
