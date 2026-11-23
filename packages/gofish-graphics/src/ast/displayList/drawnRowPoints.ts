// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * Where a display item draws the rows it is drawn through (a line's
 * points), in the item's pixels: a side table beside the item, as the live
 * slots are (`interaction/liveSlots.ts`). The display list stays plain data,
 * since it is serialized and captured; only the interaction runtime reads
 * this, so a tooltip can focus one row of a line (`tooltipFocus.ts`).
 */
import type { DisplayList } from "gofish-ir";

/** One row, drawn at (`x`, `y`). */
export type DrawnRowPoint = { row: unknown; x: number; y: number };

const table = new WeakMap<DisplayList.DisplayItem, DrawnRowPoint[]>();

export const setDrawnRowPoints = (
  item: DisplayList.DisplayItem,
  points: DrawnRowPoint[]
): void => {
  table.set(item, points);
};

/** The rows `item` is drawn through, where it draws them; undefined for an
 *  item drawn through no rows. */
export const drawnRowPoints = (
  item: DisplayList.DisplayItem
): DrawnRowPoint[] | undefined => table.get(item);
