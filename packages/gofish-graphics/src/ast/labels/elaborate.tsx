// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

import { autoLabelColorForFill } from "./autoLabelColor";
import { GoFishNode } from "../_node";
import { Text } from "../shapes/text";
import { ref } from "../shapes/ref";
import { Constraint } from "../constraints";
import type { AlignAnchor } from "../constraints/shared";
import { wrapPreservingIdentity, wrapRing } from "../elaborationUtils";
import { getValue, type MaybeValue } from "../data";
import { resolveColorChannel } from "../../color";
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
 * Compute an auto label color from the node's resolved fill (see
 * `autoLabelColorForFill`): contrast against the fill inside the shape, a
 * darkened tint of it outside.
 */
function autoLabelColor(node: GoFishNode, position: LabelPosition): string {
  const isInside =
    position === "center" || (position as string).startsWith("inset");
  return autoLabelColorForFill(resolveNodeFill(node), isInside);
}

/**
 * Push each node's `_labels` down to its children when the node has no rows
 * of its own (no datum, or the empty list a combinator root gets) — a group
 * node (e.g. a spread's per-key band) merely relays a
 * label to whichever descendant should actually carry it. A node WITH a datum
 * (a leaf shape, or a group combinator that stamped its own subdata) keeps its
 * own label rather than propagating it further. Mirrors the old
 * `GoFishNode.resolveLabels()`, generalized to an array of specs. Runs ONCE,
 * top-down, before the elaboration walk below.
 */
function resolveLabelTargets(node: GoFishNode): void {
  if (
    node._labels &&
    node._labels.length > 0 &&
    node.children.length > 0 &&
    !(node.datum?.length > 0)
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
  spec: LabelSpec,
  refRef: any,
  textRef: any,
  yDirection: AxisDirection
): any[] {
  const positionStr = spec.position ?? "outset";
  if (positionStr === "center") {
    return [Constraint.align({ x: "middle", y: "middle" }, [textRef, refRef])];
  }

  const { side, edge: rawEdge, align } = parseLabelPosition(positionStr);
  const edge = rawEdge ?? "top";
  const offset = spec.offset ?? DEFAULT_OFFSET;
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

let labelUid = 0;

/**
 * Wrap `node` in ONE Layer tier carrying, per (target × label spec), a
 * `ref(target)` stand-in and a label `Text`, related by the constraints
 * `buildLabelConstraints` derives from the spec's `LabelPosition`. Each
 * target's `_labels` are consumed here. Shared by the per-parent wrap in
 * `elaborateLabelsWalk` (targets = labeled direct children of `node`) and the
 * root self-wrap in `elaborateLabels` (targets = [node]).
 */
async function wrapWithLabelTexts(
  node: GoFishNode,
  targets: GoFishNode[]
): Promise<GoFishNode> {
  // The label constraints run in the wrapper's axis order, which is the
  // wrapped node's: the wrapper's spaces are the node's.
  const yDirection = wrapperDirection(node);
  return wrapPreservingIdentity(node, async (content) => {
    const refs: GoFishNode[] = [];
    const texts: GoFishNode[] = [];
    const pending: { refName: string; textName: string; spec: LabelSpec }[] =
      [];

    for (const target of targets) {
      const specs = target._labels!;
      target._labels = undefined;
      const datum = target.datum;
      for (const spec of specs) {
        const text = resolveLabelText(spec.accessor, datum);
        if (!text) continue; // empty/null accessor result: skip this spec

        const idx = labelUid++;
        const refName = `__lref${idx}`;
        const textName = `__ltxt${idx}`;

        refs.push((ref(target) as any).name(refName) as GoFishNode);

        const position = spec.position ?? "outset";
        const rotate = spec.rotate ?? undefined;
        const label = Text({
          text,
          fontSize: spec.fontSize ?? 11,
          fontFamily: spec.fontFamily ?? LABEL_FONT_FAMILY,
          fontWeight: spec.fontWeight,
          fontStyle: spec.fontStyle,
          fill: spec.color ?? autoLabelColor(target, position),
          rotate,
        } as any).name(textName) as GoFishNode;
        texts.push(label);
        // The label is part of its target as a mark, though it lives out of
        // the target's subtree; record that, so whatever takes the mark over
        // (a `time.transition()`) takes the label with it, and the label
        // paints under its mark's build-in animation.
        target.INTERNAL_attach(label);
        pending.push({ refName, textName, spec });
      }
    }

    // The content is seated at its own origin first, so every label
    // constraint (which reads a target via its `ref()`) sees it already
    // placed and only moves the label `Text`.
    return wrapRing(content, CONTENT_NAME, {
      nodes: [...refs, ...texts],
      constraints: (g) =>
        pending.flatMap(({ refName, textName, spec }) =>
          buildLabelConstraints(spec, g[refName], g[textName], yDirection)
        ),
    });
  });
}

/**
 * Recursively elaborate labels, children first. The wrap happens at the
 * PARENT of the labeled node(s), never at the labeled node itself: at each
 * node P, every direct child still carrying `_labels` (after
 * `resolveLabelTargets` pushed specs to their real targets) contributes its
 * ref+Text pairs to ONE Layer wrapping P. This is deliberate — wrapping each
 * mark individually would fold the label's bbox into the mark's own box and
 * an outset label would push stacked/box-driven siblings apart. Wrapping the
 * parent keeps the marks' own layout untouched (labels must never shift the
 * marks they describe — the same invariant as axis gutters, #493); the label
 * Texts seat off already-placed `ref()` stand-ins in the tier above, exactly
 * like `elaborateOrdinalAxis`'s ref-based label rows.
 *
 * A node's OWN `_labels` are therefore left alone here for ITS parent to
 * consume — except the root, which has no parent; `elaborateLabels` handles
 * that case with a self-wrap.
 */
async function elaborateLabelsWalk(
  node: GoFishNode
): Promise<{ node: GoFishNode; changed: boolean }> {
  let changed = false;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child instanceof GoFishNode) {
      const res = await elaborateLabelsWalk(child);
      if (res.changed) changed = true;
      if (res.node !== child) {
        node.children[i] = res.node;
        res.node.parent = node;
      }
    }
  }

  // Direct children still carrying `_labels` — this node (their parent) wraps
  // once for all of them. The node's OWN `_labels` are NOT collected: they
  // belong to this node's parent (or the root self-wrap).
  const targets = node.children.filter(
    (c): c is GoFishNode =>
      c instanceof GoFishNode && c._labels !== undefined && c._labels.length > 0
  );
  if (targets.length === 0) return { node, changed };

  const root = await wrapWithLabelTexts(node, targets);

  // If this node ALSO carries its own labels (pending for ITS parent), hoist
  // them onto the wrapper — the parent's collection loop sees the wrapper as
  // its child now, and the label should describe the whole labeled unit.
  if (node._labels && node._labels.length > 0) {
    root._labels = node._labels;
    if (root.datum === undefined) root.datum = node.datum;
    node._labels = undefined;
  }

  return { node: root, changed: true };
}

/**
 * Elaborate every `.label()` in `node`'s subtree into real `Text` nodes +
 * constraints. Entry point for the pipeline (see `gofish.tsx`). Runs
 * `resolveLabelTargets` once up front, then the bottom-up per-parent wrap
 * walk; a root that itself carries `_labels` (no parent to wrap it) gets one
 * final self-wrap.
 */
export async function elaborateLabels(
  node: GoFishNode
): Promise<{ node: GoFishNode; changed: boolean }> {
  resolveLabelTargets(node);
  const res = await elaborateLabelsWalk(node);
  let out = res.node;
  let changed = res.changed;
  if (out._labels && out._labels.length > 0) {
    out = await wrapWithLabelTexts(out, [out]);
    changed = true;
  }
  return { node: out, changed };
}
