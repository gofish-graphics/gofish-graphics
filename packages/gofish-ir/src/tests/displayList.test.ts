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
  compositePlan,
  filterPlan,
  type CompositeItem,
  type DisplayFilter,
  type DisplayItem,
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

// A group filter is a CSS value or one `feColorMatrix`; a `Filter`
// strategy's own kind is not a display filter.
const filtered = (filter: unknown) => ({
  ...empty,
  items: [{ kind: "group", transform: {}, filter, children: [] }],
});
check(
  "colorMatrix filter accepts",
  validate(filtered({ kind: "colorMatrix", type: "luminanceToAlpha" })).valid
);
reject("strategy kind as a filter", filtered({ kind: "grayscale" }));
reject(
  "colorMatrix with an unknown type",
  filtered({ kind: "colorMatrix", type: "saturate" })
);

// A `matrix` has `values`, 20 numbers separated by spaces or commas; a
// `luminanceToAlpha` has none.
const identity = "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0";
const matrix = (values: unknown) =>
  filtered({ kind: "colorMatrix", type: "matrix", values });
check("matrix with 20 numbers accepts", validate(matrix(identity)).valid);
check(
  "matrix with commas, signs and exponents accepts",
  validate(
    matrix(" 0.2126,0.7152, .0722 0 0, -1e-3 +1 0 0 0 0 0 1 0 0 0 0 0 1E0 0 ")
  ).valid
);
reject("matrix without values", matrix(undefined));
reject(
  "matrix with 19 numbers",
  matrix("1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1")
);
reject("matrix with 21 numbers", matrix(`${identity} 0`));
reject("matrix with a word in values", matrix(identity.replace("1", "one")));
reject(
  "matrix with values as an array",
  matrix(identity.split(" ").map(Number))
);
reject(
  "luminanceToAlpha with values",
  filtered({ kind: "colorMatrix", type: "luminanceToAlpha", values: identity })
);

// The JSON Schema says the same.
const filterSchemas = (
  DISPLAY_LIST_JSON_SCHEMA.$defs.GroupItem.properties.filter as {
    oneOf: readonly {
      required: readonly string[];
      properties: Record<string, { const?: string; pattern?: string }>;
    }[];
  }
).oneOf;
const matrixSchema = filterSchemas.find(
  (s) => s.properties.type?.const === "matrix"
);
const lumSchema = filterSchemas.find(
  (s) => s.properties.type?.const === "luminanceToAlpha"
);
check(
  "schema: matrix requires values matching the 20-number pattern",
  matrixSchema !== undefined &&
    matrixSchema.required.includes("values") &&
    new RegExp(matrixSchema.properties.values.pattern!).test(identity) &&
    !new RegExp(matrixSchema.properties.values.pattern!).test(`${identity} 0`)
);
check(
  "schema: luminanceToAlpha takes no values",
  lumSchema !== undefined && !("values" in lumSchema.properties)
);

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
// Composite plan: the inverse mask
// ---------------------------------------------------------------------------

console.log("\n# Subtract draws an inverse mask");
const sq = (x: number, fill: string): DisplayItem => ({
  kind: "rect",
  x,
  y: 0,
  w: 10,
  h: 10,
  style: { fill },
});
const subtract: CompositeItem = {
  kind: "composite",
  operator: "subtract",
  bbox: { x: 0, y: 0, w: 15, h: 10 },
  operands: [{ paint: [sq(0, "red")] }, { paint: [sq(5, "blue")] }],
};
const plan = compositePlan(subtract, "u");
const outsideMask = plan.masks.find((m) => "outside" in m);
const inner =
  outsideMask && "outside" in outsideMask
    ? plan.masks.find((m) => m.id === outsideMask.outside)
    : undefined;
check(
  "the plan has an outside mask naming an alpha mask it holds",
  inner !== undefined && "alpha" in inner && inner.alpha.length === 1
);
const subSVG = displayListToSVG({ ...empty, items: [subtract] });
const region = 'maskUnits="userSpaceOnUse" x="0" y="0" width="15" height="10"';
// The backend draws the same plan under its own uid.
const blackMask =
  /<rect x="0" y="0" width="15" height="10" fill="#000" mask="url\(#([^)]+)\)"\/>/.exec(
    subSVG
  )?.[1];
check(
  "the black rect is masked by the plan's alpha mask",
  outsideMask !== undefined &&
    "outside" in outsideMask &&
    blackMask !== undefined &&
    blackMask.endsWith(outsideMask.outside.slice("u".length)) &&
    new RegExp(`<mask id="${blackMask}" [^>]*style="mask-type:alpha"`).test(
      subSVG
    ),
  subSVG
);
const maskTags = subSVG.match(/<mask [^>]*>/g) ?? [];
check(
  "both masks have the bbox as their region",
  maskTags.length === 2 && maskTags.every((t) => t.includes(region)),
  maskTags.join("\n")
);

// ---------------------------------------------------------------------------
// Filter plan: registered as the items draw
// ---------------------------------------------------------------------------

console.log("\n# Filter defs");
const gray: DisplayFilter = {
  kind: "colorMatrix",
  type: "matrix",
  values:
    "0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0",
};
const group = (
  filter: DisplayFilter,
  children: DisplayItem[]
): DisplayItem => ({
  kind: "group",
  transform: {},
  filter,
  children,
});
const plain = filterPlan("f");
check(
  "two equal filters (not the same object) share one def",
  plain.attr(gray) === plain.attr({ ...gray }) && plain.defs.length === 1
);
check(
  "a css filter is its value, and registers no def",
  plain.attr({ kind: "css", value: "url(#shadow)" }) === "url(#shadow)" &&
    plain.defs.length === 1
);
const filteredSVG = displayListToSVG({
  ...empty,
  items: [
    group(gray, [sq(0, "red")]),
    // A filter only a composite's operand uses.
    {
      ...subtract,
      operands: [
        {
          paint: [
            group({ kind: "colorMatrix", type: "luminanceToAlpha" }, [
              sq(0, "red"),
            ]),
          ],
        },
        { paint: [group({ ...gray }, [sq(5, "blue")])] },
      ],
    },
  ],
});
const defIds = [...filteredSVG.matchAll(/<filter id="([^"]+)"/g)].map(
  (m) => m[1]
);
const refs = [...filteredSVG.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
const ids = new Set(
  [...filteredSVG.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
);
check(
  "two filter defs for three filtered groups",
  defIds.length === 2,
  filteredSVG
);
check(
  "every url(#…) names a def that exists",
  refs.length > 0 && refs.every((r) => ids.has(r)),
  filteredSVG
);
check(
  "the filter defs come first",
  filteredSVG.indexOf("<filter ") < filteredSVG.indexOf("<g"),
  filteredSVG
);

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
