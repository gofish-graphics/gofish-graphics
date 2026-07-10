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

const { chart, group, scatter, circle, line, text } = GoFish as any;

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

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
