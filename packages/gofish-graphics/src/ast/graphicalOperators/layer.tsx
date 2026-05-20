import * as Monotonic from "../../util/monotonic";
import { GoFishNode } from "../_node";
import { isToken } from "../createName";
import { Size, elaborateDims, FancyDims } from "../dims";
import { SIZE, UnderlyingSpace, isSIZE } from "../underlyingSpace";
import * as Interval from "../../util/interval";
import { computeSize } from "../../util";
import { CoordinateTransform } from "../coordinateTransforms/coord";
import { coord } from "../coordinateTransforms/coord";
import { createNodeOperatorSequential } from "../withGoFish";
import { GoFishAST } from "../_ast";
import { applyConstraints } from "../constraints";
import { unionChildSpaces } from "./alignment";

/** Normalize a node's _name (string or Token) to the string used as a key in
 * the Layer's nameToPlaceable and constraint refs. Tokens contribute their
 * `__tag`. */
const childNameKey = (node: GoFishAST): string | undefined => {
  if (!("_name" in node)) return undefined;
  const n = (node as GoFishNode)._name;
  if (n === undefined) return undefined;
  return isToken(n) ? n.__tag : n;
};

export const layer = createNodeOperatorSequential(
  async (
    childrenOrOptions:
      | ({
          key?: string;
          coord?: CoordinateTransform;
          transform?: { scale?: { x?: number; y?: number } };
          box?: boolean;
        } & FancyDims)
      | GoFishAST[],
    maybeChildren?: GoFishAST[]
  ) => {
    const options = Array.isArray(childrenOrOptions) ? {} : childrenOrOptions;
    const children = Array.isArray(childrenOrOptions)
      ? childrenOrOptions
      : maybeChildren || [];

    // If coord is provided, delegate to coord transform (similar to frame but without transform/box)
    if (!Array.isArray(childrenOrOptions) && options.coord !== undefined) {
      const {
        coord: coordTransform,
        key,
        transform: _transform,
        box: _box,
        ...restDims
      } = options;
      return coord(
        {
          key,
          transform: coordTransform,
          ...restDims,
        },
        children.filter((c): c is GoFishNode => c instanceof GoFishNode)
      );
    }

    const dims = elaborateDims(options);

    return new GoFishNode(
      {
        type: options.box === true ? "box" : "layer",
        key: options.key,
        shared: [false, false],
        resolveUnderlyingSpace: (
          children: Size<UnderlyingSpace>[],
          _childNodes: GoFishAST[]
        ) => {
          // Apply layer's own transform.scale to any SIZE spaces produced
          // by unionChildSpaces (the SIZE-preserving overlay path).
          const scaleX = options.transform?.scale?.x ?? 1;
          const scaleY = options.transform?.scale?.y ?? 1;
          const applyScale = (
            space: UnderlyingSpace,
            scale: number
          ): UnderlyingSpace =>
            isSIZE(space) && scale !== 1
              ? SIZE(Monotonic.smul(scale, space.domain))
              : space;
          return [
            applyScale(unionChildSpaces(children, 0), scaleX),
            applyScale(unionChildSpaces(children, 1), scaleY),
          ];
        },
        layout: (
          shared,
          size,
          scaleFactors,
          children,
          posScales,
          node,
          posDomains
        ) => {
          // Compute size using dims (w and h) before passing to children
          size = [
            computeSize(dims[0].size, scaleFactors?.[0]!, size[0]) ?? size[0],
            computeSize(dims[1].size, scaleFactors?.[1]!, size[1]) ?? size[1],
          ];

          const childPlaceables = [];

          // Collect constrained names before layout so we can skip baseline
          // placement for constrained children. Baseline placement sets
          // transform.translate, which makes isPlacedOn() return true and
          // causes constraints to treat every child as already placed.
          const constrainedNames = new Set<string>();
          if (node.constraints.length > 0) {
            for (const constraint of node.constraints) {
              for (const ref of constraint.children) {
                constrainedNames.add(ref.name);
              }
            }
          }

          for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const childPlaceable = child.layout(
              size,
              scaleFactors,
              posScales,
              posDomains
            );
            const childName = childNameKey(node.children[i]);
            if (!childName || !constrainedNames.has(childName)) {
              childPlaceable.place("x", 0, "baseline");
              childPlaceable.place("y", 0, "baseline");
            }
            childPlaceables.push(childPlaceable);
          }

          if (node.constraints.length > 0) {
            // Constraint-based placement:
            // Build name -> placeable map from named children
            const nameToPlaceable = new Map<
              string,
              (typeof childPlaceables)[number]
            >();
            for (let i = 0; i < node.children.length; i++) {
              const childName = childNameKey(node.children[i]);
              if (childName !== undefined) {
                nameToPlaceable.set(childName, childPlaceables[i]);
              }
            }

            // Apply constraints in declaration order. When a constraint has no
            // pre-placed target, fall back to this layer's own box baselines.
            applyConstraints(node.constraints, nameToPlaceable, {
              x: { start: 0, middle: size[0] / 2, end: size[0] },
              y: { start: 0, middle: size[1] / 2, end: size[1] },
            });

            // Re-layout unconstrained children so internal Ref() nodes observe
            // final constrained sibling positions. Constrained children are
            // intentionally left untouched to preserve "placed once" semantics.
            for (let i = 0; i < children.length; i++) {
              const childName = childNameKey(node.children[i]);
              if (childName && constrainedNames.has(childName)) continue;
              childPlaceables[i] = children[i].layout(
                size,
                scaleFactors,
                posScales,
                posDomains
              );
            }

            // Default any unplaced axes to 0
            for (const cp of childPlaceables) {
              const needsX = cp.dims[0].min === undefined;
              const needsY = cp.dims[1].min === undefined;
              if (needsX) cp.place("x", 0);
              if (needsY) cp.place("y", 0);
            }
          } else {
            // Default layer behavior: place all children at (0, 0)
            for (const cp of childPlaceables) {
              cp.place("x", 0);
              cp.place("y", 0);
            }
          }

          // Calculate the bounding box of all children
          const minX = Math.min(
            ...childPlaceables.map(
              (childPlaceable) => childPlaceable.dims[0].min!
            )
          );
          const maxX = Math.max(
            ...childPlaceables.map(
              (childPlaceable) => childPlaceable.dims[0].max!
            )
          );
          const minY = Math.min(
            ...childPlaceables.map(
              (childPlaceable) => childPlaceable.dims[1].min!
            )
          );
          const maxY = Math.max(
            ...childPlaceables.map(
              (childPlaceable) => childPlaceable.dims[1].max!
            )
          );

          const scaleX = options.transform?.scale?.x ?? 1;
          const scaleY = options.transform?.scale?.y ?? 1;

          const translateY =
            dims[1].min !== undefined ? dims[1].min - minY : undefined;

          return {
            intrinsicDims: [
              {
                min: minX,
                size: maxX - minX,
                center: minX + (maxX - minX) / 2,
                max: maxX,
              },
              {
                min: minY,
                size: maxY - minY,
                center: minY + (maxY - minY) / 2,
                max: maxY,
              },
            ],
            transform: {
              translate: [
                dims[0].min !== undefined ? dims[0].min - minX : undefined,
                translateY,
              ],
              scale: [scaleX, scaleY],
            },
          };
        },
        render: ({ intrinsicDims, transform }, children, node) => {
          const scaleX = options.transform?.scale?.x ?? 1;
          const scaleY = options.transform?.scale?.y ?? 1;
          const orderedChildren = children
            .map((child, index) => ({
              child,
              index,
              zOrder:
                node.children[index] instanceof GoFishNode
                  ? node.children[index].getZOrder()
                  : 0,
            }))
            .sort((a, b) => a.zOrder - b.zOrder || a.index - b.index)
            .map(({ child }) => child);

          return (
            <g
              transform={`translate(${transform?.translate?.[0] ?? 0}, ${
                transform?.translate?.[1] ?? 0
              }) scale(${scaleX}, ${scaleY})`}
            >
              {orderedChildren}
            </g>
          );
        },
      },
      children
    );
  }
);
