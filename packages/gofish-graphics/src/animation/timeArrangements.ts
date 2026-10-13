/**
 * `time.stagger` and `time.parallel` — WHEN, as values that work in both
 * forms of a build-in.
 *
 *   CHAINED    spread(...).transition({ enter: time.stagger({ lag: 60 }) })
 *              arranges the spread's children in time.
 *   SELECTION  .layer(chart(selectAll("bars"))
 *                .flow(time.stagger({ by: "city", spacing: 0 }))
 *                .mark(time.transition({ enter: Animation.grow() })))
 *              regroups the selected marks by `by` and arranges the groups.
 *
 * So each call returns a flow OPERATOR (the selection form's) that also
 * carries its arrangement (`__timeArrangement`, which the chained form reads).
 * As an operator it groups the refs it is given, one child per group in the
 * key's order, and records the arrangement on the node it builds. Its `by`
 * is spent on that split, so the recorded arrangement has none: its children
 * already ARE the groups. The chained form records the stagger's own `by`
 * and groups the operator's children when the build is installed. Both
 * records are read by the same walk (`install.ts`).
 *
 * `buildIn` is the selection form's leaf: the node `time.transition({ enter })`
 * makes when there is no `time.sequence` (build mode). It draws nothing and
 * records the effects and the marks they animate.
 */
import type { DisplayList } from "gofish-ir";
import { createOperator } from "../ast/marks/createOperator";
import { Frame } from "../ast/graphicalOperators/frame";
import { targetOf } from "../ast/graphicalOperators/layer";
import { GoFishAST } from "../ast/_ast";
import { GoFishNode } from "../ast/_node";
import { GoFishRef } from "../ast/_ref";
import { axisScale } from "../ast/domain";
import { UNDEFINED, type UnderlyingSpace } from "../ast/underlyingSpace";
import type { Size } from "../ast/dims";
import { createNodeOperator } from "../ast/withGoFish";
import type { SplitBy } from "../ast/datumProjection";
import { bbox, height, unionAll, width } from "../util/bbox";
import { resolveEase, type Ease, type Effect } from "./effects";
import type { StaggerFrom } from "./schedule";
import { groupEntries, rowsOf } from "./grouping";
import {
  setNodeTransition,
  type ArrangementSpec,
  type TimeArrangement,
} from "./transition";
import type { Operator } from "../ast/types";

export type StaggerOptions = {
  /** Milliseconds between the starts of neighboring groups, or a function of
   *  the wave index `w` (1, 2, …) giving the gap before wave `w`.
   *  PROTOTYPE (gun-deaths): the function form. */
  lag?: number | ((w: number) => number);
  /** Warp the start times across the run (GSAP / Motion `stagger({ ease
   *  })`); with a number `lag` or a `dwell`. PROTOTYPE (gun-deaths). */
  ease?: Ease;
  /** Milliseconds between one group's end and the next one's start;
   *  `spacing: 0` is one after another. */
  spacing?: number;
  /** The share of the time spent between starts, 0 (all together) to 1
   *  (back to back); the lag is derived from it. */
  dwell?: number;
  /** Split the children by this key and take the groups in its order;
   *  children with equal keys start together. Without it each child is its
   *  own group, in layout order. In an operator's `update` (a staggered
   *  move between keyframes) the MARKS under the operator are split by it,
   *  so a child whose marks disagree on the key is no error: R2D3's
   *  histogram staggers each dot by its own elevation under the bins.
   *  PROTOTYPE: `enter` still splits whole children. */
  by?: SplitBy;
  /** Which group starts first. Default `"first"`. */
  from?: StaggerFrom;
};

/** The rows an item of the flow stands for: a selected mark's (a ref or a
 *  node), or, in a chart's own flow (`chart(rows).flow(time.stagger({ by
 *  }))`), the data row itself. PROTOTYPE (gun-deaths): the flow form used to
 *  read only refs. */
const itemRows = (item: unknown): unknown[] =>
  item instanceof GoFishRef || item instanceof GoFishNode
    ? rowsOf(item)
    : [item];

type TimeArrangementOperator = Operator<any, any> & TimeArrangement;

function timeOperator(
  spec: ArrangementSpec,
  children?: unknown[]
): TimeArrangementOperator {
  if (children !== undefined && spec.by !== undefined) {
    throw new Error(
      `[gofish] time.${spec.kind}({ by }, [...]): in the combinator form the ` +
        `children are given, one group each, so there is nothing to split ` +
        `by. Drop \`by\`, or use time.${spec.kind}({ by }) in a .flow(...).`
    );
  }
  const operator = createOperator<any, ArrangementSpec>(
    async (_opts, children) => {
      const node = (await Frame({}, children)) as GoFishNode;
      // The split below already put each group in its own child.
      const { by: _spent, ...arrangement } = spec;
      setNodeTransition(node, { kind: "operator", enter: arrangement });
      return node;
    },
    {
      split: (o, items) => groupEntries(items, itemRows, o.by),
      // Positions nothing in space.
      arrangement: { kind: "none" },
    }
    // PROTOTYPE (gun-deaths): the combinator form, `time.stagger(opts,
    // [a, b, …])`, as every other operator has (`stack(opts, [a, b])`): the
    // children are the groups, in the order given.
  )(spec, children as any) as unknown as TimeArrangementOperator;
  Object.defineProperty(operator, "__timeArrangement", { value: spec });
  return operator;
}

/** Start the children one after another, `lag` apart (or `spacing` after
 *  each other's end, or at a `dwell`). With a list of children it is a
 *  combinator over them (PROTOTYPE, gun-deaths). */
export const stagger = (
  opts: StaggerOptions,
  children?: unknown[]
): TimeArrangementOperator => {
  const { ease, ...rest } = opts;
  return timeOperator(
    {
      kind: "stagger",
      ...rest,
      ...(ease === undefined ? {} : { ease: resolveEase(ease) }),
    },
    children
  );
};

/** Start the children together. */
export const parallel = (children?: unknown[]): TimeArrangementOperator =>
  timeOperator({ kind: "parallel" }, children);

/**
 * The selection form's leaf: the marks `operands` point at enter with the
 * `enter` effects, together (and would leave with `exit`, which the build
 * refuses). It lays its operands out the way a connector does (by their own
 * placed boxes) so its box is theirs and it moves nothing, and it draws
 * nothing itself: the marks animate in place, under the rule the build
 * installs on them.
 */
export const buildIn = createNodeOperator(
  (
    { enter, exit }: { enter: Effect[]; exit?: Effect[] },
    children: GoFishAST[]
  ) => {
    const node = new GoFishNode(
      {
        type: "buildIn",
        shared: [false, false],
        resolveUnderlyingSpace: (
          _children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => [UNDEFINED, UNDEFINED],
        layout: (_shared, size, scales, kids) => {
          const boxes = kids.map((child) => {
            const [x, y] = child.layout(size, [
              axisScale(scales?.[0]?.sigma, undefined),
              axisScale(scales?.[1]?.sigma, undefined),
            ]).dims;
            return bbox(x.min!, x.max!, y.min!, y.max!);
          });
          const box = unionAll(...boxes);
          return {
            intrinsicDims: [
              { min: box.minX, size: width(box) },
              { min: box.minY, size: height(box) },
            ],
            transform: { translate: [0, 0] },
          };
        },
        lower: (): DisplayList.DisplayItem[] => [],
      },
      children
    );
    // It draws nothing, so it claims no place in the paint order. Saying so
    // (a neutral explicit order) keeps the relational-mark default, "paint
    // under your operands" (`layer.tsx`), from reordering the very marks it
    // selects: the selected bars must paint exactly as the chained form's.
    // TODO(#907): declared shortcut. The z-order solve should not reorder
    // siblings no constraint relates; remove this once it doesn't.
    node.zOrder(0);
    setNodeTransition(node, {
      kind: "mark",
      enter,
      exit,
      targets: children
        .map(targetOf)
        .filter((t): t is GoFishNode => t !== undefined),
    });
    return node;
  }
);
