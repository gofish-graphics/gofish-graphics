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
 *    stack, scatter, group, table, treemap, line, ribbon, layer) — the
 *    mechanical kwargs→dict half. The polymorphic
 *    operator-vs-combinator (or bag-vs-pairwise-vs-combinator) DISPATCH stays
 *    hand-written in `ast.py`, calling these cores. `_chart_opts` is the
 *    same kind of core for `chart(data, **options)` (CHART_OPTIONS), and
 *    `_label_opts` for `.label(accessor, **options)` (LABEL_OPTIONS).
 *  - `_OPTION_TYPES` + `_to_wire`: the key structure of each named option
 *    type (OPTION_TYPES) and the one interpreter that renames the keys of a
 *    nested option dict (`axes={"x": {"label": {"angle": 45}}}`) to wire keys by
 *    the field's declared type, raising TypeError on an undeclared key.
 *  - The strategy family modules, `gofish/<family>.py` (`tile.py`,
 *    `overlap.py`, `curve.py`, `bin.py`, `calendar.py`), one factory per kind
 *    and per preset of the STRATEGIES table. Each builds
 *    `{"kind": ..., **params}` with snake_case keys, which `_to_wire` renames
 *    at the option the strategy is passed to (each family is an OPTION_TYPES
 *    entry). Each factory first checks its params at the call, from their
 *    types (`pyParamChecks`). A factory with no required param is made a
 *    bare kind (`_strategy.bare_kind`, #1133): `Curve.monotone` is the dict
 *    `Curve.monotone()` returns, and can be called to set options.
 *  - The Coord family module, `gofish/coord.py`: one factory per COORDS
 *    entry, written by the same family-module writer. Each builds the
 *    transform's `{"type": ..., **options}` wire config with camelCase keys
 *    (the `coord` option is not routed by `_to_wire`) and checks its params
 *    at the call. A coord is a function only, as in JS.
 * `derive`/`resolve`/`join` (real logic: RPC bridge, ref-shape narrowing,
 * DataFrame conversion), `field`/`datum`/`normalize`/`repeat`/`ref`/
 * `selectAll`, and the Color family module (`color.py`; see the note on
 * STRATEGIES) stay hand-written.
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
  STRATEGIES,
  SOURCES,
  pyKwarg,
  resolveFields,
  type StrategyFamily,
  type StrategyKind,
  type FieldGroup,
  type FieldSpec,
  type FieldType,
  carriesChannel,
  pyType,
  refPyClass,
  AUTHORED_REFS,
} from "gofish-ir/frontend";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(HERE, "..", "gofish", "_generated.py");

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

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
    // JSON has no Infinity; the docs spell it as JS and Python read it.
    const shown =
      typeof f.default === "number" && !Number.isFinite(f.default)
        ? String(f.default)
        : JSON.stringify(f.default);
    text = text ? `${text} Default ${shown}.` : `Default ${shown}.`;
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

/** Whether a value of this type may be a Python dict that `_to_wire` has to
 *  route. A channel value may be a dict too (field(...), datum(...)), but
 *  `_to_wire` passes those through by their class, so a channel branch never
 *  competes with a union's dict-shaped branch. */
function acceptsDict(type: FieldType): boolean {
  switch (type.kind) {
    case "object":
    case "record":
    case "any":
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
 *  objects (treemap `tile`, scatter `overlap`) already follow. */
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

/** The shape of a union's dict-shaped branches: the one branch's, or a
 *  tagged union of several, or null when none has option keys. */
function dictUnionShape(
  dictBranches: FieldType[],
  where: string
): string | null {
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
      // A value of a type with a Python class (`field(...)` builds a
      // FieldAccessor) already carries the wire keys, so it passes through,
      // as does a value that holds marks (`Mark.to_dict` writes them).
      if (refPyClass(type.name) !== undefined) return null;
      if (AUTHORED_REFS[type.name]?.holdsNodes) return null;
      throw new Error(
        `${where}: t.ref("${type.name}") is neither a named option type ` +
          `(OPTION_TYPES in descriptors.ts) nor a known pass-through ref ` +
          `(a pyClass in AUTHORED_REFS). Declare it before Python takes it.`
      );
    }
    case "union": {
      // A Python dict can only mean a dict-shaped branch and a list only a
      // list-shaped one, so the two are routed apart (`("union", dict_shape,
      // list_shape)`); within each, the branches must be told apart.
      const dict = dictUnionShape(type.options.filter(acceptsDict), where);
      const listShapes = type.options
        .filter((b) => b.kind === "array" || b.kind === "tuple")
        .map((b) => wireShape(b, where))
        .filter((sh): sh is string => sh !== null);
      if (listShapes.length > 1)
        throw new Error(
          `${where}: a union with more than one list-shaped branch with ` +
            `option keys; a Python list value could mean either.`
        );
      const [list] = listShapes;
      if (list === undefined) return dict;
      if (dict === null) return list;
      return `("union", ${dict}, ${list})`;
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
  const wired = shape === null ? py : `_to_wire(${shape}, ${py}, ${pyStr(py)})`;
  return carriesChannel(spec.type) ? `_channel(${wired})` : wired;
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
  return [
    `def ${fnName}(${sig === "" ? "" : `*, ${sig}`}) -> Dict[str, Any]:`,
    docstring,
    body,
  ].join("\n");
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

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Literal, Optional

from . import ast as _ast
from .ast import Mark, _channel

if TYPE_CHECKING:
    from .ast import ${[
      ...new Set(
        [
          ...Object.values(OPTION_TYPES).map((s) => s.pyClass),
          ...Object.values(AUTHORED_REFS).map((r) => r.pyClass),
        ].filter((c): c is string => c !== undefined)
      ),
    ]
      .sort()
      .join(", ")}
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
      `# ("tagged", tag_key, {tag_value: shape}), ("union", dict_shape, list_shape);`,
      `# None passes a value through.`,
      `_OPTION_TYPES: Dict[str, Any] = {`,
      ...optionTypes,
      `}`,
      ``,
      ``,
      `def _to_wire(shape: Any, value: Any, path: str) -> Any:`,
      `    """Rename the keys of a nested option value from Python to wire spelling.`,
      ``,
      `    \`shape\` is the value's declared type, compiled from the descriptor table,`,
      `    so only declared option keys are renamed (a snake_case key to its`,
      `    camelCase wire key, by the same rule as top-level kwargs). A key the`,
      `    type does not declare raises TypeError, as an unknown kwarg does.`,
      `    Record keys (column names,`,
      `    axis names) and values of any other type pass through unchanged. A`,
      `    tagged union picks its branch by the dict's tag key (\`kind\`); a missing`,
      `    or unknown tag raises TypeError. A channel value built by field(...) or`,
      `    datum(...) is a dict already in wire form, so it passes through too:`,
      `    that is how a \`dims\` entry tells a channel value from an interval.`,
      `    """`,
      `    if shape is None or value is None:`,
      `        return value`,
      `    if isinstance(value, (_ast.FieldAccessor, _ast.DatumValue)):`,
      `        return value`,
      `    kind = shape[0]`,
      `    if kind == "ref":`,
      `        return _to_wire(_OPTION_TYPES[shape[1]], value, path)`,
      `    if kind == "union":`,
      `        return _to_wire(shape[1] if isinstance(value, dict) else shape[2], value, path)`,
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
  "region",
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
    `            _kw[_k] = _v`,
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
  // Operator-only, like group: the wrapper in ast.py takes `by` and `dir`.
  ["partition", "_partition_opts"],
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

// line/ribbon/enclose: same field list for bag/pairwise/combinator forms.
for (const name of ["line", "ribbon", "enclose"]) {
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

// The time surface (`gofish/time.py`): one core per construct. The
// operators take the operator base kwargs; `time.transition` takes the mark
// base `debug`, as line/ribbon do.
for (const [name, fields, doc] of [
  [
    "_time_sequence_opts",
    { ...OPERATORS["time.sequence"].fields, ...PY_OPERATOR_BASE_KWARGS },
    OPERATORS["time.sequence"].doc,
  ],
  [
    "_time_history_opts",
    { ...OPERATORS["time.history"].fields, ...PY_OPERATOR_BASE_KWARGS },
    OPERATORS["time.history"].doc,
  ],
  [
    "_time_stagger_opts",
    { ...OPERATORS["time.stagger"].fields, ...PY_OPERATOR_BASE_KWARGS },
    OPERATORS["time.stagger"].doc,
  ],
  [
    "_time_transition_opts",
    {
      ...LEAF_MARKS["time.transition"].fields,
      debug: MARK_BASE_FIELDS.debug,
    },
    LEAF_MARKS["time.transition"].doc,
  ],
] as Array<[string, FieldGroup, string | undefined]>) {
  parts.push(renderOptsCore(name, fields, doc) + "\n");
}

// The sources (`gofish/sources.py`): one core per kind of the SOURCES table,
// whose result is the source's declaration in the document's `sources`.
for (const [kind, k] of Object.entries(SOURCES) as Array<
  [string, StrategyKind]
>) {
  parts.push(renderOptsCore(`_${kind}_source_opts`, k.params, k.doc) + "\n");
}

// chart(data, **options): the chart-level options (CHART_OPTIONS).
parts.push(
  renderOptsCore(
    "_chart_opts",
    CHART_OPTIONS,
    "Chart-level options for chart(data, **options)."
  ) + "\n"
);

writeFileSync(OUT_FILE, parts.join("\n").replace(/\n{3,}/g, "\n\n\n") + "\n");
console.log(`wrote ${OUT_FILE}`);

// ---------------------------------------------------------------------------
// Strategy families: one module per family, gofish/<family>.py
// ---------------------------------------------------------------------------

/** A preset param value as a Python literal. */
function pyLiteral(v: unknown): string {
  if (v === Infinity) return "math.inf";
  if (v === -Infinity) return "-math.inf";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "string" || typeof v === "number") return JSON.stringify(v);
  throw new Error(`no Python literal for preset value ${JSON.stringify(v)}`);
}

/** A Python f-string whose text is `text` taken literally, followed by the
 *  f-string source `tail` (`{v!r}`). */
function pyFStr(text: string, tail: string): string {
  return `f${JSON.stringify(text)
    .replace(/[{}]/g, (c) => c + c)
    .slice(0, -1)}${tail}"`;
}

/** A param type in words, for the error messages: `a finite number >= 0`,
 *  `one of "blue", "quasi", "uniform"`, `a number >= 0 or "silverman"`. */
function describeType(type: FieldType): string {
  switch (type.kind) {
    case "number":
      return `a${type.finite ? " finite" : ""} ${type.integer ? "whole number" : "number"}${[
        type.min !== undefined ? ` >= ${type.min}` : "",
        type.exclusiveMin !== undefined ? ` > ${type.exclusiveMin}` : "",
        type.max !== undefined ? ` <= ${type.max}` : "",
      ]
        .filter((b) => b !== "")
        .join(" and")}`;
    case "object":
      return `a dict with the keys ${Object.keys(type.fields).map(pyKwarg).join(", ")}`;
    case "tuple":
      return `a list or tuple of ${type.items.length} items: ${type.items.map(describeType).join(", ")}`;
    case "array":
      if (isTable(type)) return "a table (a list of dict rows, or a dataframe)";
      return `a list${type.minItems !== undefined ? ` of at least ${type.minItems} item${type.minItems === 1 ? "" : "s"}` : ""}, each item ${describeType(type.items)}`;
    case "string":
      return "a str";
    case "boolean":
      return "a bool";
    case "enum":
      return type.values.length === 1
        ? JSON.stringify(type.values[0])
        : `one of ${type.values.map((v) => JSON.stringify(v)).join(", ")}`;
    case "union":
      return type.options.map(describeType).join(" or ");
    case "ref":
      if (familyOf(type) !== undefined) return `a ${type.name} value`;
      throw new Error(`no Python check for a ref ${type.name} strategy param`);
    default:
      throw new Error(`no Python check for a ${type.kind} strategy param`);
  }
}

/** The Python type test for one branch of a param type, by the Python type
 *  its values have: number (an int or float, not a bool), str, or bool. */
function pyTypeTest(type: FieldType, v: string): string {
  switch (type.kind) {
    case "number":
      return type.integer
        ? `isinstance(${v}, int) and not isinstance(${v}, bool)`
        : `isinstance(${v}, (int, float)) and not isinstance(${v}, bool)`;
    case "string":
    case "enum":
      return `isinstance(${v}, str)`;
    case "boolean":
      return `isinstance(${v}, bool)`;
    case "object":
      return `isinstance(${v}, dict)`;
    case "array":
      return `isinstance(${v}, list)`;
    case "tuple":
      return `isinstance(${v}, (list, tuple))`;
    case "ref":
      if (familyOf(type) !== undefined) return `isinstance(${v}, dict)`;
      throw new Error(`no Python check for a ref ${type.name} strategy param`);
    default:
      throw new Error(`no Python check for a ${type.kind} strategy param`);
  }
}

/** The strategy family a param type names, when it is a value of one
 *  (`Animation.tween`'s `curve` is a `Curve`). Every family's values are
 *  dicts tagged by `kind`, so a param of one is checked by its tag against
 *  that family's kinds. */
function familyOf(type: FieldType): StrategyFamily | undefined {
  return type.kind === "ref" && Object.hasOwn(STRATEGIES, type.name)
    ? (STRATEGIES as Record<string, StrategyFamily>)[type.name]
    : undefined;
}

/** Whether a param type is a table: an array of rows, each a record. A
 *  Python factory takes any table `to_records` reads (a list of dict rows,
 *  or a dataframe) and puts it on the wire as dict rows. */
function isTable(type: FieldType): boolean {
  return type.kind === "array" && type.items.kind === "record";
}

/** The ValueError checks for a value already known to be of `type`'s Python
 *  type: a number's bounds (NaN is never a number on the wire, as in JS),
 *  an enum's values. `whole` is the param's full type, for the message. */
function pyValueChecks(
  type: FieldType,
  whole: FieldType,
  v: string,
  label: string
): string[] {
  const fail = (cond: string, text: string) => [
    `if ${cond}:`,
    `    raise ValueError(${pyFStr(`${label} ${text}, got `, `{${v}!r}`)})`,
  ];
  switch (type.kind) {
    case "number":
      return [
        // A Python int is always finite.
        ...(type.integer
          ? []
          : type.finite
            ? fail(`not math.isfinite(${v})`, "must be finite")
            : fail(`math.isnan(${v})`, "must not be NaN")),
        ...(type.min !== undefined
          ? fail(`${v} < ${type.min}`, `must be >= ${type.min}`)
          : []),
        ...(type.exclusiveMin !== undefined
          ? fail(
              `${v} <= ${type.exclusiveMin}`,
              `must be > ${type.exclusiveMin}`
            )
          : []),
        ...(type.max !== undefined
          ? fail(`${v} > ${type.max}`, `must be <= ${type.max}`)
          : []),
      ];
    case "array":
      // A table's rows are data; any other list is checked item by item.
      if (isTable(type)) return [];
      return [
        ...(type.minItems !== undefined
          ? fail(
              `len(${v}) < ${type.minItems}`,
              `must have at least ${type.minItems} item${type.minItems === 1 ? "" : "s"}`
            )
          : []),
        `for ${v}_item in ${v}:`,
        ...pyParamChecks(type.items, `${v}_item`, `${label} item`).map(
          (l) => `    ${l}`
        ),
      ];
    case "tuple":
      // Its length, then each item by its own type.
      return [
        ...fail(
          `len(${v}) != ${type.items.length}`,
          `must have ${type.items.length} items`
        ),
        ...type.items.flatMap((item, i) => [
          `${v}_${i} = ${v}[${i}]`,
          ...pyParamChecks(item, `${v}_${i}`, `${label}[${i}]`),
        ]),
      ];
    case "object": {
      // Its keys, then each value by its own type. A key is snake_case, as
      // in any nested option dict.
      const fields = Object.entries(type.fields);
      const keys = fields.map(([f]) => pyKwarg(f));
      const known = `(${keys.map(pyStr).join(", ")}${keys.length === 1 ? "," : ""})`;
      return [
        `for _key in ${v}:`,
        `    if _key not in ${known}:`,
        `        raise TypeError(${pyFStr(`${label} got an unexpected key `, `{_key!r}; expected ${keys.join(", ")}"`.slice(0, -1))})`,
        ...fields.flatMap(([f, spec]) => {
          const key = pyKwarg(f);
          // The value is bound to a name first: an f-string cannot hold a
          // quoted subscript before Python 3.12.
          const at = `${v}_${key}`;
          const sub = `${label}['${key}']`;
          return [
            ...(spec.required
              ? [
                  `if ${pyStr(key)} not in ${v}:`,
                  `    raise TypeError(${pyStr(`${label} is missing the key '${key}'`)})`,
                ]
              : []),
            `if ${pyStr(key)} in ${v}:`,
            `    ${at} = ${v}[${pyStr(key)}]`,
            ...pyParamChecks(spec.type, at, sub).map((l) => `    ${l}`),
          ];
        }),
      ];
    }
    case "ref": {
      // A value of another family: its tag names one of that family's kinds.
      const kinds = Object.keys(familyOf(type)!.kinds);
      return fail(
        `${v}.get("kind") not in (${kinds.map((k) => JSON.stringify(k)).join(", ")}${kinds.length === 1 ? "," : ""})`,
        `must be ${describeType(whole)}`
      );
    }
    case "enum":
      return fail(
        `${v} not in (${type.values.map((s) => JSON.stringify(s)).join(", ")}${type.values.length === 1 ? "," : ""})`,
        `must be ${describeType(whole)}`
      );
    default:
      return [];
  }
}

/** The eager checks a strategy factory runs on one param `v`, from the
 *  param's descriptor type, so a bad value fails at the Python call: a
 *  TypeError when its Python type is not one the param admits, a ValueError
 *  when it is but the value is out of range. The same constraints as the JS
 *  `checkStrategy`, which reads the same STRATEGIES table. The branches of a
 *  union are told apart by Python type. */
function pyParamChecks(type: FieldType, v: string, label: string): string[] {
  // A param that holds marks (a blob's `avoiding`) is checked where JS
  // reads it: its marks have no Python type test.
  if (type.kind === "ref" && AUTHORED_REFS[type.name]?.holdsNodes) return [];
  const branches = type.kind === "union" ? [...type.options] : [type];
  const tests = branches.map((b) => pyTypeTest(b, v));
  if (new Set(tests).size !== tests.length)
    throw new Error(
      `${label}: two branches of a strategy param share a Python type`
    );
  const typeError = `raise TypeError(${pyFStr(`${label} must be ${describeType(type)}, got `, `{type(${v}).__name__}`)})`;
  const indent = (lines: string[]) => lines.map((l) => `    ${l}`);
  if (branches.length === 1)
    return [
      `if not ${tests[0].includes(" and ") ? `(${tests[0]})` : tests[0]}:`,
      `    ${typeError}`,
      ...pyValueChecks(type, type, v, label),
    ];
  return [
    ...branches.flatMap((b, i) => {
      const checks = pyValueChecks(b, type, v, label);
      return [
        `${i === 0 ? "if" : "elif"} ${tests[i]}:`,
        ...indent(checks.length ? checks : ["pass"]),
      ];
    }),
    `else:`,
    `    ${typeError}`,
  ];
}

/** How the members of a family module spell the dict they build. */
interface FamilyWire {
  /** The key that names the choice: a strategy's `kind`, a coord's `type`. */
  tag: "kind" | "type";
  /** The param keys: `"snake"` for the snake_case kwarg names, which the
   *  option the dict is passed to renames to wire keys (`_to_wire`, by the
   *  family's OPTION_TYPES entry), as for any nested option dict; `"wire"`
   *  for the camelCase wire keys themselves, for a family whose option
   *  `_to_wire` does not route (`coord` is `t.any`). */
  keys: "snake" | "wire";
  /** A member with no required param is also a value as it is (a bare
   *  kind, #1133), as the JS family's members are. */
  bare: boolean;
}

/** One member of a family: a function that builds the family's dict. */
interface FamilyFactory {
  family: string;
  /** The Python function name. */
  name: string;
  /** The value of the dict's tag key. */
  tag: string;
  params: FieldGroup;
  /** Param values, by field name, this member sets before the caller's. */
  preset: Record<string, unknown>;
  doc: string;
  /** The param that is positional-only; the rest are keyword-only
   *  (`StrategyKind.positional`, `ConstructDescriptor.positional`). */
  positional?: string;
}

/** One member of a family module. It checks each param at the call, from
 *  its descriptor type (`pyParamChecks`), then builds `{tag: ..., **params}`
 *  with only the params set, so the defaults stay on the JS side. A table
 *  param is read into dict rows, and a tuple param goes on the wire as a
 *  list. */
function renderFamilyFactory(wire: FamilyWire, f: FamilyFactory): string {
  const { family, name, tag, params, preset, doc, positional } = f;
  if (positional !== undefined && !Object.hasOwn(params, positional))
    throw new Error(`${family}.${name}: no param ${positional}`);
  const keyOf = (field: string) =>
    wire.keys === "snake" ? pyKwarg(field) : (params[field].wire ?? field);
  // The positional param comes first.
  const fields = Object.keys(params).sort(
    (a, b) => Number(b === positional) - Number(a === positional)
  );
  const ents = fields.map(
    (field) => [field, pyKwarg(field), params[field]] as const
  );
  // A preset value is this factory's default for that param.
  const docLines = ents
    .map(([field, py, spec]) =>
      docLine(py, field in preset ? { ...spec, default: preset[field] } : spec)
    )
    .filter(Boolean);
  const docstring = docLines.length
    ? [`    """${doc}`, "", "    Args:", ...docLines, `    """`].join("\n")
    : `    """${doc}"""`;
  const head = [
    `${pyStr(wire.tag)}: ${pyStr(tag)}`,
    ...Object.entries(preset).map(
      ([field, value]) => `${pyStr(keyOf(field))}: ${pyLiteral(value)}`
    ),
  ].join(", ");
  const bare =
    wire.bare && Object.values(params).every((spec) => !spec.required)
      ? [`@bare_kind(${pyStr(family)})`]
      : [];
  if (ents.length === 0) {
    return [
      ...bare,
      `def ${name}() -> Dict[str, Any]:`,
      docstring,
      `    return {${head}}`,
    ].join("\n");
  }
  const checks = ents.flatMap(([field, py, spec]) => {
    // An optional param is checked when it is given; a required one always,
    // so None, which is no value of it, is a TypeError at the call.
    const lines = pyParamChecks(
      spec.type,
      py,
      field === positional
        ? `${family}.${name}(${py})`
        : `${family}.${name}(${py}=...)`
    );
    // A tuple, once checked, goes on the wire as a list.
    const all =
      spec.type.kind === "tuple" ? [...lines, `${py} = list(${py})`] : lines;
    return [
      // A table is read into dict rows first (a dataframe, or a list of
      // rows), when there is one.
      ...(isTable(spec.type)
        ? [
            `    if ${py} is not None:`,
            `        from .arrow_utils import to_records`,
            `        ${py} = to_records(${py})`,
          ]
        : []),
      // A param with no Python check (one that holds marks) adds no lines.
      ...(all.length === 0
        ? []
        : spec.required
          ? all.map((l) => `    ${l}`)
          : [`    if ${py} is not None:`, ...all.map((l) => `        ${l}`)]),
    ];
  });
  const body = [
    ...checks,
    `    out: Dict[str, Any] = {${head}}`,
    `    for _k, _v in [`,
    ...ents.map(([field, py]) => `        (${pyStr(keyOf(field))}, ${py}),`),
    `    ]:`,
    `        if _v is not None:`,
    `            out[_k] = _v`,
    `    return out`,
  ].join("\n");
  const sigs = ents.map(([, py, spec]) => pySig(py, spec));
  const paramList = (
    positional === undefined
      ? [`*`, ...sigs]
      : sigs.length === 1
        ? [sigs[0], `/`]
        : [sigs[0], `/`, `*`, ...sigs.slice(1)]
  ).join(", ");
  return [
    ...bare,
    `def ${name}(${paramList}) -> Dict[str, Any]:`,
    docstring,
    body,
  ].join("\n");
}

/** Write `gofish/<module>.py`, the module the package binds as `family`:
 *  one function per factory. */
function writeFamilyModule(opts: {
  family: string;
  /** The family's doc, the module docstring's first paragraph. */
  doc: string;
  /** The descriptor table it is generated from, for the header. */
  table: string;
  wire: FamilyWire;
  factories: FamilyFactory[];
}): void {
  const { family, doc, table, wire, factories } = opts;
  const module = family.toLowerCase();
  const example = factories[0].name;
  const bareExample = wire.bare
    ? factories.find((f) =>
        Object.values(f.params).every((spec) => !spec.required)
      )?.name
    : undefined;
  const functions = factories.map((f) => renderFamilyFactory(wire, f));
  const code = functions.join("\n\n\n");
  const typing = ["Any", "Dict", "Literal", "Optional"].filter(
    (n) => n === "Any" || n === "Dict" || code.includes(`${n}[`)
  );
  const keys =
    wire.keys === "snake"
      ? [
          `snake_case param keys; the option it is passed to renames them to the`,
          `camelCase wire keys.`,
        ]
      : [`camelCase wire keys; the JS side rebuilds the value from it.`];
  const source = [
    `# GENERATED by packages/gofish-python/scripts/generate.ts from the gofish-ir`,
    `# ${table} table — do not edit; run \`pnpm --filter gofish-python gen\`.`,
    `"""`,
    `The \`\`${family}\`\` family. ${doc}`,
    ``,
    `The package binds this module as \`\`${family}\`\`, so \`\`${family}.${example}\`\` and`,
    `\`\`from gofish.${module} import ${example}\`\` reach the same member. Each member`,
    `returns a plain dict, \`\`{"${wire.tag}": ..., **params}\`\`, with`,
    ...keys,
    `Mirrors JS \`\`gofish-graphics/${module}\`\`.`,
    ...(bareExample !== undefined
      ? [
          ``,
          `A kind with no required option is a value as it is, and calling it sets`,
          `options: \`\`${family}.${bareExample}\`\` is \`\`${family}.${bareExample}()\`\` (#1133).`,
        ]
      : []),
    `"""`,
    ``,
    ...(code.includes("math.") ? [`import math`] : []),
    `from typing import ${typing.join(", ")}`,
    ...(bareExample !== undefined
      ? [``, `from ._strategy import bare_kind`]
      : []),
    ``,
    `__all__ = [${factories.map((f) => pyStr(f.name)).join(", ")}]`,
    ``,
    ``,
    code,
    ``,
  ].join("\n");
  const outFile = join(HERE, "..", "gofish", `${module}.py`);
  writeFileSync(outFile, source);
  console.log(`wrote ${outFile}`);
}

// The strategy families: gofish/<family>.py, one factory per kind and per
// preset of the STRATEGIES table.
for (const [family, spec] of Object.entries(STRATEGIES) as Array<
  [string, StrategyFamily]
>) {
  writeFamilyModule({
    family,
    doc: spec.doc,
    table: "STRATEGIES",
    wire: { tag: "kind", keys: "snake", bare: true },
    factories: [
      ...Object.entries(spec.kinds).map(([kind, k]) => ({
        family,
        name: pyKwarg(kind),
        tag: kind,
        params: k.params,
        preset: {},
        doc: k.doc,
        positional: k.positional,
      })),
      ...Object.entries(spec.presets ?? {}).map(([name, p]) => ({
        family,
        name: pyKwarg(name),
        tag: p.kind,
        params: spec.kinds[p.kind].params,
        preset: p.values,
        doc: p.doc,
      })),
    ],
  });
}

// The Coord family: gofish/coord.py, one factory per COORDS entry. Its
// members are functions only, as in JS.
writeFamilyModule({
  family: "Coord",
  doc: "The coordinate transforms of a chart's or a layer's ``coord`` option.",
  table: "COORDS",
  wire: { tag: "type", keys: "wire", bare: false },
  factories: Object.entries(COORDS).map(([type, d]) => ({
    family: "Coord",
    name: pyKwarg(d.pyName ?? type),
    tag: type,
    params: resolveFields(d),
    preset: {},
    doc: d.doc ?? "",
    positional: d.positional,
  })),
});
