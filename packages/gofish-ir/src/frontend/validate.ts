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
  type DataIR,
  type FrontendIRDocument,
  type LabelIR,
  type LeafMarkIR,
  type MarkIR,
  type Meta,
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
  if (ctx.strict) {
    rejectUnknown(
      node,
      ["type", "charts", "options", "origin", "meta"],
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
      if (ctx.strict) rejectUnknown(node, ["type", "layer"], path, ctx);
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
  // Type-specific fields are validated leniently — every operator's option
  // bag may grow over time. Strict mode just gates whether unknown fields
  // trigger errors; we don't enumerate per-operator required fields here
  // (Phase 6 will).
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
  optionalField(node, "name", path, ctx, expectString);
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
  optionalField(node, "name", path, ctx, expectString);
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
  optionalField(node, "name", path, ctx, expectString);
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
  if (!isObject(node)) {
    ctx.errors.push({ path, message: "expected object" });
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
  if (t !== "align" && t !== "distribute" && t !== "zAbove" && t !== "zBelow") {
    ctx.errors.push({
      path: `${path}.type`,
      message: `constraint type must be "align" | "distribute" | "zAbove" | "zBelow"`,
    });
    return;
  }
  expectField(node, "refs", path, ctx, (v, p) => {
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
      ctx.errors.push({ path: p, message: "refs must be an array of strings" });
    }
  });
  optionalField(node, "options", path, ctx, expectObject);
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
  optionalField(node, "name", path, ctx, expectString);
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
  if (!(key in obj) || obj[key] === undefined) return;
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
  DataIR,
  FrontendIRDocument,
  LabelIR,
  LeafMarkIR,
  MarkIR,
  Meta,
  Origin,
  RefMarkIR,
};
