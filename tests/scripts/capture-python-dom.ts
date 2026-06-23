/**
 * Capture DOM snapshots from Python story files.
 *
 * 1. Start the Python derive server
 * 2. Start the Vite harness server
 * 3. Discover Python story files (story_* functions)
 * 4. For each story: extract IR, inject into harness, capture DOM + screenshot
 * 5. Normalize DOM, write to tmp/python/<path>.html and tmp/python/<path>.png
 */

import { chromium, type Browser, type Page } from "playwright";
import { spawn, type ChildProcess } from "child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
} from "fs";
import { join, dirname, relative } from "path";
import { normalizeDom } from "./normalize-dom.js";
import { mapJsToPython } from "./path-mapping.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dirname, "../..");
const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const PYTHON_STORIES_DIR = join(TESTS_DIR, "python-stories");
const TMP_DIR = join(TESTS_DIR, "tmp/python");
const DERIVE_SERVER_PORT = 3002;
const HARNESS_PORT = 3001;

// ---------------------------------------------------------------------------
// Discover Python story files
// ---------------------------------------------------------------------------

interface PythonStory {
  module: string; // e.g. "python_stories.forwardsyntax.test_bar_basic"
  function: string; // e.g. "story_default"
  path: string; // output path e.g. "forwardsyntax/bar-basic--default"
  file: string; // e.g. "python-stories/forwardsyntax/test_bar_basic.py"
}

function discoverPythonStories(): PythonStory[] {
  const stories: PythonStory[] = [];

  function scan(dir: string, prefix: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith("__")) {
        scan(
          join(dir, entry.name),
          prefix ? `${prefix}/${entry.name}` : entry.name
        );
      } else if (entry.name.startsWith("test_") && entry.name.endsWith(".py")) {
        const filePath = join(dir, entry.name);
        const content = readFileSync(filePath, "utf-8");

        // Find all story_* function definitions
        const funcRegex = /^def\s+(story_\w+)\s*\(/gm;
        let m: RegExpExecArray | null;
        while ((m = funcRegex.exec(content)) !== null) {
          const funcName = m[1];
          // test_bar_basic.py / story_default → forwardsyntax/bar-basic--default
          const baseName = entry.name
            .replace(/^test_/, "")
            .replace(/\.py$/, "")
            .replace(/_/g, "-");
          // Python identifiers can't contain `-`; convention is plain
          // snake_case → kebab-case. JS storybook authors should avoid
          // literal underscores in export names (use CamelCase only).
          const storyName = funcName.replace(/^story_/, "").replace(/_/g, "-");
          const outPath = prefix
            ? `${prefix}/${baseName}--${storyName}`
            : `${baseName}--${storyName}`;

          const modulePath = relative(TESTS_DIR, filePath)
            .replace(/\.py$/, "")
            .replace(/\//g, ".")
            .replace(/-/g, "_");

          stories.push({
            module: modulePath,
            function: funcName,
            path: outPath,
            file: relative(TESTS_DIR, filePath),
          });
        }
      }
    }
  }

  scan(PYTHON_STORIES_DIR, "");
  return stories;
}

/**
 * Python files (relative to TESTS_DIR) whose JS source story is **file-level
 * exempt** in `.python-sync-exempt`. A Python port may still exist and be
 * committed (e.g. the ViolinPlot scipy port, whose KDE intentionally diverges
 * from the JS `fast-kde` baseline), but an exempt story is excluded from the
 * byte-parity gate — so we skip capturing it rather than emit a snapshot that
 * `compare-python` would (correctly) flag as a mismatch.
 */
function loadExemptPythonFiles(): Set<string> {
  const exemptFile = join(TESTS_DIR, ".python-sync-exempt");
  const exempt = new Set<string>();
  if (!existsSync(exemptFile)) return exempt;
  for (const raw of readFileSync(exemptFile, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    // Per-export exemptions (`file.tsx::Export`) don't exempt the whole file.
    if (line.includes("::")) continue;
    // mapJsToPython returns a path under `tests/`; story.file is relative to
    // TESTS_DIR, so strip the leading `tests/` segment to match.
    exempt.add(mapJsToPython(line).replace(/^tests\//, ""));
  }
  return exempt;
}

// ---------------------------------------------------------------------------
// Extract IR from Python story (by calling Python)
// ---------------------------------------------------------------------------

type ChartIR = {
  operators: any[];
  mark: any;
  options: any;
  data: any;
  zOrder?: number | null;
  connect?: any;
  // Set when a chart is layered via `Layer([chart.name(...), ...])` so a
  // `.constrain(...)` callback can reference it by name.
  name?: string | any | null;
};

type IRResult =
  | ({
      kind: "chart";
      deriveIds: string[];
    } & ChartIR)
  | {
      kind: "layer";
      charts: ChartIR[];
      options: any;
      deriveIds: string[];
      constraints?: any[];
      builder?: boolean;
    }
  | {
      kind: "raw-mark";
      mark: any;
      options: any;
      deriveIds: string[];
    }
  | { kind: "layer-unsupported"; reason: string }
  | { kind: "error"; reason: string };

/**
 * Load a story via the derive-server's `/load` endpoint. The server imports
 * the story, builds the IR, *and* registers any `DeriveOperator`s in its
 * registry — all in one call so the lambda_ids in the returned IR match
 * what `/derive/<id>` will look up. Doing import + register separately
 * would mint divergent UUIDs because `derive(lambda)` generates a fresh
 * UUID per call.
 */
async function loadStory(story: PythonStory): Promise<IRResult> {
  const storyAbsPath = join(TESTS_DIR, story.file);
  let resp: Response;
  try {
    resp = await fetch(`http://localhost:${DERIVE_SERVER_PORT}/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storyFile: storyAbsPath,
        function: story.function,
        pythonStoriesDir: PYTHON_STORIES_DIR,
      }),
    });
  } catch (err) {
    return {
      kind: "error",
      reason: `derive-server unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!resp.ok) {
    let body = "";
    try {
      body = await resp.text();
    } catch {
      /* ignore */
    }
    return { kind: "error", reason: `${resp.status} ${body}` };
  }
  const json = (await resp.json()) as any;
  if (json && json._kind === "layer") {
    return {
      kind: "layer",
      charts: json.charts,
      options: json.options ?? {},
      deriveIds: json.deriveIds ?? [],
      constraints: json.constraints,
      builder: json.builder,
    };
  }
  if (json && json._kind === "raw-mark") {
    return {
      kind: "raw-mark",
      mark: json.mark,
      options: json.options ?? {},
      deriveIds: json.deriveIds ?? [],
    };
  }
  if (json && json._kind === "layer-unsupported") {
    return {
      kind: "layer-unsupported",
      reason: "LayerBuilder stories not yet supported by capture harness",
    };
  }
  return { kind: "chart", ...json };
}

// ---------------------------------------------------------------------------
// Start derive server
// ---------------------------------------------------------------------------

function startDeriveServer(): ChildProcess {
  const proc = spawn(
    "python3",
    [join(TESTS_DIR, "scripts/derive-server.py"), String(DERIVE_SERVER_PORT)],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
  );

  proc.stdout?.on("data", (d) => {
    if (process.env.DEBUG) process.stdout.write(d);
  });
  proc.stderr?.on("data", (d) => {
    if (process.env.DEBUG) process.stderr.write(d);
  });

  return proc;
}

async function waitForServer(url: string, timeoutMs = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `Server at ${url} did not become ready within ${timeoutMs}ms`
  );
}

// (Derive registration is now handled by the derive-server's /load
// endpoint — see loadStory above. The previous `registerDerives` was a
// no-op stub: it imported the story but never wrote to _registry.)

// ---------------------------------------------------------------------------
// Start Vite harness server
// ---------------------------------------------------------------------------

function startHarnessServer(): ChildProcess {
  const proc = spawn(
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

  proc.stdout?.on("data", (d) => {
    if (process.env.DEBUG) process.stdout.write(d);
  });
  proc.stderr?.on("data", (d) => {
    if (process.env.DEBUG) process.stderr.write(d);
  });

  return proc;
}

// ---------------------------------------------------------------------------
// Capture single Python story
// ---------------------------------------------------------------------------

async function captureStory(
  page: Page,
  harnessUrl: string,
  story: PythonStory,
  ir: IRResult & { kind: "chart" | "layer" | "raw-mark" }
): Promise<{ dom: string; screenshot: Buffer }> {
  await page.goto(harnessUrl, { waitUntil: "networkidle" });

  const deriveServerUrl =
    ir.deriveIds && ir.deriveIds.length > 0
      ? `http://localhost:${DERIVE_SERVER_PORT}`
      : undefined;

  // Inject spec and trigger render. The harness dispatches on `spec.type`:
  // `"layer"` for a multi-chart layer, `"raw-mark"` for a bare Mark
  // rendered without a Chart wrapper, undefined for the single-chart path.
  let spec: any;
  if (ir.kind === "layer") {
    spec = {
      type: "layer",
      charts: ir.charts,
      options: ir.options,
      constraints: ir.constraints,
      builder: ir.builder,
      deriveServerUrl,
    };
  } else if (ir.kind === "raw-mark") {
    spec = {
      type: "raw-mark",
      mark: ir.mark,
      options: ir.options,
      deriveServerUrl,
    };
  } else {
    spec = {
      data: ir.data,
      operators: ir.operators,
      mark: ir.mark,
      options: ir.options,
      connect: ir.connect ?? null,
      deriveServerUrl,
    };
  }

  await page.evaluate((s) => {
    window.__GOFISH_RENDER_COMPLETE__ = false;
    window.__GOFISH_RENDER_ERROR__ = null;
    // Clear previous render
    const root = document.getElementById("gofish-harness-root");
    if (root) root.innerHTML = "";
    window.__renderChart__(s);
  }, spec);

  // Wait for render completion. Most charts resolve quickly; heavy unit-dot
  // treemaps can paint thousands of marks while the render promise is still
  // settling, so fall back to waiting for visible SVG output.
  try {
    await page.waitForFunction(
      () => window.__GOFISH_RENDER_COMPLETE__ === true,
      { timeout: 8_000 }
    );
  } catch {
    await page.waitForFunction(
      () => {
        const root = document.getElementById("gofish-harness-root");
        return (
          (root?.querySelectorAll("ellipse, circle, rect, path, line")
            ?.length ?? 0) > 0
        );
      },
      { timeout: 40_000 }
    );
  }

  // Check for errors
  const error = await page.evaluate(() => window.__GOFISH_RENDER_ERROR__);
  if (error) throw new Error(`Render error: ${error}`);

  // Extra settle time
  await page.waitForTimeout(300);

  // Extract DOM
  const dom = await page.evaluate(() => {
    const root = document.getElementById("gofish-harness-root");
    return root ? root.innerHTML : "";
  });

  // Screenshot. Tight timeout: the playwright default of 30s means each
  // zero-height story burns 30s waiting for the element to "be visible"
  // before failing. With many failures, the job runs for tens of minutes.
  // 5s is enough for a healthy chart to settle and render.
  const rootHandle = await page.$("#gofish-harness-root");
  let screenshot: Buffer;
  if (rootHandle) {
    screenshot = await rootHandle.screenshot({ type: "png", timeout: 5_000 });
  } else {
    screenshot = await page.screenshot({ type: "png", timeout: 5_000 });
  }

  return { dom, screenshot };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Capturing Python DOM snapshots ===\n");

  // Optional substring filter (like `capture-one` on the JS side):
  //   pnpm capture-python "marginal"
  // matches against the story id (e.g. seaborn/marginal-histogram--default).
  const filter = process.argv[2]?.toLowerCase();

  let stories = discoverPythonStories();
  if (filter) {
    stories = stories.filter((s) => s.path.toLowerCase().includes(filter));
    console.log(`Filter "${filter}" matched ${stories.length} story(ies)\n`);
  }
  if (stories.length === 0) {
    console.log("No Python stories found. Skipping.");
    return;
  }
  console.log(`Found ${stories.length} Python stories\n`);

  const exemptPythonFiles = loadExemptPythonFiles();

  // Start servers
  const deriveProc = startDeriveServer();
  const harnessProc = startHarnessServer();

  let browser: Browser | undefined;

  // Uncaught in-page errors for the story currently being captured; cleared
  // per story, checked after captureStory (see the pageerror listener).
  const pageErrors: string[] = [];

  // Hoisted to function scope so the outer `finally` (and the
  // `flushCaptureResults` helper it relies on) can persist whatever
  // we managed to collect even if the loop or browser setup throws.
  let captured = 0;
  let failed = 0;
  let skipped = 0;
  const failures: { story: string; reason: string }[] = [];
  const skips: { story: string; reason: string }[] = [];
  const capturedIds: string[] = [];
  const failedRecords: { id: string; story: string; reason: string }[] = [];
  const skippedRecords: { id: string; story: string; reason: string }[] = [];

  // Flush capture-results.json to disk. Called incrementally per story
  // and again in the outer `finally` so partial output survives a
  // mid-loop crash (otherwise the build script would see no capture
  // data and silently render coverage-only state).
  mkdirSync(TMP_DIR, { recursive: true });
  const flushCaptureResults = () => {
    try {
      writeFileSync(
        join(TMP_DIR, "capture-results.json"),
        JSON.stringify(
          {
            captured: capturedIds,
            failed: failedRecords,
            skipped: skippedRecords,
          },
          null,
          2
        )
      );
    } catch {
      /* ignore — best-effort */
    }
  };

  try {
    // Wait for servers to be ready
    await waitForServer(`http://localhost:${DERIVE_SERVER_PORT}/health`);
    console.log("Derive server ready");
    await waitForServer(`http://localhost:${HARNESS_PORT}`);
    console.log("Harness server ready\n");

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    // Surface in-page failures in the capture log AND fail the story — an
    // uncaught exception thrown from an async render microtask escapes the
    // harness's try/catch (so __GOFISH_RENDER_ERROR__ never gets set), and
    // the story would otherwise "capture OK" with a Loading/blank DOM.
    page.on("pageerror", (err) => {
      console.log(`    [pageerror] ${err.message}`);
      pageErrors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        console.log(`    [console.${msg.type()}] ${msg.text()}`);
      }
    });

    for (const story of stories) {
      process.stdout.write(
        `  ${story.module}::${story.function} → ${story.path} ... `
      );

      // Skip stories whose JS source is file-level parity-exempt — the port
      // is intentionally not byte-identical (e.g. ViolinPlot's scipy KDE).
      if (exemptPythonFiles.has(story.file)) {
        console.log("SKIP (JS story is parity-exempt)");
        skipped++;
        const reason = "JS story is parity-exempt (.python-sync-exempt)";
        skips.push({ story: `${story.module}::${story.function}`, reason });
        skippedRecords.push({
          id: story.path,
          story: `${story.module}::${story.function}`,
          reason,
        });
        flushCaptureResults();
        continue;
      }

      const ir = await loadStory(story);
      if (ir.kind === "layer-unsupported") {
        // Known limitation, not a real failure: surface visibly but
        // don't tank the build over Layer stories the harness can't
        // currently render.
        console.log(`SKIP (${ir.reason})`);
        skipped++;
        skips.push({
          story: `${story.module}::${story.function}`,
          reason: ir.reason,
        });
        skippedRecords.push({
          id: story.path,
          story: `${story.module}::${story.function}`,
          reason: ir.reason,
        });
        flushCaptureResults();
        continue;
      }
      if (ir.kind === "error") {
        console.log(`FAILED (IR extraction): ${ir.reason}`);
        failed++;
        failures.push({
          story: `${story.module}::${story.function}`,
          reason: `IR extraction failed: ${ir.reason}`,
        });
        failedRecords.push({
          id: story.path,
          story: `${story.module}::${story.function}`,
          reason: `IR extraction failed: ${ir.reason}`,
        });
        flushCaptureResults();
        continue;
      }

      try {
        pageErrors.length = 0;
        const { dom, screenshot } = await captureStory(
          page,
          `http://localhost:${HARNESS_PORT}`,
          story,
          ir
        );
        if (pageErrors.length > 0) {
          throw new Error(`uncaught page error: ${pageErrors.join(" | ")}`);
        }
        const normalized = normalizeDom(dom);

        const domPath = join(TMP_DIR, `${story.path}.html`);
        mkdirSync(dirname(domPath), { recursive: true });
        writeFileSync(domPath, normalized, "utf-8");

        const screenshotPath = join(TMP_DIR, `${story.path}.png`);
        writeFileSync(screenshotPath, screenshot);

        console.log("OK");
        captured++;
        capturedIds.push(story.path);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`FAILED: ${msg}`);
        failed++;
        failures.push({
          story: `${story.module}::${story.function}`,
          reason: msg,
        });
        failedRecords.push({
          id: story.path,
          story: `${story.module}::${story.function}`,
          reason: msg,
        });
      }
      flushCaptureResults();
    }

    console.log(
      `\nDone: ${captured} captured, ${failed} failed, ${skipped} skipped`
    );
    if (skipped > 0) {
      console.log(`\n${skipped} skipped (known limitations):`);
      for (const s of skips) console.log(`  - ${s.story}: ${s.reason}`);
    }

    // Persist capture counts to parity-summary.json. compare-python.ts
    // will read and merge into the same file so the CI status description
    // can render all categories. Written on every run (even when zero) so
    // the workflow reader always finds the file.
    const summaryPath = join(TESTS_DIR, "tmp/parity-summary.json");
    let prior: Record<string, unknown> = {};
    if (existsSync(summaryPath)) {
      try {
        prior = JSON.parse(readFileSync(summaryPath, "utf-8"));
      } catch {
        /* ignore — overwrite */
      }
    }
    writeFileSync(
      summaryPath,
      JSON.stringify(
        { ...prior, captured, captureFailed: failed, skipped },
        null,
        2
      )
    );

    await context.close();

    // Surface capture failures so CI doesn't silently pass when stories
    // can't even produce output. Without this, the compare step has
    // nothing to compare and trivially "passes". A capture failure here
    // means the Python story is broken (stale API, bad import, etc.) —
    // we want it red, not invisible.
    if (failed > 0) {
      console.error(`\n${failed} Python story capture failure(s):`);
      for (const f of failures) {
        console.error(`  - ${f.story}: ${f.reason}`);
      }
      process.exitCode = 1;
    }
  } finally {
    await browser?.close();
    deriveProc.kill();
    harnessProc.kill();
    // Belt-and-suspenders: even if the loop crashed mid-way, persist
    // whatever per-story records we collected so build-parity-review-site
    // can show the partial picture.
    flushCaptureResults();
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
