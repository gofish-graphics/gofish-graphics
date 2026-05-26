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
// Report
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
