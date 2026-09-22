/**
 * `Tween` — the node behind `time.transition()`: the temporal reading of
 * `connect`.
 *
 * `connect` consumes a run of already-laid-out marks and emits the geometry
 * BETWEEN them, all of it at once, as a path. `Tween` consumes the same run
 * and emits the geometry AT one point along it — the mark the run passes
 * through at the current playhead. Same operands, same derived-geometry
 * stratum, same lack of a size claim of its own; only the reading differs. A
 * line is the whole trajectory, a tween is the dot moving along it.
 *
 * Interpolation runs over the operands' RESOLVED geometry (their placed
 * boxes), i.e. downstream of layout, with the knots at the keyframes' own data
 * time values — see `src/interpolate.ts`. Under the σ-affine model that
 * agrees with re-laying-out at an interpolated datum whenever the path through
 * layout is affine in the interpolated quantities, which a fixed-domain
 * scatter is (see the animation design note, §4.1).
 *
 * The operands are made invisible here, by the same structural rule `blank()`
 * uses (`INTERNAL_emitNothing`): once a transition is reading a run of
 * keyframes, the keyframes themselves are scaffolding. They keep their boxes,
 * their data and their anchoring role, and they contribute no display items
 * and no hit-test targets.
 *
 * WHERE THE PLAYHEAD IS READ. The run is a LAYOUT-time fact: which keyframes
 * there are, where layout placed each of them, and therefore the whole curve
 * the mark will travel. The playhead is a PAINT-time fact: which point of that
 * curve is showing right now. So the two are split by the reactivity rule
 * (`src/interaction/live.ts`): the node reads the clock once as it is built,
 * through `readLive`, for a value to lower and to register the clock for
 * events, and the paint tier re-reads it per frame inside `live()` slots,
 * patching the one moving item's attributes and nothing else.
 *
 * That split is sound because a tween is the LEAF case of subtree containment
 * (incremental layout, issue #674). The node makes no size claim of its own
 * and contributes no domain values, so nothing above it can see the playhead
 * move; and it has no children of its own to re-place, so "re-laying out the
 * subtree" is recomputing one display item — which is exactly what the paint
 * tier does. What it costs is the one thing containment demands in exchange:
 * the node's LAYOUT box is the extent of the whole trajectory, the union of
 * its keyframes' placed boxes, not the box it happens to occupy at t. That is
 * the same box a `line` through the same keyframes claims, for the same
 * reason — the room a mark needs is the room it uses over its whole run.
 */
import type { DisplayList } from "gofish-ir";
import { GoFishAST } from "../_ast";
import { GoFishNode } from "../_node";
import { resolveColorChannel } from "../../color";
import {
  lowerStyle,
  rectItemFromBox,
  roleFor,
} from "../displayList/lowerHelpers";
import { displayTranslate } from "../dims";
import { isValue, MaybeValue } from "../data";
import { axisScale } from "../domain";
import { UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import { Size } from "../dims";
import { createNodeOperator } from "../withGoFish";
import { readLive } from "../../interaction/live";
import { setLiveSlots } from "../../interaction/liveSlots";
import {
  interpolateRun,
  knotOrder,
  type InterpolationMethod,
} from "../../interpolate";

/** The shapes a transition can paint. A keyframe's own shape decides: the
 *  emitted mark is the same kind of thing as the marks it moves between. */
const SUPPORTED_SHAPES = new Set(["ellipse", "rect", "blank"]);

/** The display-item fields a moving mark patches per frame, by shape — the
 *  item's own geometry field names, which is what a live slot is keyed by
 *  (see `paintSVG`'s `GEOMETRY_CHANNELS`). */
const MOVING_FIELDS: Record<string, string[]> = {
  ellipse: ["cx", "cy", "rx", "ry"],
  rect: ["x", "y", "w", "h"],
};

export type TweenOptions = {
  /** The playhead, in the time field's own units (a year, not a fraction).
   *  A signal (a `timer`, or anything that reads one) makes the mark move: it
   *  is read once as the node is built, for a value to lower, and then per
   *  frame in paint position. A plain number is a chart held still, and lowers to exactly the
   *  static item it would have lowered before. */
  at: (() => number) | number;
  /** Each operand's time value, in operand order. */
  knots: number[];
  /** How the run is read between keyframes. */
  method: InterpolationMethod;
  /** Time reparameterization inside one keyframe interval: `u -> u'`, both in
   *  `[0, 1]`. Easing is a warp of the parameter, not of the values, so it
   *  composes with either interpolation method. */
  ease?: (u: number) => number;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  opacity?: number;
};

/** One keyframe's placed box, as the four edges the run interpolates over. */
type Box = { xMin: number; xMax: number; yMin: number; yMax: number };

/**
 * The run a tween paints, in time order: everything about it that layout
 * decided. Reading it at a playhead is pure arithmetic over these numbers,
 * which is what lets the paint tier do it per frame.
 */
type Run = {
  knots: number[];
  boxes: Box[];
  /** The shape every keyframe of the run is — the shape the moving mark is. */
  shape: string;
  /** Each keyframe's own color channel, for the paint the mark inherits. */
  colors: (MaybeValue<string> | undefined)[];
  method: InterpolationMethod;
  ease?: (u: number) => number;
};

/** The run read at one playhead: the box the moving mark occupies, and which
 *  keyframe the attributes that are NOT blended come from. */
type Sample = { cx: number; cy: number; w: number; h: number; source: number };

/**
 * Evaluate a run at `t`.
 *
 * Easing warps the parameter INSIDE the interval `t` falls in, then maps back
 * to time, so an eased run still passes through every keyframe at its own time
 * value.
 *
 * The paint the moving mark inherits from its keyframes is not interpolated —
 * a country's color is its color — so `source` names one keyframe to read it
 * off rather than blending. Which one: normally the keyframe the playhead is
 * nearest, but under `"step"` the PREVIOUS one, so the whole mark — position,
 * size, paint — is the keyframe the method is holding rather than a held
 * position wearing the next keyframe's paint.
 */
function sampleRun(run: Run, t: number): Sample {
  const { knots, boxes, method, ease } = run;
  let warped = t;
  if (ease !== undefined && knots.length >= 2) {
    let i = 0;
    while (i < knots.length - 2 && knots[i + 1] <= t) i++;
    const [lo, hi] = [knots[i], knots[i + 1]];
    if (t > lo && t < hi) warped = lo + ease((t - lo) / (hi - lo)) * (hi - lo);
  }

  const channel = (read: (b: Box) => number) =>
    interpolateRun(knots, boxes.map(read), warped, method);

  const cx = channel((b) => (b.xMin + b.xMax) / 2);
  const cy = channel((b) => (b.yMin + b.yMax) / 2);
  const w = channel((b) => b.xMax - b.xMin);
  const h = channel((b) => b.yMax - b.yMin);

  const source =
    method === "step"
      ? knots.reduce((best, k, i) => (k <= t ? i : best), 0)
      : knots.reduce(
          (best, k, i) =>
            Math.abs(k - t) < Math.abs(knots[best] - t) ? i : best,
          0
        );
  return { cx, cy, w, h, source };
}

export const tween = createNodeOperator(
  (
    {
      at: playhead,
      knots,
      method,
      ease,
      fill,
      stroke,
      strokeWidth,
      opacity,
    }: TweenOptions,
    children: GoFishAST[]
  ) => {
    /** The keyframe nodes behind the operands (each operand is a `ref`). */
    const keyframeNodes = (cs: GoFishAST[]): GoFishNode[] =>
      cs
        .map((c) => ((c as any).targetNode ?? c) as GoFishNode)
        .filter((n): n is GoFishNode => n instanceof GoFishNode);

    /** The playhead as a function, whether or not it was written as one, and
     *  whether it can change after layout. A plain number cannot, so the node
     *  lowers to a static item and nothing reactive is wired up. */
    const readPlayhead = (): number =>
      typeof playhead === "function" ? playhead() : playhead;
    const moves = typeof playhead === "function";

    // The playhead, read ONCE, HERE: the value the node lowers to, and the
    // read that registers the clock with the chart's interaction runtime.
    // Here rather than in `layout` because this is the part of the node's life
    // that happens during RESOLVE, which is when the ambient runtime is
    // installed and an input read can reach it. `readLive` is what keeps the
    // read paint-time — untracked, and flagged so the input wires event
    // dispatch without becoming a pipeline dependency of this chart (see
    // `src/interaction/live.ts`).
    const t = readLive(readPlayhead);

    return new GoFishNode(
      {
        type: "tween",
        shared: [false, false],
        // Data-driven paint is registered for the shared color scale the same
        // way a leaf mark's is — see `connect`'s identical note.
        color: isValue(fill) ? fill : undefined,
        resolveUnderlyingSpace: (
          _children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => [UNDEFINED, UNDEFINED],
        layout: (_shared, size, scales, children) => {
          const keyframes = keyframeNodes(children);
          const shapes = new Set(keyframes.map((n) => n.type));
          for (const shape of shapes) {
            if (!SUPPORTED_SHAPES.has(shape)) {
              throw new Error(
                `[gofish] time.transition(): cannot move a "${shape}" mark — a ` +
                  `transition paints its keyframes' own shape, and so far that ` +
                  `is ${[...SUPPORTED_SHAPES].join(" / ")}. Use one of those as ` +
                  `the keyframe mark, or open an issue for "${shape}".`
              );
            }
          }
          // ONE shape for the whole run, because the shape is a layout-time
          // fact like the rest of the run: the moving mark is a single display
          // item whose attributes the playhead patches, and no attribute turns
          // a circle into a rectangle. A run is one key's marks from one mark
          // factory, so this is homogeneous in practice; saying so loudly
          // beats painting whichever shape the playhead happened to start on.
          if (shapes.size > 1) {
            throw new Error(
              `[gofish] time.transition(): a transition paints ONE shape for ` +
                `the whole run, and these keyframes are ` +
                `${[...shapes].join(" / ")}. Use the same mark for every ` +
                `keyframe of a run.`
            );
          }
          // The keyframes are scaffolding once a transition reads them.
          for (const n of keyframes) n.INTERNAL_emitNothing();

          // Forward σ but not the anchored map, exactly as `connect` does:
          // the operands are placed by their own boxes, not by data position.
          const placed = children.map((child) =>
            child.layout(size, [
              axisScale(scales?.[0]?.sigma, undefined),
              axisScale(scales?.[1]?.sigma, undefined),
            ])
          );

          const order = knotOrder(knots);
          const run: Run = {
            knots: order.map((i) => knots[i]),
            boxes: order.map((i) => {
              const dims = placed[i].dims;
              return {
                xMin: dims[0].min!,
                xMax: dims[0].max!,
                yMin: dims[1].min!,
                yMax: dims[1].max!,
              };
            }),
            shape: keyframes[0]?.type ?? "ellipse",
            colors: order.map((i) => (children[i] as any)?.color),
            method,
            ease,
          };

          // The box is the whole TRAJECTORY, not the point the mark is at:
          // the union of the keyframes' placed boxes, which is the room the
          // mark uses over its run. That is what makes the playhead paint-time
          // — nothing above this node can see it move — and it is the same box
          // a `line` through the same keyframes claims.
          const spans = run.boxes.length > 0;
          const xMin = Math.min(...run.boxes.map((b) => b.xMin));
          const xMax = Math.max(...run.boxes.map((b) => b.xMax));
          const yMin = Math.min(...run.boxes.map((b) => b.yMin));
          const yMax = Math.max(...run.boxes.map((b) => b.yMax));

          return {
            intrinsicDims: [
              { min: spans ? xMin : 0, size: spans ? xMax - xMin : 0 },
              { min: spans ? yMin : 0, size: spans ? yMax - yMin : 0 },
            ],
            transform: { translate: [0, 0] },
            renderData: { run, t },
          };
        },
        lower: (
          { transform, renderData, toPixel },
          _children,
          node
        ): DisplayList.DisplayItem[] => {
          const { run, t } = renderData as { run: Run; t: number };
          const unitScale = node.getRenderSession().scaleContext?.unit;
          // One resolved paint per keyframe, so reading the run at a playhead
          // is an array index rather than a color computation.
          const fills = run.colors.map(
            (keyframeColor) =>
              resolveColorChannel(
                (fill ?? keyframeColor) as MaybeValue<string>,
                unitScale
              ) ?? "black"
          );
          const declaredStroke = resolveColorChannel(stroke, unitScale);

          // The same local-pixel map `connect` builds: the node's absolute
          // translate folded in, so the interpolated point lands where the
          // keyframes' own boxes were measured.
          const [tx, ty] = displayTranslate(transform);
          const toLocalPixel = ([px, py]: [number, number]): [number, number] =>
            toPixel([px + tx, py + ty]);

          /** The moving mark as it stands at one playhead. Everything it needs
           *  is either in `run` (layout's) or in this closure (lowering's), so
           *  the paint tier can call it per frame. */
          const build = (at: number): DisplayList.DisplayItem => {
            const { cx, cy, w, h, source } = sampleRun(run, at);
            const resolvedFill = fills[source];
            const style = lowerStyle({
              fill: resolvedFill,
              stroke: declaredStroke ?? resolvedFill,
              strokeWidth: strokeWidth ?? 0,
              opacity: opacity ?? 1,
            });
            if (run.shape === "ellipse") {
              const [px, py] = toLocalPixel([cx, cy]);
              return {
                kind: "ellipse",
                cx: px,
                cy: py,
                rx: w / 2,
                ry: h / 2,
                style,
                datum: node.datum,
                role: roleFor(node.datum),
              };
            }
            return {
              ...rectItemFromBox(
                cx - w / 2,
                cx + w / 2,
                cy - h / 2,
                cy + h / 2,
                toLocalPixel
              ),
              style,
              datum: node.datum,
              role: roleFor(node.datum),
            };
          };

          const item = build(t);
          if (moves) {
            // The paint tier's half of the split: one thunk per attribute of
            // the moving mark, each re-reading the playhead in JSX attribute
            // position so Solid patches that attribute and nothing else. The
            // item is rebuilt at most once per distinct playhead value, and
            // the attributes then read their own field off it.
            let cache = { at: t, item };
            const itemAt = (): DisplayList.DisplayItem => {
              const now = readPlayhead();
              if (now !== cache.at) cache = { at: now, item: build(now) };
              return cache.item;
            };
            const slots: Record<string, () => unknown> = {};
            for (const field of MOVING_FIELDS[item.kind] ?? []) {
              slots[field] = () =>
                (itemAt() as unknown as Record<string, unknown>)[field];
            }
            // Paint moves with the mark: which keyframe a run reads its color
            // off depends on where the playhead is.
            slots.fill = () => itemAt().style?.fill;
            slots.stroke = () => itemAt().style?.stroke;
            setLiveSlots(item, slots);
          }
          return [item];
        },
      },
      children
    );
  }
);
