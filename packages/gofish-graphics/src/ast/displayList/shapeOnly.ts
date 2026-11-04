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
  // The copy, made at the first item that differs from its paint.
  let out: DisplayList.DisplayItem[] | undefined;
  items.forEach((item, i) => {
    const paint = shapeOnly.has(item)
      ? undefined
      : item.kind === "group"
        ? paintOfGroup(item)
        : item;
    if (paint !== item) out ??= items.slice(0, i);
    if (out && paint) out.push(paint);
  });
  return out ?? items;
}

/** A group's paint: the group itself when none of its children was hidden,
 *  else the group of its children's paint, or nothing when that is none. */
function paintOfGroup(
  group: DisplayList.DisplayItem & { kind: "group" }
): DisplayList.DisplayItem | undefined {
  const children = paintOf(group.children);
  if (children === group.children) return group;
  return children.length > 0 ? { ...group, children } : undefined;
}
