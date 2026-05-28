/**
 * Tests for the frontend-IR schema + validator.
 *
 * Runnable as a script: `pnpm --filter gofish-ir test`. Uses plain assertions
 * + console.log to match the gofish-graphics test convention (tsx-runnable,
 * no test framework dep). Exits with code 1 on any failure.
 */

import {
  allExamples,
  validate,
  type FrontendIRDocument,
} from "../frontend/index.js";

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

// ---------------------------------------------------------------------------
// Examples accept (permissive and strict)
// ---------------------------------------------------------------------------

console.log("\n# Examples validate (permissive)");
for (const { name, doc } of allExamples) {
  const r = validate(doc);
  check(
    `${name} accepts in permissive mode`,
    r.valid,
    r.valid ? undefined : JSON.stringify(r.errors)
  );
}

console.log("\n# Examples validate (strict)");
for (const { name, doc } of allExamples) {
  const r = validate(doc, { strict: true });
  check(
    `${name} accepts in strict mode`,
    r.valid,
    r.valid ? undefined : JSON.stringify(r.errors)
  );
}

// ---------------------------------------------------------------------------
// Targeted rejections
// ---------------------------------------------------------------------------

console.log("\n# Rejections (structural)");

check(
  "non-object root is rejected",
  !validate(null as unknown as FrontendIRDocument).valid
);

check(
  "missing irVersion is rejected",
  !validate({
    ir: "gofish-frontend",
    root: { type: "chart", mark: { type: "rect" } },
  } as unknown as FrontendIRDocument).valid
);

check(
  "wrong irVersion is rejected",
  !validate({
    irVersion: 1,
    ir: "gofish-frontend",
    root: { type: "chart", mark: { type: "rect" } },
  } as unknown as FrontendIRDocument).valid
);

check(
  "wrong ir name is rejected",
  !validate({
    irVersion: 0,
    ir: "gofish-runtime",
    root: { type: "chart", mark: { type: "rect" } },
  } as unknown as FrontendIRDocument).valid
);

check(
  "unknown root type is rejected",
  !validate({
    irVersion: 0,
    ir: "gofish-frontend",
    root: { type: "frobnicator", mark: { type: "rect" } },
  } as unknown as FrontendIRDocument).valid
);

check(
  "missing mark on chart is rejected",
  !validate({
    irVersion: 0,
    ir: "gofish-frontend",
    root: { type: "chart" },
  } as unknown as FrontendIRDocument).valid
);

check(
  "unknown mark type is rejected",
  !validate({
    irVersion: 0,
    ir: "gofish-frontend",
    root: { type: "chart", mark: { type: "wormhole" } },
  } as unknown as FrontendIRDocument).valid
);

check(
  "unknown operator type is rejected",
  !validate({
    irVersion: 0,
    ir: "gofish-frontend",
    root: {
      type: "chart",
      operators: [{ type: "evaporate" }],
      mark: { type: "rect" },
    },
  } as unknown as FrontendIRDocument).valid
);

check(
  "ref without selection is rejected",
  !validate({
    irVersion: 0,
    ir: "gofish-frontend",
    root: { type: "chart", mark: { type: "ref" } },
  } as unknown as FrontendIRDocument).valid
);

check(
  "combinator mark with non-array children is rejected",
  !validate({
    irVersion: 0,
    ir: "gofish-frontend",
    root: {
      type: "chart",
      mark: {
        type: "layer",
        __combinator: true,
        children: "not an array",
      },
    },
  } as unknown as FrontendIRDocument).valid
);

check(
  "layer with non-chart child is rejected",
  !validate({
    irVersion: 0,
    ir: "gofish-frontend",
    root: {
      type: "layer",
      charts: [{ type: "raw-mark", mark: { type: "rect" } }],
    },
  } as unknown as FrontendIRDocument).valid
);

// ---------------------------------------------------------------------------
// Strict-mode rejects unknown fields
// ---------------------------------------------------------------------------

console.log("\n# Strict mode rejects unknown fields");

check(
  "unknown root field rejected in strict",
  !validate(
    {
      irVersion: 0,
      ir: "gofish-frontend",
      root: { type: "chart", mark: { type: "rect" } },
      extraTopLevel: "no",
    } as unknown as FrontendIRDocument,
    { strict: true }
  ).valid
);

check(
  "unknown root field accepted in permissive",
  validate({
    irVersion: 0,
    ir: "gofish-frontend",
    root: { type: "chart", mark: { type: "rect" } },
    extraTopLevel: "shrug",
  } as unknown as FrontendIRDocument).valid
);

check(
  "unknown chart field rejected in strict",
  !validate(
    {
      irVersion: 0,
      ir: "gofish-frontend",
      root: { type: "chart", mark: { type: "rect" }, unexpected: 1 },
    } as unknown as FrontendIRDocument,
    { strict: true }
  ).valid
);

check(
  "leaf marks allow unknown channel-valued fields even in strict",
  validate(
    {
      irVersion: 0,
      ir: "gofish-frontend",
      root: {
        type: "chart",
        mark: {
          type: "rect",
          h: "count",
          w: 5,
          fill: "red",
          customChannel: "foo",
        },
      },
    } as unknown as FrontendIRDocument,
    { strict: true }
  ).valid
);

// ---------------------------------------------------------------------------
// Per-operator validation (P6)
// ---------------------------------------------------------------------------

console.log("\n# Per-operator field validation");

function chart(operators: any[], mark: any = { type: "rect" }) {
  return {
    irVersion: 0,
    ir: "gofish-frontend",
    root: { type: "chart", operators, mark },
  } as unknown as FrontendIRDocument;
}

check(
  "spread with valid dir accepts",
  validate(chart([{ type: "spread", by: "lake", dir: "x" }])).valid
);

check(
  "spread with invalid dir rejected",
  !validate(chart([{ type: "spread", by: "lake", dir: "diagonal" }])).valid
);

check(
  "spread with non-string by rejected",
  !validate(chart([{ type: "spread", by: 123 }])).valid
);

check(
  "stack with valid alignment accepts",
  validate(chart([{ type: "stack", by: "s", dir: "y" }])).valid
);

check(
  "stack with bad mode rejected",
  !validate(chart([{ type: "stack", mode: "elsewhere" }])).valid
);

check(
  "group without by is rejected",
  !validate(chart([{ type: "group" }])).valid
);

check(
  "group with by accepts",
  validate(chart([{ type: "group", by: "category" }])).valid
);

check(
  "table with valid by accepts",
  validate(chart([{ type: "table", by: { x: "cat", y: "row" } }])).valid
);

check(
  "table with by missing x is rejected",
  !validate(chart([{ type: "table", by: { y: "row" } }])).valid
);

check(
  "table with by missing y is rejected",
  !validate(chart([{ type: "table", by: { x: "cat" } }])).valid
);

check(
  "table.spacing as number accepts",
  validate(chart([{ type: "table", by: { x: "a", y: "b" }, spacing: 8 }])).valid
);

check(
  "table.spacing as [number, number] accepts",
  validate(chart([{ type: "table", by: { x: "a", y: "b" }, spacing: [4, 6] }]))
    .valid
);

check(
  "table.spacing as wrong shape rejected",
  !validate(
    chart([{ type: "table", by: { x: "a", y: "b" }, spacing: "tight" }])
  ).valid
);

check(
  "log with non-string label rejected",
  !validate(chart([{ type: "log", label: 5 }])).valid
);

check(
  "derive with non-string lambdaId rejected",
  !validate(chart([{ type: "derive", lambdaId: 42 }])).valid
);

check(
  "scatter with field/literal channel constructors accepts",
  validate(
    chart([
      {
        type: "scatter",
        x: { type: "field", name: "hp" },
        y: { type: "literal", value: 0 },
      },
    ])
  ).valid
);

check(
  "scatter with field missing name rejected",
  !validate(chart([{ type: "scatter", x: { type: "field" } }])).valid
);

check(
  "scatter with literal missing value rejected",
  !validate(chart([{ type: "scatter", x: { type: "literal" } }])).valid
);

console.log("\n# Strict mode rejects unknown operator fields");

check(
  "unknown spread field rejected in strict",
  !validate(chart([{ type: "spread", by: "lake", quux: 1 }]), { strict: true })
    .valid
);

check(
  "unknown spread field accepted in permissive",
  validate(chart([{ type: "spread", by: "lake", quux: 1 }])).valid
);

// Per-operator `axes` override — boolean and object forms (matches the
// node-based axis rendering added in main).
console.log("\n# Per-operator axes overrides");

check(
  "spread with axes: true accepts (strict)",
  validate(chart([{ type: "spread", by: "lake", dir: "x", axes: true }]), {
    strict: true,
  }).valid
);

check(
  "spread with axes: false accepts (strict)",
  validate(chart([{ type: "spread", by: "lake", dir: "x", axes: false }]), {
    strict: true,
  }).valid
);

check(
  "spread with axes object form accepts (strict)",
  validate(
    chart([
      {
        type: "spread",
        by: "lake",
        dir: "x",
        axes: { x: false, y: { title: "Count" } },
      },
    ]),
    { strict: true }
  ).valid
);

check(
  "stack with axes accepts (strict)",
  validate(chart([{ type: "stack", by: "s", dir: "y", axes: { y: true } }]), {
    strict: true,
  }).valid
);

check(
  "scatter with axes accepts (strict)",
  validate(
    chart([{ type: "scatter", x: "hp", y: "mpg", axes: { x: true, y: true } }]),
    { strict: true }
  ).valid
);

check(
  "axes: 'truthy-string' rejected",
  !validate(chart([{ type: "spread", axes: "yes" }])).valid
);

check(
  "axes object with bogus title type rejected",
  !validate(chart([{ type: "spread", axes: { x: { title: 7 } } }])).valid
);

check(
  "axes object with unknown sub-key rejected in strict",
  !validate(chart([{ type: "spread", axes: { z: true } as any }]), {
    strict: true,
  }).valid
);

// ---------------------------------------------------------------------------
// Bug fixes — label shorthand, table.by required (from PR review)
// ---------------------------------------------------------------------------

console.log("\n# Label shorthand forms (true / string / object)");

function chartWithLabel(label: any) {
  return {
    irVersion: 0,
    ir: "gofish-frontend",
    root: {
      type: "chart",
      mark: { type: "rect", label },
    },
  } as unknown as FrontendIRDocument;
}

check(
  "label: true accepts (boolean shorthand)",
  validate(chartWithLabel(true), { strict: true }).valid
);
check(
  "label: 'field' accepts (string shorthand)",
  validate(chartWithLabel("amount"), { strict: true }).valid
);
check(
  "label: { accessor } accepts (canonical object form)",
  validate(chartWithLabel({ accessor: "amount", position: "outset" }), {
    strict: true,
  }).valid
);
check(
  "label: number is rejected (not a recognized shape)",
  !validate(chartWithLabel(42)).valid
);

console.log("\n# table.by is required");

check(
  "table without by is rejected",
  !validate(chart([{ type: "table" }])).valid
);
check(
  "table with by accepts",
  validate(chart([{ type: "table", by: { x: "a", y: "b" } }])).valid
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
