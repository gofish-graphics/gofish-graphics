/**
 * Ruler: a hermetic, frozen reference workload measured in the same browser
 * session as every bench run, so longitudinal numbers can be normalized by the
 * run's ruler factor — canceling the CI hardware lottery.
 *
 * A ruler pins a specific published engine (the last stable minor release) plus
 * a frozen synthetic workload into a self-contained static bundle. `bench.ts
 * --ruler <dir>` runs that bundle alongside HEAD and records the geomean of its
 * point medians as `meta.ruler.factorMs`; the trend divides every stored ms by
 * that factor. Rulers are re-cut at each minor release; a `splice` run measures
 * the old and new rulers back-to-back so the multi-release trend is a piecewise
 * product of ratios.
 *
 * The first ruler is v0.1.0, built from the published npm package
 * `gofish-graphics@0.1.0`. That engine predates the perf instrumentation, so
 * ruler v0.1.0 is WALL-CLOCK ONLY (a ruler only needs total time; future rulers
 * can carry per-pass data — hence `wallOnly` in the manifest).
 *
 * Subcommands:
 *   build <version> --out <dir> [--verify]
 *     Install gofish-graphics@<version> (+ solid-js) from npm, bundle a
 *     standalone static page (published engine + a frozen copy of the synthetic
 *     generators), and write <dir>/{index.html, assets, manifest.json}.
 *   splice <oldDir> <newDir> --out <file>
 *     Measure two rulers' common workload interleaved A/B/A/B in one browser and
 *     write the baked-forever cross-ruler ratio.
 */

import { chromium } from "playwright";
import { build } from "vite";
import { createServer, type Server } from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve as resolvePath, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const TESTS_DIR = join(import.meta.dirname, "..");

// The frozen ruler workload: four families at two scales. Big enough to
// dominate the timer floor, small enough to run in seconds. Baked into every
// ruler so cross-ruler splices measure identical work.
export const RULER_POINTS: { family: string; n: number }[] = [
  { family: "spread", n: 300 },
  { family: "spread", n: 1000 },
  { family: "stack", n: 300 },
  { family: "stack", n: 1000 },
  { family: "scatter", n: 300 },
  { family: "scatter", n: 1000 },
  { family: "grid", n: 300 },
  { family: "grid", n: 1000 },
];

export type RulerManifest = {
  version: string;
  builtAt: string;
  wallOnly: boolean;
  points: { family: string; n: number }[];
  enginePackage: string;
};

// ---------------------------------------------------------------------------
// Shared helpers (also imported by bench.ts for its --ruler leg)
// ---------------------------------------------------------------------------

/** Geometric mean over the positive values (non-positives dropped, so one
 * skipped/zero point can't zero the whole factor); 0 only when none remain. */
export const geomean = (xs: number[]): number => {
  const pos = xs.filter((x) => x > 0);
  if (pos.length === 0) return 0;
  return Math.exp(pos.reduce((a, x) => a + Math.log(x), 0) / pos.length);
};

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

export type StaticServer = {
  server: Server;
  port: number;
  close: () => Promise<void>;
};

/** Serve `dir` on an ephemeral port (or `port` if given). Cross-origin isolated
 *  headers so the ruler page gets the same 5µs performance.now() as the bench. */
export function serveStatic(dir: string, port = 0): Promise<StaticServer> {
  const rootAbs = resolvePath(dir);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let path = decodeURIComponent(url.pathname);
      if (path === "/" || path.endsWith("/")) path += "index.html";
      const file = join(rootAbs, path);
      if (!file.startsWith(rootAbs)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(port, () => {
      const addr = server.address();
      const p = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        server,
        port: p,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

export function loadRulerManifest(dir: string): RulerManifest {
  return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
}

// ---------------------------------------------------------------------------
// The ruler page entry (frozen synthetic generators, inlined for hermeticity)
// ---------------------------------------------------------------------------

// Inlined copy of tests/bench/specs.ts's generators, ported to the published
// engine's fluent builder. Note: v0.1.0 exports the builder as `Chart`
// (capitalized), unlike the current `chart`. Kept byte-frozen per ruler so a
// splice measures identical work on both engines.
const RULER_ENTRY = `
import { Chart, spread, stack, scatter, rect, circle } from "gofish-graphics";

const val = (i) => 10 + (i % 50);
const rows = (n) => Array.from({ length: n }, (_, i) => ({ i, v: val(i) }));

const families = {
  spread: (n) =>
    Chart(rows(n)).flow(spread({ dir: "x", spacing: 1 })).mark(rect({ w: 4, h: "v" })),
  stack: (n) =>
    Chart(rows(n)).flow(stack({ dir: "y" })).mark(rect({ w: 20, h: "v" })),
  scatter: (n) => {
    const data = Array.from({ length: n }, (_, i) => ({ x: i, y: val(i) + (i % 7) }));
    return Chart(data).flow(scatter({ x: "x", y: "y" })).mark(circle({ r: 2 }));
  },
  grid: (n) => {
    const side = Math.max(1, Math.ceil(Math.sqrt(n)));
    const data = Array.from({ length: side * side }, (_, k) => ({
      g: Math.floor(k / side), i: k % side, v: val(k),
    }));
    return Chart(data)
      .flow(spread({ by: "g", dir: "x", spacing: 4 }))
      .mark((d) =>
        Chart(d).flow(spread({ by: "i", dir: "y", spacing: 1 })).mark(rect({ w: 4, h: 4 }))
      );
  },
};

const root = document.getElementById("ruler-root");

// Wall-clock only: clear root, render, await one rAF (the frame where paint
// lands), return the wall time. No engine perf instrumentation is assumed.
window.__runRulerPoint__ = async (family, n) => {
  root.innerHTML = "";
  const builder = families[family] && families[family](n);
  if (!builder) throw new Error("unknown ruler family: " + family);
  const t0 = performance.now();
  await builder.render(root, { w: 800, h: 600 });
  await new Promise((r) => requestAnimationFrame(r));
  return { wallMs: performance.now() - t0 };
};

window.__RULER_READY__ = true;
`;

const RULER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>GoFish Ruler</title>
  </head>
  <body>
    <div id="ruler-root"></div>
    <script type="module" src="./ruler-entry.js"></script>
  </body>
</html>
`;

// ---------------------------------------------------------------------------
// build subcommand
// ---------------------------------------------------------------------------

async function buildRuler(version: string, outDir: string, verify: boolean) {
  const outAbs = resolvePath(outDir);
  // Temp build dir under tests/tmp (never /tmp) with its own node_modules so
  // the published engine + its solid-js peer resolve hermetically.
  const workDir = join(TESTS_DIR, "tmp/bench/ruler-build", `v${version}`);
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  await writeFile(
    join(workDir, "package.json"),
    JSON.stringify(
      { name: `ruler-v${version}`, private: true, type: "module" },
      null,
      2
    )
  );
  console.log(`[ruler build] installing gofish-graphics@${version} ...`);
  execSync(
    `npm install gofish-graphics@${version} solid-js@^1.9.5 --no-audit --no-fund --loglevel=error`,
    { cwd: workDir, stdio: process.env.DEBUG ? "inherit" : "ignore" }
  );

  await writeFile(join(workDir, "ruler-entry.js"), RULER_ENTRY);
  await writeFile(join(workDir, "index.html"), RULER_HTML);

  console.log(`[ruler build] bundling → ${outAbs} ...`);
  await build({
    root: workDir,
    base: "./", // relative asset URLs → loads from any static server / subpath
    configFile: false,
    logLevel: process.env.DEBUG ? "info" : "warn",
    define: { "process.env.NODE_ENV": '"production"' },
    build: {
      outDir: outAbs,
      emptyOutDir: true,
      target: "es2020",
      assetsInlineLimit: 0,
      minify: true,
    },
  });

  const manifest: RulerManifest = {
    version,
    builtAt: new Date().toISOString(),
    // v0.1.0 predates perf instrumentation → total wall time is all a ruler needs.
    wallOnly: true,
    points: RULER_POINTS,
    enginePackage: `gofish-graphics@${version}`,
  };
  writeFileSync(
    join(outAbs, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log(
    `[ruler build] wrote manifest.json (${RULER_POINTS.length} points)`
  );

  if (verify) await verifyRuler(outAbs);
}

/** Load the bundle from a plain static server and run all points once. */
async function verifyRuler(dir: string) {
  console.log(`[ruler verify] serving + running all points ...`);
  const srv = await serveStatic(dir);
  const browser = await chromium.launch({
    headless: true,
    args: ["--js-flags=--expose-gc"],
  });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://localhost:${srv.port}/`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => (window as any).__RULER_READY__ === true, {
      timeout: 30_000,
    });
    for (const pt of RULER_POINTS) {
      const { wallMs } = (await page.evaluate(
        ([f, n]) => (window as any).__runRulerPoint__(f, n),
        [pt.family, pt.n] as [string, number]
      )) as { wallMs: number };
      console.log(`  ${pt.family} n=${pt.n} ... ${wallMs.toFixed(2)}ms`);
      if (!(wallMs > 0))
        throw new Error(`non-positive wall for ${pt.family}/${pt.n}`);
    }
    if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
    console.log(`[ruler verify] OK`);
  } finally {
    await browser.close();
    await srv.close();
  }
}

// ---------------------------------------------------------------------------
// splice subcommand
// ---------------------------------------------------------------------------

// Generous sampling: this ratio is baked into the multi-release trend forever.
const SPLICE_WARMUP = 3;
const SPLICE_SAMPLES = 20;

async function measurePointOn(
  page: import("playwright").Page,
  family: string,
  n: number,
  samples: number
): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    const { wallMs } = (await page.evaluate(
      ([f, k]) => (window as any).__runRulerPoint__(f, k),
      [family, n] as [string, number]
    )) as { wallMs: number };
    out.push(wallMs);
    await page.evaluate(() => (globalThis as any).gc?.());
  }
  return out;
}

async function spliceRulers(oldDir: string, newDir: string, outFile: string) {
  const oldMan = loadRulerManifest(oldDir);
  const newMan = loadRulerManifest(newDir);
  // Common workload only (a re-cut ruler may change its point set).
  const key = (p: { family: string; n: number }) => `${p.family}@${p.n}`;
  const newSet = new Set(newMan.points.map(key));
  const common = oldMan.points.filter((p) => newSet.has(key(p)));
  if (common.length === 0) throw new Error("rulers share no common points");

  const oldSrv = await serveStatic(oldDir);
  const newSrv = await serveStatic(newDir);
  const browser = await chromium.launch({
    headless: true,
    args: ["--js-flags=--expose-gc"],
  });

  const perPoint: {
    family: string;
    n: number;
    oldMedian: number;
    newMedian: number;
    ratio: number;
  }[] = [];

  try {
    const oldPage = await browser.newPage();
    const newPage = await browser.newPage();
    await Promise.all([
      oldPage.goto(`http://localhost:${oldSrv.port}/`, {
        waitUntil: "domcontentloaded",
      }),
      newPage.goto(`http://localhost:${newSrv.port}/`, {
        waitUntil: "domcontentloaded",
      }),
    ]);
    await Promise.all([
      oldPage.waitForFunction(() => (window as any).__RULER_READY__ === true, {
        timeout: 30_000,
      }),
      newPage.waitForFunction(() => (window as any).__RULER_READY__ === true, {
        timeout: 30_000,
      }),
    ]);

    for (const pt of common) {
      process.stdout.write(`  ${pt.family} n=${pt.n} ... `);
      // Warm both engines for this point.
      await measurePointOn(oldPage, pt.family, pt.n, SPLICE_WARMUP);
      await measurePointOn(newPage, pt.family, pt.n, SPLICE_WARMUP);
      // Interleave A/B/A/B: alternate a single sample on each side so any
      // thermal/scheduler drift hits both engines equally.
      const oldS: number[] = [];
      const newS: number[] = [];
      for (let i = 0; i < SPLICE_SAMPLES; i++) {
        oldS.push(...(await measurePointOn(oldPage, pt.family, pt.n, 1)));
        newS.push(...(await measurePointOn(newPage, pt.family, pt.n, 1)));
      }
      const om = median(oldS);
      const nm = median(newS);
      perPoint.push({
        family: pt.family,
        n: pt.n,
        oldMedian: om,
        newMedian: nm,
        ratio: om > 0 ? nm / om : 0,
      });
      console.log(
        `old ${om.toFixed(2)}ms · new ${nm.toFixed(2)}ms · ×${(nm / om).toFixed(3)}`
      );
    }
  } finally {
    await browser.close();
    await oldSrv.close();
    await newSrv.close();
  }

  const ratios = perPoint.map((p) => p.ratio);
  const out = {
    from: oldMan.version,
    to: newMan.version,
    // Geomean over points of new/old median wall — the piecewise trend multiplier.
    ratio: geomean(ratios),
    perPoint,
    samples: SPLICE_SAMPLES,
    spread: {
      minRatio: Math.min(...ratios),
      maxRatio: Math.max(...ratios),
    },
    timestamp: new Date().toISOString(),
  };
  const outAbs = resolvePath(outFile);
  mkdirSync(join(outAbs, ".."), { recursive: true });
  writeFileSync(outAbs, JSON.stringify(out, null, 2));
  console.log(
    `[ruler splice] ${out.from} → ${out.to}: ratio ×${out.ratio.toFixed(4)} → ${outAbs}`
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const [sub, ...rest] = process.argv.slice(2);
  if (sub === "build") {
    const version = rest.find((a) => !a.startsWith("--"));
    const out = argValue("--out");
    if (!version || !out) {
      console.error("usage: ruler.ts build <version> --out <dir> [--verify]");
      process.exit(1);
    }
    await buildRuler(version, out, process.argv.includes("--verify"));
  } else if (sub === "splice") {
    const dirs = rest.filter((a) => !a.startsWith("--"));
    const out = argValue("--out");
    if (dirs.length < 2 || !out) {
      console.error("usage: ruler.ts splice <oldDir> <newDir> --out <file>");
      process.exit(1);
    }
    await spliceRulers(dirs[0], dirs[1], out);
  } else {
    console.error("usage: ruler.ts <build|splice> ...");
    process.exit(1);
  }
}

// Run the CLI only when invoked directly; bench.ts imports the helpers above.
if (
  process.argv[1] &&
  resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
