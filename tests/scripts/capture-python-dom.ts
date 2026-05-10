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
import { spawn, execSync, type ChildProcess } from "child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
} from "fs";
import { join, dirname, relative } from "path";
import { normalizeDom } from "./normalize-dom.js";

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

// ---------------------------------------------------------------------------
// Extract IR from Python story (by calling Python)
// ---------------------------------------------------------------------------

type IRResult =
  | {
      kind: "chart";
      spec: any;
      data: any;
      options: any;
      deriveIds: string[];
    }
  | { kind: "layer-unsupported"; reason: string }
  | { kind: "error"; reason: string };

function extractIR(story: PythonStory): IRResult {
  const storyAbsPath = join(TESTS_DIR, story.file);
  const script = `
import sys, json, importlib.util
sys.path.insert(0, "${join(ROOT, "packages/gofish-python")}")
sys.path.insert(0, "${TESTS_DIR}")

# Register "python_stories" as a package so story imports (e.g. from python_stories.data) work
_pkg_dir = "${PYTHON_STORIES_DIR}"
_pkg_init = "${PYTHON_STORIES_DIR}/__init__.py"
_pkg_spec = importlib.util.spec_from_file_location(
    "python_stories", _pkg_init,
    submodule_search_locations=[_pkg_dir]
)
_pkg_mod = importlib.util.module_from_spec(_pkg_spec)
sys.modules["python_stories"] = _pkg_mod
_pkg_spec.loader.exec_module(_pkg_mod)

spec = importlib.util.spec_from_file_location("story_module", "${storyAbsPath}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
fn = getattr(mod, "${story.function}")

result = fn()
if not isinstance(result, tuple):
    print(json.dumps({"error": "story function must return a tuple"}))
    sys.exit(1)

builder = result[0]
options = result[1] if len(result) > 1 else {}

from gofish.ast import DeriveOperator, ChartBuilder, LayerBuilder

# The harness was built for ChartBuilder. LayerBuilder stories (Layer([...]))
# need a different IR shape and a different render path that the current
# harness doesn't implement. Surface them as a structured "skip" so the
# parent script can categorize them as a known limitation rather than a
# hard failure.
if isinstance(builder, LayerBuilder):
    print(json.dumps({"_kind": "layer-unsupported"}))
    sys.exit(0)

ir = builder.to_ir()
data = builder.data

# Collect derive lambda IDs
derive_ids = []
for op in builder.operators:
    if isinstance(op, DeriveOperator):
        derive_ids.append(op.lambda_id)

# Serialize data
if hasattr(data, 'to_dict'):
    data = data.to_dict('records')
elif hasattr(data, 'to_dicts'):
    data = data.to_dicts()

output = {
    "operators": ir["operators"],
    "mark": ir["mark"],
    "options": {**ir.get("options", {}), **options},
    "data": data,
    "deriveIds": derive_ids,
}
print(json.dumps(output))
`;

  try {
    const result = execSync(`python3 -`, {
      cwd: ROOT,
      encoding: "utf-8",
      input: script,
      timeout: 30_000,
    });
    const parsed = JSON.parse(result.trim());
    if (parsed && parsed._kind === "layer-unsupported") {
      return {
        kind: "layer-unsupported",
        reason: "LayerBuilder stories not yet supported by capture harness",
      };
    }
    return { kind: "chart", ...parsed };
  } catch (err) {
    return {
      kind: "error",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
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

// ---------------------------------------------------------------------------
// Register derive functions for a story
// ---------------------------------------------------------------------------

function registerDerives(story: PythonStory): void {
  const storyAbsPath = join(TESTS_DIR, story.file);
  const script = `
import sys, importlib.util
sys.path.insert(0, "${join(ROOT, "packages/gofish-python")}")
sys.path.insert(0, "${TESTS_DIR}")

# Register "python_stories" as a package so story imports (e.g. from python_stories.data) work
_pkg_dir = "${PYTHON_STORIES_DIR}"
_pkg_init = "${PYTHON_STORIES_DIR}/__init__.py"
_pkg_spec = importlib.util.spec_from_file_location(
    "python_stories", _pkg_init,
    submodule_search_locations=[_pkg_dir]
)
_pkg_mod = importlib.util.module_from_spec(_pkg_spec)
sys.modules["python_stories"] = _pkg_mod
_pkg_spec.loader.exec_module(_pkg_mod)

from gofish.ast import DeriveOperator

spec = importlib.util.spec_from_file_location("story_module", "${storyAbsPath}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
fn = getattr(mod, "${story.function}")
result = fn()
builder = result[0]

for op in builder.operators:
    if isinstance(op, DeriveOperator):
        pass

print("OK")
`;

  try {
    execSync(`python3 -`, {
      cwd: ROOT,
      encoding: "utf-8",
      input: script,
      timeout: 10_000,
    });
  } catch {
    // Non-fatal — story may not have derives
  }
}

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
  ir: any
): Promise<{ dom: string; screenshot: Buffer }> {
  await page.goto(harnessUrl, { waitUntil: "networkidle" });

  // Inject spec and trigger render
  const spec = {
    data: ir.data,
    operators: ir.operators,
    mark: ir.mark,
    options: ir.options,
    deriveServerUrl:
      ir.deriveIds && ir.deriveIds.length > 0
        ? `http://localhost:${DERIVE_SERVER_PORT}`
        : undefined,
  };

  await page.evaluate((s) => {
    window.__GOFISH_RENDER_COMPLETE__ = false;
    window.__GOFISH_RENDER_ERROR__ = null;
    // Clear previous render
    const root = document.getElementById("gofish-harness-root");
    if (root) root.innerHTML = "";
    window.__renderChart__(s);
  }, spec);

  // Wait for render completion. Short timeout — a render that takes more
  // than a few seconds in CI is almost always silently broken (e.g. a
  // missing derive lambda leaving the chart at zero size).
  await page.waitForFunction(() => window.__GOFISH_RENDER_COMPLETE__ === true, {
    timeout: 8_000,
  });

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

  const stories = discoverPythonStories();
  if (stories.length === 0) {
    console.log("No Python stories found. Skipping.");
    return;
  }
  console.log(`Found ${stories.length} Python stories\n`);

  // Start servers
  const deriveProc = startDeriveServer();
  const harnessProc = startHarnessServer();

  let browser: Browser | undefined;

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

    mkdirSync(TMP_DIR, { recursive: true });

    let captured = 0;
    let failed = 0;
    let skipped = 0;
    const failures: { story: string; reason: string }[] = [];
    const skips: { story: string; reason: string }[] = [];

    for (const story of stories) {
      process.stdout.write(
        `  ${story.module}::${story.function} → ${story.path} ... `
      );

      // Register derives for this story with the derive server
      if (story.file) {
        registerDerives(story);
      }

      const ir = extractIR(story);
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
        continue;
      }
      if (ir.kind === "error") {
        console.log(`FAILED (IR extraction): ${ir.reason}`);
        failed++;
        failures.push({
          story: `${story.module}::${story.function}`,
          reason: `IR extraction failed: ${ir.reason}`,
        });
        continue;
      }

      try {
        const { dom, screenshot } = await captureStory(
          page,
          `http://localhost:${HARNESS_PORT}`,
          story,
          ir
        );
        const normalized = normalizeDom(dom);

        const domPath = join(TMP_DIR, `${story.path}.html`);
        mkdirSync(dirname(domPath), { recursive: true });
        writeFileSync(domPath, normalized, "utf-8");

        const screenshotPath = join(TMP_DIR, `${story.path}.png`);
        writeFileSync(screenshotPath, screenshot);

        console.log("OK");
        captured++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`FAILED: ${msg}`);
        failed++;
        failures.push({
          story: `${story.module}::${story.function}`,
          reason: msg,
        });
      }
    }

    console.log(
      `\nDone: ${captured} captured, ${failed} failed, ${skipped} skipped`
    );
    if (skipped > 0) {
      console.log(`\n${skipped} skipped (known limitations):`);
      for (const s of skips) console.log(`  - ${s.story}: ${s.reason}`);
    }

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
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
