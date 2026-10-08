/**
 * Tests for the frontend-IR emitter (gofish-graphics/serialize/toJSON).
 *
 * Builds charts via the fluent chart API, calls .toJSON(), and validates the
 * resulting documents against the canonical schema in gofish-ir.
 *
 * Runnable as a script via tsx. No test framework — plain assertions + a
 * pass/fail counter so it can run alongside the existing test:path /
 * test:font scripts.
 */

import { Frontend } from "gofish-ir";
import { resolveLabelText } from "../ast/labels/labelPlacement";
// Import from the built dist rather than source: lodash's named exports
// don't survive Node ESM resolution without bundling, but the Vite-built
// dist has them inlined. Run `pnpm build` first.
// @ts-ignore -- dist may not exist at typecheck time, but the test runner
//  runs build first via the test:serialize script.
import * as GoFish from "../../dist/index.js";

const {
  chart,
  spread,
  stack,
  scatter,
  rect,
  circle,
  line,
  ribbon,
  text,
  layer,
  pack,
  circles,
  jitter,
  derive,
  join,
  log,
  v,
  field,
  datum,
  literal,
  Serialize,
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

function validateDoc(doc: unknown, label: string, strict = true) {
  const r = Frontend.validate(doc, { strict });
  check(
    `${label} validates (${strict ? "strict" : "permissive"})`,
    r.valid,
    r.valid ? undefined : JSON.stringify(r.errors).slice(0, 200)
  );
  return r;
}

async function main() {
  console.log("\n# Frontend-IR emitter — toJSON()");

  check(
    "translate modifier exists on createOperator output",
    typeof scatter({ x: "hp" }).translate === "function"
  );
  check(
    "translate modifier exists on createMark output",
    typeof rect({ h: "value" }).translate === "function"
  );
  check(
    "translate modifier preserves transform modifiers",
    typeof rect({ h: "value" }).translate({ x: 10 }).cut === "function"
  );

  // -------------------------------------------------------------------------
  // Simple chart: data → spread → rect mark.
  // -------------------------------------------------------------------------
  {
    const seafood = [
      { lake: "A", species: "trout", count: 12 },
      { lake: "A", species: "bass", count: 8 },
      { lake: "B", species: "trout", count: 5 },
    ];
    const c = chart(seafood)
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(rect({ h: "count", fill: "species" }));
    const doc = await c.toJSON();
    validateDoc(doc, "simple bar chart");
    check(
      "bar chart root is chart",
      (doc.root as Frontend.ChartIR).type === "chart"
    );
    const operators = (doc.root as Frontend.ChartIR).operators!;
    check("bar chart has one operator", operators.length === 1);
    check(
      "bar chart operator is spread",
      operators[0].type === "spread" && (operators[0] as any).by === "lake"
    );
    check(
      "bar chart mark is rect",
      (doc.root as Frontend.ChartIR).mark.type === "rect"
    );
  }

  // -------------------------------------------------------------------------
  // Stack operator emits as type: "stack" (not spread w/ glue: true).
  // -------------------------------------------------------------------------
  {
    const data = [
      { x: "A", s: "a", v: 1 },
      { x: "A", s: "b", v: 2 },
    ];
    const c = chart(data)
      .flow(
        spread({ by: "x", dir: "x" }),
        stack({ by: "s", dir: "y" })
      )
      .mark(rect({ h: "v", fill: "s" }));
    const doc = await c.toJSON();
    validateDoc(doc, "spread+stack chart");
    const ops = (doc.root as Frontend.ChartIR).operators!;
    check("two operators", ops.length === 2);
    check("first is spread", ops[0].type === "spread");
    check("second is stack", ops[1].type === "stack");
    check(
      "stack opts do not leak the 'glue: true' implementation detail",
      !("glue" in (ops[1] as any))
    );
  }

  // -------------------------------------------------------------------------
  // Derive operator emits opaque.
  // -------------------------------------------------------------------------
  {
    const c = chart([{ x: 1 }, { x: 2 }])
      .flow(
        derive((rows: any[]) => rows.map((r) => ({ ...r, y: r.x * 2 })))
      )
      .mark(circle({ r: 3 }));
    const doc = await c.toJSON();
    validateDoc(doc, "derive chart");
    const ops = (doc.root as Frontend.ChartIR).operators!;
    check("derive operator emits as type: derive", ops[0].type === "derive");
    check(
      "derive operator has no function body in IR",
      !("fn" in (ops[0] as any))
    );
  }

  // -------------------------------------------------------------------------
  // Join operator inlines its right table and round-trips (unlike derive,
  // a join has no opaque function body — the right table is plain JSON).
  // -------------------------------------------------------------------------
  {
    const right = [
      { k: "a", v: 1 },
      { k: "a", v: 2 },
      { k: "b", v: 3 },
    ];
    const c = chart([{ k: "a" }, { k: "b" }])
      .flow(join(right, { on: "k" }))
      .mark(circle({ r: 3 }));
    const doc = await c.toJSON();
    validateDoc(doc, "join chart");
    const ops = (doc.root as Frontend.ChartIR).operators!;
    check("join operator emits as type: join", ops[0].type === "join");
    check("join operator emits `on`", (ops[0] as any).on === "k");
    check(
      "join operator inlines `right` table as JSON",
      JSON.stringify((ops[0] as any).right) === JSON.stringify(right)
    );
    // fromJSON rebuilds the join via the registry (site 2a) and re-emits it.
    const rebuilt = Serialize.buildChart(
      doc.root,
      [{ k: "a" }, { k: "b" }],
      undefined,
      Serialize.makeTokenResolver()
    );
    const doc2 = await rebuilt.toJSON();
    const ops2 = (doc2.root as Frontend.ChartIR).operators!;
    check(
      "round-trip preserves join op",
      JSON.stringify(ops2[0]) === JSON.stringify(ops[0])
    );
  }

  // -------------------------------------------------------------------------
  // Layer combinator-form mark.
  // -------------------------------------------------------------------------
  {
    const c = chart([{ a: 1, b: 2 }])
      .mark(
        layer([
          rect({ w: 10, h: 20, fill: "steelblue" }),
          text({ text: "label", fontSize: 12 }),
        ])
      );
    const doc = await c.toJSON();
    validateDoc(doc, "layer combinator chart");
    const mark = (doc.root as Frontend.ChartIR).mark;
    check("mark is layer combinator", mark.type === "layer");
    check(
      "layer has __combinator flag",
      (mark as Frontend.CombinatorMarkIR).__combinator === true
    );
    const children = (mark as Frontend.CombinatorMarkIR).children;
    check("layer has 2 children", children.length === 2);
    check("first child is rect", children[0].type === "rect");
    check("second child is text", children[1].type === "text");
  }

  // -------------------------------------------------------------------------
  // Scatter operator with explicit x/y channels.
  // -------------------------------------------------------------------------
  {
    const c = chart([
      { mpg: 22, hp: 110 },
      { mpg: 19, hp: 150 },
    ])
      .flow(scatter({ x: "hp", y: "mpg" }))
      .mark(circle({ r: 3, fill: "steelblue" }));
    const doc = await c.toJSON();
    validateDoc(doc, "scatter chart");
    const ops = (doc.root as Frontend.ChartIR).operators!;
    check("scatter operator", ops[0].type === "scatter");
    check("scatter carries x", (ops[0] as any).x === "hp");
    check("scatter carries y", (ops[0] as any).y === "mpg");
  }

  // -------------------------------------------------------------------------
  // Axis-name `dims` (#838): carried verbatim on scatter and on a leaf mark,
  // validated against the value-or-interval schema, and round-tripped.
  // -------------------------------------------------------------------------
  {
    const c = chart([
      { bearing: 1, distance: 3 },
      { bearing: 2, distance: 5 },
    ])
      .flow(
        scatter({ dims: { theta: "bearing", r: "distance" } }),
        spread({ dir: "theta" })
      )
      .mark(rect({ dims: { theta: { size: datum(1) }, r: 4 } }));
    const doc = await c.toJSON();
    validateDoc(doc, "dims chart");
    const root = doc.root as Frontend.ChartIR;
    const ops = root.operators!;
    check(
      "scatter carries dims verbatim",
      JSON.stringify((ops[0] as any).dims) ===
        JSON.stringify({ theta: "bearing", r: "distance" })
    );
    check("spread carries dir: theta", (ops[1] as any).dir === "theta");
    check(
      "rect carries dims with a datum size",
      JSON.stringify((root.mark as any).dims) ===
        JSON.stringify({ theta: { size: { type: "datum", datum: 1 } }, r: 4 })
    );
    const rebuilt = Serialize.buildChart(
      root,
      [],
      undefined,
      Serialize.makeTokenResolver()
    );
    const doc2 = await rebuilt.toJSON();
    check(
      "round-trip preserves dims",
      JSON.stringify(doc2.root) === JSON.stringify(doc.root)
    );
    const bad = Frontend.validate(
      {
        ...doc,
        root: {
          ...root,
          mark: { type: "rect", dims: { theta: { width: 2 } } },
        },
      },
      { strict: true }
    );
    // Leaf marks only warn during the descriptor rollout (validate.ts).
    check(
      "an interval with a non-anchor key is flagged",
      bad.warnings.some((w: any) => w.message.includes('"width"'))
    );
  }

  // -------------------------------------------------------------------------
  // Log operator with a prefix.
  // -------------------------------------------------------------------------
  {
    const c = chart([{ a: 1 }])
      .flow(log("debug-label"))
      .mark(rect({}));
    const doc = await c.toJSON();
    validateDoc(doc, "log chart");
    const ops = (doc.root as Frontend.ChartIR).operators!;
    check("log operator", ops[0].type === "log");
    check("log prefix preserved", (ops[0] as any).prefix === "debug-label");
  }

  // -------------------------------------------------------------------------
  // Non-finite numbers round-trip: toJSON tags them, the validator accepts
  // the tag, and decoding before reconstruction gives the same chart.
  // -------------------------------------------------------------------------
  {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      v: (i * 7) % 23,
      w: i === 0 ? -Infinity : i,
    }));
    const c = chart(rows)
      .flow(
        scatter({
          x: "v",
          alignment: "middle",
          overlap: jitter(),
        })
      )
      .mark(circle({ r: 3 }));
    const doc = await c.toJSON();
    const root = doc.root as Frontend.ChartIR;
    check(
      "toJSON tags smoothing: Infinity",
      JSON.stringify((root.operators![0] as any).overlap.smoothing) ===
        '{"$numberDouble":"Infinity"}'
    );
    check(
      "toJSON tags -Infinity inside data rows",
      JSON.stringify((root.data as any).rows[0].w) ===
        '{"$numberDouble":"-Infinity"}'
    );
    // Through real JSON text, as a file or a bridge would carry it.
    const parsed = JSON.parse(JSON.stringify(doc));
    validateDoc(parsed, "chart with non-finite numbers");
    const decoded = Serialize.readIR(JSON.stringify(doc));
    check(
      "decode restores Infinity and -Infinity",
      (decoded.root as any).operators[0].overlap.smoothing === Infinity &&
        (decoded.root as any).data.rows[0].w === -Infinity
    );
    const rebuilt = Serialize.buildChart(
      decoded.root,
      (decoded.root as any).data.rows,
      undefined,
      Serialize.makeTokenResolver()
    );
    const doc2 = await rebuilt.toJSON();
    check(
      "the rebuilt chart re-emits the same IR",
      JSON.stringify(doc2) === JSON.stringify(doc)
    );
    const opts = { w: 300, h: 120 };
    // Item ids are node uids, which differ between two builds; compare the
    // drawing without them.
    const drawing = async (chartToDraw: any) =>
      JSON.stringify(await chartToDraw.toDisplayList(opts), (k, val) =>
        k === "id" ? undefined : val
      );
    const a = await drawing(c);
    const b = await drawing(rebuilt);
    check(
      "the rebuilt chart draws the same display list",
      a === b,
      `${a.slice(0, 120)} vs ${b.slice(0, 120)}`
    );
  }

  // -------------------------------------------------------------------------
  // Chart options propagate.
  // -------------------------------------------------------------------------
  {
    const c = chart([{ a: 1 }], { axes: true } as any).mark(rect({}));
    const doc = await c.toJSON();
    validateDoc(doc, "chart with options");
    check(
      "options.axes propagated",
      (doc.root as Frontend.ChartIR).options?.axes === true
    );
  }

  // -------------------------------------------------------------------------
  // Per-operator `axes` override propagates and validates strict.
  // -------------------------------------------------------------------------
  {
    const c = chart([
      { lake: "A", count: 1 },
      { lake: "B", count: 2 },
    ])
      .flow(
        spread({ by: "lake", dir: "x", axes: { x: false, y: true } } as any)
      )
      .mark(rect({ h: "count" }));
    const doc = await c.toJSON();
    validateDoc(doc, "spread with axes override");
    const ops = (doc.root as Frontend.ChartIR).operators!;
    check("spread carries axes object", typeof (ops[0] as any).axes === "object");
    check(
      "spread.axes.x preserved",
      (ops[0] as any).axes.x === false &&
        (ops[0] as any).axes.y === true
    );
  }

  // -------------------------------------------------------------------------
  // No-operator chart (mark only).
  // -------------------------------------------------------------------------
  {
    const c = chart([{ a: 1 }]).mark(rect({ w: 5, h: 10 }));
    const doc = await c.toJSON();
    validateDoc(doc, "no-operator chart");
    const ops = (doc.root as Frontend.ChartIR).operators;
    check(
      "operators array is empty (or absent)",
      ops === undefined || ops.length === 0
    );
  }

  // -------------------------------------------------------------------------
  // v(value) wrapper survives — appears in the channel slot as-is.
  // -------------------------------------------------------------------------
  {
    const c = chart([{ a: 1 }]).mark(rect({ fill: v("crimson") }));
    const doc = await c.toJSON();
    validateDoc(doc, "v()-wrapped channel", false /* permissive */);
    const mark = (doc.root as Frontend.ChartIR).mark as Frontend.LeafMarkIR;
    const fill = (mark as any).fill;
    check(
      "v() wrapper preserved as datum",
      fill && typeof fill === "object" && fill.type === "datum"
    );
  }

  // -------------------------------------------------------------------------
  // field() / datum() / literal() explicit channel constructors.
  // -------------------------------------------------------------------------
  console.log("\n# Explicit channel constructors (field / datum / literal)");

  // field() should produce the same runtime behavior as a bare field-name
  // string. The chart renders identically; the IR carries the field tag.
  {
    const data = [{ count: 5 }, { count: 10 }];
    const c = chart(data)
      .mark(rect({ h: field("count"), fill: literal("steelblue") }));
    const doc = await c.toJSON();
    validateDoc(doc, "field/literal explicit chart", false);
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check(
      "field('count') survives on the wire",
      mark.h && typeof mark.h === "object" && mark.h.type === "field"
    );
    check("field carries name", mark.h.name === "count");
    check(
      "literal('steelblue') survives on the wire",
      mark.fill && typeof mark.fill === "object" && mark.fill.type === "literal"
    );
    check("literal carries value", mark.fill.value === "steelblue");
  }

  // datum() is an alias for v() — same runtime tag, same wire shape.
  {
    const data = [{ a: 1 }];
    const viaDatum = await chart(data)
      .mark(rect({ fill: datum("crimson") }))
      .toJSON();
    const viaV = await chart(data).mark(rect({ fill: v("crimson") })).toJSON();
    const fillDatum = (viaDatum.root as any).mark.fill;
    const fillV = (viaV.root as any).mark.fill;
    check(
      "datum() and v() emit identical IR",
      JSON.stringify(fillDatum) === JSON.stringify(fillV)
    );
    check(
      "datum() emits type: 'datum' (Vega-Lite convention)",
      fillDatum && typeof fillDatum === "object" && fillDatum.type === "datum"
    );
  }

  // Disambiguation example: literal("count") means the string literal "count"
  // (not the column "count"); field("0.5") means the column named "0.5"
  // (not the number 0.5).
  {
    const data = [{ count: 5 }];
    const c = chart(data).mark(text({ text: literal("count") }));
    const doc = await c.toJSON();
    const txt = (doc.root as any).mark.text;
    check(
      "literal('count') is not interpreted as a field",
      txt && typeof txt === "object" && txt.type === "literal" && txt.value === "count"
    );
  }

  // -------------------------------------------------------------------------
  // Chained .name() and .label() propagate through __serialize.
  // -------------------------------------------------------------------------
  console.log("\n# Chained .name() and .label() survive toJSON");

  // .name("bars") on a leaf mark — the prior bug was that the chain
  // returned a new mark without __serialize, throwing in toJSON.
  {
    const c = chart([{ a: 1 }]).mark(rect({ h: 10 }).name("bars"));
    const doc = await c.toJSON();
    validateDoc(doc, "chart with .name()");
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check(".name('bars') survives toJSON", mark.name === "bars");
    check(".name() preserves other channel opts", mark.h === 10);
  }

  // .name(...) on a combinator-form mark.
  {
    const c = chart([{ a: 1 }]).mark(
      layer([rect({ w: 5 }), rect({ w: 10 })]).name("layered-rects")
    );
    const doc = await c.toJSON();
    validateDoc(doc, "combinator with .name()");
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check(
      "combinator .name() survives",
      mark.name === "layered-rects" &&
        mark.type === "layer" &&
        mark.__combinator === true
    );
  }

  // Chained .label("accessor", {options})
  {
    const c = chart([{ a: 1, count: 5 }]).mark(
      rect({ h: "count" }).label("count", { position: "outset", fontSize: 10 })
    );
    const doc = await c.toJSON();
    validateDoc(doc, "chart with chained .label()");
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check(".label() preserved as an array", Array.isArray(mark.label));
    check(".label() array has one entry", mark.label?.length === 1);
    check(".label() accessor preserved", mark.label?.[0]?.accessor === "count");
    check(
      ".label() options preserved",
      mark.label?.[0]?.position === "outset" &&
        mark.label?.[0]?.fontSize === 10
    );
  }

  // Two chained .label() calls on the same mark — each appends its own
  // entry to the wire array, and both round-trip through fromJSON.
  {
    const c = chart([{ a: 1, count: 5, lake: "A" }]).mark(
      rect({ h: "count" })
        .label("count", {
          position: "center",
          color: "white",
          fontWeight: "bold",
        })
        .label("lake", { position: "outset-top", fontSize: 9 })
    );
    const doc = await c.toJSON();
    validateDoc(doc, "chart with two chained .label() calls");
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check("two .label() calls preserved as a 2-entry array", mark.label?.length === 2);
    check(
      "first .label() entry preserved",
      mark.label?.[0]?.accessor === "count" &&
        mark.label?.[0]?.position === "center" &&
        mark.label?.[0]?.color === "white" &&
        mark.label?.[0]?.fontWeight === "bold"
    );
    check(
      "second .label() entry preserved",
      mark.label?.[1]?.accessor === "lake" &&
        mark.label?.[1]?.position === "outset-top" &&
        mark.label?.[1]?.fontSize === 9
    );

    const rebuilt = Serialize.buildChart(
      doc.root,
      [{ a: 1, count: 5, lake: "A" }],
      undefined,
      Serialize.makeTokenResolver()
    );
    const doc2 = await rebuilt.toJSON();
    const mark2 = (doc2.root as Frontend.ChartIR).mark as any;
    check(
      "round-trip preserves both .label() calls",
      mark2.label?.length === 2 &&
        mark2.label?.[0]?.accessor === "count" &&
        mark2.label?.[1]?.accessor === "lake"
    );
  }

  // fontFamily / fontWeight / fontStyle round-trip through toJSON/fromJSON.
  {
    const c = chart([{ a: 1, count: 5 }]).mark(
      rect({ h: "count" }).label("count", {
        fontFamily: "Georgia, serif",
        fontWeight: 700,
        fontStyle: "italic",
      })
    );
    const doc = await c.toJSON();
    validateDoc(doc, "chart with label font-style options");
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check(
      "fontFamily/fontWeight/fontStyle preserved in emitted IR",
      mark.label?.[0]?.fontFamily === "Georgia, serif" &&
        mark.label?.[0]?.fontWeight === 700 &&
        mark.label?.[0]?.fontStyle === "italic"
    );

    const rebuilt = Serialize.buildChart(
      doc.root,
      [{ a: 1, count: 5 }],
      undefined,
      Serialize.makeTokenResolver()
    );
    const doc2 = await rebuilt.toJSON();
    const mark2 = (doc2.root as Frontend.ChartIR).mark as any;
    check(
      "fontFamily/fontWeight/fontStyle round-trip",
      mark2.label?.[0]?.fontFamily === "Georgia, serif" &&
        mark2.label?.[0]?.fontWeight === 700 &&
        mark2.label?.[0]?.fontStyle === "italic"
    );
  }

  // -------------------------------------------------------------------------
  // Chained .label() on operators (#702) — the traversal form used inside
  // .flow(...), not the mark-level .label() tested above.
  // -------------------------------------------------------------------------
  console.log("\n# Chained .label() on operators survives toJSON (#702)");

  const groupData = [
    { lake: "A", species: "trout", count: 12 },
    { lake: "A", species: "bass", count: 8 },
    { lake: "B", species: "trout", count: 5 },
  ];

  // String accessor: appears in the emitted IR and survives fromJSON.
  {
    check(
      ".label exists on stack(...) operator",
      typeof stack({ by: "lake", dir: "x" }).label === "function"
    );
    check(
      ".label exists on spread(...) operator",
      typeof spread({ by: "lake", dir: "x" }).label === "function"
    );

    const built = chart(groupData)
      .flow(
        stack({ by: "lake", dir: "x" }).label("lake", {
          position: "outset-top",
        })
      )
      .mark(rect({ h: "count", fill: "species" }));
    const doc = await built.toJSON();
    validateDoc(doc, "chart with chained operator .label()");
    const op = (doc.root as Frontend.ChartIR).operators![0] as any;
    check("operator .label() preserved as an array", Array.isArray(op.label));
    check("operator .label() accessor preserved", op.label?.[0]?.accessor === "lake");
    check(
      "operator .label() options preserved",
      op.label?.[0]?.position === "outset-top"
    );

    const rebuilt = Serialize.buildChart(
      doc.root,
      groupData,
      undefined,
      Serialize.makeTokenResolver()
    );
    const doc2 = await rebuilt.toJSON();
    const op2 = (doc2.root as Frontend.ChartIR).operators![0] as any;
    check(
      "round-trip preserves operator .label()",
      op2.label?.[0]?.accessor === "lake" &&
        op2.label?.[0]?.position === "outset-top"
    );
  }

  // Repeated .label() on the same operator (traversal form) — each call
  // appends its own entry to the wire array, and both round-trip.
  {
    const built = chart(groupData)
      .flow(
        stack({ by: "lake", dir: "x" })
          .label("lake", { position: "outset-top" })
          .label(field("count").sum(), { position: "center" })
      )
      .mark(rect({ h: "count", fill: "species" }));
    const doc = await built.toJSON();
    validateDoc(doc, "chart with two chained operator .label() calls");
    const op = (doc.root as Frontend.ChartIR).operators![0] as any;
    check("two operator .label() calls preserved as a 2-entry array", op.label?.length === 2);
    check(
      "first operator .label() entry preserved",
      op.label?.[0]?.accessor === "lake" && op.label?.[0]?.position === "outset-top"
    );
    check(
      "second operator .label() entry preserved",
      op.label?.[1]?.accessor?.type === "field" &&
        op.label?.[1]?.accessor?.name === "count" &&
        op.label?.[1]?.position === "center"
    );

    const rebuilt = Serialize.buildChart(
      doc.root,
      groupData,
      undefined,
      Serialize.makeTokenResolver()
    );
    const doc2 = await rebuilt.toJSON();
    const op2 = (doc2.root as Frontend.ChartIR).operators![0] as any;
    check(
      "round-trip preserves both operator .label() calls",
      op2.label?.length === 2 &&
        op2.label?.[0]?.accessor === "lake" &&
        op2.label?.[1]?.accessor?.name === "count"
    );
  }

  // Function accessor: warns and is omitted from the emitted IR.
  {
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    let op: any;
    try {
      const built = chart(groupData)
        .flow(spread({ by: "lake", dir: "x" }).label((d: any) => d[0]?.lake))
        .mark(rect({ h: "count" }));
      const doc = await built.toJSON();
      op = (doc.root as Frontend.ChartIR).operators![0] as any;
    } finally {
      console.warn = originalWarn;
    }
    check(
      "function accessor on operator .label() warns",
      warnings.length === 1 && /function accessors aren't serializable/.test(
        String(warnings[0]?.[0])
      )
    );
    check("function accessor omitted from operator IR", op.label === undefined);
  }

  // `.translate().label()` and `.label().translate()` both serialize both
  // fields, regardless of chain order (createOperator.ts's translateOperator
  // delegates .label() back to the base operator's own setter).
  {
    const translateThenLabel = scatter({ by: "lake", x: "count" })
      .translate({ y: 5 })
      .label("lake");
    const labelThenTranslate = scatter({ by: "lake", x: "count" })
      .label("lake")
      .translate({ y: 5 });

    for (const [name, op] of [
      ["translate().label()", translateThenLabel],
      ["label().translate()", labelThenTranslate],
    ] as const) {
      const built = chart(groupData).flow(op).mark(rect({ h: "count" }));
      const doc = await built.toJSON();
      const opIR = (doc.root as Frontend.ChartIR).operators![0] as any;
      check(
        `${name} serializes translate`,
        opIR.translate?.y === 5
      );
      check(`${name} serializes label`, opIR.label?.[0]?.accessor === "lake");
    }
  }

  // -------------------------------------------------------------------------
  // Field-expression accessor on .label() (group-total aggregate labels) —
  // the redesign that replaced silently reading a group's first row.
  // -------------------------------------------------------------------------
  console.log("\n# field(...) aggregate accessor on .label() survives toJSON");

  // Mark-level .label(field(...).sum())
  {
    const built = chart(groupData)
      .flow(stack({ by: "lake", dir: "x" }))
      .mark(rect({ h: "count" }).label(field("count").sum()));
    const doc = await built.toJSON();
    validateDoc(doc, "chart with mark field-expr .label()");
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check(
      "mark field-expr .label() accessor serialized as wire object",
      mark.label?.[0]?.accessor?.type === "field" &&
        mark.label?.[0]?.accessor?.name === "count" &&
        mark.label?.[0]?.accessor?.ops?.[0]?.op === "sum"
    );

    const rebuilt = Serialize.buildChart(
      doc.root,
      groupData,
      undefined,
      Serialize.makeTokenResolver()
    );
    const doc2 = await rebuilt.toJSON();
    const mark2 = (doc2.root as Frontend.ChartIR).mark as any;
    check(
      "round-trip preserves mark field-expr .label()",
      mark2.label?.[0]?.accessor?.type === "field" &&
        mark2.label?.[0]?.accessor?.name === "count" &&
        mark2.label?.[0]?.accessor?.ops?.[0]?.op === "sum"
    );
  }

  // Operator-level .label(field(...).sum())
  {
    const built = chart(groupData)
      .flow(stack({ by: "lake", dir: "x" }).label(field("count").sum()))
      .mark(rect({ h: "count" }));
    const doc = await built.toJSON();
    validateDoc(doc, "chart with operator field-expr .label()");
    const op = (doc.root as Frontend.ChartIR).operators![0] as any;
    check(
      "operator field-expr .label() accessor serialized as wire object",
      op.label?.[0]?.accessor?.type === "field" &&
        op.label?.[0]?.accessor?.name === "count" &&
        op.label?.[0]?.accessor?.ops?.[0]?.op === "sum"
    );

    const rebuilt = Serialize.buildChart(
      doc.root,
      groupData,
      undefined,
      Serialize.makeTokenResolver()
    );
    const doc2 = await rebuilt.toJSON();
    const op2 = (doc2.root as Frontend.ChartIR).operators![0] as any;
    check(
      "round-trip preserves operator field-expr .label()",
      op2.label?.[0]?.accessor?.type === "field" &&
        op2.label?.[0]?.accessor?.name === "count" &&
        op2.label?.[0]?.accessor?.ops?.[0]?.op === "sum"
    );
  }

  // -------------------------------------------------------------------------
  // resolveLabelText: heterogeneous bare-string accessor over an array datum
  // throws loudly instead of silently reading the first row.
  // -------------------------------------------------------------------------
  console.log("\n# resolveLabelText homogeneity check");
  {
    const rows = [
      { lake: "A", count: 12 },
      { lake: "A", count: 8 },
      { lake: "B", count: 5 },
    ];
    let threw = false;
    let message = "";
    try {
      resolveLabelText("lake", rows);
    } catch (e) {
      threw = true;
      message = String((e as Error).message);
    }
    check(
      "heterogeneous bare-string accessor over an array datum throws",
      threw && message.includes("lake")
    );

    // Homogeneous case (a real `by`-field) still resolves normally.
    const homogeneousRows = rows.filter((r) => r.lake === "A");
    check(
      "homogeneous bare-string accessor over an array datum resolves",
      resolveLabelText("lake", homogeneousRows) === "A"
    );

    // An aggregate accessor over the same heterogeneous rows works fine.
    // (`.toJSON()` here — `field` comes from the built dist bundle in this
    // test file, a different module instance than the `FieldExpr` class
    // `resolveLabelText` imports from source, so `instanceof` wouldn't
    // match; the wire form is what real cross-boundary accessors look like
    // anyway, e.g. after a JSON round-trip through fromJSON.)
    check(
      "field(...).sum() over a heterogeneous array datum resolves",
      resolveLabelText(field("count").sum().toJSON(), rows) === "25"
    );

    // Empty array does not throw — no rows, no label.
    check(
      "empty array datum resolves to empty string, no throw",
      resolveLabelText("lake", []) === ""
    );

    // A field(...) accessor WITHOUT an aggregate op gets the same
    // group-constant rule as a bare string — no first-row backdoor.
    let fieldThrew = false;
    try {
      resolveLabelText(field("count").toJSON(), rows);
    } catch (e) {
      fieldThrew = true;
    }
    check(
      "aggregate-less field accessor over heterogeneous rows throws",
      fieldThrew
    );
    check(
      "aggregate-less field accessor over homogeneous rows resolves",
      resolveLabelText(field("lake").toJSON(), homogeneousRows) === "A"
    );
  }

  // Round-trip after .name() — fromJSON should recreate the named mark.
  {
    const built = chart([{ a: 1 }]).mark(
      rect({ fill: "red" }).name("named")
    );
    const doc = await built.toJSON();
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check(
      "round-trip .name() preserves field on second pass",
      mark.name === "named"
    );
  }

  // Combinator-form stack: once emitted by toJSON with no deserializer
  // factory, so fromJSON threw "Unknown combinator mark type". This test pins
  // the round trip.
  {
    const c = chart([{ a: 1 }]).mark(
      stack({ dir: "y" }, [rect({ h: 10 }), rect({ h: 20 })])
    );
    const doc = await c.toJSON();
    validateDoc(doc, "combinator-form stack");
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check("combinator stack emits", mark.type === "stack");
    check("combinator stack is flagged", mark.__combinator === true);
    check("combinator stack has children", Array.isArray(mark.children));
  }

  // Combinator-form pack (nested): toJSON flags it `__combinator`, and
  // fromJSON rebuilds it through pack's `(opts, marks)` overload.
  {
    const c = chart([{ a: 1 }]).mark(
      pack({ method: circles() }, [
        circle({ r: 10 }),
        pack({}, [circle({ r: 4 }), circle({ r: 3 })]),
      ])
    );
    const doc = await c.toJSON();
    validateDoc(doc, "combinator-form pack");
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check("combinator pack emits", mark.type === "pack");
    check("combinator pack is flagged", mark.__combinator === true);
    check(
      "combinator pack keeps method",
      mark.options?.method?.kind === "circles"
    );
    check(
      "nested combinator pack is flagged",
      mark.children?.[1]?.type === "pack" &&
        mark.children[1].__combinator === true
    );
    const rebuilt = Serialize.buildChart(
      doc.root,
      [{ a: 1 }],
      undefined,
      Serialize.makeTokenResolver()
    );
    const doc2 = await rebuilt.toJSON();
    check(
      "combinator pack round-trips through fromJSON",
      JSON.stringify((doc2.root as Frontend.ChartIR).mark) ===
        JSON.stringify(mark),
      JSON.stringify((doc2.root as Frontend.ChartIR).mark)
    );
  }

  // -------------------------------------------------------------------------
  // Relational marks (`line`/`ribbon`) — `along` option and the mark
  // carrying a `__serialize` tag through `.layer(...)` (the replacement for
  // the removed `.connect()` sugar).
  // -------------------------------------------------------------------------
  console.log("\n# relational mark `along` option");

  const connectData = [
    { g: "x", a: 1, b: 2 },
    { g: "y", a: 2, b: 3 },
    { g: "x", a: 3, b: 1 },
  ];

  // Bag-form `ribbon({ along })` stamps `along` into its own `__serialize`
  // tag verbatim (the split it implies is computed separately by
  // `ChartBuilder` and never written into `opts` — see `notes/design/
  // relational-mark-default-split.md`).
  {
    const rib = ribbon({ along: "g", opacity: 0.8 });
    check(
      "ribbon({ along }) carries along in __serialize.opts",
      (rib as any).__serialize?.opts?.along === "g"
    );
  }

  // A `.layer(line())` chart still resolves and its `.toJSON()` (the
  // producer tier's ChartBuilder) round-trips through fromJSON.
  {
    const built = chart(connectData)
      .flow(scatter({ by: "g", x: "a", y: "b" }))
      .mark(circle({ r: 4 }).name("pts"));
    const doc = await built.toJSON();
    validateDoc(doc, "layer() producer tier");
    const rebuilt = Serialize.buildChart(
      doc.root,
      connectData,
      undefined,
      Serialize.makeTokenResolver()
    );
    const doc2 = await rebuilt.toJSON();
    check(
      "round-trip preserves mark.name",
      (doc2.root as Frontend.ChartIR).mark.name ===
        (doc.root as Frontend.ChartIR).mark.name
    );
  }

  // A relational mark over rows fuses into a layer, so `.mark(line(...))`
  // returns a LayerBuilder, which has no `.name()` or `.zOrder()` in JS. A
  // named or ordered fused chart in the IR (Python can emit one) must fail
  // with the one clear error, for both modifiers, not a TypeError.
  {
    const rows = [
      { x: 1, y: 2 },
      { x: 2, y: 3 },
    ];
    const fusedJS = chart(rows)
      .flow(scatter({ x: "x", y: "y" }))
      .mark(line({}));
    check(
      "JS: a fused relational chart has no .name() or .zOrder()",
      typeof fusedJS.name !== "function" &&
        typeof fusedJS.zOrder !== "function"
    );
    const ir = {
      type: "chart",
      data: { type: "inline", rows },
      operators: [{ type: "scatter", x: "x", y: "y" }],
      mark: { type: "line" },
      options: {},
    };
    for (const [label, extra] of [
      ["name", { name: "trend" }],
      ["zOrder", { zOrder: 1 }],
    ] as const) {
      let message = "";
      try {
        Serialize.buildChart(
          { ...ir, ...extra },
          [],
          undefined,
          Serialize.makeTokenResolver()
        );
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      check(
        `fused line chart with ${label} throws the fused-layer error`,
        message.includes("fuses into a layer"),
        message || "did not throw"
      );
    }
  }

  // -------------------------------------------------------------------------
  // The deserializer's factory table agrees with the descriptor table: every
  // descriptor has a factory, and every factory has a descriptor (#691).
  // -------------------------------------------------------------------------
  {
    // Wire types the descriptor table declares that `mapMark` rebuilds
    // structurally rather than through a factory.
    const STRUCTURAL = new Set(["mark-fn"]);
    const kinds: Frontend.NodeKind[] = [
      "operator",
      "leaf-mark",
      "combinator-mark",
    ];
    const tables = kinds.map((kind) => Frontend.DESCRIPTOR_TABLES[kind]);
    const missing: string[] = [];
    for (const kind of kinds) {
      for (const type of Object.keys(Frontend.DESCRIPTOR_TABLES[kind])) {
        if (STRUCTURAL.has(type)) continue;
        const built =
          kind === "operator" &&
          Object.hasOwn(Serialize.OPERATOR_BUILDERS, type);
        if (!built && typeof Serialize.FACTORIES[type] !== "function") {
          missing.push(`${kind} ${type}`);
        }
      }
    }
    check(
      "every descriptor has a deserializer factory",
      missing.length === 0,
      missing.join(", ")
    );
    const declared = new Set(tables.flatMap((table) => Object.keys(table)));
    const orphans = Object.keys(Serialize.FACTORIES).filter(
      (type) => !declared.has(type)
    );
    check(
      "every deserializer factory has a descriptor",
      orphans.length === 0,
      orphans.join(", ")
    );
    const orphanBuilders = Object.keys(Serialize.OPERATOR_BUILDERS).filter(
      (type) => !Object.hasOwn(Frontend.OPERATORS, type)
    );
    check(
      "every hand-written operator builder has an operator descriptor",
      orphanBuilders.length === 0,
      orphanBuilders.join(", ")
    );
    check(
      "rebuild is kind-checked (no operator `layer`)",
      Serialize.rebuild("operator", "layer", {}) === undefined
    );
  }

  // -------------------------------------------------------------------------
  // toJSON keeps only the keys a construct's descriptor declares (#691).
  // -------------------------------------------------------------------------
  {
    const rows = [{ k: "a", v: 1 }];
    const doc = await chart(rows)
      .flow(spread({ by: "k", dir: "x", bogus: 1, label: false } as any))
      .mark(
        circle({
          r: 3,
          w: "v",
          bogus: 0.5,
          fillOpacity: 0.6,
          debug: false,
          opacity: (d: any) => d.v,
        } as any)
      )
      .toJSON();
    const op = (doc.root as any).operators[0];
    const mark = (doc.root as any).mark;
    check("unknown operator key is dropped", !("bogus" in op));
    check(
      "operator base field `label` is kept",
      op.label === false && op.by === "k"
    );
    check(
      "unknown leaf-mark keys are dropped",
      !("w" in mark) && !("bogus" in mark)
    );
    check("leaf-mark base field `debug` is kept", mark.debug === false);
    check("a callback channel is dropped", !("opacity" in mark));
    check(
      "declared leaf-mark keys are kept",
      mark.r === 3 && mark.fillOpacity === 0.6
    );

    const combDoc = await chart(rows)
      .mark(spread({ dir: "x", spacing: 4, bogus: 1 } as any, [rect({ w: 4, h: 4 })]))
      .toJSON();
    const comb = (combDoc.root as any).mark;
    check(
      "unknown combinator option is dropped",
      comb.options.spacing === 4 && !("bogus" in comb.options)
    );

    const undeclared: any = async () => undefined;
    undeclared.__serialize = { type: "not-a-construct", opts: {} };
    let message = "";
    try {
      await chart(rows).mark(undeclared).toJSON();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    check(
      "a mark type with no descriptor has no IR form",
      message.includes("no leaf-mark descriptor"),
      message || "did not throw"
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
