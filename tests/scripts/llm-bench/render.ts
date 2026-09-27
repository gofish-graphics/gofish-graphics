/**
 * Renders one program for one arm and reads it back as a RenderRecord.
 *
 * One Vite server (tests/harness/llm-bench) and one Chromium are shared by a
 * whole run; every render gets a fresh browser context, so no state leaks
 * between programs. JS arms load the program as an ES module through Vite;
 * the matplotlib arm runs the script with uv and loads the SVG it saved into
 * the same page, so every arm goes through the same extractor.
 */

import { chromium, type Browser, type ConsoleMessage } from "playwright";
import { spawn, type ChildProcess } from "child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { basename, dirname, join } from "path";
import { homedir } from "os";
import { transform } from "esbuild";
import { startViteServer } from "../capture-core";
import type { RenderRecord } from "./record";
import type { Arm, Size } from "./tasks";

const HARNESS_DIR = join(import.meta.dirname, "../../harness/llm-bench");
const REPO_ROOT = join(import.meta.dirname, "../../..");
export const HARNESS_PORT = Number(process.env.LLM_BENCH_PORT ?? 3005);

/** Virtual time handed to every render after its render call returns, so
 *  timers, transitions and animation frames settle the same way each time. */
const SETTLE_VIRTUAL_MS = 2000;
/** Real-time limit on one render call (module load + render). */
const RENDER_TIMEOUT_MS = 20_000;
/** Real-time limit on one matplotlib script. */
const PYTHON_TIMEOUT_MS = 60_000;

export const MATPLOTLIB_VERSION = "3.10.9";
export const PANDAS_VERSION = "2.3.3";

function uvPath(): string {
  const local = join(homedir(), ".local/bin/uv");
  return existsSync(local) ? local : "uv";
}

const UV_ARGS = [
  "run",
  "--no-project",
  "--with",
  `matplotlib==${MATPLOTLIB_VERSION}`,
  "--with",
  `pandas==${PANDAS_VERSION}`,
  "python",
];

export interface RenderOutcome {
  ok: boolean;
  /** Why the program did not produce a usable picture. Sent back to the
   *  model on a repair turn. */
  error?: string;
  /** Wall time of the render itself: the program's module load + render call
   *  in the page for JS arms, the python process for matplotlib. */
  renderMs: number;
  record?: RenderRecord;
  svgPath?: string;
  pngPath?: string;
  recordPath?: string;
}

function run(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; cwd?: string; timeoutMs: number }
): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

const tail = (s: string, n = 3000) => (s.length > n ? "..." + s.slice(-n) : s);

/** Make an error readable for the model: program paths relative to its own
 *  file, no cache-busting queries, no harness stack frames, bounded length. */
function cleanError(error: string, codePath: string): string {
  const origin = `http://localhost:${HARNESS_PORT}`;
  const lines = error
    .split(origin + "/@fs" + dirname(codePath) + "/")
    .join("")
    .split(origin + "/@fs" + REPO_ROOT + "/")
    .join("")
    .split(origin + "/")
    .join("")
    .replace(/\?(import&)?t=\d+/g, "")
    .split("\n")
    .filter(
      (l) =>
        !/main\.ts|eval at evaluate|<anonymous>|ClockController|\.vite-llm-bench/.test(
          l
        )
    );
  // Keep both ends: a JS error leads with the message, a Python traceback
  // ends with it.
  if (lines.length <= 30) return lines.join("\n");
  return [
    ...lines.slice(0, 10),
    `    ... (${lines.length - 30} lines omitted)`,
    ...lines.slice(-20),
  ].join("\n");
}

export class Renderer {
  private constructor(
    private vite: ChildProcess,
    private browser: Browser
  ) {}

  static async start(opts: { python: boolean }): Promise<Renderer> {
    const vite = startViteServer(HARNESS_DIR, HARNESS_PORT);
    let viteLog = "";
    vite.stdout?.on("data", (d) => (viteLog += d));
    vite.stderr?.on("data", (d) => (viteLog += d));
    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        const resp = await fetch(`http://localhost:${HARNESS_PORT}/index.html`);
        if (resp.ok) break;
      } catch {
        // not up yet
      }
      if (Date.now() > deadline || vite.exitCode !== null) {
        vite.kill();
        throw new Error(
          `Vite harness did not start on port ${HARNESS_PORT}:\n${viteLog}`
        );
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    const browser = await chromium.launch();
    const renderer = new Renderer(vite, browser);
    // Transform + pre-bundle every library once so the first timed render
    // does not pay for it, and install the pinned matplotlib into uv's cache.
    const page = await browser.newPage();
    await page.goto(`http://localhost:${HARNESS_PORT}/index.html`);
    await page.waitForFunction(() => !!(window as any).llmBench);
    await page.evaluate(() => (window as any).llmBench.prewarm());
    await page.close();
    if (opts.python) {
      const r = await run(
        uvPath(),
        [...UV_ARGS, "-c", "import matplotlib, pandas"],
        {
          timeoutMs: 300_000,
        }
      );
      if (r.code !== 0)
        throw new Error(`uv could not install matplotlib:\n${r.stderr}`);
    }
    return renderer;
  }

  async close(): Promise<void> {
    await this.browser.close();
    this.vite.kill();
  }

  /**
   * Render the program at `codePath` (already written) for `arm`. Writes
   * `<base>.svg`, `<base>.png` and `<base>.record.json` next to it, where
   * `<base>` is `codePath` without its extension.
   */
  async render(
    arm: Arm,
    codePath: string,
    data: unknown[],
    dataPath: string,
    size: Size
  ): Promise<RenderOutcome> {
    const base = codePath.replace(/\.[^.]+$/, "");
    const svgPath = `${base}.svg`;
    const pngPath = `${base}.png`;
    const recordPath = `${base}.record.json`;
    for (const p of [svgPath, pngPath, recordPath]) rmSync(p, { force: true });

    // 1. Produce something the page can load.
    let moduleUrl: string | null = null;
    let svgText: string | null = null;
    let renderMs = 0;
    const code = readFileSync(codePath, "utf8");
    if (arm === "matplotlib") {
      const outSvg = `${base}.mpl.svg`;
      rmSync(outSvg, { force: true });
      const t0 = performance.now();
      const r = await run(uvPath(), [...UV_ARGS, basename(codePath)], {
        cwd: dirname(codePath),
        env: {
          DATA_PATH: dataPath,
          OUT_PATH: outSvg,
          MPLBACKEND: "Agg",
          // Keep text as <text> (not glyph outlines) so labels are readable
          // by the extractor, and make ids deterministic.
          MATPLOTLIBRC: join(HARNESS_DIR, "matplotlibrc"),
        },
        timeoutMs: PYTHON_TIMEOUT_MS,
      });
      renderMs = performance.now() - t0;
      if (r.timedOut)
        return {
          ok: false,
          error: `The script did not finish within ${PYTHON_TIMEOUT_MS / 1000}s.`,
          renderMs,
        };
      if (r.code !== 0)
        return {
          ok: false,
          error: `The script exited with code ${r.code}:\n${tail(r.stderr)}`,
          renderMs,
        };
      if (!existsSync(outSvg))
        return {
          ok: false,
          error: "The script finished but did not save an SVG to OUT_PATH.",
          renderMs,
        };
      svgText = readFileSync(outSvg, "utf8");
    } else {
      // Syntax errors surface here with a precise location; through Vite
      // they would only say "failed to fetch module".
      try {
        const out = await transform(code, {
          loader: arm === "recharts" ? "jsx" : "js",
          format: "esm",
          jsx: "automatic",
          jsxImportSource: "react",
          sourcefile: codePath.split("/").pop(),
        });
        let servedPath = codePath;
        if (arm === "recharts") {
          servedPath = `${base}.compiled.js`;
          writeFileSync(servedPath, out.code);
        }
        moduleUrl = `/@fs${servedPath}?t=${Date.now()}`;
      } catch (e) {
        return {
          ok: false,
          error: `Syntax error:\n${(e as Error).message}`,
          renderMs: 0,
        };
      }
    }

    // 2. Show it in the page. A failure of the harness itself (the page
    // reloading under a Vite re-optimization, a crashed context) is not the
    // program's fault, so it gets one retry.
    const show = () =>
      this.show(arm, { moduleUrl, svgText, renderMs }, data, size, {
        svgPath,
        pngPath,
        recordPath,
      });
    const first = await show();
    const out = first.harnessError ? await show() : first;
    if (out.error) out.error = cleanError(out.error, codePath);
    return out;
  }

  private async show(
    arm: Arm,
    input: {
      moduleUrl: string | null;
      svgText: string | null;
      renderMs: number;
    },
    data: unknown[],
    size: Size,
    out: { svgPath: string; pngPath: string; recordPath: string }
  ): Promise<RenderOutcome & { harnessError?: boolean }> {
    const { moduleUrl, svgText } = input;
    const { svgPath, pngPath, recordPath } = out;
    let renderMs = input.renderMs;
    // Render in a fresh context on a controllable clock.
    const context = await this.browser.newContext({
      viewport: { width: size.w + 400, height: size.h + 400 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) =>
      errors.push(`Uncaught ${e.name}: ${e.message}`)
    );
    let loads = 0;
    page.on("load", () => loads++);
    page.on("console", (m: ConsoleMessage) => {
      if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
    });
    try {
      await page.clock.install();
      await page.goto(`http://localhost:${HARNESS_PORT}/index.html`);
      await page.waitForFunction(() => !!(window as any).llmBench);
      if (arm !== "matplotlib") {
        const lib =
          arm === "gofish" ? "gofish" : arm === "d3" ? "d3" : "recharts";
        await page.evaluate((l) => (window as any).llmBench.prewarm(l), lib);
      }
      const t0 = performance.now();
      const call =
        arm === "matplotlib"
          ? page.evaluate((s) => {
              try {
                (window as any).llmBench.renderSvg(s);
                return null;
              } catch (e) {
                return (window as any).llmBench.describe(e);
              }
            }, svgText!)
          : page.evaluate(
              async ({ url, data, react }) => {
                try {
                  if (react)
                    await (window as any).llmBench.renderReact(url, data);
                  else await (window as any).llmBench.renderModule(url, data);
                  return null;
                } catch (e) {
                  return (window as any).llmBench.describe(e);
                }
              },
              { url: moduleUrl!, data, react: arm === "recharts" }
            );
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<string>((resolve) => {
        timer = setTimeout(
          () =>
            resolve(
              `The render did not finish within ${RENDER_TIMEOUT_MS / 1000}s.`
            ),
          RENDER_TIMEOUT_MS
        );
      });
      const thrown = await Promise.race([call, timeout]);
      clearTimeout(timer);
      if (arm !== "matplotlib") renderMs = performance.now() - t0;
      if (thrown) return { ok: false, error: thrown, renderMs };

      try {
        await page.clock.runFor(SETTLE_VIRTUAL_MS);
      } catch (e) {
        // A timer the program scheduled threw while the clock ran.
        const msg = (e as Error).message.replace(/^clock\.runFor: /, "");
        return {
          ok: false,
          error: `Uncaught error after render returned: ${msg}`,
          renderMs,
        };
      }
      const problem = await page.evaluate(() =>
        (window as any).llmBench.problem()
      );
      if (errors.length > 0)
        return { ok: false, error: errors.slice(0, 5).join("\n"), renderMs };
      if (problem) return { ok: false, error: problem, renderMs };

      if (loads > 1)
        throw new Error("the harness page reloaded during the render");
      await page.locator("#root").screenshot({ path: pngPath });
      writeFileSync(
        svgPath,
        await page.evaluate(() => (window as any).llmBench.svgMarkup())
      );
      const record = await page.evaluate(() =>
        (window as any).llmBench.extract()
      );
      writeFileSync(recordPath, JSON.stringify(record, null, 1));
      return { ok: true, renderMs, record, svgPath, pngPath, recordPath };
    } catch (e) {
      return {
        ok: false,
        error: `Harness error: ${(e as Error).message}`,
        renderMs,
        harnessError: true,
      };
    } finally {
      await context.close();
    }
  }
}
