/**
 * Capture DOM snapshots and screenshots from every Storybook story.
 *
 * Renders the full story corpus headlessly into `tmp/js/` (normalized DOM +
 * PNG screenshots) for comparison against the checked-in baselines.
 *
 * The actual capture loop lives in `capture-core.ts` (shared with
 * `capture-diff.ts`): it starts a Vite dev server serving the stories-runner
 * page, navigates Playwright to it once, and renders each story in sequence by
 * calling `window.__renderStory__(id)` — much faster than per-story navigation
 * because there's no page load between stories, just JS execution.
 */

import { join } from "path";
import { captureStories } from "./capture-core.js";

const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const TMP_DIR = join(TESTS_DIR, "tmp/js");
const VITE_PORT = 3001;

async function main() {
  console.log("=== Capturing JS DOM snapshots (batch mode) ===\n");

  const result = await captureStories({
    harnessDir: HARNESS_DIR,
    port: VITE_PORT,
    outDir: TMP_DIR,
    screenshot: true,
    cleanOutDir: true,
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
