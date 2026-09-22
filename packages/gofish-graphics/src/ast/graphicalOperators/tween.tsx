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
import {
  interpolateRun,
  knotOrder,
  type InterpolationMethod,
} from "../../interpolate";

/** The shapes a transition can paint. A keyframe's own shape decides: the
 *  emitted mark is the same kind of thing as the marks it moves between. */
const SUPPORTED_SHAPES = new Set(["ellipse", "rect", "blank"]);

export type TweenOptions = {
  /** The playhead, in the time field's own units (a year, not a fraction). */
  t: number;
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

export const tween = createNodeOperator(
  (
    {
      t,
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
          const sortedKnots = order.map((i) => knots[i]);
          const boxes = order.map((i) => placed[i].dims);

          // Easing warps the parameter INSIDE the interval `t` falls in, then
          // maps back to time, so an eased run still passes through every
          // keyframe at its own time value.
          let warped = t;
          if (ease !== undefined && sortedKnots.length >= 2) {
            let i = 0;
            while (i < sortedKnots.length - 2 && sortedKnots[i + 1] <= t) i++;
            const [lo, hi] = [sortedKnots[i], sortedKnots[i + 1]];
            if (t > lo && t < hi) {
              warped = lo + ease((t - lo) / (hi - lo)) * (hi - lo);
            }
          }

          const channel = (read: (b: (typeof boxes)[number]) => number) =>
            interpolateRun(sortedKnots, boxes.map(read), warped, method);

          const cx = channel((b) => (b[0].min! + b[0].max!) / 2);
          const cy = channel((b) => (b[1].min! + b[1].max!) / 2);
          const w = channel((b) => b[0].max! - b[0].min!);
          const h = channel((b) => b[1].max! - b[1].min!);

          // The paint the moving mark inherits from its keyframes: whichever
          // keyframe the playhead is nearest. Paint is not interpolated — a
          // country's color is its color — so it is READ OFF a keyframe
          // rather than blended (the same value at every keyframe here, since
          // the run is one key's).
          const nearest =
            order[
              sortedKnots.reduce(
                (best, k, i) =>
                  Math.abs(k - t) < Math.abs(sortedKnots[best] - t) ? i : best,
                0
              )
            ];
          const keyframeColor = (children[nearest] as any)?.color;

          return {
            intrinsicDims: [
              { min: cx - w / 2, size: w },
              { min: cy - h / 2, size: h },
            ],
            transform: { translate: [0, 0] },
            renderData: {
              cx,
              cy,
              w,
              h,
              shape: keyframes[nearest]?.type ?? "ellipse",
              keyframeColor,
            },
          };
        },
        lower: (
          { transform, renderData, toPixel },
          _children,
          node
        ): DisplayList.DisplayItem[] => {
          const { cx, cy, w, h, shape, keyframeColor } = renderData as {
            cx: number;
            cy: number;
            w: number;
            h: number;
            shape: string;
            keyframeColor: MaybeValue<string> | undefined;
          };
          const unitScale = node.getRenderSession().scaleContext?.unit;
          const resolvedFill = resolveColorChannel(
            (fill ?? keyframeColor) as MaybeValue<string>,
            unitScale
          );
          const resolvedStroke =
            resolveColorChannel(stroke, unitScale) ?? resolvedFill;
          const style = lowerStyle({
            fill: resolvedFill ?? "black",
            stroke: resolvedStroke ?? resolvedFill ?? "black",
            strokeWidth: strokeWidth ?? 0,
            opacity: opacity ?? 1,
          });

          // The same local-pixel map `connect` builds: the node's absolute
          // translate folded in, so the interpolated point lands where the
          // keyframes' own boxes were measured.
          const [tx, ty] = displayTranslate(transform);
          const at = ([px, py]: [number, number]): [number, number] =>
            toPixel([px + tx, py + ty]);

          if (shape === "ellipse") {
            const [px, py] = at([cx, cy]);
            return [
              {
                kind: "ellipse",
                cx: px,
                cy: py,
                rx: w / 2,
                ry: h / 2,
                style,
                datum: node.datum,
                role: roleFor(node.datum),
              },
            ];
          }
          return [
            {
              ...rectItemFromBox(
                cx - w / 2,
                cx + w / 2,
                cy - h / 2,
                cy + h / 2,
                at
              ),
              style,
              datum: node.datum,
              role: roleFor(node.datum),
            },
          ];
        },
      },
      children
    );
  }
);
