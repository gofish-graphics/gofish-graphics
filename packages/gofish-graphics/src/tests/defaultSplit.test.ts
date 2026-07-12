/**
 * Tests for the default-grouping rule for fused relational marks (issue
 * #752) — see `notes/design/relational-mark-default-split.md`. A `line()`/
 * `ribbon()` with no explicit `along`, fused over the current chart's own
 * flow (`.mark(R(...))`, or `.layer(R(...))` sugar over the previous tier's
 * marks), gets a default split and travel direction computed from the flow.
 * `along` names a flow tier by its `by` field and pins it as the path tier,
 * overriding the inference entirely (section 7 below).
 *
 * Verifies the computed default by counting how many connectors a chart
 * renders. `toDisplayList()`'s flat `doc.items` array is the inspectable
 * handle: under the default LINEAR coordinate transform, `line`/`ribbon`
 * (via `Connect`) are the only shapes in these test charts that emit a
 * `"path"` display item — `rect`/`blank` emit `"rect"` items in linear
 * space (they only fall back to `"path"` in a nonlinear coordinate system,
 * which none of these charts use) — so `doc.items.filter(kind === "path")`
 * is exactly the set of rendered connector paths, one per connector as long
 * as no test varies per-segment styling (none do).
 *
 * Run: `pnpm build && tsx src/tests/defaultSplit.test.ts` (wired as
 * `pnpm test:default-split`). Imports from `dist` for the same lodash-ESM
 * reason as `serialize.test.ts` / `fusion.test.ts`.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";

const {
  chart,
  spread,
  stack,
  scatter,
  group,
  blank,
  ribbon,
  line,
  circle,
  selectAll,
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

function pathCount(doc: { items: { kind: string }[] }): number {
  return doc.items.filter((it) => it.kind === "path").length;
}

/**
 * Render `builder` to a display-list document. A relational mark placed
 * directly in `.mark()` position fuses (see `ChartBuilder.mark()`) and
 * returns a `LayerBuilder`, which — unlike `ChartBuilder` — has no
 * `toDisplayList()` terminal of its own; go through `.resolve()` (both
 * builder types have it) and call the resolved `GoFishNode`'s own
 * `toDisplayList()` directly instead.
 */
async function renderDisplayList(
  builder: { resolve(): Promise<any> },
  options: { w: number; h: number }
): Promise<{ items: { kind: string; style?: Record<string, unknown> }[] }> {
  const node = await builder.resolve();
  return node.toDisplayList(options);
}

async function expectThrows(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

async function main() {
  console.log("\n# Default grouping for relational marks (issue #752)");

  // -- 1. Ridgeline: spread(month, y) -> scatter(x), fused ribbon(h), no by
  //    -> one connector per outer (month) group. --------------------------
  {
    const data = [
      { month: "A", x: 0, y: 1 },
      { month: "A", x: 1, y: 2 },
      { month: "A", x: 2, y: 1 },
      { month: "B", x: 0, y: 3 },
      { month: "B", x: 1, y: 4 },
      { month: "B", x: 2, y: 2 },
    ];
    const doc = await renderDisplayList(
      chart(data, { w: 200, h: 200 })
        .flow(spread({ by: "month", dir: "y", spacing: 50 }), scatter({ x: "x" }))
        .mark(ribbon({ h: "y" })),
      { w: 200, h: 200 }
    );
    check(
      "ridgeline: one connector per month group (2)",
      pathCount(doc) === 2,
      `got ${pathCount(doc)}`
    );
  }

  // -- 2. Stacked-area: spread(lake, x) -> stack(species, y),
  //    .mark(blank(h)).layer(ribbon({})) -> split by species (transverse
  //    regrouping across the outer spread), not lake. ----------------------
  {
    const data = [
      { lake: "L1", species: "s1", count: 3 },
      { lake: "L1", species: "s2", count: 5 },
      { lake: "L2", species: "s1", count: 4 },
      { lake: "L2", species: "s2", count: 2 },
    ];
    const doc = await renderDisplayList(
      chart(data, { w: 200, h: 200 })
        .flow(
          spread({ by: "lake", dir: "x", spacing: 50 }),
          stack({ by: "species", dir: "y" })
        )
        .mark(blank({ h: "count" }))
        .layer(ribbon({})),
      { w: 200, h: 200 }
    );
    check(
      "stacked area: split by species, not lake (2)",
      pathCount(doc) === 2,
      `got ${pathCount(doc)}`
    );
  }

  // -- 3. Barley slope: spread(site,x) -> spread(year,x) ->
  //    scatter(by:variety, y), fused line() -> one connector per
  //    site×variety, threading the year groups. ---------------------------
  {
    const data: any[] = [];
    let n = 0;
    for (const site of ["S1", "S2"]) {
      for (const year of ["Y1", "Y2"]) {
        for (const variety of ["V1", "V2"]) {
          data.push({ site, year, variety, yield: 10 + (n++ % 5) });
        }
      }
    }
    const doc = await renderDisplayList(
      chart(data, { w: 300, h: 300 })
        .flow(
          spread({ by: "site", dir: "x", spacing: 80 }),
          spread({ by: "year", dir: "x", spacing: 30 }),
          scatter({ by: "variety", y: "yield" })
        )
        .mark(line()),
      { w: 300, h: 300 }
    );
    check(
      "barley slope: one connector per site×variety (4)",
      pathCount(doc) === 4,
      `got ${pathCount(doc)}`
    );
  }

  // -- 4. Connected scatterplot: scatter(by, x, y), fused line() -> ONE
  //    connector (positions both axes -> flow order, nothing else to
  //    split). ---------------------------------------------------------
  {
    const data = [
      { year: 2000, x: 1, y: 2 },
      { year: 2001, x: 2, y: 3 },
      { year: 2002, x: 3, y: 1 },
    ];
    const doc = await renderDisplayList(
      chart(data, { w: 200, h: 200 })
        .flow(scatter({ by: "year", x: "x", y: "y" }))
        .mark(line()),
      { w: 200, h: 200 }
    );
    check(
      "connected scatterplot: ONE connector",
      pathCount(doc) === 1,
      `got ${pathCount(doc)}`
    );
  }

  // -- 5. Single-spread area: spread(by, dir:x), fused ribbon(h) -> ONE
  //    connector (the only positioning tier IS the path tier). -----------
  {
    const data = [
      { lake: "L1", count: 3 },
      { lake: "L2", count: 5 },
      { lake: "L3", count: 2 },
    ];
    const doc = await renderDisplayList(
      chart(data, { w: 200, h: 200 })
        .flow(spread({ by: "lake", dir: "x", spacing: 50 }))
        .mark(ribbon({ h: "count" })),
      { w: 200, h: 200 }
    );
    check(
      "single-spread area: ONE connector",
      pathCount(doc) === 1,
      `got ${pathCount(doc)}`
    );
  }

  // -- 6. Layered-area: spread(X, x) -> group(C),
  //    .mark(blank(h)).layer(ribbon({})) -> split by C. -------------------
  {
    const data = [
      { x: 0, c: "c1", y: 2 },
      { x: 1, c: "c1", y: 3 },
      { x: 2, c: "c1", y: 1 },
      { x: 0, c: "c2", y: 1 },
      { x: 1, c: "c2", y: 4 },
      { x: 2, c: "c2", y: 2 },
    ];
    const doc = await renderDisplayList(
      chart(data, { w: 200, h: 200 })
        .flow(spread({ by: "x", dir: "x", spacing: 50 }), group({ by: "c" }))
        .mark(blank({ h: "y" }))
        .layer(ribbon({})),
      { w: 200, h: 200 }
    );
    check(
      "layered area: split by c (2)",
      pathCount(doc) === 2,
      `got ${pathCount(doc)}`
    );
  }

  // -- 7a. Explicit `along` transposes the split (design note's "transposed"
  //    example): streamgraph shape spread(lake,x) -> stack(species,y), fused
  //    ribbon. The default names the stack tier's OWN grouping (species) as
  //    the split (matches #2's stacked-area case). `along: "species"`
  //    instead pins the stack tier as the PATH — the path travels the
  //    stack's own `dir` (y) — so the split becomes the complement, lake:
  //    one band per lake, threading species. --------------------------------
  {
    const data = [
      { lake: "L1", species: "s1", count: 3 },
      { lake: "L1", species: "s2", count: 5 },
      { lake: "L1", species: "s3", count: 1 },
      { lake: "L2", species: "s1", count: 4 },
      { lake: "L2", species: "s2", count: 2 },
      { lake: "L2", species: "s3", count: 6 },
    ];
    const makeFlow = () => [
      spread({ by: "lake", dir: "x", spacing: 50 }),
      stack({ by: "species", dir: "y" }),
    ];
    const defaultDoc = await renderDisplayList(
      chart(data, { w: 200, h: 200 })
        .flow(...makeFlow())
        .mark(blank({ h: "count" }))
        .layer(ribbon({})),
      { w: 200, h: 200 }
    );
    check(
      "streamgraph shape, no along: split by species (3)",
      pathCount(defaultDoc) === 3,
      `got ${pathCount(defaultDoc)}`
    );
    const alongDoc = await renderDisplayList(
      chart(data, { w: 200, h: 200 })
        .flow(...makeFlow())
        .mark(blank({ h: "count" }))
        .layer(ribbon({ along: "species" })),
      { w: 200, h: 200 }
    );
    check(
      "along: 'species' transposes the split to lake (2)",
      pathCount(alongDoc) === 2,
      `got ${pathCount(alongDoc)}`
    );
  }

  // -- 7b. Barley shape: an explicit `along: "year"` gives the SAME result as
  //    the inferred default (#3's site×variety split, 4 connectors) — proves
  //    `along` can name the tier inference would have picked anyway. --------
  {
    const data: any[] = [];
    let n = 0;
    for (const site of ["S1", "S2"]) {
      for (const year of ["Y1", "Y2"]) {
        for (const variety of ["V1", "V2"]) {
          data.push({ site, year, variety, yield: 10 + (n++ % 5) });
        }
      }
    }
    const doc = await renderDisplayList(
      chart(data, { w: 300, h: 300 })
        .flow(
          spread({ by: "site", dir: "x", spacing: 80 }),
          spread({ by: "year", dir: "x", spacing: 30 }),
          scatter({ by: "variety", y: "yield" })
        )
        .mark(line({ along: "year" })),
      { w: 300, h: 300 }
    );
    check(
      "barley slope: along: 'year' matches the inferred default (4)",
      pathCount(doc) === 4,
      `got ${pathCount(doc)}`
    );
  }

  // -- 7c. `along` naming a field no flow tier groups by is a loud error,
  //    naming the field (never a silent no-op). ----------------------------
  {
    const data = [
      { x: 0, c: "c1", y: 2 },
      { x: 1, c: "c1", y: 3 },
      { x: 0, c: "c2", y: 1 },
      { x: 1, c: "c2", y: 4 },
    ];
    const err = await expectThrows(() =>
      renderDisplayList(
        chart(data, { w: 200, h: 200 })
          .flow(spread({ by: "x", dir: "x", spacing: 50 }), group({ by: "c" }))
          .mark(blank({ h: "y" }))
          .layer(ribbon({ along: "nonexistent" })),
        { w: 200, h: 200 }
      )
    );
    check(
      "along naming an unknown field throws, naming the field",
      err instanceof Error && /nonexistent/.test((err as Error).message),
      err instanceof Error ? err.message : String(err)
    );
  }

  // -- 7d. `along` on a chart with no flow of its own — a refs-bag chart —
  //    is a loud error, not a silent no-op. ---------------------------------
  {
    const data = [
      { id: 0, family: "a", x: 0, y: 1 },
      { id: 1, family: "a", x: 1, y: 2 },
      { id: 2, family: "b", x: 0, y: 3 },
      { id: 3, family: "b", x: 1, y: 4 },
    ];
    let threw: unknown;
    try {
      chart(data, { w: 200, h: 200 })
        .flow(scatter({ by: "id", x: "x", y: "y" }))
        .mark(circle({ r: 3 }).name("dots"))
        .layer(
          chart(selectAll("dots"))
            .flow(group({ by: "family" }))
            .mark(line({ along: "family" }))
        );
    } catch (e) {
      threw = e;
    }
    check(
      "along on a refs-bag chart throws (not silently ignored)",
      threw instanceof Error && /refs/.test((threw as Error).message),
      threw instanceof Error ? (threw as Error).message : String(threw)
    );
  }

  // -- 7e. Fusing a no-`along` connector leaves the mark's own
  //    `__serialize.opts` unpolluted (the computed default lives in a
  //    separate cell, not in the record of what the user wrote) while the
  //    split still happens. --------------------------------------------
  {
    const data = [
      { month: "A", x: 0, y: 1 },
      { month: "A", x: 1, y: 2 },
      { month: "B", x: 0, y: 3 },
      { month: "B", x: 1, y: 4 },
    ];
    const conn = ribbon({ h: "y" });
    const doc = await renderDisplayList(
      chart(data, { w: 200, h: 200 })
        .flow(spread({ by: "month", dir: "y", spacing: 50 }), scatter({ x: "x" }))
        .mark(conn),
      { w: 200, h: 200 }
    );
    check(
      "fusing a no-along connector leaves __serialize.opts.along undefined",
      (conn as any).__serialize?.opts?.along === undefined
    );
    check(
      "...while the computed default split still happened (2 connectors)",
      pathCount(doc) === 2,
      `got ${pathCount(doc)}`
    );
  }

  // -- 8. Refs-bag chart (chart(selectAll(...))) is UNCHANGED — no default
  //    injected; the nested chart().flow(group({by})).mark(line()) idiom
  //    keeps its pre-#752 meaning (one connector per group() split, no
  //    additional default-split machinery involved). --------------------
  {
    const data = [
      { id: 0, family: "a", x: 0, y: 1 },
      { id: 1, family: "a", x: 1, y: 2 },
      { id: 2, family: "b", x: 0, y: 3 },
      { id: 3, family: "b", x: 1, y: 4 },
    ];
    const doc = await renderDisplayList(
      chart(data, { w: 200, h: 200 })
        .flow(scatter({ by: "id", x: "x", y: "y" }))
        .mark(circle({ r: 3 }).name("dots"))
        .layer(
          chart(selectAll("dots"))
            .flow(group({ by: "family" }))
            .mark(line({ strokeWidth: 1.5 }))
        ),
      { w: 200, h: 200 }
    );
    check(
      "refs-bag chart unchanged: one connector per family group (2)",
      pathCount(doc) === 2,
      `got ${pathCount(doc)}`
    );
  }

  console.log("\n# Paint fix: field-valued fill on an unsplit connector");

  // -- 9a. No by, no other grouping tiers, fill: <heterogeneous field> ->
  //    throws the homogeneity error loudly instead of leaking the field
  //    name into CSS. -------------------------------------------------
  {
    const data = [
      { lake: "L1", count: 3 },
      { lake: "L2", count: 5 },
      { lake: "L3", count: 2 },
    ];
    const err = await expectThrows(() =>
      renderDisplayList(
        chart(data, { w: 200, h: 200 })
          .flow(spread({ by: "lake", dir: "x", spacing: 50 }))
          .mark(ribbon({ h: "count", fill: "lake" })),
        { w: 200, h: 200 }
      )
    );
    check(
      "heterogeneous field-valued fill on an unsplit connector throws",
      err instanceof Error && /lake/.test((err as Error).message),
      err instanceof Error ? err.message : String(err)
    );
  }

  // -- 9b. Homogeneous field-valued fill resolves to that value's color —
  //    no literal field name leaks into the emitted style. --------------
  {
    const data = [
      { lake: "L1", count: 3, kind: "fish" },
      { lake: "L2", count: 5, kind: "fish" },
    ];
    const doc = await renderDisplayList(
      chart(data, { w: 200, h: 200 })
        .flow(spread({ by: "lake", dir: "x", spacing: 50 }))
        .mark(ribbon({ h: "count", fill: "kind" })),
      { w: 200, h: 200 }
    );
    const paths = doc.items.filter((it: any) => it.kind === "path");
    check("homogeneous field-valued fill produced a connector", paths.length === 1);
    const fillValue = paths[0]?.style?.fill;
    check(
      "resolved fill is not the literal field name",
      fillValue !== "kind",
      String(fillValue)
    );
  }

  // -- 9c. A literal (non-field) color string passes through unchanged. ---
  {
    const data = [
      { lake: "L1", count: 3 },
      { lake: "L2", count: 5 },
    ];
    const doc = await renderDisplayList(
      chart(data, { w: 200, h: 200 })
        .flow(spread({ by: "lake", dir: "x", spacing: 50 }))
        .mark(ribbon({ h: "count", fill: "steelblue" })),
      { w: 200, h: 200 }
    );
    const paths = doc.items.filter((it: any) => it.kind === "path");
    check(
      "a literal color string passes through unchanged",
      paths[0]?.style?.fill === "steelblue",
      String(paths[0]?.style?.fill)
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
