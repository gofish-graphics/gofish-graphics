/**
 * Regression test for the "blank fusion" bug in `ChartBuilder.mark()` /
 * `ensureNamedMark()` (chartBuilder.ts).
 *
 * Repro shape (mirrors the real `Benchmarks/Envelope` and `Benchmarks/Trend`
 * stories in `stories/bench/Benchmarks.stories.tsx`): a multi-tier `.layer()`
 * chain where a MIDDLE tier is an empty-scope `chart().flow(group({by}))`
 * whose mark is a relational mark (`line()`, tagged `__relationalFusable`).
 * Fusion is left to the binding when that tier's `.mark()` is first called
 * (`usesPreviousLayerMarks()` is true; #1232), so the still-tagged relational
 * mark is stored as `finalMark`. Because a LATER tier follows, `LayerBuilder.resolve()`
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

const {
  chart,
  group,
  scatter,
  spread,
  field,
  circle,
  blank,
  line,
  ribbon,
  text,
  selectAll,
  layer,
} = GoFish as any;

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

  console.log("\n# An empty scope decides fusion where it is bound (#1232)");

  // Empty-scope tier (`usesPreviousLayerMarks()`) + a relational mark carrying
  // an anchor key (`h`). The scope's data is not known at `.mark()`, so the
  // mark is kept for the binding to decide: no throw yet.
  let deferredThrew: unknown;
  try {
    chart()
      .flow(group({ by: "family" }))
      .mark(line({ h: "count" }));
  } catch (e) {
    deferredThrew = e;
  }
  check(
    "empty-scope tier: line({ h }) does not throw at .mark() call time",
    deferredThrew === undefined,
    deferredThrew instanceof Error ? deferredThrew.message : String(deferredThrew)
  );

  // Bound to the previous tier's marks by `.layer(...)`: the line connects
  // EXISTING marks, so `h` has nothing to anchor and is a loud error. A chain
  // whose first tier is that empty scope is bound the same way.
  const layeredOverDots = (tier: any) =>
    chart(data, { w: 200, h: 200 })
      .flow(scatter({ by: "id", x: "x", y: "y" }))
      .mark(circle({ r: 3 }))
      .layer(tier)
      .resolve();
  const lineWithH = () =>
    chart()
      .flow(group({ by: "family" }))
      .mark(line({ h: "count" }));
  for (const [label, tier] of [
    ["empty-scope .layer() tier", lineWithH()],
    ["empty-scope chain in .layer()", lineWithH().layer(text({ text: "c" }))],
  ] as const) {
    let threw: unknown;
    try {
      await layeredOverDots(tier);
    } catch (e) {
      threw = e;
    }
    check(
      `${label}: line({ h }) throws (it connects existing marks)`,
      threw instanceof Error &&
        /connects EXISTING marks/.test((threw as Error).message),
      threw instanceof Error ? threw.message : String(threw)
    );
  }

  // Bound to a partition's rows in a mark position (a `layer([...])` child):
  // the rows need anchors, so the ribbon fuses and draws them. This is the
  // #1232 repro, which used to throw the "connects EXISTING marks" error.
  const ridgeRows = [
    { g: "a", x: 0, pdf: 1 },
    { g: "a", x: 1, pdf: 3 },
    { g: "a", x: 2, pdf: 2 },
    { g: "b", x: 0, pdf: 2 },
    { g: "b", x: 1, pdf: 1 },
    { g: "b", x: 2, pdf: 4 },
  ];
  const ridgeline = (inner: any) =>
    chart(ridgeRows)
      .flow(spread({ by: field("g"), dir: "y" }))
      .mark(layer([inner]))
      .toDisplayList({ w: 200, h: 200 });
  const pathsOf = (dl: any) => {
    const out: string[] = [];
    const walk = (it: any) => {
      if (it.kind === "path") out.push(it.d);
      for (const c of it.children ?? []) walk(c);
    };
    dl.items.forEach(walk);
    return out;
  };
  let fusedInLayer: any;
  let fusedInLayerThrew: unknown;
  try {
    fusedInLayer = await ridgeline(
      chart()
        .flow(scatter({ x: "x" }))
        .mark(ribbon({ h: "pdf", fill: "none" }))
    );
  } catch (e) {
    fusedInLayerThrew = e;
  }
  check(
    "empty scope in a layer([...]) child: ribbon({ h }) fuses over the rows",
    fusedInLayerThrew === undefined,
    fusedInLayerThrew instanceof Error
      ? fusedInLayerThrew.message
      : String(fusedInLayerThrew)
  );
  // It draws exactly what the fusion written out by hand draws.
  const byHand = pathsOf(
    await ridgeline(
      chart()
        .flow(scatter({ x: "x" }))
        .mark(blank({ h: "pdf" }))
        .layer(ribbon({ fill: "none" }))
    )
  );
  const fusedPaths = fusedInLayer ? pathsOf(fusedInLayer) : [];
  check(
    "...one ribbon per partition, as .mark(blank({ h })).layer(ribbon()) draws",
    fusedPaths.length === 2 &&
      JSON.stringify(fusedPaths) === JSON.stringify(byHand),
    `${JSON.stringify(fusedPaths)} vs ${JSON.stringify(byHand)}`
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

  console.log(
    "\n# A LayerBuilder used as an operator child registers its names in the ENCLOSING scope"
  );

  // `resolveMarkResult` threads the caller's layer context into a ChartBuilder
  // child (`withLayerContext`); a LayerBuilder child used to drop it and resolve
  // into a private registry of its own, so a `.name(...)` inside it was invisible
  // from outside and a sibling's `selectAll` threw `Layer "bars" not found`.
  // `layer(...)` resolves its children sequentially, so the second child's
  // selection is read after the first child has registered its names.
  const crossTier = (producerHasSecondTier: boolean) => {
    const root = chart(data, { w: 200, h: 200 })
      .flow(scatter({ by: "id", x: "x", y: "y" }))
      .mark(circle({ r: 3, fill: "steelblue" }).name("bars"));
    return layer({}, [
      // A ChartBuilder child, or the same chain with a `.layer(...)` tier on it
      // — which makes it a LayerBuilder instead.
      producerHasSecondTier ? root.layer(text({ text: "caption" })) : root,
      // A sibling that can only resolve if "bars" reached the shared registry.
      chart(selectAll("bars")).mark(line({ strokeWidth: 1 })),
    ]);
  };
  for (const [label, hasSecondTier] of [
    ["ChartBuilder", false],
    ["LayerBuilder", true],
  ] as const) {
    let crossTierNode: any;
    let crossTierThrew: unknown;
    try {
      // A combinator mark resolves to its node when called (no datum).
      crossTierNode = await crossTier(hasSecondTier)(undefined);
    } catch (e) {
      crossTierThrew = e;
    }
    check(
      `a sibling's selectAll() finds a name registered inside a ${label} child`,
      crossTierThrew === undefined,
      crossTierThrew instanceof Error
        ? crossTierThrew.message
        : String(crossTierThrew)
    );
    check(
      `the cross-tier selection produced a node (${label} producer)`,
      crossTierNode != null && crossTierNode.children?.length === 2,
      String(crossTierNode?.children?.length)
    );
  }

  console.log(
    "\n# An empty-scope tier with no previous marks is an error, a chart or a chain"
  );

  // A bare mark tier names nothing, so the tier after it has no previous
  // marks. An empty `chart()` there throws; so does a chain whose first tier
  // is an empty `chart()`, by the same rule, instead of drawing no rows.
  for (const [label, tier] of [
    ["an empty chart()", () => chart().mark(circle({ r: 2 }))],
    [
      "a chain whose first tier is an empty chart()",
      () =>
        chart()
          .mark(circle({ r: 2 }))
          .layer(text({ text: "x" })),
    ],
  ] as const) {
    let threw: unknown;
    try {
      await chart(data, { w: 200, h: 200 })
        .flow(scatter({ by: "id", x: "x", y: "y" }))
        .mark(circle({ r: 3 }))
        .layer(text({ text: "caption" }))
        .layer(tier())
        .resolve();
    } catch (e) {
      threw = e;
    }
    check(
      `${label} after a mark tier throws the empty-scope error`,
      threw instanceof Error && /has no previous tier's marks/.test(threw.message),
      threw instanceof Error ? threw.message : String(threw)
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
