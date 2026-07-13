// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * Generates `packages/gofish-python/gofish/_generated.py` from the
 * gofish-ir frontend descriptor table
 * (`packages/gofish-ir/src/frontend/descriptors.ts`).
 *
 * Stage 2 of the Python-wrapper codegen design
 * (apps/docs/docs/internals/design/python-wrapper-codegen.md). Run via
 * `pnpm --filter gofish-python gen` (builds gofish-ir first). Do not hand-edit
 * the generated output — add/fix descriptor entries instead.
 *
 * What gets generated, and what stays hand-written in `gofish/ast.py`:
 *  - Closed-signature **leaf mark** factories (rect, circle, ellipse, petal,
 *    text, image, polygon, blank) — pure kwargs-collection + wire rename.
 *  - Compositing-quartet + over/mask + enclose/arrow **combinator-only**
 *    marks — pure kwargs-collection, `pyName` supplies the Python-facing
 *    rename (wire `type` stays the descriptor's `type`).
 *  - `_opts(...) -> dict` **cores** for the dual-form constructs (spread,
 *    stack, scatter, group, table, treemap, line, ribbon, layer, the polar
 *    family) — the mechanical kwargs→dict half. The polymorphic
 *    operator-vs-combinator (or bag-vs-pairwise-vs-combinator) DISPATCH stays
 *    hand-written in `ast.py`, calling these cores.
 * `derive`/`resolve`/`join` (real logic: RPC bridge, ref-shape narrowing,
 * DataFrame conversion) and `palette`/`gradient`/`field`/`datum`/`normalize`/
 * `repeat`/`ref`/`selectAll` (not in the descriptor table) stay fully
 * hand-written.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEAF_MARKS,
  COMBINATOR_MARKS,
  OPERATORS,
  COORDS,
  MARK_BASE_FIELDS,
  OPERATOR_BASE_FIELDS,
  PY_LEAF_BASE_KWARGS,
  resolveFields,
  type FieldGroup,
  type FieldSpec,
  type FieldType,
} from "gofish-ir/frontend";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(HERE, "..", "gofish", "_generated.py");

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function pyType(f: FieldType): string {
  switch (f.kind) {
    case "string":
      return "str";
    case "number":
      return "float";
    case "boolean":
      return "bool";
    case "channel":
      return f.inner === "number" ? "Union[int, float, str]" : "str";
    case "enum":
      return "str";
    case "array":
      return "List[Any]";
    case "union": {
      // A union of primitive kinds renders as a real Union; anything richer
      // falls back to Any.
      const prims = f.options.map((o) => {
        if (o.kind === "string") return "str";
        if (o.kind === "number") return "float";
        if (o.kind === "boolean") return "bool";
        return null;
      });
      if (prims.every(Boolean)) return `Union[${prims.join(", ")}]`;
      return "Any";
    }
    case "any":
    case "ref":
    case "tuple":
    case "object":
    case "record":
    default:
      return "Any";
  }
}

function pySig(name: string, f: FieldSpec): string {
  // Descriptor-required wire fields are required keyword arguments: missing
  // them raised a TypeError at construction in the old hand-written wrappers,
  // and the IR validator only warns for leaf marks — the signature is the
  // only early failure point.
  if (f.required) return `${name}: ${pyType(f.type)}`;
  return `${name}: Optional[${pyType(f.type)}] = None`;
}

function docLine(name: string, f: FieldSpec): string | null {
  if (!f.doc && f.default === undefined) return null;
  let text = f.doc ?? "";
  if (f.default !== undefined) {
    text = text
      ? `${text} Default ${JSON.stringify(f.default)}.`
      : `Default ${JSON.stringify(f.default)}.`;
  }
  return `        ${name}: ${text}`;
}

/** field entries in a group, as [pyName, wireKey, spec][] preserving order. */
function entries(fields: FieldGroup): Array<[string, string, FieldSpec]> {
  return Object.entries(fields).map(([fieldName, spec]) => [
    spec.py ?? fieldName,
    spec.wire ?? fieldName,
    spec,
  ]);
}

function pyStr(s: string): string {
  return JSON.stringify(s);
}

/** Render an `_xxx_opts(...) -> dict` core: same kwargs-collection body as a
 *  leaf factory, but returns the dict instead of wrapping it in a Mark/Operator
 *  — used by hand-written dual-form dispatch in ast.py. */
function renderOptsCore(
  fnName: string,
  fields: FieldGroup,
  doc?: string
): string {
  const ents = entries(fields);
  const sig = ents.map(([py, , spec]) => pySig(py, spec)).join(", ");
  const docLines = ents
    .map(([py, , spec]) => docLine(py, spec))
    .filter(Boolean);
  const docstring = [
    `    """${doc ?? fnName}`,
    ...(docLines.length ? ["", "    Args:", ...docLines] : []),
    `    """`,
  ].join("\n");
  const pairs = ents
    .map(([py, wire]) => `        (${pyStr(wire)}, ${py}),`)
    .join("\n");
  const body = [
    `    opts: Dict[str, Any] = {}`,
    `    for _k, _v in [`,
    pairs,
    `    ]:`,
    `        if _v is not None:`,
    `            opts[_k] = _v`,
    `    return opts`,
  ].join("\n");
  return [`def ${fnName}(*, ${sig}) -> Dict[str, Any]:`, docstring, body].join(
    "\n"
  );
}

/** Combinator-only mark that always takes children + a small options set
 *  (compositing quartet, over, mask, enclose, arrow). */
function renderCombinatorFactory(opts: {
  pyName: string;
  wireType: string;
  doc?: string;
  fields: FieldGroup;
}): string {
  const { pyName, wireType, doc, fields } = opts;
  const ents = entries(fields);
  const sigParts = ents.map(([py, , spec]) => pySig(py, spec));
  const sig = sigParts.length
    ? `children: List["Mark"], *, ${sigParts.join(", ")}`
    : `children: List["Mark"]`;
  const docLines = ents
    .map(([py, , spec]) => docLine(py, spec))
    .filter(Boolean);
  const docstring = [
    `    """${doc ?? pyName}`,
    ...(docLines.length ? ["", "    Args:", ...docLines] : []),
    `    """`,
  ].join("\n");
  let body: string;
  if (ents.length === 0) {
    body = `    return Mark(${pyStr(wireType)}, _children=list(children))`;
  } else {
    const pairs = ents
      .map(([py, wire]) => `        (${pyStr(wire)}, ${py}),`)
      .join("\n");
    body = [
      `    kwargs: Dict[str, Any] = {}`,
      `    for _k, _v in [`,
      pairs,
      `    ]:`,
      `        if _v is not None:`,
      `            kwargs[_k] = _v`,
      `    return Mark(${pyStr(wireType)}, _children=list(children), **kwargs)`,
    ].join("\n");
  }
  return [`def ${pyName}(${sig}) -> Mark:`, docstring, body].join("\n");
}

// ---------------------------------------------------------------------------
// build the module
// ---------------------------------------------------------------------------

const parts: string[] = [];

parts.push(`# GENERATED by packages/gofish-python/scripts/generate.ts from gofish-ir
# descriptors — do not edit; run \`pnpm --filter gofish-python gen\`.
"""Mechanical factory layer generated from the gofish-ir frontend descriptor
table (packages/gofish-ir/src/frontend/descriptors.ts). See
apps/docs/docs/internals/design/python-wrapper-codegen.md.

\`gofish/ast.py\` imports from here for the constructs whose Python body is
pure kwargs-collection + wire-key rename; dispatch logic (dual-form
operator-vs-combinator, ref-shape narrowing, DataFrame conversion, the
lambda/RPC bridge) stays hand-written there.
"""

from typing import Any, Dict, List, Optional, Union

from .ast import Mark, _channel
`);

// --- Leaf marks -------------------------------------------------------------
const OPEN_KWARGS_MARKS = new Set(["circle", "ellipse", "petal", "blank"]);
const GENERATED_LEAF_MARKS = [
  "rect",
  "circle",
  "ellipse",
  "petal",
  "text",
  "image",
  "polygon",
  "blank",
];

parts.push(
  "\n# --- Leaf marks -------------------------------------------------------------\n"
);
for (const name of GENERATED_LEAF_MARKS) {
  const d = LEAF_MARKS[name];
  // Every leaf mark also exposes the base kwargs (`debug`); a mark's own
  // declared field of the same name wins. Labeling is done exclusively via
  // the `.label(accessor, options?)` chain — no leaf-mark `label` kwarg.
  const fields = { ...PY_LEAF_BASE_KWARGS, ...resolveFields(d) };
  const openKwargs = OPEN_KWARGS_MARKS.has(name);
  // Render manually (not via renderLeafFactory's half-baked openKwargs path)
  // for full control over the **kwargs merge.
  const ents = entries(fields);
  const sigParts = ents.map(([py, , spec]) => pySig(py, spec));
  if (openKwargs) sigParts.push("**kwargs: Any");
  const sig = sigParts.join(", ");
  const docLines = ents
    .map(([py, , spec]) => docLine(py, spec))
    .filter(Boolean);
  const docstring = [
    `    """${d.doc ?? name}`,
    ...(docLines.length ? ["", "    Args:", ...docLines] : []),
    `    """`,
  ].join("\n");
  const pairs = ents
    .map(([py, wire]) => `        (${pyStr(wire)}, ${py}),`)
    .join("\n");
  const bodyLines = [
    `    _kw: Dict[str, Any] = {}`,
    `    for _k, _v in [`,
    pairs,
    `    ]:`,
    `        if _v is not None:`,
    `            _kw[_k] = _channel(_v)`,
  ];
  if (openKwargs) {
    // Extras route through _channel too, so a callable accessor on an
    // undeclared channel (e.g. circle(cx=lambda d: ...)) bridges via the
    // derive RPC exactly like a declared one.
    bodyLines.push(`    for _k, _v in kwargs.items():`);
    bodyLines.push(`        if _v is not None:`);
    bodyLines.push(`            _kw[_k] = _channel(_v)`);
  }
  bodyLines.push(`    return Mark(${pyStr(d.type)}, **_kw)`);
  parts.push(
    [`def ${name}(*, ${sig}) -> Mark:`, docstring, bodyLines.join("\n")].join(
      "\n"
    ) + "\n"
  );
}

// --- Combinator-only marks --------------------------------------------------
parts.push(
  "\n# --- Combinator-only marks ---------------------------------------------------\n"
);
const COMBINATOR_ONLY = [
  "over",
  "inside",
  "xor",
  "out",
  "atop",
  "mask",
  "enclose",
  "position",
  "arrow",
];
for (const wireType of COMBINATOR_ONLY) {
  const d = COMBINATOR_MARKS[wireType];
  const pyName = d.pyName ?? wireType;
  parts.push(
    renderCombinatorFactory({
      pyName,
      wireType: d.type,
      doc: d.doc,
      fields: resolveFields(d),
    }) + "\n"
  );
}

// --- Dual-form operator/combinator cores ------------------------------------
parts.push(
  "\n# --- Dual-form cores (dispatch stays hand-written in ast.py) -----------------\n"
);
const DUAL_FORM_OPERATOR_CORES: Array<[string, string]> = [
  ["spread", "_spread_opts"],
  ["stack", "_stack_opts"],
  ["scatter", "_scatter_opts"],
  ["group", "_group_opts"],
  ["table", "_table_opts"],
  ["treemap", "_treemap_opts"],
];
for (const [opType, fnName] of DUAL_FORM_OPERATOR_CORES) {
  const d = OPERATORS[opType];
  // `debug` (OPERATOR_BASE_FIELDS) is the universal v3-operator escape hatch
  // (stripped JS-side by FACTORY_ONLY_KEYS) — every core accepts it.
  parts.push(
    renderOptsCore(
      fnName,
      { ...d.fields, debug: OPERATOR_BASE_FIELDS.debug },
      d.doc
    ) + "\n"
  );
}

// treemap's combinator form carries combinator-only fields (`key`, the
// JS-only `value` accessor) on top of the operator's — its own core, from
// the COMBINATOR_MARKS entry, so Treemap() doesn't reject them.
{
  const d = COMBINATOR_MARKS["treemap"];
  parts.push(
    renderOptsCore(
      "_treemap_combinator_opts",
      { ...resolveFields(d), debug: OPERATOR_BASE_FIELDS.debug },
      d.doc
    ) + "\n"
  );
}

// line/ribbon: same field list for bag/pairwise/combinator forms.
for (const name of ["line", "ribbon"]) {
  const d = LEAF_MARKS[name];
  parts.push(
    renderOptsCore(
      `_${name}_opts`,
      { ...d.fields, debug: MARK_BASE_FIELDS.debug },
      d.doc
    ) + "\n"
  );
}

// layer (marks form): key, transform, box + boxDims.
{
  const d = COMBINATOR_MARKS["layer"];
  parts.push(renderOptsCore("_layer_opts", resolveFields(d), d.doc) + "\n");
}

// --- Coord transforms --------------------------------------------------------
// Python's existing polar()/clock() spell every option in snake_case
// (inner_radius, central_angle, ...) — preserve that exact convention rather
// than the descriptor's camelCase field names, which are wire keys only.
parts.push(
  "\n# --- Coord transforms ---------------------------------------------------------\n"
);
const POLAR_PY_NAMES: Record<string, string> = {
  innerRadius: "inner_radius",
  centralAngle: "central_angle",
  startAngle: "start_angle",
  direction: "direction",
  center: "center",
};
{
  const d = COORDS["polar"];
  const ents = Object.entries(d.fields).map(
    ([wire, spec]) =>
      [POLAR_PY_NAMES[wire] ?? wire, wire, spec] as [string, string, FieldSpec]
  );
  const sig = ents.map(([py, , spec]) => pySig(py, spec)).join(", ");
  const docLines = ents
    .map(([py, , spec]) => docLine(py, spec))
    .filter(Boolean);
  const docstring = [
    `    """Shared builder for the polar-family coord configs (polar()/clock()).`,
    "",
    "    Only set options are emitted, so defaults stay on the JS side. Wire keys",
    "    are camelCase to match the JS ``PolarOptions``.",
    "",
    "    Args:",
    ...docLines,
    `    """`,
  ].join("\n");
  const pairs = ents
    .map(([py, wire]) => `        (${pyStr(wire)}, ${py}),`)
    .join("\n");
  const body = [
    `    cfg: Dict[str, Any] = {"type": transform_type}`,
    `    for _k, _v in [`,
    pairs,
    `    ]:`,
    `        if _v is not None:`,
    `            cfg[_k] = list(_v) if _k == "center" else _v`,
    `    return cfg`,
  ].join("\n");
  parts.push(
    [
      `def _polar_config(transform_type: str, *, ${sig}) -> Dict[str, Any]:`,
      docstring,
      body,
    ].join("\n") + "\n"
  );
}

writeFileSync(OUT_FILE, parts.join("\n").replace(/\n{3,}/g, "\n\n\n") + "\n");
console.log(`wrote ${OUT_FILE}`);
