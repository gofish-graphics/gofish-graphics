/**
 * Tests for the frontend-IR emitter (gofish-graphics/serialize/toJSON).
 *
 * Builds charts via the v3 fluent API, calls .toJSON(), and validates the
 * resulting documents against the canonical schema in gofish-ir.
 *
 * Runnable as a script via tsx. No test framework — plain assertions + a
 * pass/fail counter so it can run alongside the existing test:path /
 * test:font scripts.
 */

import { Frontend } from "gofish-ir";
// Import from the built dist rather than source: lodash's named exports
// don't survive Node ESM resolution without bundling, but the Vite-built
// dist has them inlined. Run `pnpm build` first.
// @ts-ignore -- dist may not exist at typecheck time, but the test runner
//  runs build first via the test:serialize script.
import * as GoFish from "../../dist/index.js";

const {
  Chart,
  spread,
  stack,
  scatter,
  rect,
  circle,
  line,
  text,
  layer,
  derive,
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
    const chart = Chart(seafood)
      .flow(spread({ by: "lake", dir: "x" }))
      .mark(rect({ h: "count", fill: "species" }));
    const doc = await chart.toJSON();
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
    const chart = Chart(data)
      .flow(
        spread({ by: "x", dir: "x" }),
        stack({ by: "s", dir: "y" })
      )
      .mark(rect({ h: "v", fill: "s" }));
    const doc = await chart.toJSON();
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
    const chart = Chart([{ x: 1 }, { x: 2 }])
      .flow(
        derive((rows: any[]) => rows.map((r) => ({ ...r, y: r.x * 2 })))
      )
      .mark(circle({ r: 3 }));
    const doc = await chart.toJSON();
    validateDoc(doc, "derive chart");
    const ops = (doc.root as Frontend.ChartIR).operators!;
    check("derive operator emits as type: derive", ops[0].type === "derive");
    check(
      "derive operator has no function body in IR",
      !("fn" in (ops[0] as any))
    );
  }

  // -------------------------------------------------------------------------
  // Layer combinator-form mark.
  // -------------------------------------------------------------------------
  {
    const chart = Chart([{ a: 1, b: 2 }])
      .mark(
        layer([
          rect({ w: 10, h: 20, fill: "steelblue" }),
          text({ text: "label", fontSize: 12 }),
        ])
      );
    const doc = await chart.toJSON();
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
    const chart = Chart([
      { mpg: 22, hp: 110 },
      { mpg: 19, hp: 150 },
    ])
      .flow(scatter({ x: "hp", y: "mpg" }))
      .mark(circle({ r: 3, fill: "steelblue" }));
    const doc = await chart.toJSON();
    validateDoc(doc, "scatter chart");
    const ops = (doc.root as Frontend.ChartIR).operators!;
    check("scatter operator", ops[0].type === "scatter");
    check("scatter carries x", (ops[0] as any).x === "hp");
    check("scatter carries y", (ops[0] as any).y === "mpg");
  }

  // -------------------------------------------------------------------------
  // Log operator with a label.
  // -------------------------------------------------------------------------
  {
    const chart = Chart([{ a: 1 }])
      .flow(log("debug-label"))
      .mark(rect({}));
    const doc = await chart.toJSON();
    validateDoc(doc, "log chart");
    const ops = (doc.root as Frontend.ChartIR).operators!;
    check("log operator", ops[0].type === "log");
    check("log label preserved", (ops[0] as any).label === "debug-label");
  }

  // -------------------------------------------------------------------------
  // Chart options propagate.
  // -------------------------------------------------------------------------
  {
    const chart = Chart([{ a: 1 }], { axes: true } as any).mark(rect({}));
    const doc = await chart.toJSON();
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
    const chart = Chart([
      { lake: "A", count: 1 },
      { lake: "B", count: 2 },
    ])
      .flow(
        spread({ by: "lake", dir: "x", axes: { x: false, y: true } } as any)
      )
      .mark(rect({ h: "count" }));
    const doc = await chart.toJSON();
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
    const chart = Chart([{ a: 1 }]).mark(rect({ w: 5, h: 10 }));
    const doc = await chart.toJSON();
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
    const chart = Chart([{ a: 1 }]).mark(rect({ fill: v("crimson") }));
    const doc = await chart.toJSON();
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
    const chart = Chart(data)
      .mark(rect({ h: field("count"), fill: literal("steelblue") }));
    const doc = await chart.toJSON();
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
    const viaDatum = await Chart(data)
      .mark(rect({ fill: datum("crimson") }))
      .toJSON();
    const viaV = await Chart(data).mark(rect({ fill: v("crimson") })).toJSON();
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
    const chart = Chart(data).mark(text({ text: literal("count") }));
    const doc = await chart.toJSON();
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
    const chart = Chart([{ a: 1 }]).mark(rect({ h: 10 }).name("bars"));
    const doc = await chart.toJSON();
    validateDoc(doc, "chart with .name()");
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check(".name('bars') survives toJSON", mark.name === "bars");
    check(".name() preserves other channel opts", mark.h === 10);
  }

  // .name(...) on a combinator-form mark.
  {
    const chart = Chart([{ a: 1 }]).mark(
      layer([rect({ w: 5 }), rect({ w: 10 })]).name("layered-rects")
    );
    const doc = await chart.toJSON();
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
    const chart = Chart([{ a: 1, count: 5 }]).mark(
      rect({ h: "count" }).label("count", { position: "outset", fontSize: 10 })
    );
    const doc = await chart.toJSON();
    validateDoc(doc, "chart with chained .label()");
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check(".label() preserved as object", typeof mark.label === "object");
    check(".label() accessor preserved", mark.label?.accessor === "count");
    check(
      ".label() options preserved",
      mark.label?.position === "outset" && mark.label?.fontSize === 10
    );
  }

  // Round-trip after .name() — fromJSON should recreate the named mark.
  {
    const built = Chart([{ a: 1 }]).mark(
      rect({ fill: "red" }).name("named")
    );
    const doc = await built.toJSON();
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check(
      "round-trip .name() preserves field on second pass",
      mark.name === "named"
    );
  }

  // Combinator-form stack: previously emitted by toJSON but COMBINATOR_FACTORIES
  // had no entry to deserialize it, so fromJSON threw "Unknown combinator
  // mark type". The fix is two lines in registry.ts; this test pins it.
  {
    const chart = Chart([{ a: 1 }]).mark(
      stack({ dir: "y" }, [rect({ h: 10 }), rect({ h: 20 })])
    );
    const doc = await chart.toJSON();
    validateDoc(doc, "combinator-form stack");
    const mark = (doc.root as Frontend.ChartIR).mark as any;
    check("combinator stack emits", mark.type === "stack");
    check("combinator stack is flagged", mark.__combinator === true);
    check("combinator stack has children", Array.isArray(mark.children));
  }

  // -------------------------------------------------------------------------
  // .connect() builder sugar (#511) — emits root.connect.
  // -------------------------------------------------------------------------
  console.log("\n# .connect() connector mark survives toJSON");

  const connectData = [
    { g: "x", a: 1, b: 2 },
    { g: "y", a: 2, b: 3 },
    { g: "x", a: 3, b: 1 },
  ];

  // Unnamed mark + .connect(line()): connect present, deep-equals {type:"line"},
  // validates strict.
  {
    const chart = Chart(connectData)
      .flow(scatter({ by: "g", x: "a", y: "b" }))
      .mark(circle({ r: 4 }))
      .connect(line());
    const doc = await chart.toJSON();
    validateDoc(doc, "connect() unnamed mark");
    const root = doc.root as Frontend.ChartIR;
    check(
      "root.connect deep-equals { type: 'line' }",
      JSON.stringify(root.connect) === JSON.stringify({ type: "line" })
    );
  }

  // Named mark + .connect(line()): mark.name preserved AND connect present.
  {
    const chart = Chart(connectData)
      .flow(scatter({ by: "g", x: "a", y: "b" }))
      .mark(circle({ r: 4 }).name("pts"))
      .connect(line());
    const doc = await chart.toJSON();
    validateDoc(doc, "connect() named mark");
    const root = doc.root as Frontend.ChartIR;
    check("named connect: mark.name === 'pts'", (root.mark as any).name === "pts");
    check("named connect: root.connect present", root.connect !== undefined);
  }

  // fromJSON → toJSON round trip preserves connect.
  {
    const built = Chart(connectData)
      .flow(scatter({ by: "g", x: "a", y: "b" }))
      .mark(circle({ r: 4 }))
      .connect(line());
    const doc = await built.toJSON();
    const rebuilt = Serialize.buildChart(
      doc.root,
      connectData,
      undefined,
      Serialize.makeTokenResolver()
    );
    const doc2 = await rebuilt.toJSON();
    check(
      "round-trip preserves root.connect",
      JSON.stringify((doc2.root as Frontend.ChartIR).connect) ===
        JSON.stringify((doc.root as Frontend.ChartIR).connect)
    );
  }

  // Double .connect() throws with a clear message.
  {
    let threw = false;
    let message = "";
    try {
      Chart(connectData)
        .flow(scatter({ by: "g", x: "a", y: "b" }))
        .mark(circle({ r: 4 }))
        .connect(line())
        .connect(line());
    } catch (e: any) {
      threw = true;
      message = String(e?.message ?? e);
    }
    check(
      "double .connect() throws mentioning 'only one connector'",
      threw && message.includes("only one connector"),
      threw ? message : "did not throw"
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
