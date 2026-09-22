// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * Live paint slots — a module-level side table mapping a display item to its
 * per-channel reactive thunks.
 *
 * A `live()` channel bakes a datum-bound thunk here at lower time; `paintSVG`
 * looks the item up and, if present, CALLS each thunk in JSX attribute
 * position so Solid tracks the signal reads and patches only that attribute.
 * The thunks live OUTSIDE the display item on purpose: display items flow into
 * serialization and normalized-DOM captures, and the gofish-ir display-list
 * types must stay pure data (no function values).
 *
 * A channel named "text" overrides the text CONTENT (the box keeps its
 * resolve-time measure); a channel named after one of the item's own geometry
 * fields (`x`, `y`, `w`, `h`, `cx`, `cy`, `rx`, `ry`, `d`) overrides that
 * field; every other channel is a `DisplayList.Style` key.
 */
import type { DisplayList } from "gofish-ir";

export type LiveSlots = Record<string, () => unknown>;

/**
 * The live-slot names that override an item's GEOMETRY rather than its style —
 * the display item's own field names, so one rule covers every primitive: a
 * slot called `cx` overrides `cx` on an ellipse, `x` overrides `x` on a rect or
 * a text anchor, `d` overrides the path string.
 *
 * Geometry is live for the same reason paint is: the value is a paint-time
 * fact, the box it sits in is a layout-time one. A mark whose POSITION moves
 * reactively must therefore claim the room for everywhere it goes at layout
 * time (a `time.transition()` claims the whole trajectory its keyframes span),
 * exactly as live text must fit its resolve-time measure. Two known limits,
 * both inherited from the live-paint channels: the serialized display list and
 * the frame the interaction runtime publishes for hit-testing carry the
 * resolve-time value, so a live item's recorded box is where it started.
 */
export const GEOMETRY_CHANNELS = new Set([
  "x",
  "y",
  "w",
  "h",
  "cx",
  "cy",
  "rx",
  "ry",
  "d",
]);

const slots = new WeakMap<DisplayList.DisplayItem, LiveSlots>();

/** Add `record`'s thunks to `item`'s slots. Slots ACCUMULATE, and a later
 *  channel wins: a node's own `lower` can slot a geometry channel and the
 *  `live()` channels of its options bag are then merged in over it, without
 *  either having to know about the other. */
export function setLiveSlots(
  item: DisplayList.DisplayItem,
  record: LiveSlots
): void {
  const existing = slots.get(item);
  slots.set(item, existing ? { ...existing, ...record } : record);
}

export function getLiveSlots(
  item: DisplayList.DisplayItem
): LiveSlots | undefined {
  return slots.get(item);
}
