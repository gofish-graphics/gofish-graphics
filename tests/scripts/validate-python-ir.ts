/**
 * Validate Python-emitted IRs against the canonical gofish-ir schema.
 *
 * For each Python story under `tests/python-stories/`:
 *   1. Ask `derive-server.py` to import the story and emit its IR.
 *   2. Wrap the result into a `FrontendIRDocument` (Python's `to_dict()`
 *      returns the root only; the wrapper adds `irVersion`/`ir`).
 *   3. Run it through `gofish-ir`'s validator in permissive mode (bridge
 *      sentinels like `__gofish_lambda` and `__scope` aren't part of the
 *      public schema, so strict mode would reject them).
 *
 * Strict-mode validation against bridge-extended IRs is out of scope for
 * v0 — the canonical schema captures the public form; a separate
 * `FrontendIRWithBridge` schema covering the bridge extensions can land
 * in a follow-up commit.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Frontend } from "gofish-ir";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = resolve(HERE, "..");
const ROOT = resolve(TESTS_DIR, "..");
const PYTHON_STORIES_DIR = join(TESTS_DIR, "python-stories");
const DERIVE_SERVER_PORT = 5197;

declare const process: {
  exit(code: number): never;
  env: Record<string, string | undefined>;
  stdout?: { write(d: any): void };
  stderr?: { write(d: any): void };
};

// ---------------------------------------------------------------------------
// Story discovery (copied from capture-python-dom.ts; simpler dup here than
// importing across the harness modules)
// ---------------------------------------------------------------------------

interface PythonStory {
  module: string;
  function: string;
  path: string;
  file: string;
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
        const funcRegex = /^def\s+(story_\w+)\s*\(/gm;
        let m: RegExpExecArray | null;
        while ((m = funcRegex.exec(content)) !== null) {
          const funcName = m[1];
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
// Derive-server lifecycle
// ---------------------------------------------------------------------------

function startDeriveServer(): ChildProcess {
  const proc = spawn(
    "python3",
    [join(TESTS_DIR, "scripts/derive-server.py"), String(DERIVE_SERVER_PORT)],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
  );
  proc.stdout?.on("data", (d) => {
    if (process.env.DEBUG) process.stdout?.write(d);
  });
  proc.stderr?.on("data", (d) => {
    if (process.env.DEBUG) process.stderr?.write(d);
  });
  return proc;
}

async function waitForServer(url: string, timeoutMs = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`derive-server didn't start within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Load + validate
// ---------------------------------------------------------------------------

async function loadStoryIR(story: PythonStory): Promise<any> {
  const storyAbsPath = join(TESTS_DIR, story.file);
  const resp = await fetch(`http://localhost:${DERIVE_SERVER_PORT}/load`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storyFile: storyAbsPath,
      function: story.function,
      pythonStoriesDir: PYTHON_STORIES_DIR,
    }),
  });
  if (!resp.ok) {
    throw new Error(`load failed: ${resp.status} ${await resp.text()}`);
  }
  return await resp.json();
}

/**
 * Wrap the /load response into a FrontendIRDocument. The server's response
 * shape differs slightly from a clean Frontend.* root: chart payloads have a
 * `deriveIds` field at the top level (bridge bookkeeping); layer/raw-mark
 * payloads use `_kind` discriminators. Normalize here.
 */
function wrap(serverIR: any): Frontend.FrontendIRDocument {
  let root: Frontend.FrontendIR;
  if (serverIR && serverIR._kind === "layer") {
    root = {
      type: "layer",
      charts: serverIR.charts,
      ...(serverIR.options ? { options: serverIR.options } : {}),
    } as Frontend.LayerIR;
  } else if (serverIR && serverIR._kind === "raw-mark") {
    root = {
      type: "raw-mark",
      mark: serverIR.mark,
      ...(serverIR.options ? { options: serverIR.options } : {}),
    } as Frontend.RawMarkIR;
  } else {
    // Plain chart payload — strip out the bridge-only `deriveIds` field
    // before wrapping, since it's not part of the canonical schema.
    const { deriveIds: _deriveIds, ...chartIR } = serverIR;
    root = { type: "chart", ...chartIR } as Frontend.ChartIR;
  }
  return { irVersion: 0, ir: "gofish-frontend", root };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const stories = discoverPythonStories();
  console.log(`Discovered ${stories.length} Python stories`);

  const server = startDeriveServer();
  await waitForServer(`http://localhost:${DERIVE_SERVER_PORT}/health`);

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: { story: string; errors: string }[] = [];

  for (const story of stories) {
    const label = `${story.path}`;
    let ir: any;
    try {
      ir = await loadStoryIR(story);
    } catch (err) {
      // Story-load failures (e.g. missing vega_datasets dep) aren't IR
      // problems — skip rather than fail.
      skipped += 1;
      console.log(
        `  SKIP ${label} — ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }
    const doc = wrap(ir);
    if (
      process.env.DEBUG_DATA &&
      (label.includes("stacked-with-labels") ||
        label.includes("circle-treemap--default"))
    ) {
      console.log(
        "DEBUG mark.label:",
        JSON.stringify(
          (doc.root as any).mark?.label ??
            (doc.root as any).mark?.children?.[0]?.label
        ),
        "mark keys:",
        Object.keys((doc.root as any).mark ?? {})
      );
    }
    const result = Frontend.validate(doc, { strict: false });
    if (result.valid) {
      passed += 1;
      if (process.env.DEBUG) console.log(`  ok   ${label}`);
    } else {
      failed += 1;
      const errStr = JSON.stringify(result.errors).slice(0, 200);
      console.error(`  FAIL ${label} — ${errStr}`);
      failures.push({ story: label, errors: errStr });
    }
  }

  server.kill();

  console.log(
    `\n${passed} passed, ${failed} failed, ${skipped} skipped (out of ${stories.length})`
  );
  if (failures.length > 0) {
    console.error("\nValidation failures:");
    for (const f of failures.slice(0, 10)) {
      console.error(`  ${f.story}: ${f.errors}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Validator crashed:", err);
  process.exit(1);
});
