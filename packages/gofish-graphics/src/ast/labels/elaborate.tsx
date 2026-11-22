// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

import { autoLabelColorForStyle, type LabelBackdrop } from "./autoLabelColor";
import { pitch } from "../../families/spacing";
import { GoFishNode } from "../_node";
import type { GoFishAST } from "../_ast";
import { GoFishRef } from "../_ref";
import { LabelText, type LabelNode } from "./labelNode";
import { Constraint } from "../constraints";
import type { AlignAnchor } from "../constraints/shared";
import { placedOutlines, type Outline } from "../geometry";
import { pointInRing } from "../geometry/plane";
import {
  createLabelPlaceConstraint,
  LABEL_TOLERANCE,
  type LabelPlaceItem,
} from "./placeStep";
import { avoidedRefs } from "../nodeRefs";
import type { Place } from "../../families/place";
import type { DrawnTier, SelectionLayer } from "../selectionLayer";
import { selectNode } from "../marks/resolveRefData";
import { Frontend } from "gofish-ir";
import {
  orientSide,
  wrapperDirection,
  type AxisDirection,
} from "../axisDirection";
import {
  type LabelPosition,
  type LabelSpec,
  parseLabelPosition,
  resolveLabelText,
} from "./labelPlacement";

/**
 * Label elaboration: turn `.label(...)` specs into ordinary GoFish shapes +
 * constraints, the same way `src/ast/axes/elaborate.tsx` turns an inferred
 * axis into Rect/Text/Layer nodes. This replaces the bespoke post-layout
 * overlay path (the former `src/ast/labels/renderLabel.tsx`): a label is no
 * longer a privileged render-time display item, it's a real `Text` node
 * seated beside (or inside) the labeled node via a `ref()` stand-in and
 * ordinary `align`/`distribute` constraints — exactly the technique
 * `elaborateOrdinalAxis` uses for its ref-based tick labels.
 *
 * `.label()` is a layer over its selection (`selectionLayer.ts`, the
 * lowering every such modifier shares). The pass first resolves each
 * `.label()` spec to its TARGET node (`resolveLabelTargets`, replacing the
 * old `GoFishNode.resolveLabels` method). Then a label is a layer of text on
 * its chart: the content of the nearest `chart()` around the labeled mark
 * (or the render root) is wrapped once in a `Layer` with one ref + label
 * pair per (labeled node × spec), so a label takes room in its chart and
 * never moves the marks it describes (see `drawLabels`).
 */

// Visual constants — chosen to match the previous bespoke label styling.
const DEFAULT_OFFSET = 6; // tuned down from the old 10px baseOffset now that the offset is real layout space
const LABEL_FONT_FAMILY = "source-sans-pro, sans-serif";

/**
 * Whether a placed label sits inside its mark: its center is inside one of
 * the mark's filled closed outlines. Inside an unfilled one, the page shows
 * through, so the label is read as outside. Both are read in the label layer's frame: the
 * label's own box, and the mark through its `ref()` stand-in (a sibling of
 * the label), in pixels.
 */
function sitsInside(label: GoFishNode, target: GoFishRef): boolean {
  const d = label.dims;
  if (d[0].center === undefined || d[1].center === undefined) return false;
  const c: [number, number] = [d[0].center, d[1].center];
  // A mark with no filled region (a line) has no inside.
  if (!target.geometry().outline(LABEL_TOLERANCE).some(filledRegion))
    return false;
  return placedOutlines(target, LABEL_TOLERANCE).some(
    (o) => filledRegion(o) && insideOutline(c, o)
  );
}

const filledRegion = (o: Outline) => o.closed && o.filled;

/** Whether `c` is inside a closed outline (even-odd), read from its exact
 *  box when it has one: the same answer `pointInRing` gives on the box's
 *  corners, half-open on each axis. */
function insideOutline(c: [number, number], o: Outline): boolean {
  if (o.box === undefined) return pointInRing(c, o.points);
  const [[x0, y0], [x1, y1]] = [o.box.min, o.box.max];
  return c[0] < x0 !== c[0] < x1 && c[1] < y0 !== c[1] < y1;
}

/**
 * The auto label color (see `autoLabelColorForStyle`), picked when the label
 * is drawn, from the style its mark painted and the paint the label draws
 * behind its own glyphs. The mark lowers first: the label layer is a ring
 * whose content, which holds the mark, paints before its labels, and nothing
 * reorders a ring's children (the content's own z-order moves to the ring,
 * see `wrapPreservingIdentity`). Inside is read from the outline, not the
 * position, so a `"center"` label on a C-shaped polygon, whose box center is
 * outside the shape, is colored for the page.
 */
const autoLabelColor =
  (target: GoFishNode, stand: GoFishRef) =>
  (label: GoFishNode, backdrop: LabelBackdrop): string =>
    autoLabelColorForStyle(
      target.paintedStyle,
      sitsInside(label, stand),
      backdrop
    );

/** Where a label goes on its target: a position string, a `Place`
 *  strategy, or `"outline"`, a default the chooser reads from the target's
 *  outline (see `GoFishNode.labelPosition`). */
type TargetPosition = LabelPosition | Place | "outline";

/** Is this position value a `Place` strategy (not a position string)? */
const isPlace = (p: unknown): p is Place =>
  p !== null && typeof p === "object" && "kind" in (p as object);

/** The coordinate space a node is drawn in when it is not linear (a polar
 *  `coord`), or undefined. */
function warpedSpace(node: GoFishAST): string | undefined {
  for (let cur: GoFishAST | undefined = node; cur; cur = cur.parent) {
    const space = (cur as GoFishNode)._space;
    if (space !== undefined && space.type !== "linear") return space.type;
  }
  return undefined;
}

/** How a label call reads in a message: `.label("country")`. */
function callName(accessor: LabelSpec["accessor"]): string {
  if (typeof accessor === "string")
    return `.label(${JSON.stringify(accessor)})`;
  if (typeof accessor === "function") return ".label(fn)";
  return `.label(field(${JSON.stringify(accessor.name)}))`;
}

/**
 * The position a spec places its label at on `target`: its own, or the
 * target's default (`GoFishNode.labelPosition`), or `"outset"`. A `Place`
 * strategy reads the target's outline in screen space, which a polar or
 * other warped coordinate space does not give yet: there, a default falls
 * back to `"outset"` (by the box, as before), and a strategy written out is
 * an error.
 */
function positionOf(spec: LabelSpec, target: GoFishNode): TargetPosition {
  const given = spec.position;
  if (isPlace(given))
    Frontend.checkStrategy("Place", given, ".label({ position })");
  const space = warpedSpace(target);
  if (given !== undefined) {
    if (isPlace(given) && space !== undefined)
      throw new Error(
        `[gofish] .label({ position: Place.${given.kind}() }): Place ` +
          `strategies read a mark's outline on the screen, which a ${space} ` +
          `coordinate space does not give yet (#1201: ` +
          `https://github.com/gofish-graphics/gofish-graphics/issues/1201). Use a position string, which places the label ` +
          `by the mark's box.`
      );
    return given;
  }
  if (space !== undefined) return "outset";
  return target.labelPosition ?? "outset";
}

/**
 * Push each node's `_labels` down to its child nodes when the node is a
 * group: it has no datum of its own and draws no ink of its own, so it
 * merely relays a label to whichever descendant should actually carry it (a
 * spread's per-key band). A node WITH a datum (a leaf shape, or a group
 * combinator that stamped its own subdata) keeps its own label rather than
 * propagating it further, and so does a mark that draws its own ink between
 * or around its children (an `arrow`, a `line`), which says where its label
 * goes (`labelPosition`). Mirrors the old `GoFishNode.resolveLabels()`,
 * generalized to an array of specs. Runs ONCE, top-down, before the
 * elaboration walk below.
 */
function resolveLabelTargets(node: GoFishNode): void {
  if (
    node._labels &&
    node._labels.length > 0 &&
    node.datum === undefined &&
    node.labelPosition === undefined &&
    node.children.some((c) => c instanceof GoFishNode)
  ) {
    for (const child of node.children) {
      if (
        child instanceof GoFishNode &&
        (!child._labels || child._labels.length === 0)
      ) {
        child._labels = node._labels;
      }
    }
    node._labels = undefined;
  }
  for (const child of node.children) {
    if (child instanceof GoFishNode) resolveLabelTargets(child);
  }
}

/**
 * Which bbox anchor of the TARGET corresponds to a given visual edge, in the
 * axis order of the frame the label constraints run in (`yDirection`, that
 * frame's y direction). x always runs with the pixels, so `left` is
 * `"start"` and `right` is `"end"`; `top`/`bottom` are the screen's start
 * and end edges read through the y direction (`orientSide`).
 */
function edgeAnchor(
  edge: "top" | "bottom" | "left" | "right",
  yDirection: AxisDirection
): AlignAnchor {
  switch (edge) {
    case "right":
      return "end";
    case "left":
      return "start";
    case "top":
      return orientSide("start", yDirection);
    case "bottom":
      return orientSide("end", yDirection);
  }
}

/**
 * Map a `LabelAlignment` (the label option's cross-axis token) to the
 * `AlignAnchor` used to align the label against its target's bbox. Per
 * `LabelPosition`'s documented semantics `start` is the left or the top of
 * the screen and `end` the right or the bottom, so on a `left`/`right` edge
 * (cross axis y) it reads through the y direction, as {@link edgeAnchor}
 * does.
 */
function crossAlignAnchor(
  edge: "top" | "bottom" | "left" | "right",
  align: "start" | "center" | "end",
  yDirection: AxisDirection
): AlignAnchor {
  if (align === "center") return "middle";
  const yCross = edge === "left" || edge === "right";
  return orientSide(align, yCross ? yDirection : 1);
}

/** `anchor === "end"` (bbox max) pads INWARD with a negative pitch; `"start"`
 *  (bbox min) pads inward with a positive one. Shared by the inset main- and
 *  cross-axis fixed-pitch distributes below. */
const inwardSpacing = (anchor: AlignAnchor, offset: number): number =>
  anchor === "end" ? -offset : offset;

/**
 * Build the constraints that place one label `Text` relative to its target's
 * `ref()` stand-in, from the label's parsed `LabelPosition`. Mirrors the pixel
 * semantics of the old `calculateLabelOffset`/`getLabelTextAnchor` as closely
 * as the constraint vocabulary allows (a few px of anchor-vs-bbox drift is
 * expected and acceptable). `yDirection` is the y direction of the frame the
 * constraints run in (see `edgeAnchor`'s doc comment).
 */
function buildLabelConstraints(
  positionStr: LabelPosition,
  offsetOpt: number | undefined,
  refRef: any,
  textRef: any,
  yDirection: AxisDirection
): any[] {
  if (positionStr === "center") {
    return [Constraint.align({ x: "middle", y: "middle" }, [textRef, refRef])];
  }

  const { side, edge: rawEdge, align } = parseLabelPosition(positionStr);
  const edge = rawEdge ?? "top";
  const offset = offsetOpt ?? DEFAULT_OFFSET;
  const dir: "x" | "y" = edge === "left" || edge === "right" ? "x" : "y";
  const crossDim: "x" | "y" = dir === "x" ? "y" : "x";
  const mainAnchor = edgeAnchor(edge, yDirection);
  const cs: any[] = [];

  if (side === "outset") {
    // Main axis: the label sits just past the target's outer edge, flush with
    // a `spacing` gap (edge-mode distribute — the default). The label goes on
    // whichever side of the ref is further from center along `mainAnchor`.
    const order = mainAnchor === "end" ? [refRef, textRef] : [textRef, refRef];
    cs.push(Constraint.distribute({ dir, spacing: offset }, order));
    // Cross axis: a plain bbox-edge align (no gap) — the label's edge sits
    // flush with the target's edge, matching the old "full half-extent, no
    // baseOffset" pixel math for outset alignment.
    const anchor = crossAlignAnchor(edge, align, yDirection);
    cs.push(Constraint.align({ [crossDim]: anchor } as any, [textRef, refRef]));
  } else {
    // inset: a pitch distribute (PR #762) relates the SAME point on both
    // nodes with `spacing` as a constant inward pitch — the label sits just
    // inside the target's edge by `offset` px (flush would be spacing 0).
    cs.push(
      Constraint.distribute(
        {
          dir,
          spacing: pitch(inwardSpacing(mainAnchor, offset), { at: mainAnchor }),
        },
        [refRef, textRef]
      )
    );
    if (align === "center") {
      cs.push(
        Constraint.align({ [crossDim]: "middle" } as any, [textRef, refRef])
      );
    } else {
      const crossAnchor = crossAlignAnchor(edge, align, yDirection);
      cs.push(
        Constraint.distribute(
          {
            dir: crossDim,
            spacing: pitch(inwardSpacing(crossAnchor, offset), {
              at: crossAnchor,
            }),
          },
          [refRef, textRef]
        )
      );
    }
  }
  return cs;
}

/** A label the pass seats: one spec on one target, at its position. */
type LabelPair = {
  target: GoFishNode;
  spec: LabelSpec;
  position: TargetPosition;
};

/** Whether a position is placed by the chooser after the solve (a `Place`
 *  strategy, or a default read from the outline) rather than by the solve
 *  (a position string). */
const isChosen = (p: TargetPosition): p is Place | "outline" =>
  p === "outline" || isPlace(p);

/**
 * The label tier over one home (`labelLayer`'s `draw`): per label pair, a
 * ref to its target, made as a selection makes one (`selectNode`), and a label,
 * in order, beside the home's content. A label's text is its accessor over
 * the target's rows, the ref's `datum`. A label at a position string is
 * placed by the solve, by the constraints `buildLabelConstraints` derives
 * from it; a label the chooser places is placed after the solve, by one
 * `labelPlace` constraint over all of them, which also keeps them off the
 * labels at a position string and the labels of the charts inside the home
 * (`inside`, placed before it, read through refs). It draws every label it
 * seated.
 */
function drawLabels(
  pairs: LabelPair[],
  { home, inside }: { home: GoFishNode; inside: LabelNode[][] }
): DrawnTier<LabelNode[]> {
  // The label constraints run in the wrapper's axis order, which is the
  // wrapped node's: the wrapper's spaces are the node's.
  const yDirection = wrapperDirection(home);
  const seated: LabelNode[] = [];
  const refs: GoFishAST[] = [];
  const texts: GoFishNode[] = [];
  // Labels at a position string, placed by the solve.
  const fixed: {
    stand: GoFishAST;
    text: GoFishNode;
    position: LabelPosition;
    offset?: number;
    label: LabelNode;
  }[] = [];
  // Labels the chooser places after the solve.
  const placed: {
    stand: GoFishAST;
    text: GoFishNode;
    avoid: GoFishAST[];
    spec: LabelSpec;
    place: Place | "outline";
    node: ReturnType<typeof LabelText>;
  }[] = [];
  // The nodes each call keeps off, read through refs made once per call.
  const avoided = new Map<unknown, GoFishAST[]>();

  for (const { target, spec, position } of pairs) {
    // The target's rows, which its ref reads (`GoFishRef.datum`). The ref
    // is made only for a label that has a text.
    const text = resolveLabelText(spec.accessor, target.datum);
    if (!text) continue; // empty/null accessor result: skip this spec

    const stand = selectNode(target);
    refs.push(stand);

    const label = LabelText({
      text,
      fontSize: spec.fontSize ?? 11,
      fontFamily: spec.fontFamily ?? LABEL_FONT_FAMILY,
      fontWeight: spec.fontWeight,
      fontStyle: spec.fontStyle,
      fill: spec.color ?? autoLabelColor(target, stand),
      rotate: spec.rotate,
      halo: spec.halo,
      background: spec.background,
    });
    texts.push(label.node);
    seated.push(label);
    // The label is part of its target as a mark, though it lives out of
    // the target's subtree; record that, so whatever takes the mark over
    // (a `time.transition()`) takes the label with it, and the label
    // paints under its mark's build-in animation.
    target.INTERNAL_attach(label.node);
    if (!isChosen(position)) {
      fixed.push({
        stand,
        text: label.node,
        position,
        offset: spec.offset,
        label,
      });
      continue;
    }
    // The chooser places it after the solve, so the claim walk cannot
    // know where it lands: it is ink, which takes no room, and the canvas
    // grows to hold it where the render gives no size (#1032).
    label.node.inkOn = [true, true];
    let avoid = avoided.get(spec.group);
    if (avoid === undefined) {
      avoid = avoidedRefs(
        spec.avoiding,
        undefined,
        ".label({ avoiding })",
        ".label()"
      );
      refs.push(...avoid);
      avoided.set(spec.group, avoid);
    }
    placed.push({
      stand,
      text: label.node,
      avoid,
      spec,
      place: position,
      node: label,
    });
  }
  // The labels of the charts inside, which the chooser keeps its labels
  // off as it does those at a position string here.
  const insideStands =
    placed.length === 0
      ? []
      : inside.flat().map((t) => {
          const stand = selectNode(t.node);
          refs.push(stand);
          return { node: stand as GoFishAST, label: t };
        });

  // The home's content is seated at its own origin first (`wrapRing`), so
  // every label constraint (which reads a target via its ref) sees it
  // already placed and only moves the label. The chooser runs after the
  // solve.
  return {
    drawn: seated,
    nodes: [...refs, ...texts] as GoFishNode[],
    constraints: (at) => [
      ...fixed.flatMap(({ stand, text, position, offset }) =>
        buildLabelConstraints(position, offset, at(stand), at(text), yDirection)
      ),
      ...(placed.length === 0
        ? []
        : [
            createLabelPlaceConstraint(
              placed.map(
                (p): LabelPlaceItem => ({
                  group: p.spec.group,
                  target: at(p.stand),
                  label: at(p.text),
                  node: p.node,
                  place: p.place,
                  offset: p.spec.offset,
                  avoiding: p.avoid.map(at),
                  call: callName(p.spec.accessor),
                })
              ),
              [
                ...fixed.map(({ text, label }) => ({ node: text, label })),
                ...insideStands,
              ].map(({ node, label }) => ({ ref: at(node), label })),
              yDirection
            ),
          ]),
    ],
  };
}

/**
 * Take every node's `_labels` off it, each spec resolved ONCE to its
 * position on its target (`positionOf`), into `out`: a subtree's labels
 * before those of the nodes that hold it, and siblings' in order.
 */
function holdLabels(node: GoFishNode, out: LabelPair[]): void {
  for (const child of node.children)
    if (child instanceof GoFishNode) holdLabels(child, out);
  for (const child of node.children)
    if (child instanceof GoFishNode) takeLabels(child, out);
}

/** `target`'s labels, taken off it into `out`. */
function takeLabels(target: GoFishNode, out: LabelPair[]): void {
  for (const spec of target._labels ?? [])
    out.push({ target, spec, position: positionOf(spec, target) });
  target._labels = undefined;
}

/**
 * `.label()` as a layer over its selection (`selectionLayer.ts`). Its stamps
 * are the label specs on the nodes, relayed from a group to the nodes that
 * carry them (`resolveLabelTargets`), and taken off in `holdLabels`'s order;
 * the tier over each home is `drawLabels`. The pipeline lowers it after
 * chrome (`gofish.tsx`). A label is a text in one layer on its chart
 * (`homeOf` in `selectionLayer.ts`): each chart's content is wrapped once,
 * with every label of the chart, so a chart's labels take room in the
 * chart, the chooser places them all in one run, and a label never moves
 * the marks it describes.
 */
export const labelLayer: SelectionLayer<LabelPair, LabelNode[]> = {
  take(root) {
    resolveLabelTargets(root);
    const pairs: LabelPair[] = [];
    holdLabels(root, pairs);
    takeLabels(root, pairs);
    return pairs;
  },
  target: (pair) => pair.target,
  draw: drawLabels,
};
