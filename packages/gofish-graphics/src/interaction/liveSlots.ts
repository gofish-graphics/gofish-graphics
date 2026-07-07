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
 * resolve-time measure); every other channel is a `DisplayList.Style` key.
 */
import type { DisplayList } from "gofish-ir";

export type LiveSlots = Record<string, () => unknown>;

const slots = new WeakMap<DisplayList.DisplayItem, LiveSlots>();

export function setLiveSlots(
  item: DisplayList.DisplayItem,
  record: LiveSlots
): void {
  slots.set(item, record);
}

export function getLiveSlots(
  item: DisplayList.DisplayItem
): LiveSlots | undefined {
  return slots.get(item);
}
