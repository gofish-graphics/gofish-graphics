// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Enclose and the Shape Family — /internals/frontend/enclose
// </gofish-wiki>

/**
 * `enclose`: an outline drawn around a set of nodes, under them. The outline
 * is a value of the `Shape` family (`families/shape.ts`): the padded bounding
 * box (`Shape.box()`, the default), the minimum-area enclosing ellipse
 * (`Shape.oval()`; `enclose/oval.ts`), the padded members closed by a disc
 * (`Shape.fillet()`), or a smooth region (`Shape.blob()` and its presets
 * `Shape.hull()`, `Shape.spine()`); the last two in `enclose/outline.ts`.
 * Every shape stays out of the nodes in `avoiding`, each grown by
 * `clearance`: one final cut of the outline (`enclose/separate.ts`).
 *
 * It is a relational mark (`createRelationalMark`), so it has the forms
 * `line` and `ribbon` have, and one more:
 *  - combinator `enclose(opts, children)`: fresh children are laid out as
 *    `layer` lays them out, and `ref(...)` children (or `.relate()`
 *    operands) are enclosed where they already are;
 *  - bag `chart(selectAll(name)).mark(enclose(opts))`: the refs are the
 *    members, one outline per group when the flow groups them;
 *  - flow step `.flow(..., enclose(opts), ...)`: each group's subtree is the
 *    one fresh child, as in the combinator form.
 *
 * The node's geometry is its outline, so a parent that reads geometry
 * (`pack`) lays out the outline, and an outer `enclose` hugs it.
 */
import type { FilterOptions } from "../drawFilter";
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
import { box, type Nodes, type Shape } from "../../families/shape";
import { avoidedRefs } from "../nodeRefs";
import type { Member, Pt } from "./enclose/prims";
import { membersOf } from "./enclose/members";
import { ovalOutline } from "./enclose/oval";
import {
  cutOutline,
  encloseOutline,
  type AvoidOptions,
} from "./enclose/outline";
import { targetOf } from "../constraints/relationalPaint";
import { boxOfDims, ringExtent } from "../geometry/box";
import { RelateOperand } from "../constraints/relate";
import { nodeSelectionOf } from "../nodeSelection";
import { planPlacement } from "../solver/plan";
import type { Placement } from "../constraints/claimPlacement";
import { Extent, hullExtent, padExtent } from "../extent";
import * as Pwl from "../solver/pwl";
import { ringPathData } from "../geometry/plane";
import {
  outlinePaint,
  ringOutline,
  roundedBoxOutline,
  simplifyRing,
} from "../geometry/outline";
import { ringsEnclosingCircle } from "../geometry/enclosingCircle";
import { insetConvex, intersectRings } from "../geometry/clip";
import {
  boxRing,
  inItsBox,
  isWholeBox,
  ovalRing,
  type Ring,
} from "../geometry/ring";
import type { Size } from "../dims";
import type { AxisScale } from "../domain";

export type EncloseOptions = FilterOptions & {
  /** Pixels between the members and the outline, or a field name or
   *  accessor read once per enclosed group (constant within it). Default 2. */
  padding?: number | string | ((d: any) => number);
  /** The outline: a call in the Shape family. Default `Shape.box()`. */
  shape?: Shape;
  /** Nodes the outline stays out of: a list of nodes or refs, or a
   *  `selectAll(name)` selection. A listed member is ignored. */
  avoiding?: Nodes;
  /** Pixels kept between the outline and each avoided node (and, for a
   *  blob's separate pieces, between a piece's outline and the other
   *  pieces' padded members and links). Default: `padding`. */
  clearance?: number;
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
  avoiding?: Nodes;
  clearance?: number;
  fill?: MaybeValue<string>;
  stroke?: MaybeValue<string>;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  fillOpacity?: number;
};

/** The shape, checked against the `Shape` family's table. */
function checkedShape(shape: Shape | undefined): Shape {
  if (shape === undefined) return box();
  Frontend.checkStrategy("Shape", shape, "enclose({ shape })");
  return shape;
}

/** One SVG path over every loop: the loops wind so that the nonzero rule
 *  fills the region and leaves its holes open. */
const loopsPath = (loops: Pt[][], toPixel: (p: Pt) => Pt) =>
  loops.map((loop) => ringPathData(loop.map((p) => toPixel(p)))).join("");

/** `value`, when it is a number of pixels at least 0; else an error naming
 *  enclose's option `name`, with `more` after it. */
function checkPixels(name: string, value: unknown, more = ""): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return value;
  const shown =
    typeof value === "number" ? String(value) : JSON.stringify(value);
  throw new Error(
    `[gofish] enclose({ ${name} }): ${shown} is not a number of pixels at ` +
      `least 0.${more}`
  );
}

/** The enclosure node over `members`, keeping out `avoided`. Both are its
 *  children (an avoided ref draws nothing); only the members count toward
 *  its box. `shape` is already checked. */
function Enclose(
  o: Resolved,
  shape: Shape,
  members: GoFishAST[],
  avoided: GoFishRef[]
): GoFishNode {
  const padding = checkPixels(
    "padding",
    o.padding ?? 2,
    " A field name must name a column of the enclosed rows, whose value is " +
      "such a number."
  );
  const clearance =
    o.clearance === undefined
      ? undefined
      : checkPixels("clearance", o.clearance);
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
      // Over fresh members, each laid at the outline's origin, the outline
      // claims their union grown by the padding. Around refs it is placed
      // from them (`placedFromRefs` below), and claims nothing of its own.
      resolveExtent: (childExtents) =>
        ([0, 1] as const).map((axis) => {
          const own = childExtents.slice(0, memberCount).map((e) => e[axis]);
          if (
            own.length === 0 ||
            members.some((m) => m instanceof GoFishRef) ||
            own.some((e) => e === undefined)
          )
            return undefined;
          return padExtent(hullExtent(...(own as Extent[])), padding);
        }) as [Extent | undefined, Extent | undefined],
      layout: (size, scales, children, _node, space) => {
        if (fillsItsSpace(members)) {
          if (avoided.length > 0)
            throw new Error(
              `enclose({ avoiding }): this enclosure's member fills the space it is ` +
                `given (such as a treemap), so it fills the outline, and an outline ` +
                `cut around avoided nodes cannot be filled. Give the member a size ` +
                `of its own, or avoid nothing.`
            );
          return fillingLayout(shape, padding, size, scales, children, space);
        }
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
        // the members' padded box
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
        const geometry = (from: number, to: number): Member[] =>
          children
            .slice(from, to)
            .flatMap((child, i) =>
              from > 0 && memberNodes.has(targetOf(child))
                ? []
                : membersOf(placed[from + i])
            );
        const loops = outlineOf(
          shape,
          geometry(0, memberCount),
          {
            padding,
            avoiding: geometry(memberCount, children.length),
            clearance,
          },
          { min: [minX, minY], max: [maxX, maxY] }
        );
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
      // The outline is the node's geometry: a `pack` that holds it packs the
      // outline's own smallest circle, stroke included (not its members'),
      // and an outer `enclose` reads it as a ring (fill "none") or, filled,
      // as its box (#1207). A box shape's outline is its padded box, so its
      // geometry is that box alone, and its circle the one around the box
      // (not the default's, around the members, which leaves out the
      // padding).
      geometry: ({ intrinsicDims, renderData }, _children, node) => {
        const box = boxOfDims(intrinsicDims, node.type);
        const loops = renderData?.loops as Pt[][] | undefined;
        if (loops === undefined || loops.length === 0) return { box };
        const d = node.yFrame.direction;
        const paint = outlinePaint({ fill, stroke, strokeWidth });
        return {
          box,
          // The painted loops, thinned to the tolerance asked for: an outer
          // enclose reads this outline as members, one per piece.
          outline: (tolerance) =>
            loops.map((l) => ringOutline(simplifyRing(l, tolerance), d, paint)),
          enclosingCircle: () => {
            const c = ringsEnclosingCircle(loops, d);
            return { ...c, r: c.r + outlineOverhang(stroke, strokeWidth) };
          },
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

/** Whether every member fills the space it is given on both axes: it is
 *  fresh (not a `ref`), and the claim walk says it fills its room
 *  (`GoFishNode.fillsRoom`: a `treemap` or a `region` with no size of its
 *  own does; a `pack` of sized circles does not). */
const fillsItsSpace = (members: readonly GoFishAST[]): boolean =>
  members.length > 0 &&
  members.every(
    (m) => m instanceof GoFishNode && m.fillsRoom(0) && m.fillsRoom(1)
  );

/**
 * The layout of an enclosure around members that fill their space (#1222):
 * the outline is its space, and the members fill the outline, drawn in by
 * the padding, as their shape (see `Layout` in `_node.ts`). The outline is
 * the box it is laid out in for `Shape.box()`, or the shape it is handed
 * there (a treemap's cell), and the oval in that box for `Shape.oval()`,
 * cut to the shape it is handed. Only a convex outline can be a member's
 * shape, and `Shape.fillet()` and `Shape.blob()` hug members that have a
 * size of their own, so around members that fill their space they are an
 * error, as is `avoiding` (a cut outline is not convex; the layout throws
 * that one).
 */
function fillingLayout(
  shape: Shape,
  padding: number,
  size: Size,
  scales: Size<AxisScale | undefined>,
  children: readonly GoFishAST[],
  space: Ring | undefined
) {
  if (shape.kind === "fillet" || shape.kind === "blob")
    throw new Error(
      `enclose({ shape }): Shape.${shape.kind} hugs members that have a ` +
        `size of their own, but this enclosure's member fills the space it ` +
        `is given (such as a treemap), so it would fill the outline instead, ` +
        `and only a convex outline can be filled. Use Shape.box or ` +
        `Shape.oval, or give the member a size of its own.`
    );
  const [w, h] = size;
  // The shape it is handed, unless that is its box.
  const cell = isWholeBox(space, w, h) ? undefined : space;
  const outline: Ring =
    shape.kind === "box"
      ? (cell ?? boxRing(w, h))
      : cell === undefined
        ? ovalRing(w, h)
        : (intersectRings(ovalRing(w, h), cell) ?? []);
  const inner =
    padding > 0 && outline.length >= 3
      ? (insetConvex(outline, padding) ?? [])
      : outline;
  // Each member is laid out in the inner shape's box, with that shape as
  // its own, and its origin at the box's corner.
  for (const child of children) {
    if (inner.length < 3) {
      placeUnplacedChild(child.layout([0, 0], scales));
      continue;
    }
    const box = inItsBox(inner);
    const placed = child.layout(box.size, scales, box.ring);
    placed.place("x", box.at[0], "baseline");
    placed.place("y", box.at[1], "baseline");
  }
  return {
    intrinsicDims: { x: 0, y: 0, w, h },
    transform: { translate: [undefined, undefined] as [undefined, undefined] },
    // A box with no shape handed to it draws as a rect (with its corners);
    // any other outline as its loop.
    renderData: {
      loops:
        shape.kind === "box" && cell === undefined
          ? undefined
          : [outline.map(([x, y]): Pt => [x, y])],
      box: [0, 0, w, h],
    },
  };
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
    const p = target && planPlacement(target, frame, axis);
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
 * (`marks/chart.ts`, beside `line` and `ribbon`) builds for each group.
 * `avoiding` is read here; a `selectAll(name)` in it resolves against
 * `layerContext`, the chart's named layers.
 */
export function encloseNode(
  o: Resolved,
  members: GoFishAST[],
  layerContext: LayerContext | undefined
): GoFishNode {
  const shape = checkedShape(o.shape);
  // The avoided nodes, as fresh refs the enclosure holds.
  const avoided = avoidedRefs(
    o.avoiding,
    layerContext,
    "enclose({ avoiding })",
    "enclose"
  );
  return Enclose(o, shape, members, avoided);
}

/** How far, px, the chords of a box's rounded corners may stray from them
 *  when the box is cut by its keep-outs. */
const BOX_TOLERANCE = 0.01;

/**
 * The outline of `shape` around placed members `own` (in the node's frame),
 * cut by the keep-outs in `avoid` (`enclose/outline.ts`; a blob or a fillet
 * is cut piece by piece, each never into its own padded members). Undefined
 * for a box no keep-out reaches: it draws as itself, the members' padded box
 * `box` with its corners.
 */
function outlineOf(
  shape: Shape,
  own: Member[],
  avoid: AvoidOptions,
  box: { min: Pt; max: Pt }
): Pt[][] | undefined {
  switch (shape.kind) {
    case "blob":
    case "fillet":
      return encloseOutline(own, { ...shape, ...avoid });
    case "oval":
      return cutOutline(ovalOutline(own, avoid.padding), own, avoid);
    case "box": {
      if (!avoid.avoiding?.length) return undefined;
      const { rx, ry } = cornerRadii(shape.rx, shape.ry, 2);
      const ring = [
        roundedBoxOutline(box, rx, ry, 1, BOX_TOLERANCE).points as Pt[],
      ];
      const cut = cutOutline(ring, own, avoid);
      return cut === ring ? undefined : cut;
    }
  }
}
