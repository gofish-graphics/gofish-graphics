/**
 * Capture DOM snapshots and screenshots from every Storybook story.
 *
 * Renders the full story corpus headlessly into `tmp/js/` (normalized DOM +
 * PNG screenshots). compare.ts diffs it against the snapshot baselines and
 * compare-python.ts diffs the Python capture against it.
 *
 * Usage:
 *   tsx scripts/capture-js-dom.ts [filter] [--shard i/N]
 *
 * `filter` keeps only the stories whose title/name or id contains it (case-
 * insensitive). `--shard i/N` captures only shard i of N (see `Shard` in
 * capture-core.ts; CI's use is the js-capture job in visual-tests.yml).
 *
 * The actual capture loop lives in `capture-core.ts` (shared with
 * `capture-diff.ts` and `capture-one.ts`): it starts a Vite dev server serving
 * the stories-runner page and renders each story in a fresh browser context,
 * so no state leaks from one story to the next.
 */

import { join } from "path";
import { parseArgs } from "util";
import { captureStories, parseShard } from "./capture-core.js";

const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const TMP_DIR = join(TESTS_DIR, "tmp/js");
const VITE_PORT = 3001;

async function main() {
  const { values, positionals } = parseArgs({
    options: { shard: { type: "string" } },
    allowPositionals: true,
  });
  const [filter] = positionals;
  const shard =
    values.shard === undefined ? undefined : parseShard(values.shard);

  console.log("=== Capturing JS DOM snapshots (batch mode) ===\n");

  const result = await captureStories({
    harnessDir: HARNESS_DIR,
    port: VITE_PORT,
    outDir: TMP_DIR,
    filter,
    screenshot: true,
    cleanOutDir: true,
    shard,
  });

  console.log(
    `\nDone: ${result.captured.length} captured, ${result.failed.length} failed, ${result.skipped.length} skipped`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
