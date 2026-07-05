/**
 * capture-sweep.ts
 *
 * Solver shadow sweep (#39 stage 5a): render EVERY story headlessly with
 * `GOFISH_SOLVER_CHECK` injected into the page, and surface any solver-shadow
 * divergence the render logs. It answers "does the rank-2 placement solve
 * reproduce the shipped rank-1 result on every story?" — the gate for flipping
 * the commit path (5b).
 *
 * The harness aliases `gofish-graphics` to `src/`, so it renders the library
 * live from source — no rebuild needed (run `pnpm install` first on a fresh
 * worktree). An init script sets `window.GOFISH_SOLVER_CHECK = 1` before any
 * story module loads, so `envFlag("GOFISH_SOLVER_CHECK")` is true and the
 * shadow checks (`constraints/rank2Placement.ts`, `_node.ts` bbox-conflict) run.
 * Each story's browser console is captured; any `[solver-check]` (rank-2 vs
 * rank-1 placement divergence) or `[bbox-conflict]` (ledger over-determination)
 * line is collected and reported per story.
 *
 * Usage:
 *   tsx scripts/capture-sweep.ts            # whole suite
 *   tsx scripts/capture-sweep.ts bar        # only stories matching "bar"
 *
 * Exit code 0 = every story clean, 1 = at least one story logged a divergence
 * (so it doubles as a pass/fail gate).
 */

import { chromium, type Browser } from "playwright";
import { join } from "path";
import {
  startViteServer,
  waitForVite,
  type StoryInfo,
} from "./capture-core.js";

const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const VITE_PORT = 3004; // distinct from the other capture ports so they can coexist

/** A shadow divergence line matches one of the solver-check prefixes. */
const SHADOW_PREFIX = /^\[(solver-check|bbox-conflict)\]/;

interface StoryReport {
  path: string;
  lines: string[];
}

async function main() {
  const filter = process.argv[2]?.toLowerCase().trim();

  const viteProc = startViteServer(HARNESS_DIR, VITE_PORT);
  viteProc.stdout?.on("data", (d) => {
    if (process.env.DEBUG) process.stdout.write(d.toString());
  });
  viteProc.stderr?.on("data", (d) => process.stderr.write(d.toString()));

  let browser: Browser | undefined;
  const reports: StoryReport[] = [];
  const renderFailures: { path: string; error: string }[] = [];
  let total = 0;

  try {
    await waitForVite(VITE_PORT);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    // Turn the shadow on before any story module evaluates. `envFlag` reads
    // `globalThis[name]`, which is `window` in the page.
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).GOFISH_SOLVER_CHECK = 1;
    });

    // Collect console output into a per-story buffer. Cleared before each render.
    let buffer: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (SHADOW_PREFIX.test(text)) buffer.push(text);
      else if (msg.type() === "error") console.error(`[browser] ${text}`);
      else if (process.env.DEBUG)
        console.log(`[browser:${msg.type()}] ${text}`);
    });
    page.on("pageerror", (err) =>
      console.error(`[browser pageerror] ${err.message}`)
    );

    await page.goto(`http://localhost:${VITE_PORT}/stories-runner.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () => (window as any).__STORIES_RUNNER_READY__ === true,
      { timeout: 30_000 }
    );
    const runnerError = await page.evaluate(
      () => (window as any).__STORIES_RUNNER_ERROR__
    );
    if (runnerError)
      throw new Error(`Stories runner failed to initialize: ${runnerError}`);

    const allStories = (await page.evaluate(() =>
      window.__listStories__()
    )) as StoryInfo[];

    const stories = filter
      ? allStories.filter((s) => {
          const hay = `${s.title}/${s.name}`.toLowerCase();
          return hay.includes(filter) || s.id.includes(filter);
        })
      : allStories;

    console.log(
      `Sweeping ${stories.length} stories${filter ? ` matching "${filter}"` : ""} with GOFISH_SOLVER_CHECK=1\n`
    );

    for (const story of stories) {
      const path = `${story.title}/${story.name}`;
      process.stdout.write(`  ${path} ... `);
      buffer = [];

      try {
        const success = await page.evaluate(
          async (id) => window.__renderStory__(id),
          story.id
        );
        if (!success) {
          const err = await page.evaluate(() => window.__STORY_RENDER_ERROR__);
          console.log(`FAILED: ${err}`);
          renderFailures.push({ path, error: String(err) });
          continue;
        }
        await page.waitForFunction(
          () => window.__STORY_RENDER_DONE__ === true,
          {
            timeout: 15_000,
          }
        );
        total++;

        // Drain any console messages still queued after the render settles.
        await page.waitForTimeout(0);

        if (buffer.length > 0) {
          const lines = [...buffer];
          reports.push({ path, lines });
          console.log(`DIVERGED (${lines.length})`);
        } else {
          console.log("clean");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`FAILED: ${msg}`);
        renderFailures.push({ path, error: msg });
      }
    }

    await context.close();
  } finally {
    await browser?.close();
    viteProc.kill();
  }

  // Report.
  console.log(`\n=== Solver-shadow sweep result ===\n`);
  console.log(`  Stories rendered: ${total}`);
  console.log(`  Stories with divergences: ${reports.length}`);

  if (reports.length > 0) {
    console.log(`\n  Divergences:`);
    for (const r of reports) {
      console.log(`    ${r.path}`);
      for (const line of r.lines) console.log(`      ${line}`);
    }
  }

  if (renderFailures.length > 0) {
    console.log(`\n  ${renderFailures.length} render failure(s):`);
    for (const f of renderFailures) console.log(`    ! ${f.path}: ${f.error}`);
  }

  if (reports.length === 0) {
    console.log(
      `\n  Clean: every rendered story reproduced the rank-1 result.`
    );
  }

  // Non-zero when any story diverged so this can gate the 5a landing.
  process.exit(reports.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
