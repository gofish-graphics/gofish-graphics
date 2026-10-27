// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

import { autoLabelColorForFill } from "./autoLabelColor";
import { GoFishNode } from "../_node";
import type { GoFishAST } from "../_ast";
import { GoFishRef } from "../_ref";
import { LabelText } from "./labelNode";
import { ref } from "../shapes/ref";
import { Constraint } from "../constraints";
import type { AlignAnchor, ConstraintRef } from "../constraints/shared";
import { placedOutlines } from "../geometry";
import { pointInRing } from "../geometry/plane";
import {
  createLabelPlaceConstraint,
  LABEL_TOLERANCE,
  type LabelPlaceItem,
} from "./placeStep";
import { avoidedRefs } from "../nodeRefs";
import type { Place } from "../../families/place";
import { wrapPreservingIdentity, wrapRing } from "../elaborationUtils";
import { getValue, type MaybeValue } from "../data";
import { resolveColorChannel } from "../../color";
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
 * carry `_labels` is wrapped once in a `Layer` with one `ref()` + `Text`
 * pair per (labeled child × spec) — the PARENT wraps, never the labeled mark
 * itself, so a label's bbox never inflates the mark's own box and can never
 * push siblings apart (see `elaborateLabelsWalk`). A labeled ROOT gets a
 * final self-wrap.
 */

// Visual constants — chosen to match the previous bespoke label styling.
const DEFAULT_OFFSET = 6; // tuned down from the old 10px baseOffset now that the offset is real layout space
const CONTENT_NAME = "__labelContent";
const LABEL_FONT_FAMILY = "source-sans-pro, sans-serif";

/**
 * Resolve the fill color of a node to a CSS color string — the SAME resolution
 * the shape's own fill uses (`resolveColorChannel`), so a label contrasts
 * against the color actually drawn: a categorical swatch, a continuous gradient
 * `scaleFn(value)`, or a literal color. Falls back to a literal string value.
 */
function resolveNodeFill(node: GoFishNode): string | null {
  if (node.color == null) return null;

  try {
    const scaleContext = node.getRenderSession().scaleContext;
    const resolved = resolveColorChannel(
      node.color as MaybeValue<string>,
      scaleContext?.unit
    );
    if (typeof resolved === "string") return resolved;
  } catch {
    // no session yet
  }

  const colorValue = getValue(node.color);
  return typeof colorValue === "string" ? colorValue : null;
}

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
  return placedOutlines(target, LABEL_TOLERANCE).some(
    (o) =>
      o.closed && o.filled && pointInRing(c, o.points as [number, number][])
  );
}

/**
 * The auto label color (see `autoLabelColorForFill`), picked when the label
 * is drawn: contrast against the mark's fill when the label sits inside its
 * mark's outline, and a darkened tint of the fill outside. Inside is read
 * from the outline, not the position, so a `"center"` label on a C-shaped
 * polygon, whose box center is outside the shape, is colored for the page.
 */
const autoLabelColor =
  (target: GoFishNode, stand: GoFishRef) =>
  (label: GoFishNode): string =>
    autoLabelColorForFill(resolveNodeFill(target), sitsInside(label, stand));

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

let labelUid = 0;

/**
 * Wrap `node` in ONE Layer tier carrying, per label pair, a `ref(target)`
 * stand-in and a label, in the order the pass met them. A label at a
 * position string is placed by the solve, by the constraints
 * `buildLabelConstraints` derives from it; a label the chooser places is
 * placed after the solve, by one `labelPlace` constraint over all of them,
 * which also keeps them off the labels at a position string here and the
 * labels the pass seated in wrappers below (`below`, read through refs).
 * Returns the wrapper and the labels it seated at a position string.
 */
async function wrapWithLabels(
  node: GoFishNode,
  pairs: LabelPair[],
  below: GoFishNode[]
): Promise<{ node: GoFishNode; texts: GoFishNode[] }> {
  // The label constraints run in the wrapper's axis order, which is the
  // wrapped node's: the wrapper's spaces are the node's.
  const yDirection = wrapperDirection(node);
  const fixedTexts: GoFishNode[] = [];
  const root = await wrapPreservingIdentity(node, async (content) => {
    const refs: GoFishAST[] = [];
    const texts: GoFishNode[] = [];
    // Labels at a position string, placed by the solve.
    const fixed: {
      refName: string;
      textName: string;
      position: LabelPosition;
      offset?: number;
    }[] = [];
    // Labels the chooser places after the solve.
    const placed: {
      refName: string;
      textName: string;
      avoidNames: string[];
      spec: LabelSpec;
      place: Place | "outline";
      node: ReturnType<typeof LabelText>;
    }[] = [];
    // The nodes each call keeps off, read through refs made once per call.
    const avoided = new Map<unknown, string[]>();

    for (const { target, spec, position } of [...pairs].sort(
      (a, b) => a.order - b.order
    )) {
      const text = resolveLabelText(spec.accessor, target.datum);
      if (!text) continue; // empty/null accessor result: skip this spec

      const idx = labelUid++;
      const refName = `__lref${idx}`;
      const textName = `__ltxt${idx}`;

      const stand = ref(target).name(refName);
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
      label.node.name(textName);
      texts.push(label.node);
      // The label is part of its target as a mark, though it lives out of
      // the target's subtree; record that, so whatever takes the mark over
      // (a `time.transition()`) takes the label with it, and the label
      // paints under its mark's build-in animation.
      target.INTERNAL_attach(label.node);
      if (!isChosen(position)) {
        fixed.push({ refName, textName, position, offset: spec.offset });
        fixedTexts.push(label.node);
        continue;
      }
      let avoidNames = avoided.get(spec.group);
      if (avoidNames === undefined) {
        avoidNames = avoidedRefs(
          spec.avoiding,
          undefined,
          ".label({ avoiding })",
          ".label()"
        ).map((r, k) => {
          const name = `__lavoid${idx}_${k}`;
          refs.push(r.name(name));
          return name;
        });
        avoided.set(spec.group, avoidNames);
      }
      placed.push({
        refName,
        textName,
        avoidNames,
        spec,
        place: position,
        node: label,
      });
    }
    // The labels seated below, which the chooser keeps its labels off.
    const belowNames =
      placed.length === 0
        ? []
        : below.map((t) => {
            const name = `__lbelow${labelUid++}`;
            refs.push(ref(t).name(name));
            return name;
          });

    // The content is seated at its own origin first, so every label
    // constraint (which reads a target via its `ref()`) sees it already
    // placed and only moves the label. The chooser runs after the solve.
    return wrapRing(content, CONTENT_NAME, {
      nodes: [...refs, ...texts] as GoFishNode[],
      constraints: (g) => [
        ...fixed.flatMap(({ refName, textName, position, offset }) =>
          buildLabelConstraints(
            position,
            offset,
            g[refName],
            g[textName],
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
                    target: g[p.refName] as ConstraintRef,
                    label: g[p.textName] as ConstraintRef,
                    node: p.node,
                    place: p.place,
                    offset: p.spec.offset,
                    avoiding: p.avoidNames.map((n) => g[n] as ConstraintRef),
                    call: callName(p.spec.accessor),
                  })
                ),
                [...fixed.map(({ textName }) => textName), ...belowNames].map(
                  (n) => g[n] as ConstraintRef
                ),
                yDirection
              ),
            ]),
      ],
    });
  });
  return { node: root, texts: fixedTexts };
}

/** What the walk below hands up from a subtree. */
type Walked = {
  node: GoFishNode;
  changed: boolean;
  /** Labels the chooser places whose call has targets outside the subtree
   *  yet: they are seated further up. */
  pending: LabelPair[];
  /** The labels seated at a position string in the subtree. */
  texts: GoFishNode[];
};

/**
 * Recursively elaborate labels, children first. A label at a position
 * string is wrapped at the PARENT of the labeled node, never at the labeled
 * node itself: at each node P, every direct child still carrying `_labels`
 * (after `resolveLabelTargets` pushed specs to their real targets)
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
 * A node's OWN `_labels` are left alone here for ITS parent to consume,
 * except the root's, which has no parent; `elaborateLabels` handles those
 * with a self-wrap.
 */
async function elaborateLabelsWalk(
  node: GoFishNode,
  calls: Map<unknown, number>,
  order: { next: number }
): Promise<Walked> {
  let changed = false;
  const pending: LabelPair[] = [];
  const below: GoFishNode[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child instanceof GoFishNode) {
      const res = await elaborateLabelsWalk(child, calls, order);
      if (res.changed) changed = true;
      if (res.node !== child) {
        node.children[i] = res.node;
        res.node.parent = node;
      }
      pending.push(...res.pending);
      below.push(...res.texts);
    }
  }

  // Direct children still carrying `_labels`: their labels at a position
  // string are wrapped here, and the ones the chooser places join those
  // waiting. The node's OWN `_labels` are NOT collected: they belong to this
  // node's parent (or the root self-wrap).
  const pairs: LabelPair[] = [];
  for (const child of node.children)
    if (child instanceof GoFishNode && child._labels?.length)
      pairs.push(...consumeLabels(child, order));
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
  if (here.length === 0) return { node, changed, pending: rest, texts: below };

  const { node: root, texts } = await wrapWithLabels(node, here, below);

  // If this node ALSO carries its own labels (pending for ITS parent), hoist
  // them onto the wrapper — the parent's collection loop sees the wrapper as
  // its child now, and the label should describe the whole labeled unit.
  if (node._labels && node._labels.length > 0) {
    root._labels = node._labels;
    if (root.datum === undefined) root.datum = node.datum;
    node._labels = undefined;
  }

  return {
    node: root,
    changed: true,
    pending: rest,
    texts: [...below, ...texts],
  };
}

/** A target's labels as pairs, each at its position, taken off it. */
function consumeLabels(
  target: GoFishNode,
  order: { next: number }
): LabelPair[] {
  const specs = target._labels ?? [];
  target._labels = undefined;
  return specs.map((spec) => ({
    target,
    spec,
    position: positionOf(spec, target),
    order: order.next++,
  }));
}

/** How many targets each call has that the chooser places: the labels of
 *  one call are placed together once the walk has met them all. */
function countChosen(node: GoFishNode, calls: Map<unknown, number>): void {
  for (const spec of node._labels ?? [])
    if (isChosen(positionOf(spec, node)))
      calls.set(spec.group, (calls.get(spec.group) ?? 0) + 1);
  for (const child of node.children)
    if (child instanceof GoFishNode) countChosen(child, calls);
}

/**
 * Elaborate every `.label()` in `node`'s subtree into real label nodes and
 * constraints. Entry point for the pipeline (see `gofish.tsx`). Runs
 * `resolveLabelTargets` once up front, then the bottom-up wrap walk; the
 * root's own labels (no parent to wrap them), and the placed labels of a
 * call that also labels the root, get one final self-wrap.
 */
export async function elaborateLabels(
  node: GoFishNode
): Promise<{ node: GoFishNode; changed: boolean }> {
  resolveLabelTargets(node);
  const calls = new Map<unknown, number>();
  countChosen(node, calls);
  const order = { next: 0 };
  const res = await elaborateLabelsWalk(node, calls, order);
  let out = res.node;
  const pairs = [
    ...res.pending,
    ...(out._labels?.length ? consumeLabels(out, order) : []),
  ];
  if (pairs.length === 0) return { node: out, changed: res.changed };
  out = (await wrapWithLabels(out, pairs, res.texts)).node;
  return { node: out, changed: true };
}
