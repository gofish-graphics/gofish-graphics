/**
 * `enclose`: an outline drawn around a set of nodes, under them. The outline
 * is a value of the `Shape` family (`families/shape.ts`): the padded bounding
 * box (`Shape.box()`, the default) or a smooth region (`Shape.blob()` and its
 * presets `Shape.hull()`, `Shape.spine()`; the geometry is in
 * `enclose/blob.ts`).
 *
 * It is a relational mark (`createRelationalMark`), so it has the forms
 * `line` and `ribbon` have:
 *  - combinator `enclose(opts, children)`: fresh children are laid out as
 *    `layer` lays them out, and `ref(...)` children (or `.relate()`
 *    operands) are enclosed where they already are;
 *  - bag `chart(selectAll(name)).mark(enclose(opts))`: the refs are the
 *    members, one outline per group when the flow groups them.
 */
import { GoFishNode, placeUnplacedChild } from "../_node";
import { displayTranslate, type Size } from "../dims";
import { Frontend, type DisplayList } from "gofish-ir";
import {
  lowerChildrenOffset,
  lowerStyle,
  rectItemFromBox,
  roleFor,
} from "../displayList/lowerHelpers";
import type { GoFishAST } from "../_ast";
import { GoFishRef } from "../_ref";
import { gray, resolveColorChannel } from "../../color";
import { isValue, type MaybeValue } from "../data";
import { foldFinite } from "../../util";
import { UNDEFINED, type UnderlyingSpace } from "../underlyingSpace";
import type { LiveValue } from "../../interaction/live";
import type { LayerContext } from "../marks/chart";
import { resolveRefData } from "../marks/chartBuilder";
import { box, type Nodes, type Shape } from "../../families/shape";
import { blobOutline, type BlobMember, type Pt } from "./enclose/blob";
import { membersOf, nodeOf } from "./enclose/members";

export type EncloseOptions = {
  /** Pixels between the members and the outline. Default 2. */
  padding?: number;
  /** The outline: a call in the Shape family. Default `Shape.box()`. */
  shape?: Shape;
  fill?: MaybeValue<string> | LiveValue;
  stroke?: MaybeValue<string> | LiveValue;
  strokeWidth?: number | LiveValue;
  strokeDasharray?: string;
  opacity?: number | LiveValue;
};

/** The resolved options the node is built from (live values already read). */
export type Resolved = {
  padding?: number;
  shape?: Shape;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
};

/** The shape, checked against the `Shape` family. A blob's `avoiding` holds
 *  live nodes in JS (its IR on the wire), so it is checked here and the rest
 *  against the family's table. */
function checkedShape(shape: Shape | undefined): Shape {
  if (shape === undefined) return box();
  const { avoiding, ...params } = shape as Shape & { avoiding?: unknown };
  Frontend.checkStrategy("Shape", params, "enclose({ shape })");
  if (
    avoiding !== undefined &&
    !Array.isArray(avoiding) &&
    !(avoiding instanceof GoFishRef)
  )
    throw new Error(
      "[gofish] enclose({ shape }): avoiding is a list of nodes or refs, or a selectAll(name) selection."
    );
  if (shape.kind === "blob") {
    for (const key of ["convexity", "neck"] as const) {
      const v = shape[key];
      if (v !== undefined && v > 1)
        throw new Error(
          `[gofish] enclose({ shape }): ${key} is at most 1, got ${v}.`
        );
    }
  }
  return shape;
}

/** The avoided nodes, as fresh refs the enclosure holds (each read where it
 *  is placed, like a ref member). A `selectAll(name)` resolves against the
 *  chart's named layers. */
function avoidedRefs(
  avoiding: Nodes | undefined,
  layerContext: LayerContext | undefined
): GoFishRef[] {
  if (avoiding === undefined) return [];
  let items: unknown[];
  if (avoiding instanceof GoFishRef) {
    if (avoiding.multiplicity !== "all") items = [avoiding];
    else if (layerContext === undefined)
      throw new Error(
        "[gofish] enclose({ shape }): avoiding: selectAll(...) names a chart's layer, so it works where enclose is a chart's mark; in the combinator form, list the nodes."
      );
    else {
      const resolved = resolveRefData(avoiding, layerContext);
      items = Array.isArray(resolved) ? resolved : [resolved];
    }
  } else items = avoiding;
  return items.map((item) => {
    if (item instanceof GoFishRef) {
      const target = item.targetNode;
      return target !== undefined
        ? new GoFishRef({ node: target })
        : new GoFishRef({ selection: item.selection! });
    }
    if (item instanceof GoFishNode) return new GoFishRef({ node: item });
    throw new Error(
      "[gofish] enclose({ shape }): avoiding lists placed nodes or refs (a .relate() operand, ref(...)); a fresh mark has no place to avoid."
    );
  });
}

/** One SVG path over every loop: the loops wind so that the nonzero rule
 *  fills the region and leaves its holes open. */
const loopsPath = (loops: Pt[][], toPixel: (p: Pt) => [number, number]) =>
  loops
    .map(
      (loop) =>
        "M" +
        loop
          .map((p) => {
            const [x, y] = toPixel(p);
            return `${+x.toFixed(2)},${+y.toFixed(2)}`;
          })
          .join("L") +
        "Z"
    )
    .join("");

/** The enclosure node over `members`, keeping out `avoided`. Both are its
 *  children (an avoided ref draws nothing); only the members count toward
 *  its box. */
function Enclose(
  o: Resolved,
  members: GoFishAST[],
  avoided: GoFishRef[]
): GoFishNode {
  const padding = o.padding ?? 2;
  const shape = checkedShape(o.shape);
  const { fill = "none", stroke = gray, strokeWidth = 1 } = o;
  const { strokeDasharray, opacity = 1 } = o;
  const memberCount = members.length;
  return new GoFishNode(
    {
      type: "enclose",
      shared: [false, false],
      color: isValue(fill) ? fill : stroke,
      resolveUnderlyingSpace: (
        _children: Size<UnderlyingSpace>[],
        _childNodes: GoFishAST[]
      ) => [UNDEFINED, UNDEFINED],
      layout: (_shared, size, scales, children) => {
        // Child placement mirrors `layer`'s own rule (`placeUnplacedChild`):
        // a FRESH child reports an undefined translate until placed, so it
        // gets `layer`'s baseline-origin placement. An already-placed operand
        // (a `ref(...)`, which reconciles its own translate against its LCA
        // in `GoFishRef.layout`) must not be re-placed: `GoFishRef.place()`
        // has no ledger to make that a no-op.
        const placed = children.map((child) => {
          const p = child.layout(size, scales);
          placeUnplacedChild(p);
          return p;
        });
        const memberDims = placed.slice(0, memberCount).map((p) => p.dims);
        const fold = (dir: 0 | 1, end: "min" | "max") =>
          foldFinite(
            memberDims.map((d) => d[dir][end]),
            end === "min" ? Math.min : Math.max
          );
        let [minX, maxX, minY, maxY] = [
          fold(0, "min") - padding,
          fold(0, "max") + padding,
          fold(1, "min") - padding,
          fold(1, "max") + padding,
        ];
        let loops: Pt[][] | undefined;
        if (shape.kind === "blob") {
          const memberNodes = new Set(
            children.slice(0, memberCount).map(nodeOf)
          );
          const geometry = (from: number, to: number): BlobMember[] =>
            children
              .slice(from, to)
              .flatMap((child, i) =>
                from > 0 && memberNodes.has(nodeOf(child))
                  ? []
                  : membersOf(child, placed[from + i].dims)
              );
          const { avoiding: _, ...params } = shape;
          loops = blobOutline(geometry(0, memberCount), {
            ...params,
            padding,
            avoiding: geometry(memberCount, children.length),
          });
          // The box is the outline's own.
          const pts = loops.flat();
          if (pts.length > 0) {
            minX = Math.min(...pts.map((p) => p[0]));
            maxX = Math.max(...pts.map((p) => p[0]));
            minY = Math.min(...pts.map((p) => p[1]));
            maxY = Math.max(...pts.map((p) => p[1]));
          }
        }
        return {
          intrinsicDims: {
            x: minX,
            y: minY,
            w: maxX - minX,
            h: maxY - minY,
          },
          transform: { translate: [undefined, undefined] },
          renderData: { loops },
        };
      },
      // The outline paints FIRST (under the content), then the children
      // under the node's translate on top.
      lower: (
        { intrinsicDims, transform, coordinateTransform, renderData },
        _children,
        node
      ): DisplayList.DisplayItem[] => {
        const childItems = lowerChildrenOffset(
          node,
          transform,
          coordinateTransform
        );
        const [tx, ty] = displayTranslate(transform);
        const outer = node.getRenderSession().toPixel!;
        const unit = node.getRenderSession().scaleContext?.unit;
        const style = lowerStyle({
          fill: resolveColorChannel(fill, unit),
          stroke: resolveColorChannel(stroke, unit),
          strokeWidth,
          strokeDasharray,
          opacity,
        });
        const loops = renderData?.loops as Pt[][] | undefined;
        if (loops !== undefined) {
          if (loops.length === 0) return childItems;
          const path: DisplayList.DisplayItem = {
            kind: "path",
            d: loopsPath(loops, ([x, y]) => outer([tx + x, ty + y])),
            role: "overlay",
            style,
          };
          return [path, ...childItems];
        }
        const x0 = intrinsicDims?.[0]?.min ?? -padding;
        const y0 = intrinsicDims?.[1]?.min ?? -padding;
        const w = intrinsicDims?.[0]?.size ?? 0;
        const h = intrinsicDims?.[1]?.size ?? 0;
        const corners: { rx?: number; ry?: number } =
          shape.kind === "box" ? shape : {};
        const rect = rectItemFromBox(
          tx + x0,
          tx + x0 + w,
          ty + y0,
          ty + y0 + h,
          outer,
          {
            rx: corners.rx ?? 2,
            ry: corners.ry ?? 2,
            role: "overlay",
            style,
          }
        );
        return [rect, ...childItems];
      },
    },
    [...members, ...avoided]
  );
}

/**
 * The enclosure around `members`: what the relational mark `enclose`
 * (`marks/chart.ts`, beside `line` and `ribbon`) builds for each group. A
 * blob's `avoiding` is read here; a `selectAll(name)` in it resolves against
 * `layerContext`, the chart's named layers.
 */
export function encloseNode(
  o: Resolved,
  members: GoFishAST[],
  layerContext: LayerContext | undefined
): GoFishNode {
  const shape = checkedShape(o.shape);
  const avoided =
    shape.kind === "blob" ? avoidedRefs(shape.avoiding, layerContext) : [];
  return Enclose({ ...o, shape }, members, avoided);
}
