#!/usr/bin/env node
/**
 * Capture REAL rendered SVGs for every example in the docs gallery.
 *
 * Output: prototypes/gallery/renders.js, a plain <script src>-loadable file
 * defining `window.GALLERY_RENDERS = [{ id, title, description, w, h, svg }, ...]`.
 * It is file:// safe (no fetch), for the standalone gallery prototype.
 *
 * HOW IT RENDERS
 * --------------
 * The docs example pages (/js/examples/<id>.html) render almost all charts via
 * the Sandpack in-browser bundler (the `::: starfish-live` blocks), which lives
 * inside an <iframe> and depends on a CDN bundler — flaky/offline-unfriendly to
 * capture. Only pulley.md uses the GoFishVue `::: starfish` path directly.
 *
 * So instead of scraping the docs pages, this script stands up a tiny Vite
 * harness (apps/docs/__capture/) that replicates GoFishVue.vue's execution model
 * exactly: it imports `gofish-graphics` + the same dataset modules and runs each
 * example's source through `new Function(...)` with the identical argument list.
 * This was verified faithful: the pulley example renders byte-for-byte the same
 * DOM (11 <text> els, 1 <svg>) as the real GoFishVue docs page.
 *
 * The harness is served from apps/docs as Vite root so bare imports
 * (gofish-graphics, lodash, spectral.js, fast-kde) resolve from apps/docs/node_modules.
 *
 * USAGE
 *   node prototypes/gallery/capture-renders.mjs [baseUrl]
 *   - baseUrl (optional): a harness already serving /__capture/index.html.
 *     If omitted, the script spawns its own Vite harness and tears it down.
 */

import { spawn } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", ".."); // prototypes/gallery -> repo root
const DOCS_DIR = join(REPO_ROOT, "apps", "docs");
const TESTS_DIR = join(REPO_ROOT, "tests");
const HARNESS_DIR = join(DOCS_DIR, "__capture");
const VITE_BIN = join(TESTS_DIR, "node_modules", ".bin", "vite");
const EXAMPLES_DATA = join(
  DOCS_DIR,
  "docs",
  ".vitepress",
  "data",
  "examples.data.js"
);
const OUT_FILE = join(__dirname, "renders.js");

// playwright lives in the tests package
const requireFromTests = createRequire(join(TESTS_DIR, "package.json"));
const { chromium } = requireFromTests("playwright");

const argBase = process.argv[2] || null;

// ---------------------------------------------------------------------------
// Harness files (mirror of GoFishVue.vue's sandbox closure)
// ---------------------------------------------------------------------------
const HARNESS_JS = `
import * as gf from "gofish-graphics";
import { mix } from "spectral.js";
import _ from "lodash";
import { streamgraphData } from "../components/data/streamgraphData";
import { titanic } from "../components/data/titanic";
import { nightingale } from "../components/data/nightingale";
import { drivingShifts } from "../components/data/drivingShifts";
import { newCarColors } from "../components/data/newCarColors";
import { caltrain, caltrainStopOrder } from "../components/data/caltrain";
import { penguins } from "../components/data/penguins";
import { density1d } from "fast-kde";
import { genderPayGap, payGrade } from "../components/data/genderPayGap";
import { seafood, lakeLocations } from "../components/data/seafood";

window.renderExample = (code) => {
  const fn = new Function(
    "_", "root", "size", "gf",
    "streamgraphData", "titanic", "nightingale", "drivingShifts",
    "newCarColors", "caltrain", "caltrainStopOrder", "penguins",
    "density1d", "genderPayGap", "payGrade", "mix", "seafood", "lakeLocations",
    code
  );
  const root = document.createElement("div");
  root.className = "render-root";
  const size = { width: 500, height: 300 }; // GoFishVue default
  fn(
    _, root, size, gf,
    streamgraphData, titanic, nightingale, drivingShifts,
    newCarColors, caltrain, caltrainStopOrder, penguins,
    density1d, genderPayGap, payGrade, mix, seafood, lakeLocations
  );
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.appendChild(root);
  return true;
};
window.__harnessReady = true;
`;

const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>body{margin:0}</style></head>
<body><div id="app"></div>
<script type="module" src="./harness.js"></script>
</body></html>`;

function writeHarness() {
  mkdirSync(HARNESS_DIR, { recursive: true });
  writeFileSync(join(HARNESS_DIR, "harness.js"), HARNESS_JS);
  writeFileSync(join(HARNESS_DIR, "index.html"), HARNESS_HTML);
}

function startVite() {
  if (!existsSync(VITE_BIN)) {
    throw new Error(`vite binary not found at ${VITE_BIN} (run pnpm install)`);
  }
  const child = spawn(VITE_BIN, [DOCS_DIR, "--port", "5180"], {
    cwd: DOCS_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (d) => {
      buf += d.toString();
      const m = buf.match(/Local:\s+(http:\/\/localhost:(\d+)\/)/);
      if (m) {
        child.stdout.off("data", onData);
        resolve({ child, url: m[1].replace(/\/$/, "") });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (d) => {
      // surface fatal vite errors
      const s = d.toString();
      if (/Error|EADDRINUSE/.test(s)) buf += s;
    });
    child.on("exit", (code) =>
      reject(new Error(`vite exited early (${code}): ${buf.slice(-500)}`))
    );
    setTimeout(
      () => reject(new Error(`vite did not start in time: ${buf.slice(-500)}`)),
      60000
    );
  });
}

// ---------------------------------------------------------------------------
// Namespace any internal ids so multiple inlined svgs don't collide.
// Charts currently emit zero id= attrs, but clipPaths/gradients could appear.
// ---------------------------------------------------------------------------
function namespaceSvgIds(svg, exampleId) {
  const ids = new Set();
  for (const m of svg.matchAll(/\bid="([^"]+)"/g)) ids.add(m[1]);
  if (ids.size === 0) return { svg, namespaced: 0 };
  const prefix = exampleId.replace(/[^a-zA-Z0-9_-]/g, "_") + "__";
  let out = svg;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out
      .replace(new RegExp(`\\bid="${esc}"`, "g"), `id="${prefix}${id}"`)
      .replace(new RegExp(`url\\(#${esc}\\)`, "g"), `url(#${prefix}${id})`)
      .replace(
        new RegExp(`((?:xlink:)?href)="#${esc}"`, "g"),
        `$1="#${prefix}${id}"`
      );
  }
  return { svg: out, namespaced: ids.size };
}

async function main() {
  // 1. Load example registry (already filters HIDDEN/internal, sorted by title;
  //    each entry carries id, title, description?, and code).
  // examples.data.js is ESM-syntax but apps/docs/package.json marks .js as CJS,
  // so import() fails. Copy it to a sibling .mjs (same dir => its relative fs
  // reads still resolve) and import that, then clean up.
  const tmpData = join(dirname(EXAMPLES_DATA), "__examples.capture.tmp.mjs");
  let examples;
  try {
    writeFileSync(tmpData, readFileSync(EXAMPLES_DATA));
    const dataMod = await import(pathToFileURL(tmpData).href);
    examples = dataMod.default.load().examples;
  } finally {
    try {
      rmSync(tmpData, { force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  }
  console.log(`Loaded ${examples.length} examples from registry.`);

  // 2. Harness + server
  writeHarness();
  let viteChild = null;
  let baseUrl = argBase;
  if (!baseUrl) {
    console.log("Starting Vite harness...");
    const started = await startVite();
    viteChild = started.child;
    baseUrl = started.url;
    console.log(`Harness up at ${baseUrl}`);
  } else {
    console.log(`Using provided harness base: ${baseUrl}`);
  }

  const results = [];
  const failures = [];
  const anomalies = [];

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1200 },
    });
    page.on("pageerror", (e) =>
      anomalies.push(`pageerror: ${e.message.slice(0, 200)}`)
    );

    await page.goto(`${baseUrl}/__capture/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__harnessReady, { timeout: 30000 });

    for (const ex of examples) {
      const { id, title, description, code } = ex;
      try {
        const rendered = await page.evaluate((c) => {
          try {
            return window.renderExample(c);
          } catch (e) {
            return { __error: String((e && e.message) || e) };
          }
        }, code);
        if (rendered && rendered.__error) {
          throw new Error(rendered.__error);
        }

        // Wait for the FIRST svg to exist with a nonzero bbox, and settle.
        const measured = await page.waitForFunction(
          () => {
            const svg = document.querySelector("#app svg");
            if (!svg) return false;
            const r = svg.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return false;
            // settle: require two stable reads of the serialized length
            const len = svg.outerHTML.length;
            const w = window;
            if (w.__lastLen === len && w.__lastFor === len) {
              return { w: r.width, h: r.height, len };
            }
            w.__lastFor = w.__lastLen;
            w.__lastLen = len;
            return false;
          },
          { timeout: 25000, polling: 250 }
        );
        await page.evaluate(() => {
          delete window.__lastLen;
          delete window.__lastFor;
        });
        const m = await measured.jsonValue();

        const raw = await page.evaluate(() => {
          const svg = document.querySelector("#app svg");
          // prefer the attribute size if present, else bbox
          const wAttr = svg.getAttribute("width");
          const hAttr = svg.getAttribute("height");
          const r = svg.getBoundingClientRect();
          const w = wAttr ? parseFloat(wAttr) : r.width;
          const h = hAttr ? parseFloat(hAttr) : r.height;
          // CRITICAL: give the root svg a viewBox so it SCALES when displayed
          // smaller than 1:1 in the gallery frames. Without one, a fixed
          // width/height svg just crops to a corner (the "blank frames" bug).
          if (!svg.getAttribute("viewBox")) {
            svg.setAttribute("viewBox", "0 0 " + w + " " + h);
          }
          // make it fill whatever box it's dropped into, preserving aspect
          svg.setAttribute("width", "100%");
          svg.setAttribute("height", "100%");
          svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
          return { outerHTML: svg.outerHTML, w, h };
        });

        const { svg, namespaced } = namespaceSvgIds(raw.outerHTML, id);
        const w = Math.round(raw.w);
        const h = Math.round(raw.h);

        if (svg.length > 300 * 1024)
          anomalies.push(`${id}: large svg ${(svg.length / 1024) | 0}KB`);
        if (/<use\b/.test(svg)) anomalies.push(`${id}: contains <use>`);
        if (/<image\b/.test(svg)) anomalies.push(`${id}: contains <image>`);
        if (/url\(\s*['"]?https?:/.test(svg) || /@font-face/.test(svg))
          anomalies.push(`${id}: external font/url ref`);
        if (namespaced) anomalies.push(`${id}: namespaced ${namespaced} id(s)`);

        results.push({ id, title, description, w, h, svg });
        console.log(
          `  ok  ${id.padEnd(26)} ${String(w).padStart(4)} x ${String(
            h
          ).padStart(4)}  (${(svg.length / 1024).toFixed(1)}KB)`
        );
      } catch (err) {
        const msg = String((err && err.message) || err).slice(0, 200);
        failures.push({ id, error: msg });
        console.log(`  FAIL ${id.padEnd(26)} ${msg}`);
      }
    }
  } finally {
    await browser.close();
    if (viteChild) viteChild.kill("SIGTERM");
    // remove the scaffolding
    try {
      rmSync(HARNESS_DIR, { recursive: true, force: true });
    } catch {
      /* best-effort scaffolding cleanup */
    }
  }

  // 3. Write the file:// loadable data file
  const banner =
    "/* AUTO-GENERATED by prototypes/gallery/capture-renders.mjs. Do not edit by hand. */\n";
  writeFileSync(
    OUT_FILE,
    banner + "window.GALLERY_RENDERS = " + JSON.stringify(results) + ";\n"
  );

  console.log("\n=== Summary ===");
  console.log(`captured: ${results.length}/${examples.length}`);
  console.log(`output:   ${OUT_FILE}`);
  if (anomalies.length) {
    console.log(`anomalies (${anomalies.length}):`);
    for (const a of anomalies) console.log("  - " + a);
  }
  if (failures.length) {
    console.log(`failures (${failures.length}):`);
    for (const f of failures) console.log(`  - ${f.id}: ${f.error}`);
  }

  // Exit nonzero only if more than a handful fail.
  if (failures.length > 3) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
