// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

import { evalFieldValues, FieldExpr, FieldExprWire } from "../fieldExpr";

export type LabelAccessor<D = any> =
  | string
  | FieldExprWire
  | FieldExpr
  | ((d: D) => string);

export interface LabelOptions {
  position?: LabelPosition;
  fontSize?: number;
  color?: string;
  offset?: number;
  rotate?: number;
  /** Passed straight through to the label's `Text` node; defaults to the
   *  elaborator's own font family when unset. */
  fontFamily?: string;
  fontWeight?: number | string;
  fontStyle?: string;
}

export interface LabelSpec<D = any> extends LabelOptions {
  accessor: LabelAccessor<D>;
}

/** Is this accessor a field-expression (either the `FieldExpr` class or its
 *  deserialized `FieldExprWire` wire form)? Mirrors the duck-typed check in
 *  `fieldExpr.ts`'s `getFieldOps`. */
const isFieldExprAccessor = (
  accessor: unknown
): accessor is FieldExprWire | FieldExpr =>
  accessor instanceof FieldExpr ||
  (accessor !== null &&
    typeof accessor === "object" &&
    (accessor as any).type === "field");

/**
 * Resolve a label's display text for one node's datum, which is a list of
 * rows (or `undefined` on a node built without data).
 *
 * - Function accessor: call it directly on the rows — the raw,
 *   non-serializable escape hatch.
 * - Field-expression accessor (`field(name).sum()`/`.mean()`/etc., or its
 *   wire form): evaluate the aggregate over the rows via `evalFieldValues`.
 * - Bare string accessor: read the field off every row.
 *
 * Without an aggregate, the field must be constant across the rows (this is
 * always true for a `by`-field, by construction). If it isn't, this is a
 * user-spec error and throws loudly rather than silently reading just the
 * first row. No datum, or no rows: "".
 */
export function resolveLabelText(
  accessor: LabelAccessor,
  rows: any[] | undefined
): string {
  if (typeof accessor === "function") return String(accessor(rows) ?? "");
  if (rows == null || rows.length === 0) return "";

  const isExpr = isFieldExprAccessor(accessor);
  const values = isExpr
    ? evalFieldValues(accessor, rows).values
    : rows.map((row) => row?.[accessor]);
  const first = values[0];
  if (values.length > 1 && !values.every((v) => v === first)) {
    const field = isExpr ? accessor.name : accessor;
    const shown = isExpr ? `field("${field}")` : `"${field}"`;
    throw new Error(
      `[gofish] .label(${shown}): field is not constant within the ` +
        `group; use an aggregate like field("${field}").mean()`
    );
  }
  return first != null ? String(first) : "";
}

export type LabelSide = "inset" | "outset";
export type LabelEdge = "top" | "bottom" | "left" | "right";
export type LabelAlignment = "start" | "center" | "end";

/**
 * Label position — three optional dimensions separated by hyphens:
 *
 * `side-edge-align`
 *
 * - `side`: `inset | outset` — whether the label sits inside or outside the shape
 * - `edge`: `top | bottom | left | right` — which edge to anchor to
 * - `align`: `start | center | end` — alignment along the perpendicular axis
 *
 * Special tokens:
 * - `"center"` — dead center of the shape (no edge)
 * - `"outset"` — shorthand for `outset-top-center`
 * - `inset` always requires an edge: `"inset-top"`, `"inset-bottom"`, etc.
 *
 * Defaults: side → `outset`, edge → `top`, align → `center`
 *
 * Alignment semantics:
 * - `outset-top` / `outset-bottom` / `inset-top` / `inset-bottom`:
 *   align is along x — `start` = left edge, `end` = right edge
 * - `outset-left` / `outset-right` / `inset-left` / `inset-right`:
 *   align is along y — `start` = top edge, `end` = bottom edge
 */
export type LabelPosition =
  | "center"
  | "outset"
  | `${LabelSide}-${LabelEdge}`
  | `${LabelSide}-${LabelEdge}-${LabelAlignment}`;

const SIDES = new Set<string>(["inset", "outset"]);
const EDGES = new Set<string>(["top", "bottom", "left", "right"]);
const ALIGNMENTS = new Set<string>(["start", "center", "end"]);

interface ParsedPosition {
  side: LabelSide;
  edge: LabelEdge | null;
  align: LabelAlignment;
}

/** Parse a position string into its three dimensions. */
export function parseLabelPosition(position: LabelPosition): ParsedPosition {
  if (position === "center")
    return { side: "inset", edge: null, align: "center" };

  const parts = (position as string).split("-");

  let side: LabelSide = "outset";
  let edge: LabelEdge | null = null;
  let align: LabelAlignment = "center";

  let i = 0;

  if (parts[i] && SIDES.has(parts[i])) {
    side = parts[i] as LabelSide;
    i++;
  }

  if (parts[i] && EDGES.has(parts[i])) {
    edge = parts[i] as LabelEdge;
    i++;
  }

  if (parts[i] && ALIGNMENTS.has(parts[i])) {
    align = parts[i] as LabelAlignment;
  }

  return { side, edge, align };
}
