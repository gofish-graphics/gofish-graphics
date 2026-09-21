/*
 * `::: gofish-ref <name> [<name> ...]` markdown container — the options table of
 * an API reference page, generated from the construct descriptor table in
 * `packages/gofish-ir/src/frontend/descriptors.ts`.
 *
 * That table is already the single source the Python factory layer is generated
 * from (`packages/gofish-python/scripts/generate.ts`), so an option's name,
 * type, default and one-line description live there and nowhere else. A page
 * writes
 *
 *   ## Parameters
 *
 *   ::: gofish-ref rect
 *   :::
 *
 * and gets the construct's `doc` line plus an `Option | Type | Default |
 * Description` table. JS pages (`docs/js/**`) show the JS field names and a
 * TS-ish type; Python pages (`docs/python/**`) show the `py` kwarg names and a
 * Python type — the language is detected from `env.relativePath`.
 *
 * Fields a construct picks up from a shared group (`boxDims`, `paint`) render as
 * their own open subsection ("Box dimensions", "Paint") below the table of the
 * construct's own fields.
 *
 * An unknown name throws, failing the build — the same stance the sibling
 * `::: gofish example:<id>` container takes on an unknown example id. The
 * reverse direction (every descriptor construct has a page in both languages)
 * is checked by `scripts/check-api-coverage.mjs`.
 *
 * The descriptor table is imported from source rather than through the
 * `gofish-ir` package export, so the docs build needs no prior
 * `pnpm --filter gofish-ir build` (the file is dependency-free TypeScript).
 */

import container from "markdown-it-container";
import {
  COMBINATOR_MARKS,
  COORDS,
  LEAF_MARKS,
  OPERATORS,
  SHARED_FIELD_GROUPS,
  resolveFields,
  type ConstructDescriptor,
  type FieldSpec,
  type FieldType,
} from "../../../../packages/gofish-ir/src/frontend/descriptors";

type Lang = "js" | "python";

const TABLES: Record<string, ConstructDescriptor>[] = [
  OPERATORS,
  LEAF_MARKS,
  COMBINATOR_MARKS,
  COORDS,
];

/** The user-facing factory name. `pyName` is the JS-and-Python-facing rename of
 *  a wire type (the compositing quartet: inside→intersect, xor→exclude,
 *  out→subtract, atop→paint), so it is the display name in both languages. */
export function displayName(d: ConstructDescriptor): string {
  return d.pyName ?? d.type;
}

/** Every descriptor entry a `gofish-ref` name may refer to — a name can match
 *  more than one table (the dual-form constructs are both an operator and a
 *  combinator mark). */
export function lookupConstructs(name: string): ConstructDescriptor[] {
  const found: ConstructDescriptor[] = [];
  for (const table of TABLES) {
    for (const d of Object.values(table)) {
      if (d.type === name || d.pyName === name) found.push(d);
    }
  }
  return found;
}

const KIND_LABEL: Record<ConstructDescriptor["kind"], string> = {
  operator: "Operator form",
  "leaf-mark": "Mark form",
  "combinator-mark": "Combinator form",
  coord: "Coordinate transform",
};

// ---------------------------------------------------------------------------
// Types and defaults, per language
// ---------------------------------------------------------------------------

function tsType(f: FieldType): string {
  switch (f.kind) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "any":
      return "any";
    case "enum":
      return f.values.map((v) => `"${v}"`).join(" | ");
    case "channel":
      switch (f.inner) {
        case "number":
          return "number | string | FieldExpr";
        case "boolean":
          return "boolean | FieldExpr";
        default:
          return "string | FieldExpr";
      }
    case "ref":
      return f.name;
    case "union":
      return f.options.map(tsType).join(" | ");
    case "array":
      return `${tsType(f.items)}[]`;
    case "tuple":
      return `[${f.items.map(tsType).join(", ")}]`;
    case "object":
      return "object";
    case "record":
      return `Record<string, ${tsType(f.valueType)}>`;
  }
}

function pyType(f: FieldType): string {
  switch (f.kind) {
    case "string":
    case "enum":
      return "str";
    case "number":
      return "float";
    case "boolean":
      return "bool";
    case "channel":
      switch (f.inner) {
        case "number":
          return "int | float | str";
        case "boolean":
          return "bool";
        default:
          return "str";
      }
    case "union":
      return f.options.map(pyType).join(" | ");
    case "array":
      return "list";
    case "tuple":
      return "tuple";
    case "object":
    case "record":
      return "dict";
    case "any":
    case "ref":
      return "Any";
  }
}

/** π-aware number formatting, so `centralAngle`'s default reads `2π` rather
 *  than `6.283185307179586`. */
function formatNumber(n: number): string {
  if (n !== 0 && Number.isFinite(n)) {
    const halves = Math.round((n / Math.PI) * 2);
    if (Math.abs(n - (halves * Math.PI) / 2) < 1e-12) {
      if (halves === 2) return "π";
      if (halves === -2) return "-π";
      if (halves === 1) return "π/2";
      if (halves === -1) return "-π/2";
      if (halves % 2 === 0) return `${halves / 2}π`;
      return `${halves}π/2`;
    }
  }
  return String(n);
}

function formatDefault(v: unknown, lang: Lang): string {
  if (v === undefined) return "";
  if (typeof v === "number") return formatNumber(v);
  if (typeof v === "boolean") {
    return lang === "python" ? (v ? "True" : "False") : String(v);
  }
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) {
    return `[${v.map((x) => formatDefault(x, lang)).join(", ")}]`;
  }
  return JSON.stringify(v);
}

// ---------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------

/** Pipes and newlines would break out of a markdown table cell. */
function cell(text: string): string {
  return text
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/** A code span, spelled in markdown (not raw HTML) so the cell renders the same
 *  whatever `html` setting the markdown-it instance carries. */
function code(text: string): string {
  return text ? `\`${cell(text)}\`` : "";
}

/** The shared group a field came from, by FieldSpec identity — `resolveFields`
 *  copies the group's own spec objects, and a construct that overrides one
 *  (e.g. `blank`'s `w`) creates a fresh object, so identity is exactly
 *  "this field is the shared group's". */
function sharedGroupOf(spec: FieldSpec): string | null {
  for (const { label, fields } of SHARED_FIELD_GROUPS) {
    for (const candidate of Object.values(fields)) {
      if (candidate === spec) return label;
    }
  }
  return null;
}

function fieldName(name: string, spec: FieldSpec, lang: Lang): string {
  return lang === "python" ? (spec.py ?? name) : name;
}

function optionsTable(
  rows: Array<[string, FieldSpec]>,
  lang: Lang,
  md: { render(src: string): string }
): string {
  const header = [
    "| Option | Type | Default | Description |",
    "| --- | --- | --- | --- |",
  ];
  const body = rows.map(([name, spec]) => {
    const type = lang === "python" ? pyType(spec.type) : tsType(spec.type);
    const required = spec.required ? "**Required.** " : "";
    const doc = spec.doc ? cell(spec.doc) : "";
    return `| ${code(fieldName(name, spec, lang))} | ${code(type)} | ${code(
      formatDefault(spec.default, lang)
    )} | ${required}${doc} |`;
  });
  return md.render([...header, ...body].join("\n"));
}

function renderDescriptor(
  d: ConstructDescriptor,
  opts: {
    lang: Lang;
    md: { render(src: string): string };
    heading: string | null;
  }
): string {
  const { lang, md, heading } = opts;
  const fields = Object.entries(resolveFields(d));

  const own: Array<[string, FieldSpec]> = [];
  const groups = new Map<string, Array<[string, FieldSpec]>>();
  for (const [name, spec] of fields) {
    const label = sharedGroupOf(spec);
    if (label == null) {
      own.push([name, spec]);
    } else {
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push([name, spec]);
    }
  }

  const parts: string[] = [];
  if (heading) parts.push(md.render(heading));
  if (d.doc) parts.push(md.render(d.doc));
  parts.push(
    own.length ? optionsTable(own, lang, md) : md.render("_No options._")
  );
  for (const [label, rows] of groups) {
    // An open subsection, not a collapsed block: the shared channels (`w`, `h`,
    // `fill`, ...) are as much a part of the construct's surface as its own
    // fields, so they read inline under their group's heading.
    parts.push(md.render(`#### ${label}`) + optionsTable(rows, lang, md));
  }
  return parts.join("\n");
}

/** Distinct by resolved field set: the dual-form constructs (spread, stack,
 *  line, ...) carry the same fields in both tables and render once; `treemap`,
 *  whose combinator form adds `key`, renders one labeled table per form. */
function renderName(
  name: string,
  opts: { lang: Lang; md: { render(src: string): string }; titled: boolean }
): string {
  const found = lookupConstructs(name);
  if (found.length === 0) {
    throw new Error(
      `Unknown gofish-ref construct "${name}". It must be a construct in ` +
        `packages/gofish-ir/src/frontend/descriptors.ts (OPERATORS, LEAF_MARKS, ` +
        `COMBINATOR_MARKS or COORDS), named by its wire type or its pyName.`
    );
  }
  const byFields = new Map<string, ConstructDescriptor[]>();
  for (const d of found) {
    const key = JSON.stringify(resolveFields(d));
    if (!byFields.has(key)) byFields.set(key, []);
    byFields.get(key)!.push(d);
  }
  const variants = [...byFields.values()];
  const title = displayName(found[0]);

  return variants
    .map((group) => {
      const suffix =
        variants.length > 1 ? ` — ${KIND_LABEL[group[0].kind]}` : "";
      const heading =
        opts.titled || suffix ? `### \`${title}\`${suffix}` : null;
      return renderDescriptor(group[0], {
        lang: opts.lang,
        md: opts.md,
        heading,
      });
    })
    .join("\n");
}

export default function gofishRef(md) {
  md.use(container, "gofish-ref", {
    render(tokens, idx, _options, env) {
      if (tokens[idx].nesting !== 1) return "\n</div>\n";

      const names = tokens[idx].info.trim().split(/\s+/).slice(1);
      if (names.length === 0) {
        throw new Error(
          "`::: gofish-ref` needs at least one construct name, e.g. `::: gofish-ref rect`."
        );
      }
      const relativePath: string =
        (env && typeof env.relativePath === "string" && env.relativePath) || "";
      const lang: Lang = relativePath.startsWith("python/") ? "python" : "js";

      const body = names
        .map((name) => renderName(name, { lang, md, titled: names.length > 1 }))
        .join("\n");
      return `<div class="gofish-ref-table">\n${body}`;
    },
  });
}
