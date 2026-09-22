/**
 * Capture a screenshot (+ normalized DOM) for ONE story (or a small subset),
 * on demand, for an interactive review loop.
 *
 * This is the fast primitive behind the `iterate-example` skill: render the
 * single story you're working on to a PNG that Claude (or you) can look at,
 * critique, and fix — without re-rendering the entire story corpus the way
 * `capture-js-dom.ts` does.
 *
 * It is `captureStories` from `capture-core.ts` with a filter, so a story goes
 * through exactly the batch render path (fresh context, fake clock, fixed
 * virtual budget) and its `.html` is byte-comparable with `tmp/js/`.
 *
 * Usage:
 *   tsx scripts/capture-one.ts                 # list all available stories
 *   tsx scripts/capture-one.ts bar/grouped     # capture stories matching "bar/grouped"
 *   tsx scripts/capture-one.ts "Scatter"       # case-insensitive substring on title/name/id
 *
 * Output: tests/tmp/iterate/<path>.png  (and .html for the normalized DOM)
 * The matched output paths are printed at the end so a caller knows what to read.
 */

import { join } from "path";
import { captureStories, listStories } from "./capture-core.js";

const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const OUT_DIR = join(TESTS_DIR, "tmp/iterate");
// Distinct from capture-js-dom (3001) so both can run; CAPTURE_ONE_PORT lets
// several capture-one loops run concurrently (each on its own port).
const VITE_PORT = Number(process.env.CAPTURE_ONE_PORT) || 3002;

async function main() {
  const filter = process.argv[2]?.trim();

  // No filter → list what's available and exit. Helps when you don't know the id.
  if (!filter) {
    const stories = await listStories(HARNESS_DIR, VITE_PORT);
    console.log(
      `\n${stories.length} stories available. Pass a substring to capture one:\n`
    );
    for (const s of stories) console.log(`  ${s.title}/${s.name}`);
    console.log(
      `\ne.g.  tsx scripts/capture-one.ts "${stories[0]?.title}/${stories[0]?.name}"`
    );
    return;
  }

  // Never wipe OUT_DIR: captures from a previous filter survive, so you can
  // compare two stories across runs.
  const result = await captureStories({
    harnessDir: HARNESS_DIR,
    port: VITE_PORT,
    outDir: OUT_DIR,
    filter,
    screenshot: true,
  });

  const matched =
    result.captured.length + result.failed.length + result.skipped.length;
  if (matched === 0) {
    console.error(
      `\nNo stories match "${filter}". Run without an argument to list all stories.`
    );
    process.exitCode = 1;
    return;
  }

  if (result.written.length) {
    console.log(
      `\nWritten — read the .png (and .html for exact coords/sizes):`
    );
    // PNG first (read this), then the DOM (read for exact coords/sizes).
    for (const { png, html } of result.written) {
      if (png) console.log(`  ${png}`);
      console.log(`  ${html}`);
    }
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
