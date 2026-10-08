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
  checkStrategy,
  encodeNonFinite,
  decodeNonFinite,
  FRONTEND_IR_JSON_SCHEMA,
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
  "layer with a raw-mark child accepts (component-level annotation tier)",
  validate({
    irVersion: 0,
    ir: "gofish-frontend",
    root: {
      type: "layer",
      charts: [{ type: "raw-mark", mark: { type: "rect" } }],
    },
  } as unknown as FrontendIRDocument).valid
);

check(
  "layer with a non-chart, non-raw-mark child is rejected",
  !validate({
    irVersion: 0,
    ir: "gofish-frontend",
    root: {
      type: "layer",
      charts: [{ type: "data", foo: 1 }],
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

// `dir` names an axis the way the enclosing coordinate space does (#838), so
// the wire accepts any name; an undeclared one is a render-time error.
check(
  "spread with a coord-declared dir accepts",
  validate(chart([{ type: "spread", by: "lake", dir: "theta" }])).valid
);

check(
  "spread with non-string dir rejected",
  !validate(chart([{ type: "spread", by: "lake", dir: 0 }])).valid
);

check(
  "rect with dims (value and interval) accepts",
  validate(
    chart([], {
      type: "rect",
      dims: { theta: { size: { type: "datum", datum: 1 } }, r: "value" },
    })
  ).valid
);

check(
  "scatter with dims accepts",
  validate(
    chart([
      { type: "scatter", dims: { lon: "lon", lat: { min: "a", max: "b" } } },
    ])
  ).valid
);

check(
  "scatter dims interval with a non-anchor key rejected",
  !validate(chart([{ type: "scatter", dims: { lon: { width: 2 } } }])).valid
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
  "stack with bad anchor rejected",
  !validate(chart([{ type: "stack", anchor: "elsewhere" }])).valid
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
  "log with non-string prefix rejected",
  !validate(chart([{ type: "log", prefix: 5 }])).valid
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

check(
  "axis side and labelAngle accept (strict)",
  validate(
    chart([
      {
        type: "spread",
        by: "lake",
        dir: "x",
        axes: {
          x: { side: "end", labelAngle: [45] },
          y: { labelAngle: "auto" },
        },
      },
    ]),
    { strict: true }
  ).valid
);

check(
  "axis option with unknown key rejected in strict",
  !validate(
    chart([{ type: "spread", axes: { x: { label_angle: 45 } } as any }]),
    { strict: true }
  ).valid
);

check(
  "axis labelAngle of the wrong type rejected",
  !validate(
    chart([{ type: "spread", axes: { x: { labelAngle: "45" } } as any }])
  ).valid
);

// JS types an axis title `string | false`: `false` suppresses the inferred
// title, and `true` is not a title.
check(
  "axis title false and a string accept (strict)",
  validate(
    chart([
      {
        type: "spread",
        by: "lake",
        dir: "x",
        axes: { x: { title: false }, y: { title: "Count" } },
      },
    ]),
    { strict: true }
  ).valid
);

check(
  "axis title true rejected",
  !validate(chart([{ type: "spread", axes: { x: { title: true } } as any }]))
    .valid
);

// ---------------------------------------------------------------------------
// Bug fixes — label shorthand, table.by required (from PR review)
// ---------------------------------------------------------------------------

console.log("\n# Label forms (array of specs / boolean shorthand)");

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
  "label: false accepts (boolean shorthand)",
  validate(chartWithLabel(false), { strict: true }).valid
);
check(
  "label: 'field' is rejected (bare-string shorthand was dropped)",
  !validate(chartWithLabel("amount"), { strict: true }).valid
);
check(
  "label: [{ accessor }] accepts (array-of-specs form)",
  validate(chartWithLabel([{ accessor: "amount", position: "outset" }]), {
    strict: true,
  }).valid
);
check(
  "label: [{ accessor }, { accessor }] accepts (multiple specs)",
  validate(
    chartWithLabel([
      { accessor: "amount", position: "outset" },
      { accessor: "count", position: "center", fontWeight: "bold" },
    ]),
    { strict: true }
  ).valid
);
check(
  "label: { accessor } is rejected (bare object shorthand was dropped; must be an array)",
  !validate(chartWithLabel({ accessor: "amount", position: "outset" }), {
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

// ---------------------------------------------------------------------------
// Non-finite numbers ({ "$numberDouble": ... })
// ---------------------------------------------------------------------------

console.log("\n# Non-finite numbers");
{
  const inf = { $numberDouble: "Infinity" };
  const nan = { $numberDouble: "NaN" };
  const doc = (smoothing: unknown, zOrder: unknown = 1) =>
    ({
      irVersion: 0,
      ir: "gofish-frontend",
      root: {
        type: "chart",
        data: { type: "inline", rows: [{ v: 1 }, { v: Infinity }] },
        operators: [
          {
            type: "scatter",
            x: "v",
            overlap: { kind: "noise", smoothing },
          },
        ],
        mark: { type: "circle", r: 3 },
        zOrder,
      },
    }) as unknown as FrontendIRDocument;

  const plain = validate(doc(5));
  check("a finite number field validates", plain.valid, JSON.stringify(plain));
  const tagged = validate(doc(inf, { $numberDouble: "-Infinity" }));
  check(
    "a number field accepts the tagged Infinity and -Infinity",
    tagged.valid,
    JSON.stringify(tagged.errors)
  );
  const bad = validate(doc(nan));
  check(
    "a number field rejects the tagged NaN loudly",
    !bad.valid && bad.errors.some((e) => /NaN/.test(e.message)),
    JSON.stringify(bad.errors)
  );
  const channel = validate({
    ...doc(5),
    root: { ...(doc(5).root as object), mark: { type: "circle", r: inf } },
  } as unknown as FrontendIRDocument);
  check(
    "a channel value accepts the tagged Infinity",
    channel.valid,
    JSON.stringify(channel.errors)
  );
  const silverman = validate(doc("silverman"));
  check(
    'noise smoothing accepts "silverman" (sina())',
    silverman.valid,
    JSON.stringify(silverman.errors)
  );
  check("noise smoothing rejects another name", !validate(doc("scott")).valid);
  const zero = validate(doc(0));
  check(
    "noise smoothing accepts 0 (the default)",
    zero.valid,
    JSON.stringify(zero.errors)
  );

  const raw = {
    a: Infinity,
    b: [-Infinity, 2, NaN],
    c: { d: "x", e: { f: Infinity } },
  };
  const enc = encodeNonFinite(raw);
  check(
    "encode writes every non-finite number as its tag",
    JSON.stringify(enc) ===
      '{"a":{"$numberDouble":"Infinity"},"b":[{"$numberDouble":"-Infinity"},2,{"$numberDouble":"NaN"}],"c":{"d":"x","e":{"f":{"$numberDouble":"Infinity"}}}}',
    JSON.stringify(enc)
  );
  const back = decodeNonFinite(JSON.parse(JSON.stringify(enc)));
  check(
    "decode after JSON text restores Infinity, -Infinity and NaN",
    back.a === Infinity &&
      back.b[0] === -Infinity &&
      back.b[1] === 2 &&
      Number.isNaN(back.b[2]) &&
      back.c.e.f === Infinity &&
      back.c.d === "x"
  );
  const finite = { a: 1, b: [2, { c: "x" }] };
  check(
    "encode and decode share an unchanged value",
    encodeNonFinite(finite) === finite && decodeNonFinite(finite) === finite
  );
  check(
    "a look-alike object with another key is not decoded",
    (decodeNonFinite({ x: { $numberDouble: "Infinity", y: 1 } }) as any).x
      .$numberDouble === "Infinity"
  );
  const defs = (FRONTEND_IR_JSON_SCHEMA as any).$defs;
  check(
    "the JSON Schema has one shared Number def admitting the tag",
    JSON.stringify(defs.Number).includes("$numberDouble")
  );
}

// ---------------------------------------------------------------------------
// Strategies (STRATEGIES, checkStrategy)
// ---------------------------------------------------------------------------

console.log("\n# Strategies");
{
  /** The error checkStrategy throws, or "" when it accepts the value. */
  const thrown = (
    family: Parameters<typeof checkStrategy>[0],
    value: unknown
  ): string => {
    try {
      checkStrategy(family, value, "where");
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  };
  const accepts: Array<[Parameters<typeof checkStrategy>[0], unknown]> = [
    ["Tile", { kind: "squarify" }],
    ["Tile", { kind: "squarify", ratio: 1 }],
    ["Tile", { kind: "squarify", ratio: undefined }],
    ["Tile", { kind: "sliceDice" }],
    ["Overlap", { kind: "separate", padding: 2 }],
    ["Overlap", { kind: "noise", smoothing: Infinity, randomness: "uniform" }],
    ["Overlap", { kind: "noise", smoothing: { $numberDouble: "Infinity" } }],
    ["Overlap", { kind: "noise", smoothing: "silverman", seed: 3 }],
    ["Curve", { kind: "monotone" }],
    ["Curve", { kind: "arc", direction: "down" }],
    ["Curve", { kind: "perfectArrows", bow: 0.3, padEnd: 4 }],
  ];
  for (const [family, value] of accepts) {
    const why = thrown(family, value);
    check(`${family} accepts ${JSON.stringify(value)}`, why === "", why);
  }
  const rejects: Array<[Parameters<typeof checkStrategy>[0], unknown, RegExp]> =
    [
      ["Tile", { kind: "strip" }, /where\.kind: unknown kind "strip"/],
      ["Tile", "squarify", /expected object/],
      ["Tile", { kind: "squarify", ratio: 0.5 }, /at least 1/],
      ["Tile", { kind: "slice", ratio: 2 }, /unknown field "ratio"/],
      ["Overlap", { kind: "separate", padding: -1 }, /at least 0/],
      ["Overlap", { kind: "separate", padding: Infinity }, /finite/],
      ["Overlap", { kind: "noise", randomness: "pink" }, /randomness/],
      ["Overlap", { kind: "noise", smoothing: -1 }, /smoothing/],
      ["Overlap", { kind: "noise", smoothing: NaN }, /smoothing/],
      ["Overlap", { kind: "noise", smoothing: "scott" }, /smoothing/],
      ["Overlap", { kind: "noise", seed: Infinity }, /seed: expected a finite/],
      ["Overlap", { kind: "swarm" }, /unknown kind "swarm"/],
      ["Curve", { type: "monotone" }, /unknown kind undefined/],
      ["Curve", { kind: "arc", direction: "left" }, /direction/],
      ["Curve", { kind: "linear", options: {} }, /unknown field "options"/],
    ];
  for (const [family, value, pattern] of rejects) {
    const why = thrown(family, value);
    check(
      `${family} rejects ${JSON.stringify(value)}`,
      pattern.test(why) && why.includes(`the ${family} family`),
      why
    );
  }

  // The validator walks a strategy option the same way.
  const doc = (tile: unknown) =>
    ({
      irVersion: 0,
      ir: "gofish-frontend",
      root: {
        type: "chart",
        data: { type: "inline", rows: [] },
        operators: [{ type: "treemap", tile }],
        mark: { type: "rect" },
      },
    }) as unknown as FrontendIRDocument;
  const unknownKind = validate(doc({ kind: "strip" }));
  check(
    "the validator names an unknown strategy kind",
    !unknownKind.valid &&
      unknownKind.errors.some(
        (e) =>
          /tile\.kind$/.test(e.path) && /unknown kind "strip"/.test(e.message)
      ),
    JSON.stringify(unknownKind)
  );
  check(
    "the validator checks a strategy's param bounds",
    !validate(doc({ kind: "squarify", ratio: 0 })).valid
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
