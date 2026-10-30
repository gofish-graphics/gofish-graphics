// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

import { autoLabelColorForStyle, type LabelBackdrop } from "./autoLabelColor";
import { GoFishNode } from "../_node";
import type { GoFishAST } from "../_ast";
import { GoFishRef } from "../_ref";
import { LabelText, type LabelNode } from "./labelNode";
import { ref } from "../shapes/ref";
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
import { wrapPreservingIdentity, wrapRing } from "../elaborationUtils";
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
 * The pass first resolves each `.label()` spec to its TARGET node
 * (`resolveLabelTargets`, replacing the old `GoFishNode.resolveLabels`
 * method), then walks the tree bottom-up; each node whose DIRECT CHILDREN
 * hold labels is wrapped once in a `Layer` with one `ref()` + `Text`
 * pair per (labeled child × spec) — the PARENT wraps, never the labeled mark
 * itself, so a label's bbox never inflates the mark's own box and can never
 * push siblings apart (see `elaborateLabelsWalk`). A labeled ROOT gets a
 * final self-wrap.
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
    // inset: fixed-pitch distribute (PR #762) relates the SAME anchor on both
    // nodes with `spacing` as a constant inward pitch — the label sits just
    // inside the target's edge by `offset` px (flush would be spacing 0).
    cs.push(
      Constraint.distribute(
        {
          dir,
          anchor: mainAnchor,
          spacing: inwardSpacing(mainAnchor, offset),
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
            anchor: crossAnchor,
            spacing: inwardSpacing(crossAnchor, offset),
          },
          [refRef, textRef]
        )
      );
    }
  }
  return cs;
}

/** A label the pass seats: one spec on one target, at its position, and
 *  its place in the order the pass met it. */
type LabelPair = {
  target: GoFishNode;
  spec: LabelSpec;
  position: TargetPosition;
  order: number;
};

/** Whether a position is placed by the chooser after the solve (a `Place`
 *  strategy, or a default read from the outline) rather than by the solve
 *  (a position string). */
const isChosen = (p: TargetPosition): p is Place | "outline" =>
  p === "outline" || isPlace(p);

/**
 * Wrap `node` in ONE Layer tier carrying, per label pair, a `ref(target)`
 * stand-in and a label, in the order the pass met them. A label at a
 * position string is placed by the solve, by the constraints
 * `buildLabelConstraints` derives from it; a label the chooser places is
 * placed after the solve, by one `labelPlace` constraint over all of them,
 * which also keeps them off the labels at a position string here and every
 * label the pass seated in wrappers below (`below`, read through refs).
 * Returns the wrapper and every label it seated.
 */
async function wrapWithLabels(
  node: GoFishNode,
  pairs: LabelPair[],
  below: LabelNode[]
): Promise<{ node: GoFishNode; labels: LabelNode[] }> {
  // The label constraints run in the wrapper's axis order, which is the
  // wrapped node's: the wrapper's spaces are the node's.
  const yDirection = wrapperDirection(node);
  const seated: LabelNode[] = [];
  const root = await wrapPreservingIdentity(node, async (content) => {
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

    for (const { target, spec, position } of [...pairs].sort(
      (a, b) => a.order - b.order
    )) {
      const text = resolveLabelText(spec.accessor, target.datum);
      if (!text) continue; // empty/null accessor result: skip this spec

      const stand = ref(target);
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
    // The labels seated below, which the chooser keeps its labels off.
    const belowStands =
      placed.length === 0
        ? []
        : below.map((t) => {
            const stand = ref(t.node);
            refs.push(stand);
            return { node: stand as GoFishAST, label: t };
          });

    // The content is seated at its own origin first, so every label
    // constraint (which reads a target via its `ref()`) sees it already
    // placed and only moves the label. The chooser runs after the solve.
    return wrapRing(content, {
      nodes: [...refs, ...texts] as GoFishNode[],
      constraints: (at) => [
        ...fixed.flatMap(({ stand, text, position, offset }) =>
          buildLabelConstraints(
            position,
            offset,
            at(stand),
            at(text),
            yDirection
          )
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
                  ...belowStands,
                ].map(({ node, label }) => ({ ref: at(node), label })),
                yDirection
              ),
            ]),
      ],
    });
  });
  return { node: root, labels: seated };
}

/** What the walk below hands up from a subtree. */
type Walked = {
  node: GoFishNode;
  changed: boolean;
  /** Labels the chooser places whose call has targets outside the subtree
   *  yet: they are seated further up. */
  pending: LabelPair[];
  /** Every label seated in the subtree. */
  labels: LabelNode[];
};

/**
 * Recursively elaborate labels, children first. A label at a position
 * string is wrapped at the PARENT of the labeled node, never at the labeled
 * node itself: at each node P, every direct child still holding labels
 * (in `held`, after `resolveLabelTargets` pushed specs to their real targets)
 * contributes its ref+label pairs to ONE Layer wrapping P. This is
 * deliberate: wrapping each mark individually would fold the label's bbox
 * into the mark's own box, and an outset label would push stacked or
 * box-driven siblings apart. Wrapping the parent keeps the marks' own layout
 * untouched (labels must never shift the marks they describe, the same
 * invariant as axis gutters, #493); the labels seat off already-placed
 * `ref()` stand-ins in the tier above, exactly like `elaborateOrdinalAxis`'s
 * ref-based label rows.
 *
 * The labels of one `.label()` call that the chooser places are placed
 * together, in one run of the chooser: they wait (`pending`) until the walk
 * reaches the nearest node all of the call's targets are under (`calls`
 * counts each call's targets), and are wrapped there, one tier above their
 * marks or higher, so they never push marks apart either, and the area the
 * chooser keeps them in is that node's.
 *
 * A node's OWN labels are left alone here for ITS parent to consume,
 * except the root's, which has no parent; `elaborateLabels` handles those
 * with a self-wrap.
 */
async function elaborateLabelsWalk(
  node: GoFishNode,
  held: Held,
  calls: Map<unknown, number>,
  order: { next: number }
): Promise<Walked> {
  let changed = false;
  const pending: LabelPair[] = [];
  const below: LabelNode[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child instanceof GoFishNode) {
      const res = await elaborateLabelsWalk(child, held, calls, order);
      if (res.changed) changed = true;
      if (res.node !== child) node.replaceChild(i, res.node);
      pending.push(...res.pending);
      below.push(...res.labels);
    }
  }

  // Direct children still holding labels: their labels at a position
  // string are wrapped here, and the ones the chooser places join those
  // waiting. The node's OWN labels are NOT collected: they belong to this
  // node's parent (or the root self-wrap).
  const pairs: LabelPair[] = [];
  for (const child of node.children)
    if (child instanceof GoFishNode && held.has(child))
      pairs.push(...consumeLabels(child, held, order));
  for (const p of pairs) if (isChosen(p.position)) pending.push(p);
  // The calls whose every target is under this node are placed here.
  const seen = new Map<unknown, number>();
  for (const p of pending)
    seen.set(p.spec.group, (seen.get(p.spec.group) ?? 0) + 1);
  const complete = (p: LabelPair) =>
    seen.get(p.spec.group) === calls.get(p.spec.group);
  const here = [
    ...pairs.filter((p) => !isChosen(p.position)),
    ...pending.filter(complete),
  ];
  const rest = pending.filter((p) => !complete(p));
  if (here.length === 0) return { node, changed, pending: rest, labels: below };

  const { node: root, labels } = await wrapWithLabels(node, here, below);

  // If this node ALSO holds its own labels (pending for ITS parent), the
  // wrapper holds them now: the parent's collection loop sees the wrapper as
  // its child. They keep their target and position: they still describe
  // this node.
  const own = held.get(node);
  if (own !== undefined) {
    held.delete(node);
    held.set(root, own);
  }

  return {
    node: root,
    changed: true,
    pending: rest,
    labels: [...below, ...labels],
  };
}

/** A label spec on its target, at the position it resolves to there. */
type HeldLabel = Omit<LabelPair, "order">;

/** The labels not seated yet, by the node that holds them: their target, or
 *  the wrapper that took its place in its parent. */
type Held = Map<GoFishNode, HeldLabel[]>;

/**
 * Take every node's `_labels` off it into `held`, each spec resolved ONCE to
 * its position on its target (`positionOf`), and count, per call, the
 * targets the chooser places: the labels of one call are placed together
 * once the walk has met them all.
 */
function holdLabels(
  node: GoFishNode,
  held: Held,
  calls: Map<unknown, number>
): void {
  if (node._labels?.length) {
    const labels = node._labels.map((spec) => ({
      target: node,
      spec,
      position: positionOf(spec, node),
    }));
    node._labels = undefined;
    held.set(node, labels);
    for (const { spec, position } of labels)
      if (isChosen(position))
        calls.set(spec.group, (calls.get(spec.group) ?? 0) + 1);
  }
  for (const child of node.children)
    if (child instanceof GoFishNode) holdLabels(child, held, calls);
}

/** The labels `holder` holds, as pairs in the order the pass meets them,
 *  taken off it. */
function consumeLabels(
  holder: GoFishNode,
  held: Held,
  order: { next: number }
): LabelPair[] {
  const labels = held.get(holder) ?? [];
  held.delete(holder);
  return labels.map((l) => ({ ...l, order: order.next++ }));
}

/**
 * Elaborate every `.label()` in `node`'s subtree into real label nodes and
 * constraints. Entry point for the pipeline (see `gofish.tsx`). Runs
 * `resolveLabelTargets` and `holdLabels` once up front, then the bottom-up
 * wrap walk; the
 * root's own labels (no parent to wrap them), and the placed labels of a
 * call that also labels the root, get one final self-wrap.
 */
export async function elaborateLabels(
  node: GoFishNode
): Promise<{ node: GoFishNode; changed: boolean }> {
  resolveLabelTargets(node);
  const held: Held = new Map();
  const calls = new Map<unknown, number>();
  holdLabels(node, held, calls);
  const order = { next: 0 };
  const res = await elaborateLabelsWalk(node, held, calls, order);
  let out = res.node;
  const pairs = [...res.pending, ...consumeLabels(out, held, order)];
  if (pairs.length === 0) return { node: out, changed: res.changed };
  out = (await wrapWithLabels(out, pairs, res.labels)).node;
  return { node: out, changed: true };
}
