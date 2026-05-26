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
  text,
  layer,
  derive,
  log,
  v,
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

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
