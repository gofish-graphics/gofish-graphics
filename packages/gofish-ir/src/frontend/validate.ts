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

export interface ValidationError {
  /** Dotted path into the document. */
  path: string;
  message: string;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ValidationError[] };

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
  };
  walkDocument(doc, "$", ctx);
  return ctx.errors.length === 0
    ? { valid: true }
    : { valid: false, errors: ctx.errors };
}

// ---------------------------------------------------------------------------
// Walkers
// ---------------------------------------------------------------------------

interface Context {
  strict: boolean;
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
    walkArray(v, p, ctx, walkRootChart)
  );
  optionalField(node, "options", path, ctx, expectObject);
  optionalField(node, "constraints", path, ctx, (v, p) =>
    walkArray(v, p, ctx, walkConstraint)
  );
  if (ctx.strict) {
    rejectUnknown(
      node,
      ["type", "charts", "options", "constraints", "origin", "meta"],
      path,
      ctx
    );
  }
}

function walkRootChart(node: unknown, path: string, ctx: Context): void {
  if (!isObject(node) || node.type !== "chart") {
    ctx.errors.push({
      path,
      message: 'layer children must be charts (type === "chart")',
    });
    return;
  }
  walkChart(node, path, ctx);
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
    default:
      ctx.errors.push({
        path: `${path}.type`,
        message: `data type must be "inline" | "select" | "external", got ${JSON.stringify(
          node.type
        )}`,
      });
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
  // Per-type field validation. Each operator has a known set of optional
  // and required fields; in strict mode, unknown fields are rejected.
  const knownFields: Record<string, string[]> = {
    derive: ["type", "lambdaId", "provenance", "origin", "meta"],
    spread: [
      "type",
      "by",
      "dir",
      "spacing",
      "alignment",
      "sharedScale",
      "mode",
      "reverse",
      "glue",
      "axes",
      "origin",
      "meta",
    ],
    stack: [
      "type",
      "by",
      "dir",
      "alignment",
      "sharedScale",
      "mode",
      "reverse",
      "axes",
      "origin",
      "meta",
    ],
    group: ["type", "by", "origin", "meta"],
    scatter: [
      "type",
      "by",
      "x",
      "y",
      "xMin",
      "xMax",
      "yMin",
      "yMax",
      "alignment",
      "axes",
      "origin",
      "meta",
    ],
    table: ["type", "by", "spacing", "numCols", "origin", "meta"],
    log: ["type", "label", "origin", "meta"],
  };
  switch (node.type) {
    case "derive":
      optionalField(node, "lambdaId", path, ctx, expectString);
      optionalField(node, "provenance", path, ctx, expectStringRecord);
      break;
    case "spread":
    case "stack":
      optionalField(node, "by", path, ctx, expectString);
      optionalField(node, "dir", path, ctx, (v, p) => {
        if (v !== "x" && v !== "y")
          ctx.errors.push({
            path: p,
            message: `dir must be "x" | "y", got ${JSON.stringify(v)}`,
          });
      });
      optionalField(node, "spacing", path, ctx, expectNumber);
      optionalField(node, "alignment", path, ctx, expectString);
      optionalField(node, "sharedScale", path, ctx, expectBoolean);
      optionalField(node, "reverse", path, ctx, expectBoolean);
      optionalField(node, "mode", path, ctx, (v, p) => {
        if (v !== "edge" && v !== "center")
          ctx.errors.push({
            path: p,
            message: `mode must be "edge" | "center"`,
          });
      });
      // spread-only stack options (stack operator rejects these via its own
      // knownFields list); optionalField no-ops when the field is absent.
      optionalField(node, "glue", path, ctx, expectBoolean);
      optionalField(node, "axes", path, ctx, walkAxesOptions);
      break;
    case "group":
      expectField(node, "by", path, ctx, expectString);
      break;
    case "scatter":
      optionalField(node, "by", path, ctx, expectString);
      for (const k of ["x", "y", "xMin", "xMax", "yMin", "yMax"]) {
        optionalField(node, k, path, ctx, walkChannelValue);
      }
      optionalField(node, "axes", path, ctx, walkAxesOptions);
      break;
    case "table":
      // `by` is required: the table operator can't run without an
      // {x, y} field-name pair (Python's table() raises if missing).
      expectField(node, "by", path, ctx, (v, p) => {
        if (!isObject(v)) {
          ctx.errors.push({ path: p, message: "table.by must be an object" });
          return;
        }
        expectField(v, "x", p, ctx, expectString);
        expectField(v, "y", p, ctx, expectString);
      });
      optionalField(node, "spacing", path, ctx, (v, p) => {
        if (typeof v === "number") return;
        if (
          Array.isArray(v) &&
          v.length === 2 &&
          v.every((n) => typeof n === "number")
        )
          return;
        ctx.errors.push({
          path: p,
          message: "table.spacing must be a number or [number, number]",
        });
      });
      optionalField(node, "numCols", path, ctx, expectNumber);
      break;
    case "log":
      optionalField(node, "label", path, ctx, expectString);
      break;
  }
  if (ctx.strict) {
    rejectUnknown(node, knownFields[node.type] ?? ["type"], path, ctx);
  }
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
    if (typeof obj.name !== "string") {
      ctx.errors.push({
        path: `${path}.name`,
        message: 'field channel must have a string "name"',
      });
    }
    // Optional unit annotation (field(name, measure)); a string when present.
    if (obj.measure !== undefined && typeof obj.measure !== "string") {
      ctx.errors.push({
        path: `${path}.measure`,
        message: 'field "measure" must be a string when present',
      });
    }
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
  if (ctx.strict) {
    rejectUnknown(
      node,
      ["type", "selection", "name", "label", "zOrder", "origin", "meta"],
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
      ["type", "x", "y", "children", "origin", "meta"],
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
  // Channel-valued props are unrestricted in v0 (mirrors widget IR).
  // Strict mode does NOT reject unknown fields on leaf marks, because the
  // entire point of a leaf is to carry channel-valued props with arbitrary
  // names (h, w, fill, x, y, etc.).
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

/** An object whose every value is a string — e.g. a measure-provenance map
 *  (field name → measure). */
function expectStringRecord(value: unknown, path: string, ctx: Context): void {
  if (!isObject(value)) {
    ctx.errors.push({
      path,
      message: `expected object, got ${typeNameOf(value)}`,
    });
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "string") {
      ctx.errors.push({
        path: `${path}.${k}`,
        message: `expected string, got ${typeNameOf(v)}`,
      });
    }
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
