/**
 * Runtime validator for the GoFish Display List IR.
 *
 * The third of the three encodings (TS types in `schema.ts`, JSON Schema in
 * `jsonSchema.ts`, this runtime check) — all three must agree. Mirrors the
 * shape of the frontend IR's `validate`.
 */

import type { DisplayItem, DisplayListDocument, Style } from "./schema.js";
import { DISPLAY_ITEM_KINDS } from "./schema.js";

export interface ValidationError {
  /** JSON-pointer-ish path to the offending value. */
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
/** Datum provenance: a single row object, or an array of row objects. */
const isDatum = (v: unknown): boolean =>
  isObject(v) || (Array.isArray(v) && v.every(isObject));

function checkStyle(
  style: unknown,
  path: string,
  errors: ValidationError[]
): void {
  if (style === undefined) return;
  if (!isObject(style)) {
    errors.push({ path, message: "style must be an object" });
    return;
  }
  const s = style as Record<keyof Style, unknown>;
  for (const k of ["fill", "stroke"] as const) {
    if (s[k] !== undefined && !isStr(s[k]))
      errors.push({ path: `${path}.${k}`, message: `${k} must be a string` });
  }
  for (const k of ["strokeWidth", "opacity", "fillOpacity"] as const) {
    if (s[k] !== undefined && !isNum(s[k]))
      errors.push({ path: `${path}.${k}`, message: `${k} must be a number` });
  }
  for (const k of ["mixBlendMode", "strokeDasharray", "filter"] as const) {
    if (s[k] !== undefined && !isStr(s[k]))
      errors.push({ path: `${path}.${k}`, message: `${k} must be a string` });
  }
}

function checkBBox(
  bbox: unknown,
  path: string,
  errors: ValidationError[]
): void {
  if (
    !isObject(bbox) ||
    !isNum(bbox.x) ||
    !isNum(bbox.y) ||
    !isNum(bbox.w) ||
    !isNum(bbox.h)
  )
    errors.push({
      path,
      message: "bbox must be { x, y, w, h: number }",
    });
}

function checkBase(
  item: Record<string, unknown>,
  path: string,
  errors: ValidationError[]
): void {
  checkStyle(item.style, `${path}.style`, errors);
  if (item.datum !== undefined && !isDatum(item.datum))
    errors.push({
      path: `${path}.datum`,
      message: "datum must be an object or an array of objects",
    });
  if (
    item.role !== undefined &&
    item.role !== "node" &&
    item.role !== "overlay"
  )
    errors.push({
      path: `${path}.role`,
      message: 'role must be "node" or "overlay"',
    });
  if (item.id !== undefined && !isStr(item.id))
    errors.push({ path: `${path}.id`, message: "id must be a string" });
}

/** Required fields per kind: `num` checked with `isNum`, `str` with `isStr`. */
const REQUIRED_FIELDS: Record<string, { num?: string[]; str?: string[] }> = {
  rect: { num: ["x", "y", "w", "h"] },
  ellipse: { num: ["cx", "cy", "rx", "ry"] },
  path: { str: ["d"] },
  text: { num: ["x", "y"], str: ["text"] },
  image: { num: ["x", "y", "w", "h"], str: ["href"] },
  group: {},
  composite: {},
  mask: {},
};

function checkItem(
  item: unknown,
  path: string,
  errors: ValidationError[]
): void {
  if (!isObject(item)) {
    errors.push({ path, message: "item must be an object" });
    return;
  }
  const kind = item.kind;
  if (
    !isStr(kind) ||
    !(DISPLAY_ITEM_KINDS as readonly string[]).includes(kind)
  ) {
    errors.push({
      path: `${path}.kind`,
      message: `kind must be one of ${DISPLAY_ITEM_KINDS.join(", ")}`,
    });
    return;
  }
  const required = REQUIRED_FIELDS[kind];
  for (const f of required.num ?? []) {
    if (!isNum(item[f]))
      errors.push({ path: `${path}.${f}`, message: `${f} must be a number` });
  }
  for (const f of required.str ?? []) {
    if (!isStr(item[f]))
      errors.push({ path: `${path}.${f}`, message: `${f} must be a string` });
  }

  // Optional-field constraints, kept in agreement with the JSON Schema.
  if (kind === "text") {
    for (const f of ["fontSize", "rotate"] as const) {
      if (item[f] !== undefined && !isNum(item[f]))
        errors.push({ path: `${path}.${f}`, message: `${f} must be a number` });
    }
    if (item.fontFamily !== undefined && !isStr(item.fontFamily))
      errors.push({
        path: `${path}.fontFamily`,
        message: "fontFamily must be a string",
      });
    if (
      item.textAnchor !== undefined &&
      !["start", "middle", "end"].includes(item.textAnchor as string)
    )
      errors.push({
        path: `${path}.textAnchor`,
        message: "textAnchor must be one of start, middle, end",
      });
    if (
      item.dominantBaseline !== undefined &&
      !["auto", "central", "middle", "hanging", "mathematical"].includes(
        item.dominantBaseline as string
      )
    )
      errors.push({
        path: `${path}.dominantBaseline`,
        message:
          "dominantBaseline must be one of auto, central, middle, hanging, mathematical",
      });
  } else if (kind === "image") {
    if (
      item.preserveAspectRatio !== undefined &&
      !isStr(item.preserveAspectRatio)
    )
      errors.push({
        path: `${path}.preserveAspectRatio`,
        message: "preserveAspectRatio must be a string",
      });
  }

  // Recursive nesting items: validate bbox + the child item arrays.
  if (kind === "group") {
    if (!isObject(item.transform))
      errors.push({
        path: `${path}.transform`,
        message: "transform must be an object",
      });
    if (!Array.isArray(item.children))
      errors.push({
        path: `${path}.children`,
        message: "children must be an array",
      });
    else
      item.children.forEach((c, i) =>
        checkItem(c, `${path}.children[${i}]`, errors)
      );
  } else if (kind === "composite") {
    checkBBox(item.bbox, `${path}.bbox`, errors);
    if (
      item.operator === undefined ||
      !["over", "atop", "in", "out", "xor"].includes(item.operator as string)
    )
      errors.push({
        path: `${path}.operator`,
        message: "operator must be one of over, atop, in, out, xor",
      });
    for (const key of ["source", "dest"] as const) {
      if (!Array.isArray(item[key]))
        errors.push({
          path: `${path}.${key}`,
          message: `${key} must be an array`,
        });
      else
        item[key].forEach((c, i) =>
          checkItem(c, `${path}.${key}[${i}]`, errors)
        );
    }
  } else if (kind === "mask") {
    checkBBox(item.bbox, `${path}.bbox`, errors);
    for (const key of ["mask", "content"] as const) {
      if (!Array.isArray(item[key]))
        errors.push({
          path: `${path}.${key}`,
          message: `${key} must be an array`,
        });
      else
        item[key].forEach((c, i) =>
          checkItem(c, `${path}.${key}[${i}]`, errors)
        );
    }
  }

  checkBase(item, path, errors);
}

export function validate(doc: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  if (!isObject(doc)) {
    return {
      valid: false,
      errors: [{ path: "", message: "document must be an object" }],
    };
  }
  if (doc.irVersion !== 0)
    errors.push({ path: "irVersion", message: "irVersion must be 0" });
  if (doc.ir !== "gofish-display-list")
    errors.push({ path: "ir", message: 'ir must be "gofish-display-list"' });
  if (
    !isObject(doc.viewport) ||
    !isNum(doc.viewport.w) ||
    !isNum(doc.viewport.h)
  )
    errors.push({
      path: "viewport",
      message: "viewport must be { w: number, h: number }",
    });
  if (!Array.isArray(doc.items)) {
    errors.push({ path: "items", message: "items must be an array" });
  } else {
    doc.items.forEach((item, i) => checkItem(item, `items[${i}]`, errors));
  }
  return { valid: errors.length === 0, errors };
}

/** Narrowing convenience: validate then assert the branded type. */
export function isDisplayListDocument(
  doc: unknown
): doc is DisplayListDocument {
  return validate(doc).valid;
}
