import { computeAesthetic } from "../../util";
import { GoFishNode } from "../_node";
import { Size, elaborateDims, FancyDims, translateString } from "../dims";
import { getMeasure, getValue, isValue, MaybeValue } from "../data";
import { POSITION, UNDEFINED, UnderlyingSpace } from "../underlyingSpace";
import { interval } from "../../util/interval";
import { createNodeOperator } from "../withGoFish";
import { GoFishAST } from "../_ast";
import type { AlignAnchor } from "../constraints/shared";

export const position = createNodeOperator(
  (
    childrenOrOptions:
      | {
          key?: string;
          x?: MaybeValue<number>;
          y?: MaybeValue<number>;
          anchor?: AlignAnchor;
        }
      | GoFishAST[],
    maybeChildren?: GoFishAST[]
  ) => {
    const options = Array.isArray(childrenOrOptions) ? {} : childrenOrOptions;
    const children = Array.isArray(childrenOrOptions)
      ? childrenOrOptions
      : maybeChildren || [];
    return new GoFishNode(
      {
        type: "position",
        key: options.key,
        shared: [false, false],
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => {
          return [
            isValue(options.x)
              ? POSITION(
                  interval(getValue(options.x)!, getValue(options.x)!),
                  getMeasure(options.x)
                )
              : UNDEFINED,
            isValue(options.y)
              ? POSITION(
                  interval(getValue(options.y)!, getValue(options.y)!),
                  getMeasure(options.y)
                )
              : UNDEFINED,
          ];
        },
        layout: (shared, size, scaleFactors, children, posScales, _node) => {
          if (children.length !== 1) {
            throw new Error("Position operator expects exactly one child");
          }

          const child = children[0];
          /* TODO: maybe pass like [10, 10] to this instead of size to do a default think for
        scattering... but scatter pie is still broken... */
          const childPlaceable = child.layout(size, scaleFactors, posScales);

          // Place child at origin first to get its dimensions
          childPlaceable.place("x", 0);
          childPlaceable.place("y", 0);

          // Calculate the position offset based on the child's intrinsic dimensions
          const childWidth = childPlaceable.dims[0].size ?? 0;
          const childHeight = childPlaceable.dims[1].size ?? 0;

          // Handle x and y values (can be literal values or data-bound values)
          const xPos = computeAesthetic(options.x, posScales[0]!, 0)!;
          const yPos = computeAesthetic(options.y, posScales[1]!, 0)!;

          const anchorOffset = (
            axis: 0 | 1,
            anchor: AlignAnchor | undefined
          ) => {
            const dim = childPlaceable.dims[axis];
            if (anchor === "start" || anchor === "baseline")
              return dim.min ?? 0;
            if (anchor === "end") return dim.max ?? dim.size ?? 0;
            return dim.center ?? (dim.min ?? 0) + (dim.size ?? 0) / 2;
          };

          // Position is center-relative by default. `anchor` lets callers pin
          // the wrapped node's origin/start instead, which is the useful form
          // for "position(scatter(...))" radial offsets.
          const offsetX = xPos - anchorOffset(0, options.anchor);
          const offsetY = yPos - anchorOffset(1, options.anchor);

          // Update child position
          childPlaceable.place("x", offsetX);
          childPlaceable.place("y", offsetY);

          // Store only the local box (min, size); center/max are derived from
          // them by the `dims` getter. Previously this stored `center: xPos`,
          // which diverged from `min + size/2` when the child had a nonzero local
          // min — the asymmetric box that complicated the placement ledger (#39
          // stage 2). The geometric center (`min + size/2`) is the placed center.
          return {
            intrinsicDims: [
              { min: childPlaceable.dims[0].min! + offsetX, size: childWidth },
              { min: childPlaceable.dims[1].min! + offsetY, size: childHeight },
            ],
            transform: {
              translate: [offsetX, offsetY],
            },
          };
        },
        render: ({ intrinsicDims, transform }, children) => {
          return <g transform={translateString(transform)}>{children}</g>;
        },
      },
      children
    );
  }
);
