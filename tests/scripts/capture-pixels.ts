/**
 * capture-pixels.ts
 *
 * PIXEL-exact regression gate for #39 stage 6d (translate retirement).
 *
 * Unlike `capture-diff.ts` (normalized-DOM geometry diff, platform-stable), this
 * renders each story to a PNG at HEAD and at <base-ref> — BOTH in the SAME local
 * Playwright/Chromium — and compares them pixel-for-pixel with pixelmatch at
 * threshold 0. Because both refs rasterize on the identical browser/platform,
 * text antialiasing is bit-identical, so a correct behavior-preserving refactor
 * must yield ZERO differing pixels for every story. Any story with diffs is a
 * real regression to investigate (do not paper over with tolerance).
 *
 * This is the 6d gate specifically: collapsing the per-container translate
 * closures reshuffles the DOM (see capture-diff) but must not move a single
 * pixel — a DOM diff there is benign, a pixel diff here is not.
 *
 * Usage:
 *   tsx scripts/capture-pixels.ts <base-ref> [filter]
 *
 *   tsx scripts/capture-pixels.ts HEAD           # whole suite vs HEAD (pre-edit self-check)
 *   tsx scripts/capture-pixels.ts 70d281b4       # vs the 6c tip
 *   tsx scripts/capture-pixels.ts 70d281b4 bar   # only stories matching "bar"
 *
 * Output:
 *   tests/tmp/capture-pixels/head/<path>.png   PNG at HEAD (edited worktree)
 *   tests/tmp/capture-pixels/base/<path>.png   PNG at <base-ref>
 *   tests/tmp/capture-pixels/diff/<path>.png   pixelmatch diff (only for stories that moved)
 *
 * Exit code 0 = every story pixel-identical, 1 = at least one story moved (or a
 * render failed / a story exists in only one ref).
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { captureStories } from "./capture-core.js";
import { git, removeWorktree } from "./snapshot-branch.js";

const TESTS_DIR = join(import.meta.dirname, "..");
const HARNESS_DIR = join(TESTS_DIR, "harness");
const OUT_DIR = join(TESTS_DIR, "tmp/capture-pixels");
const HEAD_DIR = join(OUT_DIR, "head");
const BASE_DIR = join(OUT_DIR, "base");
const DIFF_DIR = join(OUT_DIR, "diff");

const HEAD_PORT = 3005;
const BASE_PORT = 3006;

/** Compare two PNGs at threshold 0. Returns differing-pixel count and (when > 0)
 *  the diff image. Mismatched dimensions are themselves a hard difference. */
function comparePng(
  basePath: string,
  headPath: string
): { numDiff: number; total: number; diff?: Buffer; note?: string } {
  const base = PNG.sync.read(readFileSync(basePath));
  const head = PNG.sync.read(readFileSync(headPath));
  if (base.width !== head.width || base.height !== head.height) {
    return {
      numDiff: base.width * base.height,
      total: base.width * base.height,
      note: `dimensions differ: base ${base.width}x${base.height} vs head ${head.width}x${head.height}`,
    };
  }
  const { width, height } = base;
  const diff = new PNG({ width, height });
  const numDiff = pixelmatch(base.data, head.data, diff.data, width, height, {
    threshold: 0,
  });
  return {
    numDiff,
    total: width * height,
    diff: numDiff > 0 ? PNG.sync.write(diff) : undefined,
  };
}

async function main() {
  const baseRef = process.argv[2];
  const filter = process.argv[3];

  if (!baseRef) {
    console.error(
      "Usage: tsx scripts/capture-pixels.ts <base-ref> [filter]\n" +
        "  e.g. tsx scripts/capture-pixels.ts 70d281b4\n" +
        "       tsx scripts/capture-pixels.ts HEAD bar"
    );
    process.exit(2);
  }

  const baseSha = git(`git rev-parse "${baseRef}"`, { ignoreError: true });
  if (!baseSha) {
    console.error(`Cannot resolve base ref "${baseRef}".`);
    process.exit(2);
  }
  const baseShort = baseSha.slice(0, 9);

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. HEAD (current, possibly-edited worktree) → PNGs.
  console.log(`=== Capturing HEAD (current worktree) → PNG ===\n`);
  const headResult = await captureStories({
    harnessDir: HARNESS_DIR,
    port: HEAD_PORT,
    outDir: HEAD_DIR,
    filter,
    screenshot: true,
  });

  // 2. <base-ref> from a throwaway worktree → PNGs (same process/browser).
  const wtPath = join("/tmp", `gofish-capture-pixels-${process.pid}`);
  removeWorktree(wtPath);
  let baseResult;
  try {
    console.log(
      `\n=== Checking out ${baseRef} (${baseShort}) into a temp worktree ===`
    );
    git(`git worktree add --detach "${wtPath}" ${baseSha}`);
    console.log(`Installing dependencies in the temp worktree...`);
    execSync("pnpm install --ignore-scripts", {
      cwd: wtPath,
      stdio: "inherit",
    });

    console.log(`\n=== Capturing ${baseRef} (${baseShort}) → PNG ===\n`);
    baseResult = await captureStories({
      harnessDir: join(wtPath, "tests/harness"),
      port: BASE_PORT,
      outDir: BASE_DIR,
      filter,
      screenshot: true,
    });
  } finally {
    removeWorktree(wtPath);
  }

  // 3. Pixel-compare per story.
  const headSet = new Set(
    headResult.captured.map((p) => p.replace(/\.html$/, ""))
  );
  const baseSet = new Set(
    baseResult.captured.map((p) => p.replace(/\.html$/, ""))
  );
  const all = Array.from(new Set([...headSet, ...baseSet])).sort();

  let compared = 0;
  const moved: {
    path: string;
    numDiff: number;
    total: number;
    note?: string;
  }[] = [];
  const onlyOne: { path: string; where: string }[] = [];

  for (const path of all) {
    if (!headSet.has(path)) {
      onlyOne.push({ path, where: baseRef });
      continue;
    }
    if (!baseSet.has(path)) {
      onlyOne.push({ path, where: "HEAD" });
      continue;
    }
    const headPng = join(HEAD_DIR, `${path}.png`);
    const basePng = join(BASE_DIR, `${path}.png`);
    if (!existsSync(headPng) || !existsSync(basePng)) {
      onlyOne.push({ path, where: existsSync(headPng) ? "HEAD" : baseRef });
      continue;
    }
    compared++;
    const { numDiff, total, diff, note } = comparePng(basePng, headPng);
    if (numDiff > 0) {
      moved.push({ path, numDiff, total, note });
      if (diff) {
        const diffPath = join(DIFF_DIR, `${path}.png`);
        mkdirSync(dirname(diffPath), { recursive: true });
        writeFileSync(diffPath, diff);
      }
    }
  }

  // 4. Report.
  console.log(`\n=== Pixel result: HEAD vs ${baseRef} (${baseShort}) ===\n`);
  console.log(`  Stories compared: ${compared}`);
  console.log(`  Stories with differing pixels: ${moved.length}`);
  if (moved.length) {
    for (const m of moved)
      console.log(
        `    ~ ${m.path}: ${m.numDiff}/${m.total} px differ${m.note ? ` (${m.note})` : ""}`
      );
    console.log(`\n  Diff PNGs: ${DIFF_DIR}`);
  }
  if (onlyOne.length) {
    console.log(`\n  ${onlyOne.length} story(ies) present in only one ref:`);
    for (const o of onlyOne)
      console.log(`    ! ${o.path} (only in ${o.where})`);
  }
  const renderFailures = [
    ...headResult.failed.map((f) => ({ ...f, ref: "HEAD" })),
    ...baseResult.failed.map((f) => ({ ...f, ref: baseRef })),
  ];
  if (renderFailures.length) {
    console.log(`\n  ${renderFailures.length} render failure(s):`);
    for (const f of renderFailures)
      console.log(`    ! [${f.ref}] ${f.path}: ${f.error}`);
  }

  const clean =
    moved.length === 0 && onlyOne.length === 0 && renderFailures.length === 0;
  console.log(
    `\n  ${clean ? "CLEAN — zero pixels moved." : "PIXELS MOVED / failures — investigate."}`
  );
  process.exit(clean ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
