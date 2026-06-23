/**
 * Tests for the display-list (render-IR) emitter — `toDisplayList()`.
 *
 * Builds a bar chart via the v3 fluent API, runs `toDisplayList({w, h})`, and
 * asserts the emitted document is (a) schema-valid against the canonical
 * display-list schema in `gofish-ir`, and (b) geometrically faithful: bars
 * share a baseline, heights are proportional to their data value, x-positions
 * step by width + spacing, and every bar carries its source `datum`.
 *
 * Run: `pnpm build && tsx src/tests/displayListEmit.test.ts` (wired as
 * `pnpm test:display-list`). Imports from `dist` for the same lodash-ESM
 * reason as `serialize.test.ts`.
 */

import { DisplayList } from "gofish-ir";
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";

const { chart, spread, rect } = GoFish as any;

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const near = (a: number | undefined, b: number, eps = 1e-6) =>
  a !== undefined && Math.abs(a - b) < eps;

async function main() {
  console.log("\n# Display-list emitter — toDisplayList()");

  const data = [
    { c: "A", v: 60 },
    { c: "B", v: 30 },
    { c: "D", v: 45 },
  ];
  const W = 16;
  const SPACING = 8;
  const doc: DisplayList.DisplayListDocument = await chart(data)
    .flow(spread({ by: "c", dir: "x", spacing: SPACING }))
    .mark(rect({ h: "v", w: W, fill: "steelblue" }))
    .toDisplayList({ w: 200, h: 120 });

  // -- schema conformance --------------------------------------------------
  const r = DisplayList.validate(doc);
  check(
    "emitted document validates against the display-list schema",
    r.valid,
    r.valid ? undefined : JSON.stringify(r.errors).slice(0, 200)
  );

  // -- shape ---------------------------------------------------------------
  check("envelope is gofish-display-list v0", doc.ir === "gofish-display-list" && doc.irVersion === 0);
  const bars = doc.items.filter(
    (it): it is DisplayList.RectItem => it.kind === "rect"
  );
  check("three bars emitted", bars.length === 3, `got ${bars.length}`);

  // -- geometry: shared baseline -------------------------------------------
  const baselines = bars.map((b) => b.y + b.h);
  check(
    "all bars share a baseline (y + h equal)",
    baselines.every((bl) => near(bl, baselines[0])),
    JSON.stringify(baselines)
  );

  // -- geometry: heights proportional to value -----------------------------
  // values 60, 30, 45 → heights must be in the same ratios.
  const [hA, hB, hD] = bars.map((b) => b.h);
  check("height(A=60) == 2·height(B=30)", near(hA, hB * 2), `${hA} vs ${hB}`);
  check(
    "height(D=45) == 1.5·height(B=30)",
    near(hD, hB * 1.5),
    `${hD} vs ${hB}`
  );

  // -- geometry: x steps by width + spacing --------------------------------
  check("bar width is the literal w", bars.every((b) => near(b.w, W)));
  check(
    "x positions step by w + spacing",
    near(bars[1].x - bars[0].x, W + SPACING) &&
      near(bars[2].x - bars[1].x, W + SPACING),
    bars.map((b) => b.x).join(",")
  );

  // -- datum provenance survives to every primitive ------------------------
  check(
    "each bar carries its source datum",
    bars.every((b, i) => {
      const d = Array.isArray(b.datum) ? b.datum[0] : b.datum;
      return (d as any)?.c === data[i].c && (d as any)?.v === data[i].v;
    }),
    JSON.stringify(bars.map((b) => b.datum))
  );

  // -- viewport ------------------------------------------------------------
  check(
    "viewport is positive and finite",
    doc.viewport.w > 0 && doc.viewport.h > 0
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
