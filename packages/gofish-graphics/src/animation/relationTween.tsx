/**
 * A RELATIONAL mark across keyframes: an arrow drawn again at every frame
 * from where its operands are at that frame.
 *
 * PROTOTYPE (animation grammar proposal). A relational mark's geometry is a
 * function of its operands' boxes (`arrowGeometry`), so it is not
 * interpolated between keyframes the way a box is; it is RE-DERIVED from the
 * operands' interpolated boxes. That is what keeps an arrow attached while the
 * boxes it joins move, where interpolating the two drawn arrows would slide
 * its ends off them.
 *
 * Each operand's box is read the way `tween` reads a leaf's: its placed box at
 * every keyframe that has it, interpolated with the same curve and ease, and
 * held at a keyframe while the operand enters or leaves. The arrow itself
 * enters and leaves by the same rule over the keyframes that have it, fading
 * in place (while still following its operands).
 *
 * Like `tween`, the node is laid out once: its box is the union of its
 * operands' boxes over the whole run, and the playhead is read at paint,
 * patching the arrow's path.
 */
import type { DisplayList } from "gofish-ir";
import { GoFishAST } from "../ast/_ast";
import { GoFishNode } from "../ast/_node";
import { GoFishRef } from "../ast/_ref";
import { fadeItem } from "../ast/displayList/lowerHelpers";
import { axisScale } from "../ast/domain";
import { Size } from "../ast/dims";
import { UNDEFINED, UnderlyingSpace } from "../ast/underlyingSpace";
import { createNodeOperator } from "../ast/withGoFish";
import {
  arrowGeometry,
  arrowItems,
  arrowPropsOf,
  type ArrowBox,
} from "../ast/graphicalOperators/arrow";
import { lifecycle, sampleRun } from "../ast/graphicalOperators/tween";
import { readLive } from "../interaction/live";
import { setLiveItems } from "../interaction/liveSlots";
import { channelReader, type InterpolationMethod } from "../interpolate";
import { bbox, unionAll } from "../util/bbox";

/** An operand at one keyframe: the keyframe's time and the operand there. */
type OperandAt = { t: number; node: GoFishNode };

export type RelationTweenOptions = {
  at: () => number;
  /** The times of the keyframes that draw this arrow. */
  knots: number[];
  /** Every keyframe's time. */
  sequence: number[];
  method: InterpolationMethod;
  ease?: (u: number) => number;
  props: NonNullable<ReturnType<typeof arrowPropsOf>>;
  from: OperandAt[];
  to: OperandAt[];
};

export const relationTween = (o: RelationTweenOptions) =>
  createNodeOperator((_: object, children: GoFishAST[]) => {
    const readPlayhead = o.at;
    const t0 = readLive(readPlayhead);
    const life = lifecycle(o.knots, o.sequence, o.ease);
    const operands = [o.from, o.to];
    const lives = operands.map((run) =>
      lifecycle(
        run.map((e) => e.t),
        o.sequence,
        o.ease
      )
    );

    return new GoFishNode(
      {
        type: "relationTween",
        shared: [false, false],
        resolveUnderlyingSpace: (
          _c: Size<UnderlyingSpace>[],
          _n: GoFishAST[]
        ) => [UNDEFINED, UNDEFINED],
        layout: (_shared, size, scales, kids) => {
          const placed = kids.map((child) =>
            child.layout(size, [
              axisScale(scales?.[0]?.sigma, undefined),
              axisScale(scales?.[1]?.sigma, undefined),
            ])
          );
          let next = 0;
          const boxes = operands.map((run) =>
            run.map(() => {
              const [x, y] = placed[next++].dims;
              return bbox(x.min!, x.max!, y.min!, y.max!);
            })
          );
          /** Each operand's box channels over its own run. */
          const tracks = operands.map((run, i) => {
            const knots = run.map((e) => e.t);
            const read = (f: (b: ReturnType<typeof bbox>) => number) =>
              channelReader(knots, boxes[i].map(f), o.method);
            return {
              knots,
              x: read((b) => b.minX),
              y: read((b) => b.minY),
              w: read((b) => b.maxX - b.minX),
              h: read((b) => b.maxY - b.minY),
            };
          });
          const all = unionAll(...boxes.flat());
          return {
            intrinsicDims: [
              { min: all.minX, size: all.maxX - all.minX },
              { min: all.minY, size: all.maxY - all.minY },
            ],
            transform: { translate: [0, 0] },
            renderData: { tracks },
          };
        },
        lower: ({ renderData, toPixel, local }) => {
          const { tracks } = renderData as {
            tracks: {
              knots: number[];
              x: (a: any) => number;
              y: (a: any) => number;
              w: (a: any) => number;
              h: (a: any) => number;
            }[];
          };
          const own = (p: [number, number]) => toPixel(local(p));
          /** Each operand's box at a playhead: held at a keyframe while it
           *  enters or leaves, moving between two that both have it. */
          const boxAt = (i: number, t: number): ArrowBox => {
            const tr = tracks[i];
            const s = sampleRun(tr.knots, lives[i](t).at, o.method, o.ease);
            return {
              x: tr.x(s.at),
              y: tr.y(s.at),
              w: tr.w(s.at),
              h: tr.h(s.at),
            };
          };
          const build = (t: number): DisplayList.DisplayItem[] => {
            const items = arrowItems(
              arrowGeometry(boxAt(0, t), boxAt(1, t), o.props),
              o.props,
              own
            );
            const { alpha } = life(t);
            return alpha === 1 ? items : items.map((it) => fadeItem(it, alpha));
          };
          const now = readLive(readPlayhead) ?? t0;
          const items = build(now);
          setLiveItems(
            items,
            items.map((item) =>
              item.kind === "path"
                ? ["d", "opacity"]
                : ["cx", "cy", "rx", "ry", "opacity"]
            ),
            readPlayhead,
            build,
            { key: now, items }
          );
          return items;
        },
      },
      children
    );
  })(
    {},
    [...o.from, ...o.to].map((e) => new GoFishRef({ node: e.node }))
  );
