/**
 * IR-parity pixel gate.
 *
 * The two-pass display-list IR render (`setIRRender(true)`) is supposed to be
 * PIXEL-IDENTICAL to the legacy per-shape render. `capture-diff` can't prove
 * that — it diffs normalized DOM, and the IR path intentionally restructures
 * the SVG (flat items, no nested flip groups), so every story would show benign
 * structural churn. This script instead rasterizes each story TWICE at HEAD —
 * once legacy, once IR — in the same browser, and pixel-diffs the pair.
 *
 * Both screenshots come from the same machine/fonts/build, so there is none of
 * the Mac-vs-CI text-metric drift that makes committed pixel baselines unsafe
 * locally — a near-zero diff threshold is reliable here.
 *
 *   pnpm --filter @gofish/tests capture-ir-parity [filter]
 *
 * Exits non-zero if any story's diff exceeds the threshold. Per-story diff PNGs
 * land in tests/tmp/ir-parity/diff/.
 */

import { fileURLToPath } from "url";
import { dirname, join, relative } from "path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { captureStories } from "./capture-core.js";
import { computePixelDiff } from "./pixel-diff.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const harnessDir = join(__dirname, "..", "harness");
const tmp = join(__dirname, "..", "tmp", "ir-parity");
const legacyDir = join(tmp, "legacy");
const irDir = join(tmp, "ir");
const diffDir = join(tmp, "diff");

/** Fraction-of-differing-pixels above which a story counts as a regression.
 *  Identical content rendered twice should be 0; a hair of slack absorbs
 *  sub-pixel antialiasing noise on curved/warped edges. */
const THRESHOLD_PCT = 0.02;

const filter = process.argv[2];

function listPngs(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".png")) out.push(p);
    }
  };
  walk(root);
  return out;
}

async function main() {
  console.log("# IR-parity pixel gate");
  console.log(filter ? `  filter: "${filter}"` : "  (all stories)");

  console.log("\nCapturing legacy render…");
  await captureStories({
    harnessDir,
    port: 5391,
    outDir: legacyDir,
    filter,
    screenshot: true,
    irRender: false,
    cleanOutDir: true,
  });

  console.log("Capturing IR render…");
  await captureStories({
    harnessDir,
    port: 5392,
    outDir: irDir,
    filter,
    screenshot: true,
    irRender: true,
    cleanOutDir: true,
  });

  mkdirSync(diffDir, { recursive: true });

  const legacyPngs = listPngs(legacyDir);
  const regressions: { path: string; pct: number }[] = [];
  const missing: string[] = [];
  let compared = 0;

  for (const legacyPng of legacyPngs) {
    const rel = relative(legacyDir, legacyPng);
    const irPng = join(irDir, rel);
    if (!existsSync(irPng)) {
      missing.push(rel);
      continue;
    }
    const result = computePixelDiff(legacyPng, irPng);
    if (!result) {
      missing.push(rel);
      continue;
    }
    compared += 1;
    if (result.diffPercent > THRESHOLD_PCT) {
      const diffPath = join(diffDir, rel);
      mkdirSync(dirname(diffPath), { recursive: true });
      writeFileSync(diffPath, result.diffPng);
      regressions.push({ path: rel, pct: result.diffPercent });
    }
  }

  console.log(`\nCompared ${compared} stories.`);
  if (missing.length)
    console.log(
      `  ${missing.length} could not be compared (IR render errored / missing PNG):\n` +
        missing.map((m) => `    - ${m}`).join("\n")
    );

  regressions.sort((a, b) => b.pct - a.pct);
  if (regressions.length === 0 && missing.length === 0) {
    console.log("\n✓ All stories pixel-identical (IR == legacy).");
    return;
  }
  if (regressions.length) {
    console.log(`\n✗ ${regressions.length} stories differ:`);
    for (const r of regressions)
      console.log(`    ${(r.pct * 100).toFixed(3)}%  ${r.path}`);
    console.log(`\n  diff PNGs: ${relative(process.cwd(), diffDir)}`);
  }
  process.exit(1);
}

main();
