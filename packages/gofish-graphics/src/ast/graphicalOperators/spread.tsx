import { For } from "solid-js";
import { GoFishNode, Placeable } from "../_node";
import { getMeasure, getValue, isValue, MaybeValue, Value } from "../data";
import {
  Direction,
  elaborateDims,
  elaborateDirection,
  FancyDims,
  FancyDirection,
  FancySize,
  Size,
} from "../dims";
import _, { Collection, size } from "lodash";
import { computeAesthetic, computeSize, findTargetMonotonic } from "../../util";
import { GoFishAST } from "../_ast";
import { createNodeOperator } from "../withGoFish";
import * as Monotonic from "../../util/monotonic";
import {
  ORDINAL,
  POSITION,
  SIZE,
  UNDEFINED,
  isDIFFERENCE,
  isPOSITION,
  isSIZE,
} from "../underlyingSpace";
import { UnderlyingSpace } from "../underlyingSpace";
import * as Interval from "../../util/interval";
import { Alignment, alignChildren, resolveAlignmentSpace } from "./alignment";
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

    return new GoFishNode(
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
          dims,
        },
        key,
        name,
        shared: [sharedScale, sharedScale],
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          childNodes: GoFishAST[]
        ) => {
          /* ALIGNMENT */
          const alignSpaces = children.map((child) => child[alignDir]);
          const alignResult = resolveAlignmentSpace(alignSpaces, alignment);
          const alignSpace = alignResult.space;
          alignFromSize = alignResult.fromSize;

          /* STACK DIR */
          const stackSpaces = children.map((child) => child[stackDir]);
          const namedKeys = childNodes
            .filter((node): node is GoFishNode => node instanceof GoFishNode)
            .map((node) => node.key)
            .filter((key): key is string => key !== undefined);

          // Explicit size on the spread overrides children-derived sizing.
          if (isValue(dims[stackDir].size)) {
            return {
              [stackDir]: SIZE(
                Monotonic.linear(getValue(dims[stackDir].size!), 0)
              ),
              [alignDir]: alignSpace,
            };
          }

          let stackSpace: UnderlyingSpace = UNDEFINED;

          if (glue) {
            // STACK semantics: collapse children into a single POSITION at
            // this level. Use children's intrinsic extent at scale=1.
            if (children.every((c) => isPOSITION(c[stackDir]))) {
              const totalWidth = children
                .map((c) =>
                  isPOSITION(c[stackDir])
                    ? Interval.width(c[stackDir].domain)
                    : 0
                )
                .reduce((a, b) => a + b, 0);
              stackSpace = POSITION(Interval.interval(0, totalWidth));
            } else if (stackSpaces.every(isSIZE)) {
              const totalSize = stackSpaces
                .map((s) => (s as any).domain.run(1) as number)
                .reduce((a, b) => a + b, 0);
              stackSpace = POSITION(Interval.interval(0, totalSize));
            } else if (namedKeys.length > 0) {
              stackSpace = ORDINAL(namedKeys);
            }
          } else {
            // SPREAD semantics:
            //  - All-SIZE *and* data-driven (some non-constant Monotonic)
            //    → keep SIZE composition so parents can solve scale
            //    factors via Monotonic.inverse. Names don't override
            //    because the visual size is data-driven, which dominates
            //    over categorical labeling.
            //  - All-SIZE constant + named → ORDINAL. Each slot is the
            //    same size; categorical axis labels are the right thing.
            //  - Named (any other shape) → ORDINAL.
            //  - All-SIZE constant + unnamed → SIZE composition.
            //  - All-POSITION → POSITION(union).
            const allSize = stackSpaces.every(isSIZE);
            const childDomains = allSize
              ? stackSpaces.map((s) => (s as any).domain as Monotonic.Monotonic)
              : [];
            const dataDriven =
              allSize && childDomains.some((d) => !Monotonic.isConstant(d));
            const composeSize = () =>
              mode === "edge"
                ? Monotonic.adds(
                    Monotonic.add(...childDomains),
                    effectiveSpacing * (children.length - 1)
                  )
                : Monotonic.unknown(
                    (scaleFactor: number) =>
                      childDomains[0].run(scaleFactor) / 2 +
                      effectiveSpacing * (children.length - 1) +
                      childDomains[childDomains.length - 1].run(scaleFactor) / 2
                  );
            if (dataDriven) {
              stackSpace = SIZE(composeSize());
            } else if (namedKeys.length > 0) {
              stackSpace = ORDINAL(namedKeys);
            } else if (allSize) {
              stackSpace = SIZE(composeSize());
            } else if (children.every((c) => isPOSITION(c[stackDir]))) {
              const totalWidth = children
                .map((c) =>
                  isPOSITION(c[stackDir])
                    ? Interval.width(c[stackDir].domain)
                    : 0
                )
                .reduce((a, b) => a + b, 0);
              stackSpace = POSITION(Interval.interval(0, totalWidth));
            }
          }

          return {
            [stackDir]: stackSpace,
            [alignDir]: alignSpace,
          };
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

          size = {
            [stackDir]: computeSize(
              dims[stackDir].size,
              scaleFactors?.[stackDir]!,
              size[stackDir]
            ),
            [alignDir]: computeSize(
              dims[alignDir].size,
              scaleFactors?.[alignDir]!,
              size[alignDir]
            ),
          };

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
          scaleContext.x = {
            domain: [0, size[0] / scaleFactors[0]],
            scaleFactor: scaleFactors[0],
          };
          scaleContext.y = {
            domain: [0, size[1] / scaleFactors[1]],
            scaleFactor: scaleFactors[1],
          };

          // Calculate available space for children in stacking direction after subtracting spacing
          const totalSpacing = effectiveSpacing * (children.length - 1);
          const availableStackSpace = size[stackDir] - totalSpacing;
          const childStackSize = availableStackSpace / children.length;

          // Create modified size with equal distribution for stacking direction
          const modifiedSize: Size = [0, 0];
          modifiedSize[stackDir] = childStackSize;
          modifiedSize[alignDir] = size[alignDir];
          // console.log(size[stackDir], size[alignDir]);

          const childPlaceables = children.map((child) =>
            child.layout(modifiedSize, scaleFactors, posScales)
          );

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

          /* distribute */
          const firstFixedIdx = childPlaceables.findIndex(isFixed(stackDir));
          let pos: number;
          if (firstFixedIdx === -1) {
            pos = 0;
          } else {
            const firstFixed = childPlaceables[firstFixedIdx];
            const firstFixedMin = firstFixed.dims[stackDir].min as number;
            const firstFixedMax = firstFixed.dims[stackDir].max as number;
            const firstFixedCenter = (firstFixedMin + firstFixedMax) / 2;
            if (mode === "edge") {
              pos =
                firstFixedMin -
                firstFixedIdx * effectiveSpacing -
                childPlaceables
                  .slice(0, firstFixedIdx)
                  .reduce((acc, c) => acc + c.dims[stackDir].size!, 0);
            } else {
              pos = firstFixedCenter - firstFixedIdx * effectiveSpacing;
            }
          }

          if (mode === "edge") {
            for (const child of childPlaceables) {
              if (isFixed(stackDir)(child)) {
                const childMin = child.dims[stackDir].min as number;
                const childMax = child.dims[stackDir].max as number;
                if (Math.abs(childMin - pos) > 1e-6) {
                  console.warn(
                    "Stack: fixed child stack-direction position inconsistent with layout order",
                    { expected: pos, actual: childMin }
                  );
                }
                pos = childMax + effectiveSpacing;
              } else {
                child.place(stackDir, pos, "min");
                const sz = child.dims[stackDir].size ?? 0;
                pos += sz + effectiveSpacing;
              }
            }
          } else if (mode === "center") {
            for (const child of childPlaceables) {
              if (isFixed(stackDir)(child)) {
                const childMin = child.dims[stackDir].min as number;
                const childMax = child.dims[stackDir].max as number;
                const childCenter = (childMin + childMax) / 2;
                if (Math.abs(childCenter - pos) > 1e-6) {
                  console.warn(
                    "Stack: fixed child stack-direction position inconsistent (center-to-center)",
                    { expected: pos, actual: childCenter }
                  );
                }
                pos = childCenter + effectiveSpacing;
              } else {
                child.place(stackDir, pos, "center");
                pos += effectiveSpacing;
              }
            }
          }

          // Compute alignDir intrinsicDims from extents to account for negative bars
          const alignMin = Math.min(
            ...childPlaceables.map((child) => child.dims[alignDir].min!)
          );
          const alignMax = Math.max(
            ...childPlaceables.map((child) => child.dims[alignDir].max!)
          );
          const stackMin = Math.min(
            ...childPlaceables.map((child) => child.dims[stackDir].min!)
          );
          const stackMax = Math.max(
            ...childPlaceables.map((child) => child.dims[stackDir].max!)
          );
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
        render: ({ intrinsicDims, transform }, children) => {
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
  }
);

export type SpreadOptions<T = any> = {
  by?: keyof T & string;
  dir: "x" | "y";
  spacing?: number;
  alignment?: "start" | "middle" | "end" | "baseline";
  sharedScale?: boolean;
  mode?: "edge" | "center";
  reverse?: boolean;
  glue?: boolean;
  w?: number | (keyof T & string);
  h?: number | (keyof T & string);
  debug?: boolean;
};

export const spread = createOperator<any, SpreadOptions>(Spread, {
  // When no `by` is given, pass each item through as-is. Items may already be
  // arrays (e.g. after `_.chunk(...)`) or scalars; the downstream mark
  // normalizes either form internally.
  split: ({ by }, d) =>
    by ? Map.groupBy(d, (r: any) => r[by]) : new Map(d.map((r, i) => [i, r])),
  channels: { w: "size", h: "size" },
  axisFields: ({ by, dir }) =>
    by ? (dir === "x" ? { x: by } : { y: by }) : undefined,
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
  return marks !== undefined ? spread(stackOpts, marks) : spread(stackOpts);
}
