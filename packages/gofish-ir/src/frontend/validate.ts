// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * Runtime validator for the GoFish frontend IR.
 *
 * Hand-rolled, dependency-free. Strict mode rejects unknown fields (used in
 * CI and tests); the default permissive mode ignores them, suitable for
 * forward-compatible reading.
 */

import {
  COMBINATOR_MARK_TYPES,
  LEAF_MARK_TYPES,
  OPERATOR_TYPES,
  type ChannelValue,
  type CombinatorMarkIR,
  type ConstraintIR,
  type CutMarkIR,
  type DataIR,
  type FrontendIRDocument,
  type LabelIR,
  type LeafMarkIR,
  type MarkIR,
  type Meta,
  type OffsetMarkIR,
  type Origin,
  type RefMarkIR,
} from "./schema.js";
import {
  LEAF_MARKS,
  MARK_BASE_FIELDS,
  OPERATOR_BASE_FIELDS,
  OPERATORS,
  resolveFields,
  type FieldSpec,
  type FieldType,
} from "./descriptors.js";

export interface ValidationError {
  /** Dotted path into the document. */
  path: string;
  message: string;
}

/**
 * A non-fatal finding — currently emitted only for leaf-mark channel fields
 * that aren't in the enumerated descriptor list (`descriptors.ts`'s
 * `LEAF_MARKS`). Leaf marks stay open-world for now (the gradual rollout the
 * python-wrapper-codegen design doc calls for): an unrecognized channel is a
 * signal worth surfacing, but not a validity failure — strict mode must NOT
 * start rejecting these until the enumerated lists are proven against the
 * story corpus.
 */
export interface ValidationWarning {
  path: string;
  message: string;
}

export type ValidationResult =
  | { valid: true; warnings: ValidationWarning[] }
  | { valid: false; errors: ValidationError[]; warnings: ValidationWarning[] };

export interface ValidateOptions {
  /** Reject unknown fields. Default: false (permissive). */
  strict?: boolean;
}

/** Validate a document against the frontend-IR schema. */
export function validate(
  doc: unknown,
  options: ValidateOptions = {}
): ValidationResult {
  const ctx: Context = {
    strict: options.strict === true,
    errors: [],
    warnings: [],
  };
  walkDocument(doc, "$", ctx);
  return ctx.errors.length === 0
    ? { valid: true, warnings: ctx.warnings }
    : { valid: false, errors: ctx.errors, warnings: ctx.warnings };
}

// ---------------------------------------------------------------------------
// Walkers
// ---------------------------------------------------------------------------

interface Context {
  strict: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

function walkDocument(node: unknown, path: string, ctx: Context): void {
  if (!isObject(node)) {
    ctx.errors.push({ path, message: "expected object" });
    return;
  }
  expectField(node, "irVersion", path, ctx, (v, p) => {
    if (v !== 0)
      ctx.errors.push({
        path: p,
        message: `irVersion must be 0, got ${JSON.stringify(v)}`,
      });
  });
  expectField(node, "ir", path, ctx, (v, p) => {
    if (v !== "gofish-frontend")
      ctx.errors.push({
        path: p,
        message: `ir must be "gofish-frontend", got ${JSON.stringify(v)}`,
      });
  });
  optionalField(node, "$schema", path, ctx, expectString);
  expectField(node, "root", path, ctx, walkRoot);
  if (ctx.strict) {
    rejectUnknown(node, ["irVersion", "ir", "$schema", "root"], path, ctx);
  }
}

function walkRoot(node: unknown, path: string, ctx: Context): void {
  if (!isObject(node)) {
    ctx.errors.push({ path, message: "expected object" });
    return;
  }
  switch (node.type) {
    case "chart":
      walkChart(node, path, ctx);
      return;
    case "layer":
      walkLayer(node, path, ctx);
      return;
    case "raw-mark":
      walkRawMark(node, path, ctx);
      return;
    default:
      ctx.errors.push({
        path: `${path}.type`,
        message: `root type must be "chart" | "layer" | "raw-mark", got ${JSON.stringify(
          node.type
        )}`,
      });
  }
}

function walkChart(
  node: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  walkBaseFields(node, path, ctx);
  optionalField(node, "data", path, ctx, (v, p) => {
    if (v === null) return;
    walkData(v, p, ctx);
  });
  optionalField(node, "operators", path, ctx, (v, p) =>
    walkArray(v, p, ctx, walkOperator)
  );
  expectField(node, "mark", path, ctx, walkMark);
  optionalField(node, "options", path, ctx, expectObject);
  optionalField(node, "zOrder", path, ctx, expectNumber);
  optionalField(node, "connect", path, ctx, walkMark);
  optionalField(node, "name", path, ctx, expectNameOrToken);
  if (ctx.strict) {
    rejectUnknown(
      node,
      [
        "type",
        "data",
        "operators",
        "mark",
        "options",
        "zOrder",
        "connect",
        "name",
        "origin",
        "meta",
      ],
      path,
      ctx
    );
  }
}

function walkLayer(
  node: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  walkBaseFields(node, path, ctx);
  expectField(node, "charts", path, ctx, (v, p) =>
    walkArray(v, p, ctx, walkLayerChild)
  );
  optionalField(node, "options", path, ctx, expectObject);
  optionalField(node, "constraints", path, ctx, (v, p) =>
    walkArray(v, p, ctx, walkConstraint)
  );
  optionalField(node, "builder", path, ctx, expectBoolean);
  if (ctx.strict) {
    rejectUnknown(
      node,
      ["type", "charts", "options", "constraints", "builder", "origin", "meta"],
      path,
      ctx
    );
  }
}

function walkLayerChild(node: unknown, path: string, ctx: Context): void {
  if (isObject(node) && node.type === "chart") {
    walkChart(node, path, ctx);
    return;
  }
  // A v3 `chart(...).layer(mark)` builder chain drops a component-level
  // annotation tier straight into `charts` as a raw-mark.
  if (isObject(node) && node.type === "raw-mark") {
    walkRawMark(node, path, ctx);
    return;
  }
  ctx.errors.push({
    path,
    message:
      'layer children must be charts or raw-marks (type === "chart" | "raw-mark")',
  });
}

function walkRawMark(
  node: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  walkBaseFields(node, path, ctx);
  expectField(node, "mark", path, ctx, walkMark);
  optionalField(node, "options", path, ctx, expectObject);
  if (ctx.strict) {
    rejectUnknown(
      node,
      ["type", "mark", "options", "origin", "meta"],
      path,
      ctx
    );
  }
}

function walkData(node: unknown, path: string, ctx: Context): void {
  if (!isObject(node)) {
    ctx.errors.push({ path, message: "expected object" });
    return;
  }
  switch (node.type) {
    case "inline":
      expectField(node, "rows", path, ctx, (v, p) => {
        if (!Array.isArray(v))
          ctx.errors.push({ path: p, message: "rows must be an array" });
      });
      if (ctx.strict) rejectUnknown(node, ["type", "rows"], path, ctx);
      return;
    case "select":
      expectField(node, "layer", path, ctx, expectString);
      optionalField(node, "mode", path, ctx, (v, p) => {
        if (v !== "one" && v !== "all")
          ctx.errors.push({
            path: p,
            message: `mode must be "one" | "all", got ${JSON.stringify(v)}`,
          });
      });
      if (ctx.strict) rejectUnknown(node, ["type", "layer", "mode"], path, ctx);
      return;
    case "external":
      optionalField(node, "id", path, ctx, expectString);
      if (ctx.strict) rejectUnknown(node, ["type", "id"], path, ctx);
      return;
    case "previous-tier":
      if (ctx.strict) rejectUnknown(node, ["type"], path, ctx);
      return;
    default:
      ctx.errors.push({
        path: `${path}.type`,
        message: `data type must be "inline" | "select" | "external" | "previous-tier", got ${JSON.stringify(
          node.type
        )}`,
      });
  }
}

/**
 * Generic per-type field interpreter: walks the descriptor table
 * (`descriptors.ts`) for a construct's type instead of a hand-written
 * per-type switch. Shared by operators (errors — the CRITICAL behavior
 * contract is that accepted/rejected documents stay exactly as before) and,
 * with `asWarning: true`, leaf marks (warnings only — the gradual rollout the
 * python-wrapper-codegen design doc calls for).
 */
function walkDescriptorFields(
  node: Record<string, unknown>,
  path: string,
  ctx: Context,
  fields: Record<string, FieldSpec>,
  extraKnownKeys: readonly string[],
  opts: { asWarning?: boolean; rejectUnknownInStrict?: boolean } = {}
): void {
  const push = (path: string, message: string) => {
    if (opts.asWarning) ctx.warnings.push({ path, message });
    else ctx.errors.push({ path, message });
  };
  for (const [name, spec] of Object.entries(fields)) {
    const check = (v: unknown, p: string) =>
      walkFieldType(spec.type, v, p, ctx, push);
    if (spec.required) {
      if (!(name in node)) {
        push(`${path}.${name}`, `required field "${name}" is missing`);
      } else {
        check(node[name], `${path}.${name}`);
      }
    } else {
      if (!(name in node) || node[name] === undefined || node[name] === null)
        continue;
      check(node[name], `${path}.${name}`);
    }
  }
  // Errors: unknown-field rejection is strict-mode-gated, matching the
  // pre-descriptor behavior exactly. Warnings are advisory and non-blocking,
  // so they surface regardless of strict mode — there's no reason to hide an
  // "unrecognized channel" signal from a permissive-mode caller.
  const shouldCheckUnknown = opts.asWarning ? true : ctx.strict;
  if (shouldCheckUnknown && (opts.rejectUnknownInStrict ?? true)) {
    const known = [...extraKnownKeys, ...Object.keys(fields)];
    for (const k of Object.keys(node)) {
      // Double-underscore keys are Python-bridge wire extensions
      // (__combinator, __datum, __key, __gofish_lambda, ... — see the
      // serialization essay's "Bridge extensions"), not channels; the
      // permissive envelope owns them, so they're outside this check.
      if (k.startsWith("__")) continue;
      if (!known.includes(k)) {
        push(
          `${path}.${k}`,
          opts.asWarning
            ? `unrecognized channel "${k}" for this mark type`
            : `unknown field "${k}" (strict)`
        );
      }
    }
  }
}

/** Dispatch a single value against a descriptor `FieldType`. `push` routes to
 *  either `ctx.errors` or `ctx.warnings` depending on the caller. */
function walkFieldType(
  type: FieldType,
  value: unknown,
  path: string,
  ctx: Context,
  push: (path: string, message: string) => void
): void {
  switch (type.kind) {
    case "string":
      if (typeof value !== "string")
        push(path, `expected string, got ${typeNameOf(value)}`);
      return;
    case "number":
      if (typeof value !== "number")
        push(path, `expected number, got ${typeNameOf(value)}`);
      return;
    case "boolean":
      if (typeof value !== "boolean")
        push(path, `expected boolean, got ${typeNameOf(value)}`);
      return;
    case "any":
      return;
    case "enum":
      if (typeof value !== "string" || !type.values.includes(value)) {
        push(
          path,
          `expected one of ${type.values.map((v) => JSON.stringify(v)).join(", ")}, got ${JSON.stringify(value)}`
        );
      }
      return;
    case "channel": {
      // Delegate to the existing permissive ChannelValue walker, but redirect
      // through a scratch context so its findings route through `push` (this
      // matters when `push` targets ctx.warnings — the leaf-mark descriptor
      // walk — rather than ctx.errors directly).
      const probe: Context = { strict: false, errors: [], warnings: [] };
      walkChannelValue(value, path, probe);
      for (const e of probe.errors) push(e.path, e.message);
      return;
    }
    case "ref": {
      // Same probe indirection as "channel": walkRefType pushes to
      // ctx.errors unconditionally, but this field's findings must route
      // through `push` (errors for operators, warnings for leaf marks).
      const probe: Context = { strict: ctx.strict, errors: [], warnings: [] };
      walkRefType(type.name, value, path, probe);
      for (const e of probe.errors) push(e.path, e.message);
      return;
    }
    case "union": {
      // Valid if ANY branch matches cleanly (no errors raised by that branch).
      for (const branch of type.options) {
        const probe: Context = { strict: false, errors: [], warnings: [] };
        walkFieldType(branch, value, path, probe, (p, m) =>
          probe.errors.push({ path: p, message: m })
        );
        if (probe.errors.length === 0) return;
      }
      push(
        path,
        `value did not match any of the expected shapes: ${JSON.stringify(value)}`
      );
      return;
    }
    case "array":
      if (!Array.isArray(value)) {
        push(path, `expected array, got ${typeNameOf(value)}`);
        return;
      }
      value.forEach((item, i) =>
        walkFieldType(type.items, item, `${path}[${i}]`, ctx, push)
      );
      return;
    case "tuple":
      if (!Array.isArray(value) || value.length !== type.items.length) {
        push(
          path,
          `expected a ${type.items.length}-tuple, got ${typeNameOf(value)}`
        );
        return;
      }
      type.items.forEach((item, i) =>
        walkFieldType(item, value[i], `${path}[${i}]`, ctx, push)
      );
      return;
    case "record":
      if (!isObject(value)) {
        push(path, `expected object, got ${typeNameOf(value)}`);
        return;
      }
      for (const [k, v] of Object.entries(value)) {
        walkFieldType(type.valueType, v, `${path}.${k}`, ctx, push);
      }
      return;
    case "object":
      if (!isObject(value)) {
        push(path, `expected object, got ${typeNameOf(value)}`);
        return;
      }
      // Nested object fields validate the same way as top-level descriptor
      // fields (required/optional), but do NOT reject unrecognized keys —
      // matching the pre-descriptor behavior (e.g. `table.by` never rejected
      // extra keys, even in strict mode).
      for (const [name, spec] of Object.entries(type.fields)) {
        const has =
          name in value && value[name] !== undefined && value[name] !== null;
        if (spec.required && !has) {
          push(`${path}.${name}`, `required field "${name}" is missing`);
        } else if (has) {
          walkFieldType(spec.type, value[name], `${path}.${name}`, ctx, push);
        }
      }
      return;
  }
}

/** Resolve a `t.ref(name)` against the small set of authored envelope
 *  shapes already validated elsewhere in this file. */
function walkRefType(
  name: string,
  value: unknown,
  path: string,
  ctx: Context
): void {
  switch (name) {
    case "AxesOptions":
      walkAxesOptions(value, path, ctx);
      return;
    case "LabelIR":
      walkLabel(value, path, ctx);
      return;
    case "TranslateIR":
      walkTranslate(value, path, ctx);
      return;
    case "ConstraintIR":
      walkConstraint(value, path, ctx);
      return;
    case "FieldAccessor":
      if (!isObject(value)) {
        ctx.errors.push({
          path,
          message: `expected a field(...) accessor object, got ${typeNameOf(value)}`,
        });
        return;
      }
      if (value.type !== "field") {
        ctx.errors.push({
          path: `${path}.type`,
          message: `expected type "field", got ${JSON.stringify(value.type)}`,
        });
        return;
      }
      walkFieldAccessor(value, path, ctx);
      return;
    default:
      // Unknown ref name — permissive (forward-compat), mirrors the rest of
      // this validator's stance on shapes it doesn't recognize yet.
      return;
  }
}

function walkOperator(node: unknown, path: string, ctx: Context): void {
  if (!isObject(node)) {
    ctx.errors.push({ path, message: "expected object" });
    return;
  }
  if (
    typeof node.type !== "string" ||
    !(OPERATOR_TYPES as readonly string[]).includes(node.type)
  ) {
    ctx.errors.push({
      path: `${path}.type`,
      message: `operator type must be one of ${OPERATOR_TYPES.join(", ")}, got ${JSON.stringify(
        node.type
      )}`,
    });
    return;
  }
  walkBaseFields(node, path, ctx);
  optionalField(node, "translate", path, ctx, walkTranslate);
  const descriptor = OPERATORS[node.type];
  // `debug` (OPERATOR_BASE_FIELDS) rides every operator: a factory-only dev
  // flag JS strips before layout, but real producers put it on the wire.
  const fields = descriptor
    ? { ...resolveFields(descriptor), debug: OPERATOR_BASE_FIELDS.debug }
    : {};
  walkDescriptorFields(node, path, ctx, fields, [
    "type",
    "translate",
    "origin",
    "meta",
  ]);
}

function walkTranslate(node: unknown, path: string, ctx: Context): void {
  if (!isObject(node)) {
    ctx.errors.push({
      path,
      message: `translate must be an object with optional x/y numbers, got ${typeNameOf(
        node
      )}`,
    });
    return;
  }
  optionalField(node, "x", path, ctx, expectNumber);
  optionalField(node, "y", path, ctx, expectNumber);
  if (ctx.strict) rejectUnknown(node, ["x", "y"], path, ctx);
}

/**
 * A channel value: bare primitive, the existing `{type:"datum"}` wrapper,
 * the new `{type:"field"|"literal"}` constructors, or a Python-bridge
 * sentinel. Permissive — only catches obviously-wrong shapes.
 */
function walkChannelValue(value: unknown, path: string, ctx: Context): void {
  if (value === null) return;
  if (typeof value === "string") return;
  if (typeof value === "number") return;
  if (typeof value === "boolean") return;
  if (typeof value !== "object") {
    ctx.errors.push({
      path,
      message: `channel value must be primitive or tagged object, got ${typeNameOf(value)}`,
    });
    return;
  }
  // Object form: one of the recognized tagged shapes.
  const obj = value as Record<string, unknown>;
  if ("__gofish_lambda" in obj) return; // Python-bridge sentinel
  if (obj.type === "datum") {
    if (obj.offset !== undefined && typeof obj.offset !== "number") {
      ctx.errors.push({
        path: `${path}.offset`,
        message: 'datum "offset" must be a number (post-scale pixel offset)',
      });
    }
    if (obj.colorOps !== undefined) {
      if (!Array.isArray(obj.colorOps)) {
        ctx.errors.push({
          path: `${path}.colorOps`,
          message: 'datum "colorOps" must be an array of color transforms',
        });
      } else {
        obj.colorOps.forEach((c, i) => {
          const cop = c as Record<string, unknown>;
          if (cop?.op !== "lighten" && cop?.op !== "darken") {
            ctx.errors.push({
              path: `${path}.colorOps[${i}].op`,
              message: 'colorOp "op" must be "lighten" or "darken"',
            });
          }
          if (typeof cop?.amount !== "number") {
            ctx.errors.push({
              path: `${path}.colorOps[${i}].amount`,
              message: 'colorOp "amount" must be a number',
            });
          }
        });
      }
    }
    return;
  }
  if (obj.type === "field") {
    walkFieldAccessor(obj, path, ctx);
    return;
  }
  if (obj.type === "literal") {
    if (!("value" in obj)) {
      ctx.errors.push({
        path: `${path}.value`,
        message: 'literal channel must have a "value" field',
      });
    }
    return;
  }
  // Permissive fallback: allow unknown object shapes for forward-compat.
}

/**
 * Explicit field-accessor form (`field(name, measure?)`), optionally with a
 * chained `ops` pipeline (`field("site").sort("yield")` /
 * `field("count").normalize()` — #700). Shared by `walkChannelValue`'s
 * `type: "field"` branch and `walkRefType`'s `FieldAccessor` case (the `by`
 * slot on spread/stack/group/scatter — see descriptors.ts).
 */
function walkFieldAccessor(
  obj: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  if (typeof obj.name !== "string") {
    ctx.errors.push({
      path: `${path}.name`,
      message: 'field accessor must have a string "name"',
    });
  }
  // Optional unit annotation (field(name, measure)); a string when present.
  if (obj.measure !== undefined && typeof obj.measure !== "string") {
    ctx.errors.push({
      path: `${path}.measure`,
      message: 'field "measure" must be a string when present',
    });
  }
  if (obj.ops !== undefined) {
    if (!Array.isArray(obj.ops)) {
      ctx.errors.push({
        path: `${path}.ops`,
        message: 'field "ops" must be an array of pipeline ops when present',
      });
    } else {
      obj.ops.forEach((op, i) => walkFieldOp(op, `${path}.ops[${i}]`, ctx));
    }
  }
}

/** Known `field(...)` pipeline op names — mirrors gofish-graphics'
 *  `FieldOp` (`ast/fieldExpr.ts`) exactly. */
const FIELD_OP_NAMES = [
  "sort",
  "reverse",
  "bin",
  "dropNulls",
  "normalize",
  "sum",
  "mean",
  "count",
  "distinct",
] as const;

/** One op in a `field(...)` pipeline. Rejects an unrecognized op name
 *  consistently with this validator's other enum-style checks. */
function walkFieldOp(value: unknown, path: string, ctx: Context): void {
  if (!isObject(value)) {
    ctx.errors.push({
      path,
      message: `field op must be an object, got ${typeNameOf(value)}`,
    });
    return;
  }
  if (
    typeof value.op !== "string" ||
    !(FIELD_OP_NAMES as readonly string[]).includes(value.op)
  ) {
    ctx.errors.push({
      path: `${path}.op`,
      message: `field op "op" must be one of ${FIELD_OP_NAMES.join(", ")}, got ${JSON.stringify(
        value.op
      )}`,
    });
    return;
  }
  switch (value.op) {
    case "sort":
      optionalField(value, "by", path, ctx, expectString);
      if (
        value.order !== undefined &&
        value.order !== "asc" &&
        value.order !== "desc"
      ) {
        ctx.errors.push({
          path: `${path}.order`,
          message: `sort "order" must be "asc" | "desc", got ${JSON.stringify(value.order)}`,
        });
      }
      if (value.values !== undefined) {
        if (
          !Array.isArray(value.values) ||
          !value.values.every(
            (v) => typeof v === "string" || typeof v === "number"
          )
        ) {
          ctx.errors.push({
            path: `${path}.values`,
            message:
              'sort "values" must be an array of strings/numbers when present',
          });
        }
      }
      return;
    case "bin":
      if (
        value.thresholds !== undefined &&
        typeof value.thresholds !== "number" &&
        !(
          Array.isArray(value.thresholds) &&
          value.thresholds.every((t) => typeof t === "number")
        )
      ) {
        ctx.errors.push({
          path: `${path}.thresholds`,
          message:
            'bin "thresholds" must be a number or an array of numbers when present',
        });
      }
      return;
    default:
      // reverse/dropNulls/normalize/sum/mean/count/distinct carry no extra fields.
      return;
  }
}

/**
 * `axes` — per-node axis-rendering override. Either a boolean (apply to
 * both dims) or an object `{ x?: AxisOptions, y?: AxisOptions }` where each
 * AxisOptions is a boolean or `{ title?: string | false }`.
 */
function walkAxesOptions(value: unknown, path: string, ctx: Context): void {
  if (typeof value === "boolean") return;
  if (!isObject(value)) {
    ctx.errors.push({
      path,
      message: `axes must be boolean or {x?, y?}, got ${typeNameOf(value)}`,
    });
    return;
  }
  for (const k of ["x", "y"]) {
    if (k in value) walkAxisOption(value[k], `${path}.${k}`, ctx);
  }
  if (ctx.strict) rejectUnknown(value, ["x", "y"], path, ctx);
}

function walkAxisOption(value: unknown, path: string, ctx: Context): void {
  if (typeof value === "boolean") return;
  if (value === undefined) return;
  if (!isObject(value)) {
    ctx.errors.push({
      path,
      message: `axis option must be boolean or { title? }, got ${typeNameOf(value)}`,
    });
    return;
  }
  if ("title" in value) {
    const t = value.title;
    if (t !== false && typeof t !== "string") {
      ctx.errors.push({
        path: `${path}.title`,
        message: `axis title must be a string or false, got ${typeNameOf(t)}`,
      });
    }
  }
  if (ctx.strict) rejectUnknown(value, ["title"], path, ctx);
}

function walkMark(node: unknown, path: string, ctx: Context): void {
  if (!isObject(node)) {
    ctx.errors.push({ path, message: "expected object" });
    return;
  }
  const t = node.type;
  if (typeof t !== "string") {
    ctx.errors.push({
      path: `${path}.type`,
      message: "mark type must be a string",
    });
    return;
  }
  if (t === "ref") {
    walkRefMark(node, path, ctx);
    return;
  }
  if (t === "offset") {
    walkOffsetMark(node, path, ctx);
    return;
  }
  if (t === "cut") {
    walkCutMark(node, path, ctx);
    return;
  }
  if (node.__combinator === true) {
    walkCombinatorMark(node, path, ctx);
    return;
  }
  if ((LEAF_MARK_TYPES as readonly string[]).includes(t)) {
    walkLeafMark(node, path, ctx);
    return;
  }
  ctx.errors.push({
    path: `${path}.type`,
    message: `unrecognized mark type ${JSON.stringify(t)}`,
  });
}

function walkRefMark(
  node: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  walkBaseFields(node, path, ctx);
  expectField(node, "selection", path, ctx, (v, p) => {
    if (typeof v !== "string" && !Array.isArray(v)) {
      ctx.errors.push({
        path: p,
        message: "ref.selection must be a string or array",
      });
    }
  });
  optionalField(node, "name", path, ctx, expectNameOrToken);
  optionalField(node, "label", path, ctx, walkLabel);
  optionalField(node, "zOrder", path, ctx, expectNumber);
  optionalField(node, "translate", path, ctx, walkTranslate);
  if (ctx.strict) {
    rejectUnknown(
      node,
      [
        "type",
        "selection",
        "name",
        "label",
        "zOrder",
        "translate",
        "origin",
        "meta",
      ],
      path,
      ctx
    );
  }
}

function walkOffsetMark(
  node: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  walkBaseFields(node, path, ctx);
  optionalField(node, "x", path, ctx, expectNumber);
  optionalField(node, "y", path, ctx, expectNumber);
  optionalField(node, "translate", path, ctx, walkTranslate);
  expectField(node, "children", path, ctx, (v, p) => {
    if (!Array.isArray(v)) {
      ctx.errors.push({ path: p, message: "children must be an array" });
      return;
    }
    if (v.length !== 1) {
      ctx.errors.push({
        path: p,
        message: `offset expects exactly one child, got ${v.length}`,
      });
    }
    v.forEach((item, i) => walkMark(item, `${p}[${i}]`, ctx));
  });
  if (ctx.strict) {
    rejectUnknown(
      node,
      ["type", "x", "y", "children", "translate", "origin", "meta"],
      path,
      ctx
    );
  }
}

/**
 * `cut.size` — either a field-name string (expand-mark form) or an array whose
 * entries are absolute-pixel numbers or `{type:"datum"}` flex-weight wrappers.
 */
function walkCutSize(value: unknown, path: string, ctx: Context): void {
  if (typeof value === "string") return;
  if (!Array.isArray(value)) {
    ctx.errors.push({
      path,
      message: `cut.size must be a field-name string or an array of numbers / datum() values, got ${typeNameOf(
        value
      )}`,
    });
    return;
  }
  value.forEach((item, i) => {
    const p = `${path}[${i}]`;
    if (typeof item === "number") return;
    if (isObject(item) && item.type === "datum") {
      if (item.offset !== undefined && typeof item.offset !== "number") {
        ctx.errors.push({
          path: `${p}.offset`,
          message: 'datum "offset" must be a number',
        });
      }
      return;
    }
    ctx.errors.push({
      path: p,
      message: `cut.size entries must be a number or a datum() value, got ${typeNameOf(
        item
      )}`,
    });
  });
}

function walkCutMark(
  node: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  walkBaseFields(node, path, ctx);
  expectField(node, "source", path, ctx, walkMark);
  expectField(node, "dir", path, ctx, (v, p) => {
    if (v !== "x" && v !== "y")
      ctx.errors.push({
        path: p,
        message: `cut.dir must be "x" | "y", got ${JSON.stringify(v)}`,
      });
  });
  optionalField(node, "size", path, ctx, walkCutSize);
  optionalField(node, "inset", path, ctx, expectNumber);
  optionalField(node, "name", path, ctx, expectNameOrToken);
  optionalField(node, "zOrder", path, ctx, expectNumber);
  optionalField(node, "translate", path, ctx, walkTranslate);
  if (ctx.strict) {
    rejectUnknown(
      node,
      [
        "type",
        "source",
        "dir",
        "size",
        "inset",
        "name",
        "zOrder",
        "translate",
        "origin",
        "meta",
      ],
      path,
      ctx
    );
  }
}

function walkCombinatorMark(
  node: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  if (
    !(COMBINATOR_MARK_TYPES as readonly string[]).includes(node.type as string)
  ) {
    ctx.errors.push({
      path: `${path}.type`,
      message: `combinator mark type must be one of ${COMBINATOR_MARK_TYPES.join(", ")}`,
    });
  }
  walkBaseFields(node, path, ctx);
  optionalField(node, "options", path, ctx, expectObject);
  expectField(node, "children", path, ctx, (v, p) =>
    walkArray(v, p, ctx, walkMark)
  );
  optionalField(node, "name", path, ctx, expectNameOrToken);
  optionalField(node, "label", path, ctx, walkLabel);
  optionalField(node, "constraints", path, ctx, (v, p) =>
    walkArray(v, p, ctx, walkConstraint)
  );
  optionalField(node, "zOrder", path, ctx, expectNumber);
  optionalField(node, "translate", path, ctx, walkTranslate);
  if (ctx.strict) {
    rejectUnknown(
      node,
      [
        "type",
        "__combinator",
        "options",
        "children",
        "name",
        "label",
        "constraints",
        "zOrder",
        "translate",
        "origin",
        "meta",
      ],
      path,
      ctx
    );
  }
}

function walkLeafMark(
  node: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  walkBaseFields(node, path, ctx);
  optionalField(node, "name", path, ctx, expectNameOrToken);
  optionalField(node, "label", path, ctx, walkLabel);
  optionalField(node, "constraints", path, ctx, (v, p) =>
    walkArray(v, p, ctx, walkConstraint)
  );
  optionalField(node, "zOrder", path, ctx, expectNumber);
  optionalField(node, "translate", path, ctx, walkTranslate);
  // Channel-valued props are unrestricted in v0 (mirrors widget IR).
  // Strict mode does NOT reject unknown fields on leaf marks, because the
  // entire point of a leaf is to carry channel-valued props with arbitrary
  // names (h, w, fill, x, y, etc.).
  //
  // Descriptor-driven channel warnings (non-blocking, both permissive and
  // strict mode): the enumerated channel list in `descriptors.ts`'s
  // `LEAF_MARKS` documents each mark's REAL channel set (its factory's
  // destructured options + the shared box-dims/paint groups it includes).
  // An unrecognized field is silently dropped at render — surfacing it here
  // as a warning turns that into a visible signal without breaking any
  // currently-valid document (see the gradual-rollout note in
  // ValidationWarning's docstring).
  const descriptor = LEAF_MARKS[node.type as string];
  if (descriptor) {
    // `label` is deliberately excluded here even though a few descriptors
    // (rect/circle/ellipse) list it as their own boolean inline-value-label
    // flag: on the wire it shares the same top-level key as the base
    // LabelIR mechanism (`.label()`'s canonical object/string/boolean
    // shorthand — already validated above by `walkLabel`), and the two
    // overlap in the boolean case (`label: true` is valid under both
    // readings) but diverge for the object/string forms. Re-checking it here
    // as "must be boolean" would fire a spurious warning on ordinary
    // `.label("field")` usage. The descriptor still lists it (informational,
    // for the Python-codegen stage) — just not wired into this warning walk.
    const { label: _ownLabelFlag, ...fields } = resolveFields(descriptor);
    walkDescriptorFields(
      node,
      path,
      ctx,
      // `debug` (MARK_BASE_FIELDS) rides every leaf mark, declared or not —
      // a factory-only dev flag the JS side strips before layout.
      { ...fields, debug: MARK_BASE_FIELDS.debug },
      [
        "type",
        "name",
        "label",
        "constraints",
        "zOrder",
        "translate",
        "origin",
        "meta",
      ],
      { asWarning: true }
    );
  }
}

function walkLabel(node: unknown, path: string, ctx: Context): void {
  // Shorthand forms (matching the JS API):
  //   label: true   → "label with default settings"
  //   label: "field" → "label with this field accessor, defaults elsewhere"
  if (typeof node === "boolean") return;
  if (typeof node === "string") return;
  if (!isObject(node)) {
    ctx.errors.push({
      path,
      message: "expected object, boolean, or string",
    });
    return;
  }
  expectField(node, "accessor", path, ctx, expectString);
  optionalField(node, "position", path, ctx, expectString);
  optionalField(node, "fontSize", path, ctx, expectNumber);
  optionalField(node, "color", path, ctx, expectString);
  optionalField(node, "offset", path, ctx, expectNumber);
  optionalField(node, "minSpace", path, ctx, expectNumber);
  optionalField(node, "rotate", path, ctx, expectNumber);
  if (ctx.strict) {
    rejectUnknown(
      node,
      [
        "accessor",
        "position",
        "fontSize",
        "color",
        "offset",
        "minSpace",
        "rotate",
      ],
      path,
      ctx
    );
  }
}

function walkConstraint(node: unknown, path: string, ctx: Context): void {
  if (!isObject(node)) {
    ctx.errors.push({ path, message: "expected object" });
    return;
  }
  const t = node.type;
  if (
    t !== "align" &&
    t !== "distribute" &&
    t !== "position" &&
    t !== "nest" &&
    t !== "zAbove" &&
    t !== "zBelow"
  ) {
    ctx.errors.push({
      path: `${path}.type`,
      message: `constraint type must be "align" | "distribute" | "position" | "nest" | "zAbove" | "zBelow"`,
    });
    return;
  }
  expectField(node, "refs", path, ctx, (v, p) => {
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
      ctx.errors.push({ path: p, message: "refs must be an array of strings" });
    }
    // `nest` relates exactly two refs: [outer, inner].
    if (t === "nest" && Array.isArray(v) && v.length !== 2) {
      ctx.errors.push({
        path: p,
        message: `nest refs must be exactly [outer, inner], got ${v.length}`,
      });
    }
  });
  if (t === "nest") {
    // nest options: per-axis padding `{ x?: number, y?: number }`, at least
    // one axis present. (The space-fold / centering direction is resolved
    // engine-side; the IR carries only the padding.)
    expectField(node, "options", path, ctx, (v, p) => {
      expectObject(v, p, ctx);
      if (!isObject(v)) return;
      optionalField(v, "x", p, ctx, expectNumber);
      optionalField(v, "y", p, ctx, expectNumber);
      if (v.x === undefined && v.y === undefined) {
        ctx.errors.push({
          path: p,
          message: "nest options must specify at least one of x, y",
        });
      }
      if (ctx.strict) rejectUnknown(v, ["x", "y"], p, ctx);
    });
  } else {
    optionalField(node, "options", path, ctx, expectObject);
  }
  if (ctx.strict) {
    rejectUnknown(node, ["type", "refs", "options"], path, ctx);
  }
}

function walkBaseFields(
  node: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  optionalField(node, "origin", path, ctx, walkOrigin);
  optionalField(node, "meta", path, ctx, walkMeta);
}

function walkOrigin(node: unknown, path: string, ctx: Context): void {
  if (!isObject(node)) {
    ctx.errors.push({ path, message: "origin must be an object" });
    return;
  }
  optionalField(node, "name", path, ctx, expectNameOrToken);
  optionalField(node, "stack", path, ctx, expectString);
  if (ctx.strict) rejectUnknown(node, ["name", "stack"], path, ctx);
}

function walkMeta(node: unknown, path: string, _ctx: Context): void {
  if (!isObject(node)) {
    _ctx.errors.push({ path, message: "meta must be an object" });
    return;
  }
  // Meta is intentionally open — additional keys are reserved for future
  // passes. v0 doesn't enforce per-key shapes; that lands with the passes
  // that populate them.
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

function expectField<T extends Record<string, unknown>>(
  obj: T,
  key: string,
  parentPath: string,
  ctx: Context,
  check: (value: unknown, path: string, ctx: Context) => void
): void {
  const childPath = `${parentPath}.${key}`;
  if (!(key in obj)) {
    ctx.errors.push({
      path: childPath,
      message: `required field "${key}" is missing`,
    });
    return;
  }
  check(obj[key], childPath, ctx);
}

function optionalField<T extends Record<string, unknown>>(
  obj: T,
  key: string,
  parentPath: string,
  ctx: Context,
  check: (value: unknown, path: string, ctx: Context) => void
): void {
  // Treat both `undefined` and explicit `null` as "absent". Python's
  // `to_dict()` emits `null` for several optional fields (data, zOrder,
  // ...) rather than omitting them.
  if (!(key in obj) || obj[key] === undefined || obj[key] === null) return;
  check(obj[key], `${parentPath}.${key}`, ctx);
}

function walkArray(
  v: unknown,
  path: string,
  ctx: Context,
  walkItem: (item: unknown, path: string, ctx: Context) => void
): void {
  if (!Array.isArray(v)) {
    ctx.errors.push({ path, message: "expected array" });
    return;
  }
  v.forEach((item, i) => walkItem(item, `${path}[${i}]`, ctx));
}

function rejectUnknown(
  obj: Record<string, unknown>,
  knownKeys: readonly string[],
  path: string,
  ctx: Context
): void {
  for (const k of Object.keys(obj)) {
    if (!knownKeys.includes(k)) {
      ctx.errors.push({
        path: `${path}.${k}`,
        message: `unknown field "${k}" (strict)`,
      });
    }
  }
}

function expectString(value: unknown, path: string, ctx: Context): void {
  if (typeof value !== "string") {
    ctx.errors.push({
      path,
      message: `expected string, got ${typeNameOf(value)}`,
    });
  }
}

function expectNumber(value: unknown, path: string, ctx: Context): void {
  if (typeof value !== "number") {
    ctx.errors.push({
      path,
      message: `expected number, got ${typeNameOf(value)}`,
    });
  }
}

function expectBoolean(value: unknown, path: string, ctx: Context): void {
  if (typeof value !== "boolean") {
    ctx.errors.push({
      path,
      message: `expected boolean, got ${typeNameOf(value)}`,
    });
  }
}

/**
 * A name field may be a string or a Python-bridge token sentinel
 * (`{__gofish_token, __tag}`) used to encode hygienic names across the
 * widget bridge. The deserializer resolves the sentinel to a runtime
 * Token at chart-build time.
 */
function expectNameOrToken(value: unknown, path: string, ctx: Context): void {
  if (typeof value === "string") return;
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as any).__gofish_token === "string" &&
    typeof (value as any).__tag === "string"
  ) {
    return;
  }
  ctx.errors.push({
    path,
    message: `expected string or token sentinel, got ${typeNameOf(value)}`,
  });
}

function expectObject(value: unknown, path: string, ctx: Context): void {
  if (!isObject(value)) {
    ctx.errors.push({
      path,
      message: `expected object, got ${typeNameOf(value)}`,
    });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeNameOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

// Re-export imported types so consumers can chase them from one entry point.
export type {
  ChannelValue,
  CombinatorMarkIR,
  ConstraintIR,
  CutMarkIR,
  DataIR,
  FrontendIRDocument,
  LabelIR,
  LeafMarkIR,
  MarkIR,
  Meta,
  OffsetMarkIR,
  Origin,
  RefMarkIR,
};
