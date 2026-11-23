// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

/**
 * Where a tooltip's box goes (#1395): beside the mark it describes, inside
 * the chart's marks; on a line, beside the point of the row it describes,
 * with a marker on that point. INTERNAL: the private elaboration target of
 * `.tooltip()`, as `labelPlace` is of `.label()`; there is no
 * `Constraint.tooltipPlace`.
 *
 * Like a label placement it is not a difference constraint: where the box
 * fits depends on where the solve put the mark and the chart's marks, so
 * the layer runs it after the solve (`applyConstraints`).
 *
 * TODO(#1395): a shortcut. The label chooser (`labels/placeStep.ts`) places
 * text labels only (its items carry text metrics), so a box has its own
 * small chooser here: the first of four sides that fits, then a clamp. The
 * right fix is one chooser for any placed node, with the box as one more
 * item that avoids the marks it does not describe.
 */
import type { Placeable } from "../_node";
import { rawPlaceable } from "../axisDirection";
import type { ConstraintRef, KeyOf } from "../constraints/shared";
import { placedOutlines } from "../geometry";

export interface TooltipPlaceConstraint {
  type: "tooltipPlace";
  /** The described mark (a ref to it), the area the box stays in (a ref to
   *  the chart's marks), the box, and, for a row of a line, the marker
   *  drawn on its point. */
  children:
    | [target: ConstraintRef, frame: ConstraintRef, box: ConstraintRef]
    | [
        target: ConstraintRef,
        frame: ConstraintRef,
        box: ConstraintRef,
        marker: ConstraintRef,
      ];
  /** The gap between the mark (or the marker) and the box, in px. */
  gap: number;
  /** The row of the mark the box describes, when the mark is drawn through
   *  rows (its geometry's `rowPoints`). */
  point?: { row: unknown };
}

/** The gap between a mark and its tooltip's box, in px. */
const TOOLTIP_GAP = 8;

/** The radius of the marker on a line's focused point, in px. */
export const MARKER_RADIUS = 4;

export const createTooltipPlaceConstraint = (
  children: TooltipPlaceConstraint["children"],
  point?: { row: unknown }
): TooltipPlaceConstraint => ({
  type: "tooltipPlace",
  children,
  gap: TOOLTIP_GAP,
  point,
});

export const isTooltipPlaceConstraint = (
  c: { type: string } | undefined
): c is TooltipPlaceConstraint => c?.type === "tooltipPlace";

type Span = { min: number; max: number };

/** `[lo, lo + size]` moved to lie in `frame`, its start first when it is
 *  larger. */
const clamp = (lo: number, size: number, frame: Span): number =>
  Math.max(frame.min, Math.min(lo, frame.max - size));

/**
 * The box's start on each axis, beside `target` and inside `frame`, given
 * its `size`. The first side with room wins: after the mark on x, then
 * before it, the box centered on the mark's other axis; then after or
 * before it on y, whichever has more room, the box's end flush with the
 * mark's on x (under a long bar, at its tip). With no side that fits, the
 * box sits after the mark on x, moved into the frame.
 */
export function tooltipSeat(
  target: [Span, Span],
  frame: [Span, Span],
  size: [number, number],
  gap: number
): [number, number] {
  const [tx, ty] = target;
  const [fx, fy] = frame;
  const [w, h] = size;
  const centeredY = clamp((ty.min + ty.max) / 2 - h / 2, h, fy);
  if (tx.max + gap + w <= fx.max) return [tx.max + gap, centeredY];
  if (tx.min - gap - w >= fx.min) return [tx.min - gap - w, centeredY];
  const endX = clamp(tx.max - w, w, fx);
  const after = fy.max - (ty.max + gap);
  const before = ty.min - gap - fy.min;
  if (Math.max(after, before) >= h)
    return after >= before ? [endX, ty.max + gap] : [endX, ty.min - gap - h];
  return [clamp(tx.max + gap, w, fx), centeredY];
}

/** Where `target`, placed, draws `row`: its geometry's row point moved
 *  where its box is placed, as `placedOutlines` moves its outline. */
function placedRowPoint(
  target: Placeable,
  row: unknown
): [number, number] | undefined {
  const g = target.geometry();
  const p = g.rowPoints?.().find((q) => q.row === row);
  if (p === undefined) return undefined;
  return [
    p.at[0] + (target.dims[0].min ?? 0) - g.box.min[0],
    p.at[1] + (target.dims[1].min ?? 0) - g.box.min[1],
  ];
}

/** The end of `target` when it is drawn as one open path (a line through
 *  no rows, a connector): a stable place on it. */
function openEnd(target: Placeable): [number, number] | undefined {
  const outlines = placedOutlines(target, 0.25);
  if (outlines.length !== 1 || outlines[0].closed) return undefined;
  const points = outlines[0].points;
  const end = points[points.length - 1];
  return end && [end[0], end[1]];
}

/**
 * Seat the box of a tooltip placement where {@link tooltipSeat} says,
 * beside what it describes: the point of its row on a mark drawn through
 * rows, with the marker seated on that point; the end of a mark drawn as
 * one open path; otherwise the mark's box.
 *
 * TODO(#1395): a line drawn from a function or a connector has no rows to
 * snap to, so its box describes the whole line, beside its end. The right
 * behavior is a continuous focus that shows the function's value at the
 * pointer (Dragology's `between`; snapping to rows is its `closest`), which
 * needs content that changes per pointer move without a re-run.
 */
export function applyTooltipPlacement(
  constraint: TooltipPlaceConstraint,
  placeables: Map<string, Placeable>,
  keyOf: KeyOf
): void {
  const [target, frame, box, marker] = constraint.children.map((ref) => {
    const p = placeables.get(keyOf(ref));
    if (p === undefined)
      throw new Error(`[gofish] .tooltip(): "${ref.name}" was not laid out`);
    return rawPlaceable(p);
  });
  const span = (p: Placeable, axis: 0 | 1): Span => ({
    min: p.dims[axis].min ?? 0,
    max: p.dims[axis].max ?? 0,
  });
  const size: [number, number] = [box.dims[0].size ?? 0, box.dims[1].size ?? 0];
  const area: [Span, Span] = [span(frame, 0), span(frame, 1)];
  const point =
    (constraint.point && placedRowPoint(target, constraint.point.row)) ??
    openEnd(target);
  // Beside a point, the box keeps its gap from the marker's edge.
  const r = point && marker ? MARKER_RADIUS : 0;
  const beside: [Span, Span] = point
    ? [
        { min: point[0] - r, max: point[0] + r },
        { min: point[1] - r, max: point[1] + r },
      ]
    : [span(target, 0), span(target, 1)];
  const [x, y] = tooltipSeat(beside, area, size, constraint.gap);
  box.setExtent!("x", { min: x, size: size[0] });
  box.setExtent!("y", { min: y, size: size[1] });
  if (marker) {
    const [mx, my] = point ?? [
      (beside[0].min + beside[0].max) / 2,
      (beside[1].min + beside[1].max) / 2,
    ];
    marker.setExtent!("x", {
      min: mx - MARKER_RADIUS,
      size: 2 * MARKER_RADIUS,
    });
    marker.setExtent!("y", {
      min: my - MARKER_RADIUS,
      size: 2 * MARKER_RADIUS,
    });
  }
}
