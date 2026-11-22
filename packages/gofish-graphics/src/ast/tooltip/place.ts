// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

/**
 * Where a tooltip's box goes (#1395): beside the mark it describes, inside
 * the chart's marks. INTERNAL: the private elaboration target of
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

export interface TooltipPlaceConstraint {
  type: "tooltipPlace";
  /** The described mark (a ref to it), the area the box stays in (a ref to
   *  the chart's marks) and the box. */
  children: [target: ConstraintRef, frame: ConstraintRef, box: ConstraintRef];
  /** The gap between the mark and the box, in px. */
  gap: number;
}

export const createTooltipPlaceConstraint = (
  children: TooltipPlaceConstraint["children"],
  gap = 8
): TooltipPlaceConstraint => ({ type: "tooltipPlace", children, gap });

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

/** Seat the box of a tooltip placement where {@link tooltipSeat} says. */
export function applyTooltipPlacement(
  constraint: TooltipPlaceConstraint,
  placeables: Map<string, Placeable>,
  keyOf: KeyOf
): void {
  const [target, frame, box] = constraint.children.map((ref) => {
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
  const [x, y] = tooltipSeat(
    [span(target, 0), span(target, 1)],
    [span(frame, 0), span(frame, 1)],
    size,
    constraint.gap
  );
  box.setExtent!("x", { min: x, size: size[0] });
  box.setExtent!("y", { min: y, size: size[1] });
}
