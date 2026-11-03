/**
 * The items a hidden node draws for a compositor to read (#1267).
 *
 * `.hidden()` drops a node's paint and keeps its shape. A hidden node under
 * a compositor lowers as it would draw (`GoFishNode.visibility` is
 * `"shape"`), and its items are recorded here. The compositor lowers each
 * operand once: all the items are the operand's shape, and the items with
 * the recorded ones taken out are its paint (`paintOf`).
 *
 * The record is a side table keyed by item, like the live slots
 * (`interaction/liveSlots.ts`), so the items stay pure data.
 */
import type { DisplayList } from "gofish-ir";

const shapeOnly = new WeakSet<DisplayList.DisplayItem>();

/** Record `items`, lowered by a hidden node, as shape and no paint. */
export function markShapeOnly(items: DisplayList.DisplayItem[]): void {
  for (const item of items) shapeOnly.add(item);
}

/**
 * The paint of lowered `items`: the items without the ones a hidden node
 * drew, looking inside groups. `items` itself when nothing was hidden. A
 * composite item is kept whole: it has split its own operands.
 */
export function paintOf(
  items: DisplayList.DisplayItem[]
): DisplayList.DisplayItem[] {
  let changed = false;
  const out: DisplayList.DisplayItem[] = [];
  for (const item of items) {
    if (shapeOnly.has(item)) {
      changed = true;
      continue;
    }
    if (item.kind === "group") {
      const children = paintOf(item.children);
      if (children !== item.children) {
        changed = true;
        if (children.length > 0) out.push({ ...item, children });
        continue;
      }
    }
    out.push(item);
  }
  return changed ? out : items;
}
