/**
 * Tests for the display-list IR schema + validator.
 *
 * Runnable as a script: `pnpm --filter gofish-ir test`. Plain assertions +
 * console.log, matching the gofish-graphics / frontend-schema convention.
 */

import {
  allExamples,
  validate,
  isDisplayListDocument,
  DISPLAY_LIST_JSON_SCHEMA,
  displayListToSVG,
  exampleBars,
  type DisplayListDocument,
} from "../display-list/index.js";

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
// Canonical examples accept
// ---------------------------------------------------------------------------

console.log("\n# Display-list examples validate");
allExamples.forEach((doc, i) => {
  const r = validate(doc);
  check(
    `example[${i}] accepts`,
    r.valid,
    r.valid ? undefined : JSON.stringify(r.errors)
  );
  check(`example[${i}] type guard`, isDisplayListDocument(doc));
});

// ---------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------

console.log("\n# Invalid documents reject");

const reject = (name: string, doc: unknown) =>
  check(name, !validate(doc).valid);

reject("non-object", 42);
reject("missing ir tag", {
  irVersion: 0,
  viewport: { w: 1, h: 1 },
  items: [],
} as unknown);
reject("wrong ir tag", {
  irVersion: 0,
  ir: "gofish-frontend",
  viewport: { w: 1, h: 1 },
  items: [],
} as unknown);
reject("bad irVersion", {
  irVersion: 1,
  ir: "gofish-display-list",
  viewport: { w: 1, h: 1 },
  items: [],
} as unknown);
reject("missing viewport", {
  irVersion: 0,
  ir: "gofish-display-list",
  items: [],
} as unknown);
reject("items not array", {
  irVersion: 0,
  ir: "gofish-display-list",
  viewport: { w: 1, h: 1 },
  items: {},
} as unknown);
reject("unknown item kind", {
  irVersion: 0,
  ir: "gofish-display-list",
  viewport: { w: 1, h: 1 },
  items: [{ kind: "blob", x: 0, y: 0 }],
} as unknown);
reject("rect missing numeric field", {
  irVersion: 0,
  ir: "gofish-display-list",
  viewport: { w: 1, h: 1 },
  items: [{ kind: "rect", x: 0, y: 0, w: 10 }],
} as unknown);
reject("path missing d", {
  irVersion: 0,
  ir: "gofish-display-list",
  viewport: { w: 1, h: 1 },
  items: [{ kind: "path" }],
} as unknown);
reject("bad role", {
  irVersion: 0,
  ir: "gofish-display-list",
  viewport: { w: 1, h: 1 },
  items: [{ kind: "rect", x: 0, y: 0, w: 1, h: 1, role: "thing" }],
} as unknown);

// An empty (but well-formed) document is valid.
const empty: DisplayListDocument = {
  irVersion: 0,
  ir: "gofish-display-list",
  viewport: { w: 100, h: 100 },
  items: [],
};
check("empty document accepts", validate(empty).valid);

// ---------------------------------------------------------------------------
// JSON Schema artifact shape
// ---------------------------------------------------------------------------

console.log("\n# JSON Schema artifact");
check(
  "schema $id is the display-list id",
  DISPLAY_LIST_JSON_SCHEMA.$id ===
    "https://gofish.graphics/schema/display-list/v0.json"
);
check(
  "schema requires the core fields",
  JSON.stringify(DISPLAY_LIST_JSON_SCHEMA.required) ===
    JSON.stringify(["irVersion", "ir", "viewport", "items"])
);

// ---------------------------------------------------------------------------
// Reference SVG backend
// ---------------------------------------------------------------------------

console.log("\n# SVG backend");
const svg = displayListToSVG(exampleBars);
check("emits an <svg> root", svg.startsWith("<svg") && svg.endsWith("</svg>"));
check(
  "carries the viewport as width/height/viewBox",
  svg.includes('width="200"') &&
    svg.includes('height="120"') &&
    svg.includes('viewBox="0 0 200 120"')
);
check("emits a <rect> for a rect item", svg.includes("<rect "));
check("emits resolved fill", svg.includes('fill="#4190c5"'));
check(
  "emits a <text> for a text item",
  svg.includes("<text ") && svg.includes(">A</text>")
);
check(
  "every item appears (3 primitives → 3 tags)",
  (svg.match(/<(rect|ellipse|path|text|image)\b/g) ?? []).length ===
    exampleBars.items.length
);

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
