/**
 * Render the dogfooded benchmark plot stories (Benchmarks/*) with the real
 * bench results injected, capturing each to PNG + standalone SVG under
 * `tests/tmp/bench/plots/` for the CI artifact and for thesis figures.
 *
 * The plot stories (packages/gofish-graphics/stories/bench/Benchmarks.stories.tsx)
 * read `window.__BENCH_RESULTS__` and `window.__BENCH_HISTORY__`; we set those
 * from `tests/tmp/bench/results.json` (written by `bench.ts`) and an optional
 * `tests/tmp/bench/history.json` (written in CI from the `benchmarks` data
 * branch) before rendering. With no results file the stories fall back to their
 * embedded sample, so this still produces plots.
 */

import { chromium, type Browser } from "playwright";
import { spawn, type ChildProcess } from "child_process";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const BENCH_DIR = join(TESTS_DIR, "tmp/bench");
const PLOTS_DIR = join(BENCH_DIR, "plots");
const HARNESS_PORT = 3012;

const STORY_IDS = [
  "benchmarks--asymptotics",
  "benchmarks--passbreakdown",
  "benchmarks--ecological",
  "benchmarks--trend",
  "benchmarks--envelope",
];

function startHarness(): ChildProcess {
  return spawn(
    "npx",
    [
      "vite",
      "--config",
      join(HARNESS_DIR, "vite.config.ts"),
      "--port",
      String(HARNESS_PORT),
    ],
    {
      cwd: HARNESS_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "development" },
    }
  );
}

async function waitFor(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

const readJson = (path: string): unknown =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : null;

/** Ensure the captured SVG markup is a valid standalone document. */
function standaloneSvg(svg: string): string {
  if (!svg.includes("xmlns")) {
    svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
}

async function main() {
  const results = readJson(join(BENCH_DIR, "results.json"));
  const history = readJson(join(BENCH_DIR, "history.json"));

  const harnessProc = startHarness();
  let browser: Browser | undefined;
  mkdirSync(PLOTS_DIR, { recursive: true });

  try {
    await waitFor(`http://localhost:${HARNESS_PORT}/stories-runner.html`);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1400, height: 700 },
    });
    const page = await context.newPage();

    // Inject the data on every navigation BEFORE the story modules run.
    await page.addInitScript(
      ([r, h]) => {
        if (r) (window as any).__BENCH_RESULTS__ = r;
        if (h) (window as any).__BENCH_HISTORY__ = h;
      },
      [results, history] as [unknown, unknown]
    );

    await page.goto(`http://localhost:${HARNESS_PORT}/stories-runner.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () => (window as any).__STORIES_RUNNER_READY__ === true,
      {
        timeout: 30_000,
      }
    );

    for (const id of STORY_IDS) {
      process.stdout.write(`  ${id} ... `);
      const ok = await page.evaluate(
        (sid) => (window as any).__renderStory__(sid),
        id
      );
      if (!ok) {
        console.log(
          `FAILED: ${await page.evaluate(() => (window as any).__STORY_RENDER_ERROR__)}`
        );
        continue;
      }
      await page.waitForFunction(
        () => (window as any).__STORY_RENDER_DONE__ === true,
        {
          timeout: 15_000,
        }
      );

      const rootHandle = await page.$("#stories-root");
      if (rootHandle) {
        writeFileSync(
          join(PLOTS_DIR, `${id}.png`),
          await rootHandle.screenshot({ type: "png" })
        );
      }
      const svg = await page.evaluate(() => {
        const el = document.querySelector("#stories-root svg");
        return el ? el.outerHTML : null;
      });
      if (svg) writeFileSync(join(PLOTS_DIR, `${id}.svg`), standaloneSvg(svg));
      console.log("OK");
    }

    await context.close();
  } finally {
    await browser?.close();
    harnessProc.kill();
  }

  console.log(`\nPlots → ${PLOTS_DIR}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
