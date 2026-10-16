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
import { originIs } from "../ast/underlyingSpace";
import { readLive } from "../interaction/live";
import {
  readChannel,
  setLiveItems,
  writeChannel,
} from "../interaction/liveSlots";
import {
  channelsOf,
  effectProgress,
  paintHost,
  paintRider,
  type TimedEffect,
  type EffectFrame,
} from "./effects";

/** What lowering knows about where a node was drawn. */
type LowerFrame = { transform?: Transform; toPixel: ToPixel };

/** A node's paint-time animation. `makeRule` builds the build-in's (its
 *  effects, played from their start on the build clock); the slider's handle
 *  has its own (`widgets.ts`), which moves the handle with the value. */
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
};

/** Which of a node's axes carry a data SIZE: the ones a grow collapses. Read
 *  off the node itself: an axis whose resolved space is a baseline magnitude
 *  or a difference, or whose size channel is data-driven (a rect with a data
 *  `x` and `w` is POSITION on x, and still grows from its start). */
function sizeAxesOf(node: GoFishNode): [boolean, boolean] {
  const dims = node.args?.dims as { size?: unknown }[] | undefined;
  const axis = (a: 0 | 1): boolean => {
    const space = node._underlyingSpace?.[a];
    if (space && (originIs(space, "free") || originIs(space, "none")))
      return true;
    return isValue(dims?.[a]?.size);
  };
  return [axis(0), axis(1)];
}

export function makeRule(
  playhead: () => number,
  start: number,
  effects: TimedEffect[]
): AnimationRule {
  const end = start + Math.max(0, ...effects.map((e) => e.delay + e.duration));
  /** The masks of the mark this rule animates (see MASKS below). */
  const masks: {
    box?: DisplayList.RectItem;
    rects: {
      rect: DisplayList.RectItem;
      rectAt: (t: number) => DisplayList.RectItem[];
    }[];
    wrappers: DisplayList.MaskItem[];
  } = { rects: [], wrappers: [] };
  // The playhead as the effects see it: before the start every one of them
  // is at 0 and from the end on at 1, so those stretches read as one key
  // each, and a mark that is waiting or done is not rebuilt per frame.
  const key = (): number => {
    const t = playhead();
    return t < start ? -Infinity : t >= end ? Infinity : t;
  };
  return {
    paint(lowered, { transform, toPixel }, node, role) {
      if (lowered.length === 0) return;
      // An effect on STROKES (`draw`) animates every path the mark draws,
      // wherever it sits, rather than the items it lowered to. PROTOTYPE
      // SHORTCUT: then every effect of the mark acts on its strokes.
      const items =
        role === "host" && effects.some((e) => e.effect.strokes)
          ? strokesIn(lowered)
          : lowered;
      if (items.length === 0) {
        throw new Error(
          `[gofish] Animation.draw(): this "${node.type}" mark draws no ` +
            `stroke (no path) to draw along.`
        );
      }
      // The effects are checked against the items the mark lowered to, which
      // lowering alone knows: a rect in polar coordinates is drawn as a path,
      // and a grow or a wipe cannot reshape one.
      if (role === "host") {
        for (const item of items) {
          for (const { effect } of effects) effect.fits(item.kind);
        }
      }
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
      const stateAt = (t: number): DisplayList.DisplayItem[] =>
        rest.map((item) =>
          role === "host"
            ? paintHost(item, effects, t - start, frame)
            : paintRider(item, effects, t - start)
        );
      const channels = items.map((item) => channelsOf(item, effects, role));

      // The static value: the state at the playhead as it stands now, read
      // untracked so lowering does not subscribe to the clock. It is written
      // into the renderer's items in place, so each keeps its identity (its
      // id and any live slots already set on it).
      const k0 = readLive(key);
      const first = { key: k0, items: stateAt(k0) };
      items.forEach((item, j) => {
        for (const c of channels[j]) {
          writeChannel(item, c, readChannel(first.items[j], c));
        }
      });
      setLiveItems(items, channels, key, stateAt, first);

      // MASKS (PROTOTYPE, animation grammar): an effect that cannot reshape
      // an item (a side wipe of a path or a composite) draws it under a mask
      // of the part of the MARK's box that shows (`Look.mask`). The box is
      // the union of the boxes of every node the rule animates (the parts of
      // one mark, which lower one after another), so a mark wipes as one; a
      // mask already lowered is brought up to date as each later part
      // widens the box. The items move into one mask item in their place;
      // the mask's rect is what the clock patches.
      if (role !== "host") return;
      const own = pixelBoxOf(node, transform, toPixel);
      if (own === undefined) return;
      masks.box = masks.box === undefined ? own : unionBox(masks.box, own);
      for (const timed of effects) {
        const { mask } = timed.effect;
        if (mask === undefined) continue;
        if (items !== lowered) {
          throw new Error(
            `[gofish] Animation.draw() and Animation.wipe() on one mark: ` +
              `one draws its strokes, the other masks its box. Give it one.`
          );
        }
        const inside = items
          .map((item, j) => ({ item, j }))
          .filter(({ item }) => mask(item.kind, own, 1) !== undefined);
        if (inside.length === 0) continue;
        const kind = inside[0].item.kind;
        const rectAt = (t: number): DisplayList.RectItem[] => [
          {
            ...mask(kind, masks.box!, effectProgress(timed, t - start))!,
            style: { fill: "white" },
          },
        ];
        const m0 = readLive(key);
        const rect = rectAt(m0)[0];
        setLiveItems([rect], [["x", "y", "w", "h"]], key, rectAt, {
          key: Number.NaN,
          items: [rect],
        });
        masks.rects.push({ rect, rectAt });
        const wrapper: DisplayList.DisplayItem = {
          kind: "mask",
          bbox: { ...own },
          mask: [rect],
          content: inside.map(({ item }) => item),
        };
        masks.wrappers.push(wrapper as DisplayList.MaskItem);
        // The wrapper takes the first masked item's place; the others leave
        // the list (they are inside it).
        const drop = new Set(inside.slice(1).map(({ j }) => j));
        lowered[inside[0].j] = wrapper;
        for (let j = lowered.length - 1; j >= 0; j--) {
          if (drop.has(j)) lowered.splice(j, 1);
        }
      }
      // Bring every mask of the mark up to the widened box.
      const kNow = readLive(key);
      for (const { rect, rectAt } of masks.rects) {
        const now = rectAt(kNow)[0];
        for (const c of ["x", "y", "w", "h"] as const) rect[c] = now[c];
      }
      for (const w of masks.wrappers) w.bbox = { ...masks.box };
    },
  };
}

/** Every stroke (path item) drawn inside `items`: in a group's children, a
 *  composite's layers and a mask's content, but not a mask's clip region,
 *  which is not drawn. */
function strokesIn(
  items: DisplayList.DisplayItem[],
  out: DisplayList.DisplayItem[] = []
): DisplayList.DisplayItem[] {
  for (const item of items) {
    if (item.kind === "path") out.push(item);
    else if (item.kind === "group") strokesIn(item.children, out);
    else if (item.kind === "composite") {
      strokesIn(item.source, out);
      strokesIn(item.dest, out);
    } else if (item.kind === "mask") strokesIn(item.content, out);
  }
  return out;
}

const unionBox = (
  a: DisplayList.RectItem,
  b: DisplayList.RectItem
): DisplayList.RectItem => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    kind: "rect",
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
};

/** A node's laid-out box in pixels, as a rect item (no style). */
function pixelBoxOf(
  node: GoFishNode,
  transform: Transform | undefined,
  toPixel: ToPixel
): DisplayList.RectItem | undefined {
  const dims = node.intrinsicDims;
  const [x, y] = [dims?.[0], dims?.[1]];
  if (x?.min === undefined || y?.min === undefined) return undefined;
  const xMax = x.max ?? x.min + (x.size ?? 0);
  const yMax = y.max ?? y.min + (y.size ?? 0);
  const [tx, ty] = displayTranslate(transform);
  const direction = node.yFrame.direction;
  const a = toPixel([x.min + tx, direction * y.min + ty]);
  const b = toPixel([xMax + tx, direction * yMax + ty]);
  return {
    kind: "rect",
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    w: Math.abs(b[0] - a[0]),
    h: Math.abs(b[1] - a[1]),
  };
}
