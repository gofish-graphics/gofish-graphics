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
}

function checkBase(
  item: Record<string, unknown>,
  path: string,
  errors: ValidationError[]
): void {
  checkStyle(item.style, `${path}.style`, errors);
  if (item.datum !== undefined && !isObject(item.datum))
    errors.push({ path: `${path}.datum`, message: "datum must be an object" });
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

/** Required numeric fields per kind. `path`/`text`/`image` carry their own. */
const NUMERIC_FIELDS: Record<string, string[]> = {
  rect: ["x", "y", "w", "h"],
  ellipse: ["cx", "cy", "rx", "ry"],
  path: [],
  text: ["x", "y"],
  image: ["x", "y", "w", "h"],
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
  for (const f of NUMERIC_FIELDS[kind]) {
    if (!isNum(item[f]))
      errors.push({ path: `${path}.${f}`, message: `${f} must be a number` });
  }
  if (kind === "path" && !isStr(item.d))
    errors.push({ path: `${path}.d`, message: "d must be a string" });
  if (kind === "text" && !isStr(item.text))
    errors.push({ path: `${path}.text`, message: "text must be a string" });
  if (kind === "image" && !isStr(item.href))
    errors.push({ path: `${path}.href`, message: "href must be a string" });
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
