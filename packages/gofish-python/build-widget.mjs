import { build } from "esbuild";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const widgetSrc = resolve(here, "widget-src", "index.ts");
const outputFile = resolve(here, "gofish", "_static", "widget.esm.js");

// Ensure output directory exists before esbuild writes to it.
mkdirSync(dirname(outputFile), { recursive: true });

await build({
  entryPoints: [widgetSrc],
  outfile: outputFile,
  bundle: true,
  platform: "browser",
  format: "esm",
  // ES2020 for BigInt literals: temporal-polyfill (loaded only where the
  // browser has no native Temporal) uses them.
  target: "es2020",
  sourcemap: "inline",
  logLevel: "info",
  resolveExtensions: [".ts", ".tsx", ".js", ".jsx"],
  // Resolve from workspace root to find hoisted dependencies
  absWorkingDir: root,
});

console.log(`Built widget -> ${outputFile}`);
