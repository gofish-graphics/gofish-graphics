/**
 * The build-in's PAINT tier: how a mark's display items follow the build
 * clock without the chart being laid out again.
 *
 * It is the same split `time.transition()` makes (`tween.tsx`). Layout runs
 * once and decides where every mark is at rest; the schedule (`schedule.ts`)
 * decides when each mark's effects play; and the playhead is read per frame
 * inside live slots, so a tick patches a few attributes of the items that
 * are moving and nothing else. The mark keeps its layout box the whole time
 * (the room it takes at rest), which is what makes that sound: nothing above
 * a mark can see its effect play.
 *
 * A node carries an `AnimationRule` (`GoFishNode.INTERNAL_animate`), and its
 * lowering hands its items to the rule. The items the node lowers are the
 * REST state; the rule rewrites them to the playhead's current state (so a
 * headless `toDisplayList` shows exactly what the live chart shows at that
 * playhead) and registers a thunk per changing field that re-reads the
 * playhead at paint.
 */
import type { DisplayList } from "gofish-ir";
import type { GoFishNode, ToPixel } from "../ast/_node";
import { displayTranslate, type Transform } from "../ast/dims";
import { isValue } from "../ast/data";
import { isBaselineMagnitude, isDIFFERENCE } from "../ast/underlyingSpace";
import { readLive } from "../interaction/live";
import { setLiveSlots } from "../interaction/liveSlots";
import {
  channelsOf,
  paintHost,
  paintRider,
  type Effect,
  type EffectFrame,
} from "./effects";

/** What lowering knows about where a node was drawn. */
export type LowerFrame = { transform?: Transform; toPixel: ToPixel };

/** A node's paint-time animation: its effects, when they start, and the
 *  clock that says where the playhead is. */
export type AnimationRule = {
  /** Rewrite `items` (lowered at rest) to the playhead's current state and
   *  register the per-frame patches. `role` is "host" for the animated
   *  mark's own items and "rider" for what is attached to it (its labels). */
  paint(
    items: DisplayList.DisplayItem[],
    frame: LowerFrame,
    node: GoFishNode,
    role: "host" | "rider"
  ): void;
  /** When the effects start, in build-clock ms. */
  readonly start: number;
  readonly effects: Effect[];
};

/** Which of a node's axes carry a data SIZE: the ones a grow collapses. Read
 *  off the node itself: an axis whose resolved space is a baseline magnitude
 *  or a difference, or whose size channel is data-driven (a rect with a data
 *  `x` and `w` is POSITION on x, and still grows from its start). */
export function sizeAxesOf(node: GoFishNode): [boolean, boolean] {
  const dims = node.args?.dims as { size?: unknown }[] | undefined;
  const axis = (a: 0 | 1): boolean => {
    const space = node._underlyingSpace?.[a];
    if (space && (isBaselineMagnitude(space) || isDIFFERENCE(space)))
      return true;
    return isValue(dims?.[a]?.size);
  };
  return [axis(0), axis(1)];
}

/** Copy an item's paintable fields from `from` onto `into`, in place, so the
 *  item keeps its identity (its id and any live slots already set on it). */
function assignPaint(
  into: DisplayList.DisplayItem,
  from: DisplayList.DisplayItem,
  channels: string[]
): void {
  const target = into as unknown as Record<string, unknown>;
  const source = from as unknown as Record<string, unknown>;
  for (const c of channels) {
    if (c === "opacity") {
      into.style = { ...into.style, opacity: from.style?.opacity ?? 1 };
    } else {
      target[c] = source[c];
    }
  }
}

export function makeRule(
  playhead: () => number,
  start: number,
  effects: Effect[]
): AnimationRule {
  return {
    start,
    effects,
    paint(items, { transform, toPixel }, node, role) {
      if (items.length === 0) return;
      // The rest state, kept apart from the items the renderer holds, which
      // are rewritten to the current state below.
      const rest = items.map((item) => ({
        ...item,
        style: item.style && { ...item.style },
      })) as DisplayList.DisplayItem[];
      const frame: EffectFrame = {
        baseline: toPixel(displayTranslate(transform)),
        sizeAxes: sizeAxesOf(node),
      };
      const at = (t: number): DisplayList.DisplayItem[] =>
        rest.map((item) =>
          role === "host"
            ? paintHost(item, effects, t - start, frame)
            : paintRider(item, effects, t - start)
        );

      // The static value: the state at the playhead as it stands now, read
      // untracked so lowering does not subscribe to the clock.
      const t0 = readLive(playhead);
      let cache = { t: t0, items: at(t0) };
      const current = (): DisplayList.DisplayItem[] => {
        const t = playhead();
        if (t !== cache.t) cache = { t, items: at(t) };
        return cache.items;
      };
      items.forEach((item, j) => {
        const channels = channelsOf(item, effects, role);
        if (channels.length === 0) return;
        assignPaint(item, cache.items[j], channels);
        const slots: Record<string, () => unknown> = {};
        for (const c of channels) {
          slots[c] =
            c === "opacity"
              ? () => current()[j].style?.opacity ?? 1
              : () => (current()[j] as unknown as Record<string, unknown>)[c];
        }
        setLiveSlots(item, slots);
      });
    },
  };
}
