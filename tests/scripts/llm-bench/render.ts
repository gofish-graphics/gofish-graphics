/**
 * Renders one program for one arm and reads it back as a RenderRecord.
 *
 * One Vite server (tests/harness/llm-bench) and one Chromium are shared by a
 * whole run; every render gets a fresh browser context, so no state leaks
 * between programs. JS arms load the program as an ES module through Vite;
 * the script arms (matplotlib and altair in Python with uv, ggplot2 in R)
 * run the script in its own process and load the SVG it saved into the same
 * page, so every arm goes through the same extractor.
 *
 * Every render also enforces the arm contract (contract.ts): the program
 * must import its arm's library, and the picture must have been produced by
 * it. A violation is a failed render with `errorKind: "contract"`, but the
 * picture is still read back (`record`), so a correct picture drawn some
 * other way can be told apart from a wrong one.
 */

import { chromium, type Browser, type ConsoleMessage } from "playwright";
import { spawn, type ChildProcess } from "child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { basename, dirname, join } from "path";
import { homedir } from "os";
import { transform } from "esbuild";
import { startViteServer } from "../capture-core";
import { scriptViolation, staticViolation } from "./contract";
import {
  extensionPackages,
  unavailablePackage,
  type Extensions,
} from "./extensions";
import type { RenderRecord } from "./record";
import {
  BENCH_DIR,
  isScriptArm,
  type Arm,
  type ScriptArm,
  type Size,
} from "./tasks";

const HARNESS_DIR = join(import.meta.dirname, "../../harness/llm-bench");
const REPO_ROOT = join(import.meta.dirname, "../../..");
export const HARNESS_PORT = Number(process.env.LLM_BENCH_PORT ?? 3005);

/** Virtual time handed to every render after its render call returns, so
 *  timers, transitions and animation frames settle the same way each time. */
const SETTLE_VIRTUAL_MS = 2000;
/** Real-time limit on one render call (module load + render). */
const RENDER_TIMEOUT_MS = 20_000;
/** Real-time limit on one script (Python or R). */
const SCRIPT_TIMEOUT_MS = 60_000;

export const MATPLOTLIB_VERSION = "3.10.9";
export const PANDAS_VERSION = "2.3.3";
export const ALTAIR_VERSION = "5.5.0";
export const VL_CONVERT_VERSION = "1.9.0.post1";

function uvPath(): string {
  const local = join(homedir(), ".local/bin/uv");
  return existsSync(local) ? local : "uv";
}

function rscriptPath(): string {
  for (const p of ["/usr/local/bin/Rscript", "/opt/homebrew/bin/Rscript"])
    if (existsSync(p)) return p;
  return "Rscript";
}

/**
 * How a script arm runs: `cmd` with `args`, then the script's file name (or
 * `probe`, to prewarm). The script gets `DATA_PATH`, `OUT_PATH` and
 * `ASSET_DIR` in its environment, plus `env`.
 */
interface ScriptRuntime {
  cmd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  /** Loads the arm's packages once, so the first timed render does not pay
   *  for installing them. */
  probe: [string, string];
}

/** Python through uv, with each package pinned (`pin`) and imported by the
 *  probe (`name`). */
function uvPython(
  pkgs: { name: string; pin: string }[],
  env: NodeJS.ProcessEnv
): ScriptRuntime {
  return {
    cmd: uvPath(),
    args: [
      "run",
      "--no-project",
      ...pkgs.flatMap((p) => ["--with", p.pin]),
      "python",
    ],
    env,
    probe: ["-c", `import ${pkgs.map((p) => p.name).join(", ")}`],
  };
}

/** Each script arm's runtime, with its extension packages (extensions.ts)
 *  when they are on. Without them, the Python arms do not have them
 *  installed, so importing one fails like any missing module. The R
 *  packages are installed system-wide, so with extensions off the ggplot2
 *  arm is held to its core packages by a static check instead
 *  (`unavailablePackage`). */
function scriptRuntime(arm: ScriptArm, extensions: Extensions): ScriptRuntime {
  const ext = extensionPackages(arm, extensions);
  const pandas = { name: "pandas", pin: `pandas==${PANDAS_VERSION}` };
  const pyExt = ext.map((p) => ({ name: p.name, pin: p.pin! }));
  switch (arm) {
    case "matplotlib":
      return uvPython(
        [
          { name: "matplotlib", pin: `matplotlib==${MATPLOTLIB_VERSION}` },
          pandas,
          ...pyExt,
        ],
        {
          MPLBACKEND: "Agg",
          // Keep text as <text> (not glyph outlines) so labels are readable
          // by the extractor, and make ids deterministic.
          MATPLOTLIBRC: join(HARNESS_DIR, "matplotlibrc"),
        }
      );
    case "altair":
      return uvPython(
        [
          { name: "altair", pin: `altair==${ALTAIR_VERSION}` },
          {
            name: "vl_convert",
            pin: `vl-convert-python==${VL_CONVERT_VERSION}`,
          },
          pandas,
          ...pyExt,
        ],
        {}
      );
    case "ggplot2": {
      const pkgs = [
        "ggplot2",
        "scales",
        "svglite",
        "jsonlite",
        "dplyr",
        "tidyr",
        "png",
        ...ext.map((p) => p.name),
      ];
      return {
        // --vanilla: no user or site profile, so every run starts the same.
        // The packages are installed once by hand (see the README).
        cmd: rscriptPath(),
        args: ["--vanilla"],
        env: {},
        probe: [
          "-e",
          `for (p in c(${pkgs.map((p) => `'${p}'`).join(", ")})) library(p, character.only = TRUE)`,
        ],
      };
    }
  }
}

export interface RenderOutcome {
  ok: boolean;
  /** Why the program did not produce a usable picture. Sent back to the
   *  model on a repair turn. */
  error?: string;
  /** What kind of failure `error` is: "contract" when the program ran but
   *  the picture was not produced by the arm's library (contract.ts),
   *  "render" for everything else. */
  errorKind?: "render" | "contract";
  /** Wall time of the render itself: the program's module load + render call
   *  in the page for JS arms, the whole script process for script arms. */
  renderMs: number;
  /** The picture, read back. Present when `ok`, and also on a contract
   *  failure: the program drew a picture, just not with the library. */
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
    private browser: Browser,
    /** Whether the script arms get their extension packages (see
     *  extensions.ts); the same for every render of a run. */
    readonly extensions: Extensions
  ) {}

  static async start(opts: {
    arms: Arm[];
    extensions: Extensions;
  }): Promise<Renderer> {
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
    const renderer = new Renderer(vite, browser, opts.extensions);
    // Transform + pre-bundle every library once so the first timed render
    // does not pay for it, and install each script arm's pinned packages
    // (into uv's cache) or check they load (R).
    const page = await browser.newPage();
    await page.goto(`http://localhost:${HARNESS_PORT}/index.html`);
    await page.waitForFunction(() => !!(window as any).llmBench);
    await page.evaluate(() => (window as any).llmBench.prewarm());
    await page.close();
    for (const arm of new Set(opts.arms.filter(isScriptArm))) {
      const rt = scriptRuntime(arm, opts.extensions);
      const r = await run(rt.cmd, [...rt.args, ...rt.probe], {
        timeoutMs: 300_000,
      });
      if (r.code !== 0)
        throw new Error(
          `The ${arm} arm's runtime could not load its packages:\n${r.stderr}`
        );
    }
    return renderer;
  }

  async close(): Promise<void> {
    // browser.close() can hang (seen after a long run); don't let it keep
    // the process alive.
    await Promise.race([
      this.browser.close().catch(() => {}),
      new Promise((r) => setTimeout(r, 10_000).unref()),
    ]);
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
    // A contract violation does not stop the render: the picture is still
    // read, so it can be scored as a correct picture not drawn with the
    // library (a "partial" outcome, see report.ts).
    let violation = staticViolation(arm, code);
    /** A failure before the page (no picture). A static violation is added
     *  so the model hears about both. */
    const failed = (error: string, ms: number): RenderOutcome => ({
      ok: false,
      error: violation ? `${error}\n\n${violation}` : error,
      renderMs: ms,
    });
    if (isScriptArm(arm)) {
      // An extension package used while extensions are off: the error a
      // missing package gives (see extensions.ts), before the script runs.
      const missing = unavailablePackage(arm, code, this.extensions);
      if (missing) return { ...failed(missing, 0), errorKind: "render" };
      const outSvg = `${base}.out.svg`;
      rmSync(outSvg, { force: true });
      const rt = scriptRuntime(arm, this.extensions);
      const t0 = performance.now();
      const r = await run(rt.cmd, [...rt.args, basename(codePath)], {
        cwd: dirname(codePath),
        env: {
          ...rt.env,
          DATA_PATH: dataPath,
          OUT_PATH: outSvg,
          // Task assets (images). JS programs load the same files from the
          // URL /assets/<file> (the harness's Vite config serves them).
          ASSET_DIR: join(BENCH_DIR, "assets"),
        },
        timeoutMs: SCRIPT_TIMEOUT_MS,
      });
      renderMs = performance.now() - t0;
      if (r.timedOut)
        return failed(
          `The script did not finish within ${SCRIPT_TIMEOUT_MS / 1000}s.`,
          renderMs
        );
      if (r.code !== 0)
        return failed(
          `The script exited with code ${r.code}:\n${tail(r.stderr)}`,
          renderMs
        );
      if (!existsSync(outSvg))
        return failed(
          "The script finished but did not save an SVG to OUT_PATH.",
          renderMs
        );
      svgText = readFileSync(outSvg, "utf8");
      violation ??= scriptViolation(arm, svgText);
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
        return failed(`Syntax error:\n${(e as Error).message}`, 0);
      }
    }

    // 2. Show it in the page. A failure of the harness itself (the page
    // reloading under a Vite re-optimization, a crashed context) is not the
    // program's fault, so it gets up to three retries.
    const show = () =>
      this.show(arm, { moduleUrl, svgText, renderMs }, data, size, {
        svgPath,
        pngPath,
        recordPath,
      });
    let out = await show();
    for (let i = 0; i < 3 && out.harnessError; i++) out = await show();
    if (out.error && out.errorKind !== "contract") {
      // No picture: the render error is what the model needs to fix first.
      const clean = failed(cleanError(out.error, codePath), out.renderMs);
      return { ...out, ...clean, errorKind: "render" };
    }
    if (violation) {
      // The static rule's message wins over the provenance one: it is the
      // more basic problem.
      Object.assign(out, {
        ok: false,
        error: violation,
        errorKind: "contract",
      });
    }
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
    // A program can take the whole browser down (e.g. an unbounded loop that
    // exhausts memory). Relaunch it and report a harness error, so the render
    // is retried instead of the run aborting.
    if (!this.browser.isConnected()) this.browser = await chromium.launch();
    let context;
    try {
      // Render in a fresh context on a controllable clock.
      context = await this.browser.newContext({
        viewport: { width: size.w + 400, height: size.h + 400 },
        deviceScaleFactor: 1,
      });
    } catch (e) {
      this.browser = await chromium.launch();
      return {
        ok: false,
        error: `Harness error: ${(e as Error).message}`,
        renderMs,
        harnessError: true,
      };
    }
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
      if (!isScriptArm(arm)) {
        const lib =
          arm === "gofish" ? "gofish" : arm === "d3" ? "d3" : "recharts";
        await page.evaluate((l) => (window as any).llmBench.prewarm(l), lib);
      }
      if (arm === "gofish")
        await page.evaluate(() => (window as any).llmBench.trackCreation());
      const t0 = performance.now();
      const call = isScriptArm(arm)
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
      if (!isScriptArm(arm)) renderMs = performance.now() - t0;
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
      // Some libraries (React) finish committing on real browser tasks that
      // the fake clock does not drive, so give a missing picture a few real
      // moments to appear before calling it a failure. Same for every arm.
      let problem: string | null = null;
      for (let i = 0; i < 10; i++) {
        problem = await page.evaluate(() => (window as any).llmBench.problem());
        if (!problem || problem.startsWith("The output contains")) break;
        await new Promise((r) => setTimeout(r, 100));
        await page.clock.runFor(100).catch(() => {});
      }
      // Images load over the network, which the fake clock does not drive:
      // wait for them (bounded), then let a frame paint them.
      // Before the error check, so a failed load (a 404) is reported.
      let imageTimer: NodeJS.Timeout | undefined;
      await Promise.race([
        page.evaluate(() => (window as any).llmBench.imagesReady()),
        new Promise((r) => (imageTimer = setTimeout(r, 5000))),
      ]);
      clearTimeout(imageTimer);
      await page.clock.runFor(100).catch(() => {});
      if (errors.length > 0)
        return { ok: false, error: errors.slice(0, 5).join("\n"), renderMs };
      // An empty container is occasionally a harness timing flake (seen with
      // React), so it is retried like other harness errors. A program that
      // really draws nothing fails the same way on every retry, and the error
      // then reaches the model unchanged.
      if (problem)
        return {
          ok: false,
          error: problem,
          renderMs,
          harnessError: !problem.startsWith("The output contains"),
        };

      if (loads > 1)
        throw new Error("the harness page reloaded during the render");
      await page.locator("#root").screenshot({ path: pngPath });
      writeFileSync(
        svgPath,
        await page.evaluate(() => (window as any).llmBench.svgMarkup())
      );
      // The arm contract, checked on the picture as shown and before
      // extract() rewrites <use>s. The picture is read either way.
      const foreign: string | null =
        arm === "gofish" || arm === "recharts"
          ? await page.evaluate(
              (l) => (window as any).llmBench.provenance(l),
              arm
            )
          : null;
      const record: RenderRecord = await page.evaluate(() =>
        (window as any).llmBench.extract()
      );
      record.screenshot = pngPath;
      writeFileSync(recordPath, JSON.stringify(record, null, 1));
      const done = { renderMs, record, svgPath, pngPath, recordPath };
      return foreign
        ? { ok: false, error: foreign, errorKind: "contract", ...done }
        : { ok: true, ...done };
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
