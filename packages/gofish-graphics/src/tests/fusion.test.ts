/**
 * Regression test for the "blank fusion" bug in `ChartBuilder.mark()` /
 * `ensureNamedMark()` (chartBuilder.ts).
 *
 * Repro shape (mirrors the real `Benchmarks/Envelope` and `Benchmarks/Trend`
 * stories in `stories/bench/Benchmarks.stories.tsx`): a multi-tier `.layer()`
 * chain where a MIDDLE tier is an empty-scope `chart().flow(group({by}))`
 * whose mark is a relational mark (`line()`, tagged `__relationalFusable`).
 * Fusion is correctly skipped when that tier's `.mark()` is first called
 * (`usesPreviousLayerMarks()` is true), so the still-tagged relational mark is
 * stored as `finalMark`. Because a LATER tier follows, `LayerBuilder.resolve()`
 * calls `tier.withData(prevRefs)` (an Array of `GoFishRef`, not a `GoFishRef`
 * instance) and then `tier.ensureNamedMark(...)`. Before the fix,
 * `ensureNamedMark` re-invoked `this.mark(named)`, re-entering the fusion
 * guard against the `withData(prevRefs)` shape, wrongly re-firing fusion and
 * returning a `LayerBuilder` instead of a `ChartBuilder` — which blew up
 * later in `resolve()` with `tier.withLayerContext is not a function`.
 *
 * Run: `pnpm build && tsx src/tests/fusion.test.ts` (wired as
 * `pnpm test:fusion`). Imports from `dist` for the same lodash-ESM reason as
 * `serialize.test.ts` / `displayListEmit.test.ts`.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";

const { chart, group, scatter, circle, line, ribbon, text, selectAll } =
  GoFish as any;

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

async function main() {
  console.log(
    "\n# Blank-fusion regression — .layer() chain with an empty-scope relational middle tier"
  );

  const data = [
    { id: 0, family: "a", x: 0, y: 1 },
    { id: 1, family: "a", x: 1, y: 2 },
    { id: 2, family: "b", x: 0, y: 3 },
    { id: 3, family: "b", x: 1, y: 4 },
  ];

  // Root tier: real row data + a plain (non-relational) mark.
  // Middle tier: empty-scope chart().flow(group({by})).mark(line()) — line()
  // is a relational mark (createRelationalMark), tagged __relationalFusable.
  // Because a following tier exists, LayerBuilder.resolve() will call
  // ensureNamedMark on this middle tier during resolve — the exact path that
  // was broken.
  // Trailing tier: any following tier so ensureNamedMark actually runs.
  let node: any;
  let threw: unknown;
  try {
    node = await chart(data, { w: 200, h: 200 })
      .flow(scatter({ by: "id", x: "x", y: "y" }))
      .mark(circle({ r: 3, fill: "family" }).name("dots"))
      .layer(
        chart()
          .flow(group({ by: "family" }))
          .mark(line({ strokeWidth: 1.5 }))
      )
      .layer(text({ text: "caption" }))
      .resolve();
  } catch (e) {
    threw = e;
  }

  check(
    "three-tier .layer() chain with an empty-scope relational middle tier resolves without throwing",
    threw === undefined,
    threw instanceof Error ? threw.message : String(threw)
  );
  check("resolve() produced a node", node !== undefined && node !== null);

  console.log(
    "\n# Anchor channels on a relational mark that will NOT fuse must throw at .mark() call time"
  );

  // Empty-scope tier (`usesPreviousLayerMarks()`) + a relational mark carrying
  // an anchor key (`h`) — the mark connects the previous tier's existing
  // marks, so `h` has nothing to anchor and must be a loud error, thrown
  // synchronously when `.mark()` is called (not deferred to `.resolve()`).
  let anchorOnEmptyScopeThrew: unknown;
  try {
    chart()
      .flow(group({ by: "family" }))
      .mark(line({ h: "count" }));
  } catch (e) {
    anchorOnEmptyScopeThrew = e;
  }
  check(
    "empty-scope tier: line({ h }) throws synchronously at .mark() call time",
    anchorOnEmptyScopeThrew instanceof Error &&
      /\bh\b/.test((anchorOnEmptyScopeThrew as Error).message)
  );

  // Same empty-scope shape, but with NO anchor keys — the existing happy path
  // (also exercised end-to-end by the three-tier test above) must stay legal.
  let noAnchorOnEmptyScopeThrew: unknown;
  try {
    chart()
      .flow(group({ by: "family" }))
      .mark(line({ strokeWidth: 1.5 }));
  } catch (e) {
    noAnchorOnEmptyScopeThrew = e;
  }
  check(
    "empty-scope tier: line() with no anchor keys stays legal",
    noAnchorOnEmptyScopeThrew === undefined,
    noAnchorOnEmptyScopeThrew instanceof Error
      ? noAnchorOnEmptyScopeThrew.message
      : String(noAnchorOnEmptyScopeThrew)
  );

  // Chart data already refs (selectAll(...)) + an anchor key — same
  // "connects existing marks" situation via the OTHER unfused path
  // (`dataIsRefs`), must also throw at .mark() call time.
  let anchorOnRefsDataThrew: unknown;
  try {
    chart(selectAll("dots")).mark(ribbon({ h: "count" }));
  } catch (e) {
    anchorOnRefsDataThrew = e;
  }
  check(
    "refs-data chart: ribbon({ h }) throws synchronously at .mark() call time",
    anchorOnRefsDataThrew instanceof Error &&
      /\bh\b/.test((anchorOnRefsDataThrew as Error).message)
  );

  // Fused path: a relational mark WITH anchor keys directly over raw row
  // data (a non-empty, non-refs scope) must still fuse and render, not throw.
  const rows = [
    { lake: "a", count: 3 },
    { lake: "b", count: 5 },
  ];
  let fusedRibbonNode: any;
  let fusedRibbonThrew: unknown;
  try {
    fusedRibbonNode = await chart(rows, { w: 200, h: 200 })
      .flow(scatter({ by: "lake", x: "lake", y: "count" }))
      .mark(ribbon({ h: "count" }))
      .resolve();
  } catch (e) {
    fusedRibbonThrew = e;
  }
  check(
    "fused path: ribbon({ h }) directly over raw row data does not throw",
    fusedRibbonThrew === undefined,
    fusedRibbonThrew instanceof Error
      ? fusedRibbonThrew.message
      : String(fusedRibbonThrew)
  );
  check(
    "fused path: ribbon({ h }) over raw row data produced a node",
    fusedRibbonNode !== undefined && fusedRibbonNode !== null
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
