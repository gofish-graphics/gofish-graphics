// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Labels — /internals/frontend/labels
// </gofish-wiki>

import chroma from "chroma-js";
import { luv } from "culori";
import { GoFishNode } from "../_node";
import { Text } from "../shapes/text";
import { layer } from "../graphicalOperators/layer";
import { ref } from "../shapes/ref";
import { Constraint } from "../constraints";
import type { AlignAnchor } from "../constraints/shared";
import { wrapPreservingIdentity } from "../elaborationUtils";
import { getValue, type MaybeValue } from "../data";
import { resolveColorChannel } from "../../color";
import { isCONTINUOUS } from "../underlyingSpace";
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
const DEFAULT_OFFSET = 10; // matches calculateLabelOffset's old baseOffset
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
 * Compute an auto label color.
 * - Inside the shape: contrast against the fill.
 * - Outside the shape: darken the fill for a readable tint on white background.
 */
function autoLabelColor(node: GoFishNode, position: LabelPosition): string {
  const fill = resolveNodeFill(node);
  const isInside =
    position === "center" || (position as string).startsWith("inset");

  if (isInside) {
    if (!fill) return "black";

    const luvColor = luv(fill);
    const lightness = luvColor?.l ?? 0;
    const [, , hue] = chroma(fill).lch();
    if (lightness < 60) {
      return "white";
    } else {
      return chroma.lch(8, 18, hue).hex();
    }
  }

  if (!fill) return "#333333";
  try {
    const [, chr, hue] = chroma(fill).lch();
    return chroma.lch(30, chr, hue).hex();
  } catch {
    return "#333333";
  }
}

/**
 * Push each node's `_labels` down to its children when the node has no datum
 * of its own — a group node (e.g. a spread's per-key band) merely relays a
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
    node.datum === undefined
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
 * Which bbox anchor of the TARGET corresponds to a given visual edge, in this
 * subtree's own AUTHORED (pre-bake) coordinate frame.
 *
 * `left`/`right` are direction-invariant — x is never mirrored — so they map
 * literally (`left` → bbox min/`"start"`, `right` → bbox max/`"end"`).
 *
 * `top`/`bottom` depend on `frameFlips` (does THIS node declare a continuous
 * y, and so get y-mirrored at bake — see `elaborateAxes`'s `frameFlips`,
 * `elaborationsFor` ~:722, and `bake.ts`'s `declaredYUp`): when it does, the
 * subtree's authored-ascending direction reads as visually UP once mirrored,
 * so `top` is the bbox MAX (`"end"`); when it doesn't (no mirror — an
 * ordinal/undefined-y subtree, e.g. a bar sized only along x), the authored
 * frame already equals final pixel space directly, where ascending y is
 * visually DOWN, so `top` is the bbox MIN (`"start"`) instead.
 */
function edgeAnchor(
  edge: "top" | "bottom" | "left" | "right",
  frameFlips: boolean
): AlignAnchor {
  switch (edge) {
    case "right":
      return "end";
    case "left":
      return "start";
    case "top":
      return frameFlips ? "end" : "start";
    case "bottom":
      return frameFlips ? "start" : "end";
  }
}

/**
 * Map a `LabelAlignment` (the label option's cross-axis token) to the
 * `AlignAnchor` used to align the label against its target's bbox.
 *
 * For a `top`/`bottom` edge the cross axis is x, which is direction-invariant
 * — the mapping is literal (`start` → left edge, `end` → right edge).
 *
 * For a `left`/`right` edge the cross axis is y, so — like {@link edgeAnchor}
 * — the mapping depends on `frameFlips`: per `LabelPosition`'s documented
 * semantics, `start` means "top" and `end` means "bottom"; which bbox anchor
 * ("start"/"end") that visual side is depends on whether this subtree
 * y-mirrors, exactly as `edgeAnchor` derives for the main axis.
 */
function crossAlignAnchor(
  edge: "top" | "bottom" | "left" | "right",
  align: "start" | "center" | "end",
  frameFlips: boolean
): AlignAnchor {
  if (align === "center") return "middle";
  const yCross = edge === "left" || edge === "right";
  const invert = yCross && frameFlips;
  if (!invert) return align === "start" ? "start" : "end";
  return align === "start" ? "end" : "start";
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
 * expected and acceptable). `frameFlips` is this wrap's own y-mirror
 * predicate (see `edgeAnchor`'s doc comment).
 */
function buildLabelConstraints(
  spec: LabelSpec,
  refRef: any,
  textRef: any,
  frameFlips: boolean
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
  const mainAnchor = edgeAnchor(edge, frameFlips);
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
    const anchor = crossAlignAnchor(edge, align, frameFlips);
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
      const crossAnchor = crossAlignAnchor(edge, align, frameFlips);
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

/** The `frameFlips` predicate, evaluated at the WRAP node — the node whose
 *  layer the label `Text`s actually live in. A label's `rotate` is authored
 *  as a literal screen-clockwise degrees value (Vega-Lite semantics),
 *  independent of whether that frame mirrors; `Text` re-negates its `rotate`
 *  prop when ITS OWN frame flips (`text.tsx`'s `flips ? -rotate : rotate`),
 *  so pre-negating with the SAME predicate cancels the render-time negation
 *  and lands back on the literal authored angle regardless of orientation.
 *  The same bit also feeds `edgeAnchor`/`crossAlignAnchor` (which visual side
 *  an authored "top" is). Mirrors `elaborateAxes`'s `frameFlips`
 *  (`elaborationsFor`, ~:722) and `bake.ts`'s `declaredYUp`. */
const frameFlipsAt = (
  node: GoFishNode,
  yUp: boolean,
  underCoord: boolean
): boolean =>
  yUp ||
  underCoord ||
  (node._underlyingSpace !== undefined &&
    isCONTINUOUS(node._underlyingSpace[1]));

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
  targets: GoFishNode[],
  frameFlips: boolean
): Promise<GoFishNode> {
  return wrapPreservingIdentity(node, async (content) => {
    content.name(CONTENT_NAME);

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
        const rotate =
          spec.rotate != null
            ? frameFlips
              ? -spec.rotate
              : spec.rotate
            : undefined;
        texts.push(
          Text({
            text,
            fontSize: spec.fontSize ?? 11,
            fontFamily: spec.fontFamily ?? LABEL_FONT_FAMILY,
            fontWeight: spec.fontWeight,
            fontStyle: spec.fontStyle,
            fill: spec.color ?? autoLabelColor(target, position),
            rotate,
          } as any).name(textName) as GoFishNode
        );
        pending.push({ refName, textName, spec });
      }
    }

    const built = (await (layer as any)([
      content,
      ...refs,
      ...texts,
    ])) as GoFishNode;

    built.constrain((g) => {
      const cs: any[] = [
        // Pin the content at its own origin first — constraints apply in
        // order and placement is first-write-wins, so every label constraint
        // below (which reads a target via its `ref()`) sees it already
        // placed and only moves the label `Text`.
        Constraint.position({ x: 0, y: 0, anchor: "baseline" }, [
          g[CONTENT_NAME],
        ]),
      ];
      for (const { refName, textName, spec } of pending) {
        cs.push(
          ...buildLabelConstraints(spec, g[refName], g[textName], frameFlips)
        );
      }
      return cs;
    });

    return built;
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
  node: GoFishNode,
  yUp: boolean,
  underCoord: boolean
): Promise<{ node: GoFishNode; changed: boolean }> {
  let changed = false;
  const childUnderCoord =
    underCoord || (node as { type?: string }).type === "coord";
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child instanceof GoFishNode) {
      const res = await elaborateLabelsWalk(child, yUp, childUnderCoord);
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

  const frameFlips = frameFlipsAt(node, yUp, underCoord);
  const root = await wrapWithLabelTexts(node, targets, frameFlips);

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
  node: GoFishNode,
  opts: { yUp?: boolean; underCoord?: boolean } = {}
): Promise<{ node: GoFishNode; changed: boolean }> {
  const yUp = opts.yUp ?? false;
  const underCoord = opts.underCoord ?? false;
  resolveLabelTargets(node);
  const res = await elaborateLabelsWalk(node, yUp, underCoord);
  let out = res.node;
  let changed = res.changed;
  if (out._labels && out._labels.length > 0) {
    const frameFlips = frameFlipsAt(out, yUp, underCoord);
    out = await wrapWithLabelTexts(out, [out], frameFlips);
    changed = true;
  }
  return { node: out, changed };
}
