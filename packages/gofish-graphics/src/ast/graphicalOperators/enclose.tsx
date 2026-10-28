// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * `enclose`: an outline drawn around a set of nodes, under them. The outline
 * is a value of the `Shape` family (`families/shape.ts`): the padded bounding
 * box (`Shape.box()`, the default), the minimum-area enclosing ellipse
 * (`Shape.oval()`; `enclose/oval.ts`), or a smooth region
 * (`Shape.blob()` and its presets `Shape.hull()`, `Shape.spine()`; the
 * geometry is in `enclose/blob.ts`).
 *
 * It is a relational mark (`createRelationalMark`), so it has the forms
 * `line` and `ribbon` have:
 *  - combinator `enclose(opts, children)`: fresh children are laid out as
 *    `layer` lays them out, and `ref(...)` children (or `.relate()`
 *    operands) are enclosed where they already are;
 *  - bag `chart(selectAll(name)).mark(enclose(opts))`: the refs are the
 *    members, one outline per group when the flow groups them.
 */
import { GoFishNode, outlineOverhang, placeUnplacedChild } from "../_node";

import { Frontend, type DisplayList } from "gofish-ir";
import {
  lowerChildrenOffset,
  lowerStyle,
  cornerRadii,
  rectItemFromBox,
} from "../displayList/lowerHelpers";
import type { GoFishAST } from "../_ast";
import { GoFishRef } from "../_ref";
import { gray, resolveColorChannel } from "../../color";
import { isValue, type MaybeValue } from "../data";
import { foldFinite } from "../../util";
import { UNDEFINED, type UnderlyingSpace } from "../underlyingSpace";
import type { LiveValue } from "../../interaction/live";
import type { LayerContext } from "../marks/chart";
import { box, type Shape } from "../../families/shape";
import { avoidedRefs } from "../nodeRefs";
import { blobOutline, type BlobMember, type Pt } from "./enclose/blob";
import { membersOf } from "./enclose/members";
import { ovalOutline } from "./enclose/oval";
import { targetOf } from "../constraints/relationalPaint";
import { ringExtent } from "../geometry/box";
import { RelateOperand } from "../constraints/relate";
import { nodeSelectionOf } from "../nodeSelection";
import { placementIn } from "../placementClaims";
import type { Placement } from "../constraints/claimPlacement";
import { Extent } from "../extent";
import * as Pwl from "../solver/pwl";
import { ringPathData } from "../geometry/plane";

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
  /** Opacity of the fill alone; the stroke keeps `opacity`. */
  fillOpacity?: number | LiveValue;
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
  fillOpacity?: number;
};

/** The shape, checked against the `Shape` family's table (a blob's
 *  `avoiding` holds nodes, which `avoidedRefs` checks as it reads them). */
function checkedShape(shape: Shape | undefined): Shape {
  if (shape === undefined) return box();
  Frontend.checkStrategy("Shape", shape, "enclose({ shape })");
  return shape;
}

/** One SVG path over every loop: the loops wind so that the nonzero rule
 *  fills the region and leaves its holes open. */
const loopsPath = (loops: Pt[][], toPixel: (p: Pt) => Pt) =>
  loops.map((loop) => ringPathData(loop.map((p) => toPixel(p)))).join("");

/** The enclosure node over `members`, keeping out `avoided`. Both are its
 *  children (an avoided ref draws nothing); only the members count toward
 *  its box. `shape` is already checked. */
function Enclose(
  o: Resolved,
  shape: Shape,
  members: GoFishAST[],
  avoided: GoFishRef[]
): GoFishNode {
  const padding = o.padding ?? 2;
  const { fill = "none", stroke = gray, strokeWidth = 1 } = o;
  const { strokeDasharray, opacity = 1, fillOpacity } = o;
  const memberCount = members.length;
  const node = new GoFishNode(
    {
      type: "enclose",
      color: isValue(fill) ? fill : stroke,
      strokeOverhang: outlineOverhang(stroke, strokeWidth),
      resolveUnderlyingSpace: (): [UnderlyingSpace, UnderlyingSpace] => [
        UNDEFINED,
        UNDEFINED,
      ],
      layout: (size, scales, children) => {
        // Child placement (`placeUnplacedChild`): a FRESH child reports an
        // undefined translate until placed, so its baseline is placed at the
        // origin. An already-placed operand
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
        // The children from..to read as outline geometry; an avoided node
        // that is also a member is left out of the avoided ones.
        const memberNodes = new Set(
          children.slice(0, memberCount).map(targetOf)
        );
        const geometry = (from: number, to: number): BlobMember[] =>
          children
            .slice(from, to)
            .flatMap((child, i) =>
              from > 0 && memberNodes.has(targetOf(child))
                ? []
                : membersOf(placed[from + i])
            );
        let loops: Pt[][] | undefined;
        if (shape.kind === "blob")
          loops = blobOutline(geometry(0, memberCount), {
            convexity: shape.convexity,
            holes: shape.holes,
            roundness: shape.roundness,
            neck: shape.neck,
            clearance: shape.clearance,
            padding,
            avoiding: geometry(memberCount, children.length),
          });
        else if (shape.kind === "oval")
          loops = ovalOutline(geometry(0, memberCount), padding);
        // A computed outline's box is the outline's own.
        const pts = loops?.flat() ?? [];
        if (pts.length > 0) ({ minX, maxX, minY, maxY } = ringExtent(pts));
        return {
          intrinsicDims: {
            x: minX,
            y: minY,
            w: maxX - minX,
            h: maxY - minY,
          },
          transform: { translate: [undefined, undefined] },
          // The outline in the frame the children were read in, which is
          // the frame `local` maps from in `lower`.
          renderData: { loops, box: [minX, minY, maxX, maxY] },
        };
      },
      // The outline paints FIRST (under the content), then the children
      // under the node's translate on top.
      lower: (
        { transform, coordinateTransform, renderData, toPixel, local },
        _children,
        node
      ): DisplayList.DisplayItem[] => {
        const childItems = lowerChildrenOffset(
          node,
          transform,
          coordinateTransform
        );
        // The outline is in the node's local frame and axis order (the frame
        // its children's boxes were read in); `local` places it.
        const pixel = (p: Pt) => toPixel(local(p));
        const unit = node.getRenderSession().scaleContext?.unit;
        const style = lowerStyle({
          fill: resolveColorChannel(fill, unit),
          stroke: resolveColorChannel(stroke, unit),
          strokeWidth,
          strokeDasharray,
          opacity,
          fillOpacity,
        });
        const loops = renderData?.loops as Pt[][] | undefined;
        if (loops !== undefined) {
          if (loops.length === 0) return childItems;
          const path: DisplayList.DisplayItem = {
            kind: "path",
            d: loopsPath(loops, pixel),
            role: "overlay",
            style,
          };
          return [path, ...childItems];
        }
        const [x0, y0, x1, y1] = renderData.box as number[];
        const corners: { rx?: number; ry?: number } =
          shape.kind === "box" ? shape : {};
        const [ax, ay] = local([x0, y0]);
        const [bx, by] = local([x1, y1]);
        const rect = rectItemFromBox(
          Math.min(ax, bx),
          Math.max(ax, bx),
          Math.min(ay, by),
          Math.max(ay, by),
          toPixel,
          {
            ...cornerRadii(corners.rx, corners.ry, 2),
            role: "overlay",
            style,
          }
        );
        return [rect, ...childItems];
      },
    },
    [...members, ...avoided]
  );
  // Around placed members, the outline is placed from its refs, as a label
  // beside a ref is: the claim walk knows where it lands when it knows where
  // every member does (#493 placement claims). Its claim is the members'
  // padded box. That is exact for `Shape.box()`, and a blob lies inside it;
  // an oval may reach past it, and that reach is ink.
  // TODO(#1032): an outline over fresh children has no claim yet (the claim
  // walk reads no size for it); it should claim their union grown by the
  // padding.
  if (memberCount > 0 && members.every((m) => m instanceof GoFishRef))
    node.placedFromRefs = (frame, axis) =>
      paddedPlacement(
        node.children.slice(0, memberCount),
        frame,
        axis,
        padding
      );
  return node;
}

/** The box of `members` (refs) in `frame`'s frame on `axis`, grown by
 *  `padding` on each side, with the enclosure's origin at the frame's: where
 *  the claim walk places the outline. Undefined when it does not know where
 *  a member lands. */
function paddedPlacement(
  members: GoFishAST[],
  frame: GoFishNode,
  axis: 0 | 1,
  padding: number
): Placement | undefined {
  const boxes: Placement[] = [];
  for (const m of members) {
    const target = m instanceof GoFishRef ? m.targetNode : undefined;
    const p = target && placementIn(target, frame, axis);
    if (p === undefined) return undefined;
    boxes.push(p);
  }
  const ascent = Pwl.addConstant(Pwl.envelope(boxes.map((b) => b.hi)), padding);
  const descent = Pwl.addConstant(
    Pwl.envelope(boxes.map((b) => Pwl.negate(b.lo))),
    padding
  );
  return {
    lo: Pwl.negate(descent),
    hi: ascent,
    extent: Extent(ascent, descent),
  };
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
  // The avoided nodes, as fresh refs the enclosure holds.
  const avoided =
    shape.kind === "blob"
      ? avoidedRefs(
          shape.avoiding,
          layerContext,
          "enclose({ shape }): avoiding",
          "enclose"
        )
      : [];
  return Enclose(o, shape, members, avoided);
}
