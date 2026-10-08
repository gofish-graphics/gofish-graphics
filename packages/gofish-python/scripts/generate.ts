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
 *    hand-written in `ast.py`, calling these cores. `_chart_opts` is the
 *    same kind of core for `chart(data, **options)` (CHART_OPTIONS), and
 *    `_label_opts` for `.label(accessor, **options)` (LABEL_OPTIONS).
 *  - `_OPTION_TYPES` + `_to_wire`: the key structure of each named option
 *    type (OPTION_TYPES) and the one interpreter that renames the keys of a
 *    nested option dict (`axes={"x": {"label_angle": 45}}`) to wire keys by
 *    the field's declared type, raising TypeError on an undeclared key.
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
  OPTION_TYPES,
  CHART_OPTIONS,
  MARK_BASE_FIELDS,
  PY_LEAF_BASE_KWARGS,
  PY_OPERATOR_BASE_KWARGS,
  LABEL_OPTIONS,
  pyKwarg,
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

function literalPyType(value: string | number | boolean): string {
  if (typeof value === "string") return "str";
  if (typeof value === "number") return "float";
  return "bool";
}

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
    case "literal":
      // Annotated by the literal's base type, like `enum` → str; the IR
      // validator checks the exact value.
      return literalPyType(f.value);
    case "array":
      return "List[Any]";
    case "union": {
      // A union of primitive kinds renders as a real Union; anything richer
      // falls back to Any.
      const prims = f.options.map((o) => {
        if (o.kind === "string") return "str";
        if (o.kind === "number") return "float";
        if (o.kind === "boolean") return "bool";
        if (o.kind === "literal") return literalPyType(o.value);
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

/** field entries in a group, as [pyName, wireKey, spec][] preserving order.
 *  This pairing IS the snake→camel table: every generated function lists its
 *  `(wireKey, pyName)` pairs and builds the IR dict under the wire key, so a
 *  Python user types `stroke_width=` and the IR still says `strokeWidth`. */
function entries(fields: FieldGroup): Array<[string, string, FieldSpec]> {
  return Object.entries(fields).map(([fieldName, spec]) => [
    pyKwarg(fieldName),
    spec.wire ?? fieldName,
    spec,
  ]);
}

function pyStr(s: string): string {
  return JSON.stringify(s);
}

// ---------------------------------------------------------------------------
// nested option dicts
// ---------------------------------------------------------------------------

/** Refs outside `OPTION_TYPES` that a generated kwarg may carry. Their values
 *  pass through unchanged, so each entry says why that is right. A ref in
 *  neither table fails generation, so a new nested type has to be declared
 *  before Python can take it. */
const PASSTHROUGH_REFS: Record<string, string> = {
  FieldAccessor:
    "built by field(...), whose dict already carries the wire keys (type, name, measure, ops)",
  AxisDimsValue:
    "a `dims` entry: a channel value or an interval {min, center, max, size, embedded}; " +
    "a channel value can itself be a dict (field(...), datum(...)), so a plain dict here " +
    "cannot be routed to the interval shape, and the interval keys are single words",
};

/** Whether a value of this type may be a Python dict. */
function acceptsDict(type: FieldType): boolean {
  switch (type.kind) {
    case "object":
    case "record":
    case "any":
    case "channel": // field(...) / datum(...) are dicts
      return true;
    case "ref":
      return type.name in OPTION_TYPES
        ? acceptsDict(OPTION_TYPES[type.name].type)
        : true;
    case "union":
      return type.options.some(acceptsDict);
    default:
      return false;
  }
}

/** The field that tells the branches of a tagged union apart: a dict value's
 *  `kind` names the branch it means. It is the convention the strategy
 *  objects (treemap `tile`, pack strategies) already follow. */
const DISCRIMINATOR = "kind";

/** The `kind` values that select an object branch of a tagged union, or null
 *  when the branch is not an object whose `kind` field is a string literal or
 *  an enum (named option types are looked through). */
function branchTags(type: FieldType): readonly string[] | null {
  if (type.kind === "ref" && type.name in OPTION_TYPES) {
    return branchTags(OPTION_TYPES[type.name].type);
  }
  if (type.kind !== "object") return null;
  const tag = type.fields[DISCRIMINATOR]?.type;
  if (tag?.kind === "enum") return tag.values;
  if (tag?.kind === "literal" && typeof tag.value === "string") {
    return [tag.value];
  }
  return null;
}

/** The tagged shape of a union's dict-shaped branches,
 *  `("tagged", "kind", {kind_value: branch_shape})`, or null when some branch
 *  has no `kind` tag or two branches share a `kind` value. */
function taggedShape(branches: FieldType[], where: string): string | null {
  const byTag = new Map<string, string>();
  for (const branch of branches) {
    const tags = branchTags(branch);
    if (tags === null) return null;
    const shape = wireShape(branch, where) ?? "None";
    for (const tag of tags) {
      if (byTag.has(tag)) return null;
      byTag.set(tag, shape);
    }
  }
  const entries = [...byTag].map(([tag, shape]) => `${pyStr(tag)}: ${shape}`);
  return `("tagged", ${pyStr(DISCRIMINATOR)}, {${entries.join(", ")}})`;
}

/** The key structure of a field type, as the Python literal `_to_wire` reads,
 *  or null when a value of this type has no option keys to rename and passes
 *  through unchanged. Object fields use the same `pyKwarg` rule as top-level
 *  kwargs. A union contributes its one dict-shaped branch (a dict value can
 *  only mean that branch). Several dict-shaped branches are allowed only as a
 *  tagged union: each branch an object whose `kind` field (a literal or enum)
 *  takes values no other branch takes, so `_to_wire` picks the branch by the
 *  dict's `kind`. Any other union with several dict-shaped branches would
 *  leave `_to_wire` guessing, so it fails generation. A record's keys are data
 *  (column names, axis names), so only its values are walked. */
function wireShape(type: FieldType, where: string): string | null {
  switch (type.kind) {
    case "object": {
      const fields = Object.entries(type.fields).map(([name, spec]) => {
        const sub = wireShape(spec.type, `${where}.${name}`);
        return `${pyStr(pyKwarg(name))}: (${pyStr(spec.wire ?? name)}, ${sub ?? "None"})`;
      });
      return `("object", {${fields.join(", ")}})`;
    }
    case "ref": {
      const named = OPTION_TYPES[type.name];
      if (named !== undefined) {
        return wireShape(named.type, type.name) === null
          ? null
          : `("ref", ${pyStr(type.name)})`;
      }
      if (type.name in PASSTHROUGH_REFS) return null;
      throw new Error(
        `${where}: t.ref("${type.name}") is neither a named option type ` +
          `(OPTION_TYPES in descriptors.ts) nor a known pass-through ref ` +
          `(PASSTHROUGH_REFS in generate.ts). Declare it before Python takes it.`
      );
    }
    case "union": {
      const dictBranches = type.options.filter(acceptsDict);
      const shapes = dictBranches.map((b) => wireShape(b, where));
      if (shapes.every((sh) => sh === null)) return null;
      if (dictBranches.length === 1) return shapes[0];
      const tagged = taggedShape(dictBranches, where);
      if (tagged !== null) return tagged;
      throw new Error(
        `${where}: a union with more than one dict-shaped branch, one of ` +
          `them with option keys, and the branches are not told apart by ` +
          `distinct \`${DISCRIMINATOR}\` values; a Python dict value could ` +
          `mean either.`
      );
    }
    case "array": {
      const sub = wireShape(type.items, `${where}[]`);
      return sub === null ? null : `("array", ${sub})`;
    }
    case "tuple": {
      const subs = type.items.map((item, i) =>
        wireShape(item, `${where}[${i}]`)
      );
      return subs.every((sh) => sh === null)
        ? null
        : `("tuple", (${subs.map((sh) => sh ?? "None").join(", ")},))`;
    }
    case "record": {
      const sub = wireShape(type.valueType, `${where}[*]`);
      return sub === null ? null : `("record", ${sub})`;
    }
    default:
      return null;
  }
}

/** The Python expression a generated function stores under a field's wire
 *  key: the kwarg itself, or, for a nested option type, the kwarg with its
 *  keys renamed by `_to_wire`. */
function wireValue(py: string, spec: FieldSpec): string {
  const shape = wireShape(spec.type, py);
  return shape === null ? py : `_to_wire(${shape}, ${py}, ${pyStr(py)})`;
}

/** The `(wireKey, value)` pair lines a generated function loops over to
 *  build its IR dict. */
function renderPairs(ents: Array<[string, string, FieldSpec]>): string {
  return ents
    .map(
      ([py, wire, spec]) => `        (${pyStr(wire)}, ${wireValue(py, spec)}),`
    )
    .join("\n");
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
  const pairs = renderPairs(ents);
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
    const pairs = renderPairs(ents);
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

// --- Nested option dicts ------------------------------------------------------
// One table entry per named option type (OPTION_TYPES), and one fixed
// interpreter. Each generated function passes a kwarg whose declared type has
// option keys through `_to_wire` with that type's shape.
parts.push(
  "\n# --- Nested option dicts -----------------------------------------------------\n"
);
{
  const optionTypes = Object.entries(OPTION_TYPES)
    .map(([name, spec]) => [name, wireShape(spec.type, name)] as const)
    .filter(([, shape]) => shape !== null)
    .map(([name, shape]) => `    ${pyStr(name)}: ${shape},`);
  parts.push(
    [
      `# The key structure of each named option type (descriptors.ts OPTION_TYPES):`,
      `# ("object", {py_key: (wire_key, shape)}), ("ref", name), ("array", shape),`,
      `# ("tuple", (shape, ...)), ("record", value_shape),`,
      `# ("tagged", tag_key, {tag_value: shape}); None passes a value through.`,
      `_OPTION_TYPES: Dict[str, Any] = {`,
      ...optionTypes,
      `}`,
      ``,
      ``,
      `def _to_wire(shape: Any, value: Any, path: str) -> Any:`,
      `    """Rename the keys of a nested option value from Python to wire spelling.`,
      ``,
      `    \`shape\` is the value's declared type, compiled from the descriptor table,`,
      `    so only declared option keys are renamed (\`label_angle\` to \`labelAngle\`,`,
      `    by the same rule as top-level kwargs). A key the type does not declare`,
      `    raises TypeError, as an unknown kwarg does. Record keys (column names,`,
      `    axis names) and values of any other type pass through unchanged. A`,
      `    tagged union picks its branch by the dict's tag key (\`kind\`); a missing`,
      `    or unknown tag raises TypeError.`,
      `    """`,
      `    if shape is None or value is None:`,
      `        return value`,
      `    kind = shape[0]`,
      `    if kind == "ref":`,
      `        return _to_wire(_OPTION_TYPES[shape[1]], value, path)`,
      `    if kind == "object":`,
      `        if not isinstance(value, dict):`,
      `            return value`,
      `        fields = shape[1]`,
      `        out: Dict[str, Any] = {}`,
      `        for key, item in value.items():`,
      `            if key not in fields:`,
      `                hint = next(`,
      `                    (py for py, (wire, _) in fields.items() if wire == key),`,
      `                    None,`,
      `                )`,
      `                raise TypeError(`,
      `                    f"{path} got an unexpected key {key!r}"`,
      `                    + (f" (did you mean {hint!r}?)" if hint else "")`,
      `                    + f"; expected one of {', '.join(map(repr, fields))}"`,
      `                )`,
      `            wire, sub = fields[key]`,
      `            out[wire] = _to_wire(sub, item, f"{path}[{key!r}]")`,
      `        return out`,
      `    if kind == "tagged":`,
      `        if not isinstance(value, dict):`,
      `            return value`,
      `        tag, branches = shape[1], shape[2]`,
      `        expected = ", ".join(map(repr, branches))`,
      `        if tag not in value:`,
      `            raise TypeError(f"{path} is missing the key {tag!r}; expected {tag!r} to be one of {expected}")`,
      `        branch = value[tag]`,
      `        if not isinstance(branch, str) or branch not in branches:`,
      `            raise TypeError(f"{path}[{tag!r}] got an unexpected value {branch!r}; expected one of {expected}")`,
      `        return _to_wire(branches[branch], value, path)`,
      `    if kind == "record":`,
      `        if not isinstance(value, dict):`,
      `            return value`,
      `        return {`,
      `            key: _to_wire(shape[1], item, f"{path}[{key!r}]")`,
      `            for key, item in value.items()`,
      `        }`,
      `    if kind == "array":`,
      `        if not isinstance(value, (list, tuple)):`,
      `            return value`,
      `        return [_to_wire(shape[1], item, f"{path}[{i}]") for i, item in enumerate(value)]`,
      `    if kind == "tuple":`,
      `        if not isinstance(value, (list, tuple)):`,
      `            return value`,
      `        return [`,
      `            _to_wire(sub, item, f"{path}[{i}]")`,
      `            for i, (sub, item) in enumerate(zip(shape[1], value))`,
      `        ]`,
      `    raise AssertionError(f"unknown shape kind {kind!r}")`,
    ].join("\n") + "\n"
  );
}

// --- Leaf marks -------------------------------------------------------------
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
  // The signature is closed: an undeclared kwarg is a TypeError (#1007).
  const ents = entries(fields);
  const sig = ents.map(([py, , spec]) => pySig(py, spec)).join(", ");
  const docLines = ents
    .map(([py, , spec]) => docLine(py, spec))
    .filter(Boolean);
  const docstring = [
    `    """${d.doc ?? name}`,
    ...(docLines.length ? ["", "    Args:", ...docLines] : []),
    `    """`,
  ].join("\n");
  const pairs = renderPairs(ents);
  const bodyLines = [
    `    _kw: Dict[str, Any] = {}`,
    `    for _k, _v in [`,
    pairs,
    `    ]:`,
    `        if _v is not None:`,
    `            _kw[_k] = _channel(_v)`,
  ];
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
  ["pack", "_pack_opts"],
];
for (const [opType, fnName] of DUAL_FORM_OPERATOR_CORES) {
  const d = OPERATORS[opType];
  parts.push(
    renderOptsCore(fnName, { ...d.fields, ...PY_OPERATOR_BASE_KWARGS }, d.doc) +
      "\n"
  );
}

// The combinator form of a dual-form wrapper gets its own core from its
// COMBINATOR_MARKS entry, which adds combinator-only fields (`key`) to the
// operator's. Both kinds of core take the operator base kwargs (`debug`).
for (const name of ["treemap", "spread", "stack"]) {
  const d = COMBINATOR_MARKS[name];
  parts.push(
    renderOptsCore(
      `_${name}_combinator_opts`,
      { ...resolveFields(d), ...PY_OPERATOR_BASE_KWARGS },
      d.doc
    ) + "\n"
  );
}

// `.label(accessor, **options)` on Mark and Operator: the label options.
parts.push(
  renderOptsCore(
    "_label_opts",
    LABEL_OPTIONS,
    "Options of one .label(accessor, **options) call."
  ) + "\n"
);

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

// chart(data, **options): the chart-level options (CHART_OPTIONS).
parts.push(
  renderOptsCore(
    "_chart_opts",
    CHART_OPTIONS,
    "Chart-level options for chart(data, **options)."
  ) + "\n"
);

// --- Coord transforms --------------------------------------------------------
parts.push(
  "\n# --- Coord transforms ---------------------------------------------------------\n"
);
{
  const d = COORDS["polar"];
  const ents = entries(d.fields);
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
  const pairs = renderPairs(ents);
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
