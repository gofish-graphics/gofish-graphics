// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

/**
 * Runtime validator for the GoFish frontend IR.
 *
 * Hand-rolled, dependency-free. There is one mode: an unknown field is an
 * error everywhere, on the envelope, on operators, and on marks alike.
 */

import {
  COMBINATOR_MARK_TYPES,
  LEAF_MARK_TYPES,
  OPERATOR_TYPES,
  type ChannelValue,
  type AxisInterval,
  type CombinatorMarkIR,
  type ConstraintIR,
  type RelateClauseIR,
  isConstraintIR,
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
  decodeNonFinite,
  isNonFiniteNumberIR,
  isTaggedInfinity,
} from "./nonFinite.js";
import {
  AUTHORED_REFS,
  LABEL_OPTIONS,
  OPTION_TYPES,
  acceptedFields,
  MARK_BASE_FIELDS,
  t,
  type FieldGroup,
  type FieldSpec,
  type FieldType,
  type StrategyFamilyName,
} from "./descriptors.js";

/**
 * Is `value` a number as the IR carries it: a JSON number, or the tagged
 * form of `Infinity` / `-Infinity` (see `nonFinite.ts`)? The tagged `NaN` is
 * not: a NaN where a number is expected is always a bug, so it fails loudly.
 */
function isIRNumber(value: unknown): boolean {
  return typeof value === "number" || isTaggedInfinity(value);
}

/** The error for a value that is not an IR number. */
function notANumber(value: unknown, expected = "number"): string {
  return isNonFiniteNumberIR(value)
    ? `expected ${expected}, got NaN`
    : `expected ${expected}, got ${typeNameOf(value)}`;
}

export interface ValidationError {
  /** Dotted path into the document. */
  path: string;
  message: string;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ValidationError[] };

/** Validate a document against the frontend-IR schema. */
export function validate(doc: unknown): ValidationResult {
  const ctx: Context = { errors: [] };
  walkDocument(doc, "$", ctx);
  return ctx.errors.length === 0
    ? { valid: true }
    : { valid: false, errors: ctx.errors };
}

// ---------------------------------------------------------------------------
// Walkers
// ---------------------------------------------------------------------------

interface Context {
  errors: ValidationError[];
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
  rejectUnknown(node, ["irVersion", "ir", "$schema", "root"], path, ctx);
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
  // Chart-level options (`CHART_OPTIONS`), checked like every declared
  // object: typed values, no unknown keys.
  optionalField(node, "options", path, ctx, (v, p) =>
    walkFieldType(t.ref("ChartOptions"), v, p, ctx)
  );
  optionalField(node, "zOrder", path, ctx, expectNumber);
  optionalField(node, "name", path, ctx, expectNameOrToken);
  rejectUnknown(
    node,
    [
      "type",
      "data",
      "operators",
      "mark",
      "options",
      "zOrder",
      "name",
      "origin",
      "meta",
    ],
    path,
    ctx
  );
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
  optionalField(node, "relate", path, ctx, (v, p) =>
    walkArray(v, p, ctx, walkRelateClause)
  );
  optionalField(node, "builder", path, ctx, expectBoolean);
  rejectUnknown(
    node,
    ["type", "charts", "options", "relate", "builder", "origin", "meta"],
    path,
    ctx
  );
}

function walkLayerChild(node: unknown, path: string, ctx: Context): void {
  if (isObject(node) && node.type === "chart") {
    walkChart(node, path, ctx);
    return;
  }
  // A `chart(...).layer(mark)` builder chain drops a component-level
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
  rejectUnknown(node, ["type", "mark", "options", "origin", "meta"], path, ctx);
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
      rejectUnknown(node, ["type", "rows"], path, ctx);
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
      rejectUnknown(node, ["type", "layer", "mode"], path, ctx);
      return;
    case "external":
      optionalField(node, "id", path, ctx, expectString);
      rejectUnknown(node, ["type", "id"], path, ctx);
      return;
    case "previous-tier":
      rejectUnknown(node, ["type"], path, ctx);
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
 * per-type switch. Shared by operators and leaf marks. A key the construct
 * does not declare is an error.
 *
 * `callerKeys` are the keys the caller checks itself (`type`, and any field it
 * walks with a structural check of its own): they are accepted here and not
 * checked a second time, even when `fields` declares them.
 */
function walkDescriptorFields(
  node: Record<string, unknown>,
  path: string,
  ctx: Context,
  fields: Record<string, FieldSpec>,
  callerKeys: readonly string[]
): void {
  for (const [name, spec] of Object.entries(fields)) {
    if (callerKeys.includes(name)) continue;
    if (spec.required) {
      if (!(name in node)) {
        ctx.errors.push({
          path: `${path}.${name}`,
          message: `required field "${name}" is missing`,
        });
      } else {
        walkFieldType(spec.type, node[name], `${path}.${name}`, ctx);
      }
    } else {
      if (!(name in node) || node[name] === undefined || node[name] === null)
        continue;
      walkFieldType(spec.type, node[name], `${path}.${name}`, ctx);
    }
  }
  rejectUnknown(node, [...callerKeys, ...Object.keys(fields)], path, ctx);
}

/** Whether `value` is of the JSON kind a field type takes (a number, a
 *  string, an object, ...), whatever its finer constraints. A channel, a
 *  ref, or `any` takes values of several kinds, so it is never singled out. */
function sameKind(type: FieldType, value: unknown): boolean {
  switch (type.kind) {
    case "number":
      return isIRNumber(value);
    case "string":
    case "enum":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "literal":
      return typeof value === typeof type.value;
    case "object":
    case "record":
      return isObject(value) && !Array.isArray(value);
    case "array":
    case "tuple":
      return Array.isArray(value);
    default:
      return false;
  }
}

/** Check a single value against a descriptor `FieldType`, recording each
 *  finding in `ctx.errors`. */
function walkFieldType(
  type: FieldType,
  value: unknown,
  path: string,
  ctx: Context
): void {
  const fail = (message: string, at = path) =>
    ctx.errors.push({ path: at, message });
  switch (type.kind) {
    case "string":
      if (typeof value !== "string")
        fail(`expected string, got ${typeNameOf(value)}`);
      return;
    case "number": {
      if (!isIRNumber(value)) {
        fail(notANumber(value));
        return;
      }
      const n =
        typeof value === "number" ? value : (decodeNonFinite(value) as number);
      if (type.finite && !Number.isFinite(n))
        fail(`expected a finite number, got ${n}`);
      else if (type.min !== undefined && !(n >= type.min))
        fail(`expected a number of at least ${type.min}, got ${n}`);
      else if (type.exclusiveMin !== undefined && !(n > type.exclusiveMin))
        fail(`expected a number above ${type.exclusiveMin}, got ${n}`);
      return;
    }
    case "boolean":
      if (typeof value !== "boolean")
        fail(`expected boolean, got ${typeNameOf(value)}`);
      return;
    case "literal":
      if (value !== type.value)
        fail(
          `expected ${JSON.stringify(type.value)}, got ${JSON.stringify(value)}`
        );
      return;
    case "any":
      return;
    case "enum":
      if (typeof value !== "string" || !type.values.includes(value)) {
        fail(
          `expected one of ${type.values.map((v) => JSON.stringify(v)).join(", ")}, got ${JSON.stringify(value)}`
        );
      }
      return;
    case "channel":
      walkChannelValue(value, path, ctx);
      return;
    case "ref":
      walkRefType(type.name, value, path, ctx);
      return;
    case "union": {
      // A tagged union (every branch an object whose `kind` is a literal, or
      // every branch a ref tagged by its `type`, as `field(...)` and
      // `struct(...)` are): the value's tag picks the one branch to check it
      // against, as the Python generator's `_to_wire` does, so an unknown
      // tag and a bad param each get their own message.
      const tagged = taggedBranches(type.options);
      if (tagged !== null) {
        const { key, byTag } = tagged;
        if (!isObject(value)) {
          fail(`expected object, got ${typeNameOf(value)}`);
          return;
        }
        const branch = byTag.get(value[key] as string);
        if (branch === undefined) {
          fail(
            `unknown ${key} ${JSON.stringify(value[key])}; expected one of ${[...byTag.keys()].map((k) => JSON.stringify(k)).join(", ")}`,
            `${path}.${key}`
          );
          return;
        }
        walkFieldType(branch, value, path, ctx);
        return;
      }
      // Otherwise valid if ANY branch matches cleanly: each branch is
      // checked into a probe context of its own.
      const probes: Context[] = [];
      for (const branch of type.options) {
        const probe: Context = { errors: [] };
        walkFieldType(branch, value, path, probe);
        if (probe.errors.length === 0) return;
        probes.push(probe);
      }
      // When only one branch is of the value's kind (a number for a number
      // branch, an object for an object branch), its own findings say what
      // is wrong (`expected a number above 0`).
      const ofKind = type.options.flatMap((b, i) =>
        sameKind(b, value) ? [probes[i]] : []
      );
      if (ofKind.length === 1) {
        ctx.errors.push(...ofKind[0].errors);
        return;
      }
      fail(
        `value did not match any of the expected shapes: ${JSON.stringify(value)}`
      );
      return;
    }
    case "array":
      if (!Array.isArray(value)) {
        fail(`expected array, got ${typeNameOf(value)}`);
        return;
      }
      value.forEach((item, i) =>
        walkFieldType(type.items, item, `${path}[${i}]`, ctx)
      );
      return;
    case "tuple":
      if (!Array.isArray(value) || value.length !== type.items.length) {
        fail(`expected a ${type.items.length}-tuple, got ${typeNameOf(value)}`);
        return;
      }
      type.items.forEach((item, i) =>
        walkFieldType(item, value[i], `${path}[${i}]`, ctx)
      );
      return;
    case "record":
      if (!isObject(value)) {
        fail(`expected object, got ${typeNameOf(value)}`);
        return;
      }
      for (const [k, v] of Object.entries(value)) {
        walkFieldType(type.valueType, v, `${path}.${k}`, ctx);
      }
      return;
    case "object":
      if (!isObject(value)) {
        fail(`expected object, got ${typeNameOf(value)}`);
        return;
      }
      // Nested object fields validate like top-level descriptor fields: a
      // key the object does not declare is an error (an `axes` entry other
      // than x/y, a misspelled axis option).
      walkDescriptorFields(value, path, ctx, type.fields, []);
      return;
  }
}

/** A branch's tag: the field that names it, and its value. An object
 *  whose required `kind` field is a string literal (a strategy) is tagged
 *  by its `kind`; a hand-authored ref with a `tag` (`field(...)`,
 *  `struct(...)`, AUTHORED_REFS) by its `type`. */
function branchTag(
  branch: FieldType
): { key: "kind" | "type"; value: string } | null {
  if (branch.kind === "ref") {
    const tag = AUTHORED_REFS[branch.name]?.tag;
    return tag === undefined ? null : { key: "type", value: tag };
  }
  if (branch.kind !== "object") return null;
  const tag = branch.fields.kind;
  return tag !== undefined &&
    tag.required &&
    tag.type.kind === "literal" &&
    typeof tag.type.value === "string"
    ? { key: "kind", value: tag.type.value }
    : null;
}

/** The branches of a tagged union by their tag: every branch tagged by the
 *  same field ({@link branchTag}), no two alike. Null for any other union. */
function taggedBranches(
  options: readonly FieldType[]
): { key: "kind" | "type"; byTag: Map<string, FieldType> } | null {
  const byTag = new Map<string, FieldType>();
  let key: "kind" | "type" | undefined;
  for (const branch of options) {
    const tag = branchTag(branch);
    if (tag === null || (key !== undefined && tag.key !== key)) return null;
    if (byTag.has(tag.value)) return null;
    key = tag.key;
    byTag.set(tag.value, branch);
  }
  return key === undefined ? null : { key, byTag };
}

/**
 * Check a strategy against its family in `STRATEGIES`: a known `kind`, and
 * only that kind's params, each of its declared type. Throws the first
 * problem, naming `where` the strategy was written
 * (`"treemap({ tile })"`). This is the one check a strategy gets on the JS
 * side, wherever it came from (a family factory, a hand-written object, or
 * Python IR); the validator runs the same walk over a whole document.
 */
export function checkStrategy(
  family: StrategyFamilyName,
  value: unknown,
  where: string
): void {
  const ctx: Context = { errors: [] };
  walkFieldType(OPTION_TYPES[family].type, value, where, ctx);
  if (ctx.errors.length > 0) {
    const [{ path, message }] = ctx.errors;
    throw new Error(
      `[gofish] ${path}: ${message}. Make one with a call in the ${family} family.`
    );
  }
}

/** The anchors an axis interval may name: the fields of `AxisInterval` in
 *  `OPTION_TYPES`. */
export const AXIS_INTERVAL_KEYS = Object.keys(
  (OPTION_TYPES.AxisInterval.type as Extract<FieldType, { kind: "object" }>)
    .fields
) as ReadonlyArray<keyof AxisInterval>;

/**
 * Is this value an untagged plain object? A channel value that is an object
 * always carries a tag: `type` (`field(...)`, `datum(...)`, `literal`) or the
 * `__gofish_lambda` bridge sentinel. So an untagged plain object is never a
 * channel value, which is how a `dims` entry (`AxisDimsValue`, declared in
 * `OPTION_TYPES`) tells an interval from a position, and why
 * `walkChannelValue` rejects one. Shared with gofish-graphics' dims.ts, where a
 * runtime value may be a class instance, hence the plain-prototype check.
 */
export const isAxisInterval = (v: unknown): v is Record<string, unknown> =>
  isObject(v) &&
  Object.getPrototypeOf(v) === Object.prototype &&
  !("type" in v) &&
  !("__gofish_lambda" in v);

/** Resolve a `t.ref(name)`: a named option type (`OPTION_TYPES`) walks with
 *  the generic field-type interpreter; any other name is one of the authored
 *  envelope shapes validated elsewhere in this file. */
function walkRefType(
  name: string,
  value: unknown,
  path: string,
  ctx: Context
): void {
  const optionType = OPTION_TYPES[name];
  if (optionType !== undefined) {
    walkFieldType(optionType.type, value, path, ctx);
    return;
  }
  switch (name) {
    case "LabelIR":
      walkLabel(value, path, ctx);
      return;
    case "TranslateIR":
      walkTranslate(value, path, ctx);
      return;
    case "ConstraintIR":
      walkConstraint(value, path, ctx);
      return;
    case "RelateClauseIR":
      walkRelateClause(value, path, ctx);
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
    case "StructAccessor":
      walkStructAccessor(value, path, ctx);
      return;
    default:
      // Every ref a descriptor names is in OPTION_TYPES or AUTHORED_REFS, so
      // this is a descriptor that names a shape no walker knows.
      throw new Error(`validate: no walker for the ref type "${name}"`);
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
  // The operator's own fields and OPERATOR_BASE_FIELDS (`label`, `translate`,
  // `debug`) all sit on the node.
  walkDescriptorFields(
    node,
    path,
    ctx,
    acceptedFields("operator", node.type) ?? {},
    ["type", "origin", "meta"]
  );
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
  rejectUnknown(node, ["x", "y"], path, ctx);
}

/**
 * A channel value: bare primitive, the existing `{type:"datum"}` wrapper,
 * the new `{type:"field"|"literal"}` constructors, or a Python-bridge
 * sentinel. Permissive — only catches obviously-wrong shapes.
 */
function walkChannelValue(value: unknown, path: string, ctx: Context): void {
  if (value === null) return;
  if (typeof value === "string" || typeof value === "number") return;
  if (isNonFiniteNumberIR(value)) {
    // The tagged infinities are numbers; the tagged NaN never is.
    if (!isTaggedInfinity(value))
      ctx.errors.push({ path, message: notANumber(value, "channel value") });
    return;
  }
  if (typeof value === "boolean") return;
  if (typeof value !== "object") {
    ctx.errors.push({
      path,
      message: `channel value must be primitive or tagged object, got ${typeNameOf(value)}`,
    });
    return;
  }
  // Object form: one of the recognized tagged shapes.
  if (isAxisInterval(value)) {
    ctx.errors.push({
      path,
      message:
        'a channel value object must be tagged: field(...), datum(...), or {type: "literal", value}',
    });
    return;
  }
  const obj = value as Record<string, unknown>;
  if ("__gofish_lambda" in obj) return; // Python-bridge sentinel
  if (obj.type === "datum") {
    if (obj.offset !== undefined && !isIRNumber(obj.offset)) {
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
          if (!isIRNumber(cop?.amount)) {
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
  // Permissive fallback: allow an unknown `type` tag (and arrays) for
  // forward-compat.
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

/**
 * A key built from two fields (`struct({ x, y })`), with the cells it is
 * binned into: `{ type: "struct", fields: { x, y }, ops?: [{ op: "bin",
 * partition }] }`, the partition a `Bin` strategy (`OPTION_TYPES.Bin`).
 */
function walkStructAccessor(value: unknown, path: string, ctx: Context): void {
  const fail = (message: string, at = path) =>
    ctx.errors.push({ path: at, message });
  if (!isObject(value)) {
    fail(`expected a struct(...) accessor object, got ${typeNameOf(value)}`);
    return;
  }
  if (value.type !== "struct") {
    fail(
      `expected type "struct", got ${JSON.stringify(value.type)}`,
      `${path}.type`
    );
    return;
  }
  const fields = value.fields;
  if (
    !isObject(fields) ||
    typeof fields.x !== "string" ||
    typeof fields.y !== "string"
  ) {
    fail(
      'struct "fields" must be { x: string, y: string }, naming the column ' +
        "read on each axis",
      `${path}.fields`
    );
  } else rejectUnknown(fields, ["x", "y"], `${path}.fields`, ctx);
  if (value.ops !== undefined) {
    if (!Array.isArray(value.ops)) {
      fail('struct "ops" must be an array when present', `${path}.ops`);
    } else {
      value.ops.forEach((op, i) => {
        const at = `${path}.ops[${i}]`;
        if (!isObject(op) || op.op !== "bin") {
          fail('a struct op must be { op: "bin", partition }', at);
          return;
        }
        rejectUnknown(op, ["op", "partition"], at, ctx);
        walkFieldType(
          OPTION_TYPES.Bin.type,
          op.partition,
          `${at}.partition`,
          ctx
        );
      });
    }
  }
  rejectUnknown(value, ["type", "fields", "ops"], path, ctx);
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
          !value.values.every((v) => typeof v === "string" || isIRNumber(v))
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
      if (value.partition !== undefined)
        walkPartition(value.partition, `${path}.partition`, ctx);
      return;
    default:
      // reverse/dropNulls/normalize/sum/mean/count/distinct carry no extra fields.
      return;
  }
}

const CALENDAR_UNITS = [
  "second",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
];

/** A `bin` op's partition: a Calendar value (`{ unit, step?, start? }`),
 *  `{ step }`, or `{ thresholds }` (a count or a list of edges). */
function walkPartition(value: unknown, path: string, ctx: Context): void {
  const fail = (message: string) => ctx.errors.push({ path, message });
  if (!isObject(value)) {
    fail(`bin "partition" must be an object, got ${typeNameOf(value)}`);
    return;
  }
  const keys = Object.keys(value);
  if ("unit" in value) {
    if (!CALENDAR_UNITS.includes(value.unit as string))
      fail(
        `bin "partition.unit" must be one of ${CALENDAR_UNITS.join(", ")}, got ${JSON.stringify(value.unit)}`
      );
    if (value.step !== undefined && !isIRNumber(value.step))
      fail('bin "partition.step" must be a number when present');
    if (
      value.start !== undefined &&
      value.start !== "monday" &&
      value.start !== "sunday"
    )
      fail('bin "partition.start" must be "monday" | "sunday" when present');
    const extra = keys.filter((k) => !["unit", "step", "start"].includes(k));
    if (extra.length > 0)
      fail(`bin "partition" has unknown keys: ${extra.join(", ")}`);
    return;
  }
  if (keys.length === 1 && keys[0] === "step") {
    if (!isIRNumber(value.step)) fail('bin "partition.step" must be a number');
    return;
  }
  if (keys.length === 1 && keys[0] === "thresholds") {
    const t = value.thresholds;
    if (!isIRNumber(t) && !(Array.isArray(t) && t.every((e) => isIRNumber(e))))
      fail(
        'bin "partition.thresholds" must be a number or an array of numbers'
      );
    return;
  }
  fail(
    'bin "partition" must be a Calendar value ({ unit, step?, start? }), { step }, or { thresholds }'
  );
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

/** The `MARK_BASE_FIELDS` a mark node of each kind carries beside its own
 *  keys. `name` is not among them: a mark's name may be a hygienic-name token,
 *  so every mark walker checks it with `expectNameOrToken`. */
const markBaseFields = (...keys: string[]): FieldGroup =>
  Object.fromEntries(keys.map((k) => [k, MARK_BASE_FIELDS[k]]));
const {
  name: _name,
  debug: _debug,
  ...COMBINATOR_NODE_FIELDS
} = MARK_BASE_FIELDS;
const REF_MARK_FIELDS = markBaseFields("label", "zOrder", "translate");
const CUT_MARK_FIELDS = markBaseFields("zOrder", "translate");
const OFFSET_MARK_FIELDS = markBaseFields("translate");

/** The keys every mark walker checks itself, outside the descriptor walk. */
const MARK_NODE_KEYS = ["type", "name", "origin", "meta"] as const;

function walkMarkNode(
  node: Record<string, unknown>,
  path: string,
  ctx: Context,
  fields: FieldGroup,
  ownKeys: readonly string[]
): void {
  walkBaseFields(node, path, ctx);
  optionalField(node, "name", path, ctx, expectNameOrToken);
  walkDescriptorFields(node, path, ctx, fields, [
    ...MARK_NODE_KEYS,
    ...ownKeys,
  ]);
}

function walkRefMark(
  node: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  expectField(node, "selection", path, ctx, (v, p) => {
    if (typeof v !== "string" && !Array.isArray(v)) {
      ctx.errors.push({
        path: p,
        message: "ref.selection must be a string or array",
      });
    }
  });
  walkMarkNode(node, path, ctx, REF_MARK_FIELDS, ["selection"]);
}

function walkOffsetMark(
  node: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  optionalField(node, "x", path, ctx, expectNumber);
  optionalField(node, "y", path, ctx, expectNumber);
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
  walkMarkNode(node, path, ctx, OFFSET_MARK_FIELDS, ["x", "y", "children"]);
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
    if (isIRNumber(item)) return;
    if (isObject(item) && item.type === "datum") {
      if (item.offset !== undefined && !isIRNumber(item.offset)) {
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
  walkMarkNode(node, path, ctx, CUT_MARK_FIELDS, [
    "source",
    "dir",
    "size",
    "inset",
  ]);
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
  optionalField(node, "options", path, ctx, (v, p) => {
    if (!isObject(v)) {
      ctx.errors.push({
        path: p,
        message: `expected object, got ${typeNameOf(v)}`,
      });
      return;
    }
    walkDescriptorFields(
      v,
      p,
      ctx,
      acceptedFields("combinator-mark", node.type as string) ?? {},
      []
    );
  });
  expectField(node, "children", path, ctx, (v, p) =>
    walkArray(v, p, ctx, walkMark)
  );
  // The mark's base fields sit on the node; its own options (and `debug`)
  // sit under `options`, checked above.
  walkMarkNode(node, path, ctx, COMBINATOR_NODE_FIELDS, [
    "__combinator",
    "options",
    "children",
  ]);
}

function walkLeafMark(
  node: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  // The mark's own fields and MARK_BASE_FIELDS all sit on the node: the
  // enumerated channel list in `descriptors.ts`'s `LEAF_MARKS` is each mark's
  // real channel set (its factory's options plus the shared box-dims/paint
  // groups it includes), so any other key is an error, as on every node.
  walkMarkNode(
    node,
    path,
    ctx,
    acceptedFields("leaf-mark", node.type as string) ?? {},
    []
  );
}

/** One entry of a `LabelIR` array — the shape a single `.label(accessor,
 *  options?)` call produces. */
function walkLabelSpec(node: unknown, path: string, ctx: Context): void {
  if (!isObject(node)) {
    ctx.errors.push({
      path,
      message: `expected object, got ${typeNameOf(node)}`,
    });
    return;
  }
  if (!("accessor" in node) || node.accessor === undefined) {
    ctx.errors.push({
      path: `${path}.accessor`,
      message: 'required field "accessor" is missing',
    });
  } else if (typeof node.accessor === "string") {
    // bare field name — fine
  } else if (isObject(node.accessor)) {
    if (node.accessor.type !== "field") {
      ctx.errors.push({
        path: `${path}.accessor.type`,
        message: `expected type "field", got ${JSON.stringify(node.accessor.type)}`,
      });
    } else {
      walkFieldAccessor(node.accessor, `${path}.accessor`, ctx);
    }
  } else {
    ctx.errors.push({
      path: `${path}.accessor`,
      message: `expected a string or field(...) accessor object, got ${typeNameOf(node.accessor)}`,
    });
  }
  walkDescriptorFields(node, path, ctx, LABEL_OPTIONS, ["accessor"]);
}

function walkLabel(node: unknown, path: string, ctx: Context): void {
  // Boolean shorthand (matching the JS operator-kwarg API, e.g.
  // `stack({...}, label: false)`): enable/suppress a label with default
  // settings. Distinct, live mechanism — not sugar for a one-element array.
  if (typeof node === "boolean") return;
  // Otherwise: an array of label specs, one per `.label(...)` call.
  walkArray(node, path, ctx, walkLabelSpec);
}

/** A relate clause is a constraint when it carries `refs`, else a mark. */
function walkRelateClause(node: unknown, path: string, ctx: Context): void {
  if (isObject(node) && isConstraintIR(node as RelateClauseIR))
    walkConstraint(node, path, ctx);
  else walkMark(node, path, ctx);
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
      rejectUnknown(v, ["x", "y"], p, ctx);
    });
  } else {
    optionalField(node, "options", path, ctx, expectObject);
  }
  rejectUnknown(node, ["type", "refs", "options"], path, ctx);
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
  rejectUnknown(node, ["name", "stack"], path, ctx);
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
        message: `unknown field "${k}"`,
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
  if (!isIRNumber(value)) ctx.errors.push({ path, message: notANumber(value) });
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
  RelateClauseIR,
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
