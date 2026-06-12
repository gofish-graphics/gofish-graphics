import { GoFishNode, Placeable } from "../_node";
import type { AxisOptions } from "../gofish";
import { MaybeValue } from "../data";
import {
  Direction,
  elaborateDims,
  elaborateDirection,
  FancyDims,
  FancyDirection,
  Size,
} from "../dims";
import { Collection } from "lodash";
import { SplitBy, splitKeyFn } from "../datumProjection";
import { computeAesthetic, computeSize, foldFinite } from "../../util";
import { GoFishAST } from "../_ast";
import { createNodeOperator } from "../withGoFish";
import {
  UNDEFINED,
  isDIFFERENCE,
  isPOSITION,
  isSIZE,
} from "../underlyingSpace";
import { UnderlyingSpace } from "../underlyingSpace";
import * as Interval from "../../util/interval";
import { Alignment, alignChildren, resolveAlignmentSpace } from "./alignment";
import {
  distributeSpaceFold,
  applyDistribute,
} from "../constraints/distribute";
import { allocateSlices } from "../constraints/folds";
import { createOperator } from "../marks/createOperator";
import { Mark, Operator } from "../types";

// Utility function to unwrap lodash wrapped arrays
const unwrapLodashArray = function <T>(value: T[] | Collection<T>): T[] {
  if (typeof value === "object" && value !== null && "value" in value) {
    return (value as Collection<T>).value() as T[];
  }
  return value as T[];
};

export const Spread = createNodeOperator(
  (
    {
      name,
      key,
      dir,
      spacing = 8,
      alignment = "baseline",
      sharedScale = false,
      mode = "edge",
      reverse = false,
      glue = false,
      stackWeights,
      axes,
      ...fancyDims
    }: {
      name?: string;
      key?: string;
      dir: FancyDirection;
      spacing?: number;
      alignment?: Alignment;
      sharedScale?: boolean;
      mode?: "edge" | "center";
      reverse?: boolean;
      // When true, treat as a stack: glue children together, summing their
      // sizes into a POSITION at this level. `spacing` is ignored.
      glue?: boolean;
      /**
       * When length matches `children`, divides space along `dir` in proportion
       * to these weights (after subtracting `spacing`). Otherwise each child
       * gets an equal share.
       */
      stackWeights?: number[];
      /** Override axis rendering for this node. true/false applies to both
       * dims; object form controls x/y independently. */
      axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
    } & FancyDims<MaybeValue<number>>,
    children: GoFishAST[] | Collection<GoFishAST>
  ) => {
    // Unwrap lodash wrapped children if needed
    children = unwrapLodashArray(children);

    const stackDir = elaborateDirection(dir);
    const alignDir = (1 - stackDir) as Direction;
    // track whether align axis came from SIZE so we still perform baseline alignment even with posScales
    let alignFromSize = false;
    const dims = elaborateDims(fancyDims);
    // Glue mode ignores spacing.
    const effectiveSpacing = glue ? 0 : spacing;

    const node = new GoFishNode(
      {
        type: "spread",
        args: {
          key,
          name,
          dir,
          spacing,
          alignment,
          sharedScale,
          mode,
          reverse,
          glue,
          stackWeights,
          dims,
        },
        key,
        name,
        shared: [sharedScale, sharedScale],
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          childNodes: GoFishAST[]
        ) => {
          // Cross axis: defer to the shared alignment fold. Keep the
          // `fromSize` flag so layout still baseline-aligns SIZE-derived
          // children even when a posScale is present.
          const alignResult = resolveAlignmentSpace(
            children.map((child) => child[alignDir]),
            alignment
          );
          alignFromSize = alignResult.fromSize;

          // Stack axis: defer to the shared distribute fold. `namedKeys` is the
          // compacted list of children's ordinal keys (drives the ORDINAL
          // branch); distributeSpaceFold re-filters undefined, so the compacted
          // form is equivalent to a positional one.
          const namedKeys = childNodes
            .filter((node): node is GoFishNode => node instanceof GoFishNode)
            .map((node) => node.key)
            .filter((key): key is string => key !== undefined);
          const stackSpace = distributeSpaceFold(
            children.map((child) => child[stackDir]),
            namedKeys,
            {
              spacing: effectiveSpacing,
              mode,
              glue,
              size: dims[stackDir].size,
            }
          );

          const result: Size<UnderlyingSpace> = [UNDEFINED, UNDEFINED];
          result[stackDir] = stackSpace;
          result[alignDir] = alignResult.space;
          return result;
        },
        layout: (shared, size, scaleFactors, children, posScales, node) => {
          if (reverse) {
            children = children.reverse();
          }
          const stackPos = computeAesthetic(
            dims[stackDir].min,
            posScales?.[stackDir]!,
            undefined
          );
          const alignPos = computeAesthetic(
            dims[alignDir].min,
            posScales?.[alignDir]!,
            undefined
          );

          const nextSize: Size = [0, 0];
          nextSize[stackDir] = computeSize(
            dims[stackDir].size,
            scaleFactors?.[stackDir]!,
            size[stackDir]
          );
          nextSize[alignDir] = computeSize(
            dims[alignDir].size,
            scaleFactors?.[alignDir]!,
            size[alignDir]
          );
          size = nextSize;

          // Compute scale factors at this level by dispatching on
          // underlying-space kind: SIZE inverts the composed Monotonic;
          // POSITION derives a linear factor from its domain extent;
          // DIFFERENCE divides by its known pixel width (analogous to
          // POSITION but with no anchored origin).
          const myUSpace = node._underlyingSpace!;
          const computeScaleFactor = (dir: Direction): number | undefined => {
            const space = myUSpace[dir];
            if (isSIZE(space)) {
              return (
                space.domain.inverse(size[dir], {
                  upperBoundGuess: size[dir],
                }) ?? 0
              );
            }
            if (isPOSITION(space) && space.domain) {
              const w = Interval.width(space.domain);
              return w !== 0 ? size[dir] / w : 0;
            }
            if (isDIFFERENCE(space)) {
              return space.width !== 0 ? size[dir] / space.width : 0;
            }
            return undefined;
          };

          if (shared[stackDir]) {
            const sf = computeScaleFactor(stackDir);
            if (sf !== undefined) scaleFactors[stackDir] = sf;
          }
          if (shared[alignDir]) {
            const sf = computeScaleFactor(alignDir);
            if (sf !== undefined) scaleFactors[alignDir] = sf;
          }

          const scaleContext = node.getRenderSession().scaleContext;
          const sfX = scaleFactors[0] ?? 1;
          const sfY = scaleFactors[1] ?? 1;
          scaleContext.x = {
            domain: [0, size[0] / sfX],
            scaleFactor: sfX,
          };
          scaleContext.y = {
            domain: [0, size[1] / sfY],
            scaleFactor: sfY,
          };

          // Divide the stack-axis budget into per-child slices (shared fill
          // policy; weights split it in proportion, else an equal share).
          const childStackSizes = allocateSlices(
            size[stackDir],
            effectiveSpacing,
            children.length,
            stackWeights
          );

          const childPlaceables = children.map((child, i) => {
            const modifiedSize: Size = [0, 0];
            modifiedSize[stackDir] = childStackSizes[i] ?? 0;
            modifiedSize[alignDir] = size[alignDir];
            return child.layout(modifiedSize, scaleFactors, posScales);
          });

          // Fixed-position children have dims already defined (e.g. Ref to another layer)
          const isFixed = (dir: Direction) => (child: Placeable) =>
            child.dims[dir].min !== undefined;
          const alignmentToDim = {
            start: "min",
            middle: "center",
            end: "max",
            baseline: "min",
          } as const;
          const getBaseline = (dir: Direction) => (child: Placeable) =>
            child.dims[dir][alignmentToDim[alignment]!]!;
          const isClose = (a: number, b: number) => Math.abs(a - b) < 1e-6;

          // Align-direction consistency: check before placing (when >= 2 fixed)
          const fixedChildren = childPlaceables.filter(isFixed(alignDir));
          if (fixedChildren.length >= 2) {
            const baselines = fixedChildren.map(getBaseline(alignDir));
            const allSameBaseline = baselines.every((b) =>
              isClose(b!, baselines[0]!)
            );
            if (!allSameBaseline) {
              console.warn(
                "Stack: fixed children have inconsistent align-direction positions",
                { alignment, baselines }
              );
            }
          }

          /* align */
          alignChildren(
            childPlaceables,
            alignDir,
            alignment,
            size[alignDir],
            posScales?.[alignDir],
            alignFromSize
          );

          // distribute: delegate to the shared walk. `reverse` was already
          // applied to `children` above, so the placement order is fixed
          // (order: "forward"). The reporter surfaces spread's historical
          // inconsistency warning for fixed children whose position disagrees
          // with the running layout — a console-only behavior the constraint
          // path doesn't share.
          applyDistribute(
            {
              dir: stackDir === 0 ? "x" : "y",
              spacing: effectiveSpacing,
              mode,
              order: "forward",
            },
            childPlaceables,
            (expected, actual) =>
              console.warn(
                mode === "center"
                  ? "Stack: fixed child stack-direction position inconsistent (center-to-center)"
                  : "Stack: fixed child stack-direction position inconsistent with layout order",
                { expected, actual }
              )
          );

          // A child the alignment step didn't place (no `alignment` given)
          // renders at its own origin (translate 0): nail it down there now so
          // the extents below measure the real box. Left unplaced, the child
          // would be invisible to the measurement and the spread would report
          // a zero cross extent — wrong whenever children's boxes overhang
          // their origin (e.g. facets whose axis labels hang below baseline).
          for (const child of childPlaceables) {
            if (child.dims[alignDir].min === undefined) {
              child.place(alignDir, 0, "baseline");
            }
          }

          // Compute alignDir intrinsicDims from extents to account for negative
          // bars (NaN-safe; see foldFinite for why undefined extents are
          // skipped).
          const reduceExtent = (
            dir: Direction,
            pick: (iv: { min?: number; max?: number }) => number | undefined,
            f: (...n: number[]) => number
          ): number =>
            foldFinite(
              childPlaceables.map((child) => pick(child.dims[dir])),
              f
            );
          const alignMin = reduceExtent(alignDir, (iv) => iv.min, Math.min);
          const alignMax = reduceExtent(alignDir, (iv) => iv.max, Math.max);
          const stackMin = reduceExtent(stackDir, (iv) => iv.min, Math.min);
          const stackMax = reduceExtent(stackDir, (iv) => iv.max, Math.max);
          const alignSize = alignMax - alignMin;
          const stackSize = stackMax - stackMin;
          const translateAlign =
            alignPos !== undefined ? alignPos - alignMin : undefined;

          return {
            intrinsicDims: {
              [alignDir]: {
                min: alignMin,
                size: alignSize,
                center: alignMin + alignSize / 2,
                max: alignMax,
              },
              [stackDir]: {
                min: stackMin,
                size: stackSize,
                center: stackMin + stackSize / 2,
                max: stackMax,
              },
            },
            transform: {
              translate: {
                [alignDir]: translateAlign,
                [stackDir]:
                  stackPos !== undefined ? stackPos - stackMin : undefined,
              },
            },
          };
        },
        render: ({ transform }, children) => {
          return (
            <g
              transform={`translate(${transform?.translate?.[0] ?? 0}, ${transform?.translate?.[1] ?? 0})`}
            >
              {children}
            </g>
          );
        },
      },
      children
    );
    if (axes !== undefined) {
      const toShow = (opt: AxisOptions | undefined): boolean | undefined =>
        opt === undefined ? undefined : opt === false ? false : true;
      node._axisOverride =
        typeof axes === "boolean"
          ? { x: axes, y: axes }
          : { x: toShow(axes.x), y: toShow(axes.y) };
    }
    // Tag with stack direction so coord can map axis overrides to polar dimensions
    node.axisDir = stackDir;
    return node;
  }
);

export type SpreadOptions<T = any> = {
  by?: SplitBy;
  dir: "x" | "y";
  spacing?: number;
  alignment?: "start" | "middle" | "end" | "baseline";
  sharedScale?: boolean;
  mode?: "edge" | "center";
  reverse?: boolean;
  glue?: boolean;
  /** Combinator form: same length as child marks; splits space along `dir` by weight. */
  stackWeights?: number[];
  w?: number | (keyof T & string);
  h?: number | (keyof T & string);
  debug?: boolean;
  axes?: boolean | { x?: AxisOptions; y?: AxisOptions };
};

export const spread = createOperator<any, SpreadOptions>(Spread, {
  // With `by`: groupBy on the field. Without `by`: identity split — one leaf
  // per row (the waffle grid relies on this to spread chunked sub-arrays).
  // Expand-kind marks (e.g. `cut`) need the whole array in one leaf instead;
  // that override lives in createOperator (it dispatches on the mark's kind),
  // not here, so this split stays kind-agnostic.
  split: ({ by }, d) =>
    by ? Map.groupBy(d, splitKeyFn(by)) : new Map(d.map((r, i) => [i, r])),
  channels: { w: "size", h: "size" },
  axisFields: ({ by, dir }) =>
    typeof by === "string" ? (dir === "x" ? { x: by } : { y: by }) : undefined,
  serialize: { type: "spread" },
});

/** Stack glues children together, summing sizes into a POSITION at the spread
 * level. Neither `spacing` nor `glue` is configurable — stacked children always
 * touch (use `spread({ spacing: N })` instead if you want gaps). */
export type StackOptions<T = any> = Omit<SpreadOptions<T>, "spacing" | "glue">;

export function stack(
  opts: StackOptions,
  marks: Mark<any>[]
): ReturnType<typeof spread>;
export function stack(opts: StackOptions): Operator<any[], any[]>;
export function stack(
  opts: StackOptions,
  marks?: Mark<any>[]
): ReturnType<typeof spread> | Operator<any[], any[]> {
  const stackOpts: SpreadOptions = { ...opts, glue: true };
  const result =
    marks !== undefined ? spread(stackOpts, marks) : spread(stackOpts);
  // Stack is `spread({glue: true})` under the hood, but the IR wire format
  // discriminates them by type. Re-tag the produced operator/mark so the
  // frontend-IR emitter sees `{ type: "stack", ...stripped-opts }` instead
  // of `{ type: "spread", glue: true, ... }`. Preserve `__combinator` and
  // `children` when present (combinator form) — dropping them would make
  // toJSON emit a leaf-shaped node missing its children.
  const tag = (result as any).__serialize;
  if (tag) {
    const { glue: _glue, ...stackPayload } = tag.opts;
    (result as any).__serialize = {
      ...tag,
      type: "stack",
      opts: stackPayload,
    };
  }
  return result;
}
