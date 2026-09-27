/**
 * Writes tests/llm-bench/context/cheatsheet.md: the handwritten intro
 * (context/cheatsheet-intro.md) followed by terse tables of every public
 * operator, mark, combinator and coordinate transform, generated from the
 * construct descriptors (packages/gofish-ir/src/frontend/descriptors.ts), so
 * the tables follow the API. Every name printed is checked against the
 * exports of packages/gofish-graphics/src/lib.ts, and so is every name the
 * intro calls.
 *
 *   pnpm --filter @gofish/tests exec tsx scripts/llm-bench/make-cheatsheet.ts [--check]
 *
 * `--check` exits non-zero when the file on disk is out of date.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";
import type {
  ConstructDescriptor,
  FieldSpec,
  FieldType,
} from "gofish-ir/frontend";
import { ModelTokenCounter } from "./codestats";
import { DEFAULT_MODEL } from "./cost";
import { apiKey } from "./model";
import { BENCH_DIR, TOKEN_CACHE } from "./tasks";

const REPO = join(import.meta.dirname, "../../..");

// The descriptors are read from source, as the docs build reads them, so
// the cheatsheet never lags an unbuilt gofish-ir. The path is not a literal,
// which keeps the file out of this project's type check (its rootDir); the
// types come from the package.
const DESCRIPTORS = join(
  REPO,
  "packages/gofish-ir/src/frontend/descriptors.ts"
);
const {
  boxDims,
  COMBINATOR_MARKS,
  COORDS,
  LEAF_MARKS,
  OPERATORS,
  resolveFields,
}: typeof import("gofish-ir/frontend") = await import(
  pathToFileURL(DESCRIPTORS).href
);
const INTRO = join(BENCH_DIR, "context/cheatsheet-intro.md");
export const CHEATSHEET = join(BENCH_DIR, "context/cheatsheet.md");

// Which descriptors are shown. Everything else in the table is either
// internal (`over`, `mark-fn`), a debugging aid (`log`), or the explicit-
// children form of an operator or connector already listed.
const OPERATOR_NAMES = [
  "spread",
  "stack",
  "scatter",
  "group",
  "table",
  "treemap",
  "derive",
  "resolve",
  "join",
];
const MARK_NAMES = [
  "rect",
  "circle",
  "ellipse",
  "text",
  "line",
  "ribbon",
  "polygon",
  "image",
  "petal",
  "blank",
];
const COMBINATOR_NAMES = [
  "layer",
  "enclose",
  "arrow",
  "position",
  "inside",
  "xor",
  "out",
  "atop",
  "mask",
];
// wavy, bipolar and arcLengthPolar are left out: they are for diagrams, not
// charts, and every token here is sent on every call.
const COORD_NAMES = ["clock", "polar"];

/** Fields left out of every row: structural, debugging, Python-bridge, or
 *  anchor-mode details a static chart does not need. */
const OMIT = new Set([
  "debug",
  "key",
  "label",
  "translate",
  "lambdaId",
  "provenance",
  "emX",
  "emY",
  "debugBoundingBox",
  "leafIntrinsicRadiusField",
  "filter",
  "source",
  "target",
  "glue",
  "flipY",
  "round",
  "box",
  "transform",
  "sharedScale",
  "stretch",
  "stretchMin",
  "stretchMax",
  "straights",
  "blendMode",
  "mixBlendMode",
  "preserveAspectRatio",
  "fontFamily",
  "fontStyle",
]);

/** A line's and ribbon's w/h only matter for blank fusion, and from/to for
 *  connecting two ref columns (diagrams). */
const OMIT_FOR: Record<string, string[]> = {
  line: ["w", "h", "from", "to"],
  ribbon: ["w", "h", "from", "to"],
};

/** Constructs whose options are not an options object (a function), and
 *  operators that have no descriptor (filter). Handwritten; the name is
 *  still checked against lib.ts. */
const SIGNATURE: Record<string, string> = {
  derive: "`derive(fn)`, `fn(rows)` returns rows",
  filter: "`filter(pred)`, `pred(row)` returns a boolean",
};

/** Names the intro calls, checked against lib.ts like the tables. */
const INTRO_NAMES = [
  "chart",
  "selectAll",
  "field",
  "palette",
  "gradient",
  "bin",
  "filter",
];

/** The value exported from lib.ts under each name. */
function libExports(): Set<string> {
  const src = readFileSync(
    join(REPO, "packages/gofish-graphics/src/lib.ts"),
    "utf8"
  );
  const names = new Set<string>();
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g))
    for (const part of m[1].split(",")) {
      const p = part.replace(/\btype\s+/, "").trim();
      if (!p || /^type\b/.test(part.trim())) continue;
      const alias = /\bas\s+(\w+)/.exec(p);
      names.add(alias ? alias[1] : p.split(/\s/)[0]);
    }
  return names;
}

function typeText(t: FieldType): string | null {
  if (t.kind === "enum" && t.values.length <= 3)
    return t.values.map((v) => `"${v}"`).join("|");
  if (t.kind === "object") return `{ ${Object.keys(t.fields).join(", ")} }`;
  return null;
}

/** `name=default`, `name: "a"|"b"` for a short enum, or the bare name.
 *  Defaults of 0 and 1, long strings (a font stack, a color) and booleans
 *  are left out. */
function fieldText(name: string, f: FieldSpec): string {
  const d = f.default;
  const shown =
    d === undefined || typeof d === "boolean" || d === 0 || d === 1
      ? null
      : typeof d === "string"
        ? d.length > 10
          ? null
          : `"${d}"`
        : typeof d === "number" && !Number.isInteger(d)
          ? String(Math.round(d * 100) / 100)
          : JSON.stringify(d);
  const values = shown === null ? typeText(f.type) : null;
  return shown !== null
    ? `${name}=${shown}`
    : values
      ? `${name}: ${values}`
      : name;
}

const inGroup = (g: Record<string, FieldSpec>, f: FieldSpec) =>
  Object.values(g).includes(f);

/** The shared box group and the paint options, printed once above the
 *  lists. */
const BOX = "x y w h cx cy x2 y2";
const PAINT = ["fill", "stroke", "strokeWidth", "opacity"];

/** A construct's options: the box and paint groups collapsed to one entry
 *  each, omitted fields dropped. */
function optionsText(
  jsName: string,
  d: ConstructDescriptor,
  defaults: boolean
): string {
  const fields = resolveFields(d);
  const parts: string[] = [];
  let box = false;
  let paintDone = false;
  // A construct with all four paint options lists them as `[style]`.
  const hasPaint = PAINT.every((n) => n in fields);
  for (const [name, f] of Object.entries(fields)) {
    if (OMIT.has(name) || OMIT_FOR[jsName]?.includes(name)) continue;
    if (hasPaint && PAINT.includes(name)) {
      if (!paintDone) parts.push("[style]");
      paintDone = true;
      continue;
    }
    if (inGroup(boxDims, f)) {
      if (["theta", "thetaSize", "r", "rSize"].includes(name)) continue;
      if (!box) parts.push("[box]");
      box = true;
      continue;
    }
    parts.push(defaults ? fieldText(name, f) : name);
  }
  return parts.length ? parts.join(", ") : "no options";
}

/** One line per construct; constructs with the same options share a line. */
function list(title: string, rows: { name: string; text: string }[]): string {
  const merged: { name: string; text: string }[] = [];
  for (const r of rows) {
    const same = r.text && merged.find((m) => m.text === r.text);
    if (same) same.name += ` ${r.name}`;
    else merged.push({ ...r });
  }
  return [
    `## ${title}`,
    "",
    ...merged.map((r) => `- ${r.name}${r.text ? `: ${r.text}` : ""}`),
  ].join("\n");
}

export function buildCheatsheet(): string {
  const exported = libExports();
  const missing: string[] = [];
  const check = (name: string) => {
    if (!exported.has(name)) missing.push(name);
    return name;
  };
  INTRO_NAMES.forEach(check);

  // Defaults are shown for operators and marks only.
  const row = (
    d: ConstructDescriptor | undefined,
    type: string,
    defaults = true
  ): { name: string; text: string } => {
    // The JS name: the compositing marks export under their friendlier
    // names (inside -> intersect, ...), which the descriptor keeps in pyName.
    const js = check(d?.pyName ?? type);
    return SIGNATURE[js]
      ? { name: SIGNATURE[js], text: "" }
      : { name: `\`${js}\``, text: optionsText(js, d!, defaults) };
  };
  const ops = [
    ...OPERATOR_NAMES.map((n) => row(OPERATORS[n], n)),
    row(undefined, "filter"),
  ];
  const marks = MARK_NAMES.map((n) => row(LEAF_MARKS[n], n));
  const combinators = COMBINATOR_NAMES.map((n) =>
    row(COMBINATOR_MARKS[n], n, false)
  );
  const coords = COORD_NAMES.map((n) => row(COORDS[n], n, false));
  if (missing.length)
    throw new Error(
      `not exported from gofish-graphics lib.ts: ${missing.join(", ")}`
    );

  const intro = readFileSync(INTRO, "utf8").trimEnd();
  return (
    [
      intro,
      "",
      `Options (=default). [box] = ${BOX}. [style] = ${PAINT.join(" ")}.`,
      "",
      list("Operators (in `.flow()`)", ops),
      "",
      list("Marks (in `.mark()`)", marks),
      "",
      list(
        "Combinators (with children: `layer([a, b])`, `stack({ dir }, [a, b])`)",
        combinators
      ),
      "",
      list("Coordinates (`chart(data, { coord })`)", coords),
    ].join("\n") + "\n"
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = buildCheatsheet();
  if (process.argv.includes("--check")) {
    const onDisk = readFileSync(CHEATSHEET, "utf8");
    if (onDisk !== text) {
      console.error(
        `${CHEATSHEET} is out of date; run scripts/llm-bench/make-cheatsheet.ts`
      );
      process.exit(1);
    }
    console.log("cheatsheet is up to date");
  } else {
    writeFileSync(CHEATSHEET, text);
    const n = await new ModelTokenCounter(TOKEN_CACHE, apiKey()).count(
      text,
      DEFAULT_MODEL
    );
    console.log(
      `wrote ${CHEATSHEET}: ${text.length} characters, ${n.tokens} ${DEFAULT_MODEL} tokens${n.est ? " (est.)" : ""}`
    );
  }
}
