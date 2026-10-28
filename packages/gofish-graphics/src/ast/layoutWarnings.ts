// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import type { GoFishNode } from "./_node";
import type { DistributeConstraint } from "./constraints/distribute";
import { axisIndex, axisName } from "./constraints/shared";
import { room } from "../util";

/**
 * A problem layout found and drew through anyway (#493): the render keeps
 * its size, the drawing overflows it, and this says why. Every warning is
 * printed once with the prefix {@link LAYOUT_WARNING_PREFIX} and is on the
 * `View` the render returns (`view.warnings`).
 *
 * - `fixed-overflow`: the fixed parts of a node (literal spacing, literal
 *   sizes and positions, text, chrome) need more pixels on an axis than the
 *   slot it is given. No σ fits, so the parts that scale are drawn as if
 *   the fixed parts took no room, and the drawing overflows.
 * - `ink-overflow`: what the graphic draws reaches past the canvas for
 *   another reason: a node the claim walk cannot place (ink), so it took
 *   no room.
 */
export type LayoutWarning = {
  kind: "fixed-overflow" | "ink-overflow";
  /** The node, as its operator or mark and key: `spread(by: "site")`. */
  node: string;
  axis: "x" | "y";
  /** Pixels needed and pixels available (fixed-overflow), or the drawing's
   *  length and the canvas's (ink-overflow). */
  needed: number;
  available: number;
  /** The fixed parts and their pixels, largest first (fixed-overflow). */
  parts: { part: string; px: number }[];
  /** How far the drawing reaches past the canvas before and after it on
   *  the axis (ink-overflow). */
  overflow?: [number, number];
  /** The whole warning as one line, as it is printed. */
  message: string;
};

/** The prefix every layout warning is printed with. */
const LAYOUT_WARNING_PREFIX = "[gofish:layout]";

const px = (v: number) => `${Math.round(v * 10) / 10} px`;

/** The distribute of the spread or stack `node` is along `axis`, if it is
 *  one (a ring that seats its chrome with a distribute is not). */
const chainOn = (
  node: GoFishNode,
  axis: 0 | 1
): DistributeConstraint | undefined =>
  node.axisDir !== axis
    ? undefined
    : node.constraints.find(
        (c): c is DistributeConstraint =>
          c.type === "distribute" && axisIndex(c.dir) === axis
      );

/** `node` as its operator or mark and key: `spread(by: "site")`,
 *  `stack(by: "species")`, `chart`, `rect(key: "Lake A")`. */
function describeNode(node: GoFishNode): string {
  if (node._chartBox !== undefined) return "chart";
  const chain =
    node.axisDir === undefined ? undefined : chainOn(node, node.axisDir);
  if (chain !== undefined)
    return `${chain.glue ? "stack" : "spread"}(${
      chain.measure !== undefined
        ? `by: "${chain.measure}"`
        : `dir: "${chain.dir}"`
    })`;
  return node.key !== undefined && node.key !== ""
    ? `${node.type}(key: "${node.key}")`
    : node.type;
}

/** The fixed pixels of `node`'s claim on `axis`: its claim at σ = 0. */
const fixedPx = (node: GoFishNode, axis: 0 | 1): number => {
  return room(node.resolveExtent()[axis]?.width.run(0) ?? 0);
};

/** The children whose claims compose into `node`'s on `axis`: not ink,
 *  not a stand-in. */
const composing = (node: GoFishNode, axis: 0 | 1): GoFishNode[] =>
  node.children.filter(
    (c, i): c is GoFishNode =>
      "resolveExtent" in c &&
      c.type !== "ref" &&
      !node.claimWalk?.ink[axis].has(i) &&
      (c as GoFishNode).resolveExtent()[axis] !== undefined
  );

/** The child of `node` whose claim on `axis` holds the most fixed pixels,
 *  or undefined when no child composes into its claim. */
const largestChild = (
  node: GoFishNode,
  axis: 0 | 1
): GoFishNode | undefined => {
  const kids = composing(node, axis);
  return kids.length === 0
    ? undefined
    : kids.reduce((a, b) => (fixedPx(b, axis) > fixedPx(a, axis) ? b : a));
};

/**
 * The node that holds the fixed parts below `start`, and its slot: down
 * from `start` through each node whose fixed pixels are mostly one child's
 * (a chart's rings, a label wrapper), taking off the pixels the node adds
 * around that child, to the first node that lays several parts out along
 * the axis (a spread), has a size of its own, or has no child that claims.
 */
function culprit(
  start: GoFishNode,
  axis: 0 | 1,
  available: number
): { node: GoFishNode; available: number } {
  let node = start;
  for (;;) {
    if (chainOn(node, axis) !== undefined) break;
    if (node !== start && node.claimWalk?.ownScope[axis] === true) break;
    const big = largestChild(node, axis);
    if (big === undefined) break;
    // Mostly one child's: more than half of the node's fixed pixels. A
    // node whose fixed pixels are spread over its children (a literal
    // position here, a fixed-size box there) holds them itself.
    if (fixedPx(big, axis) * 2 <= fixedPx(node, axis)) break;
    available -= fixedPx(node, axis) - fixedPx(big, axis);
    node = big;
  }
  return { node, available };
}

/**
 * The fixed parts under `node` on `axis`: the spacing of each spread along
 * it and the size of each node with a size of its own (parts of one
 * description summed, with how many there are), and the rest of its fixed
 * pixels (text, literal sizes and positions, chrome).
 */
function fixedParts(
  node: GoFishNode,
  axis: 0 | 1
): { part: string; px: number }[] {
  const spacing = new Map<string, { each: number; count: number }>();
  const add = (key: string, each: number) => {
    const cur = spacing.get(key) ?? { each, count: 0 };
    cur.count++;
    spacing.set(key, cur);
  };
  const visit = (n: GoFishNode) => {
    if (n.claimWalk?.ownScope[axis] === true) {
      add(`${describeNode(n)}: its own size`, fixedPx(n, axis));
      return;
    }
    const chain = chainOn(n, axis);
    if (chain !== undefined && !chain.glue && chain.anchor === "edge") {
      const gaps = chain.children.length - 1;
      if (chain.spacing > 0 && gaps > 0)
        add(
          `${describeNode(n)}: spacing ${chain.spacing} × ${gaps}`,
          chain.spacing * gaps
        );
    }
    for (const c of composing(n, axis)) visit(c);
  };
  // A node with a size of its own holds that size, whatever is in it.
  if (node.claimWalk?.ownScope[axis] === true)
    return [{ part: "its own size", px: fixedPx(node, axis) }];
  visit(node);
  const parts = [...spacing].map(([key, { each, count }]) => ({
    part: count > 1 ? `${key}, ×${count}` : key,
    px: each * count,
  }));
  const rest = fixedPx(node, axis) - parts.reduce((a, p) => a + p.px, 0);
  if (rest > 0.5)
    parts.push({
      part: "other fixed sizes (text, literal sizes and positions, chrome)",
      px: rest,
    });
  return parts.sort((a, b) => b.px - a.px);
}

/**
 * A `fixed-overflow` warning for `start`, whose fixed parts on `axis` need
 * more than the `available` pixels it is given, or undefined when they fit.
 * It names the node that holds the fixed parts (see {@link culprit}).
 */
export function fixedOverflow(
  start: GoFishNode,
  axis: 0 | 1,
  available: number
): LayoutWarning | undefined {
  if (!Number.isFinite(available)) return undefined;
  if (fixedPx(start, axis) <= available + 0.5) return undefined;
  const at = culprit(start, axis, available);
  return fixedWarning(
    at.node,
    axis,
    fixedPx(at.node, axis),
    at.available,
    fixedParts(at.node, axis),
    "The parts that scale are drawn as if the fixed parts took no room"
  );
}

/** A `fixed-overflow` warning: `node`'s fixed `parts` need `needed` pixels
 *  on `axis`, more than the `available` pixels of its slot, and its parts
 *  are drawn as `drawn` says. */
function fixedWarning(
  node: GoFishNode,
  axis: 0 | 1,
  needed: number,
  available: number,
  parts: { part: string; px: number }[],
  drawn: string
): LayoutWarning {
  const what = describeNode(node);
  const name = axisName(axis);
  return {
    kind: "fixed-overflow",
    node: what,
    axis: name,
    needed,
    available,
    parts,
    message:
      `${what} on ${name}: its fixed parts need ${px(needed)}, but its slot ` +
      `has ${px(Math.max(0, available))}. Fixed parts: ` +
      parts.map((p) => `${p.part} = ${px(p.px)}`).join("; ") +
      `. ${drawn}, and the graphic overflows on ${name}.`,
  };
}

/** {@link fixedOverflow} for the content of `node`, a node with a size of
 *  its own (`available` pixels) on `axis`: its child whose claim holds the
 *  most fixed pixels. */
export function fixedOverflowInside(
  node: GoFishNode,
  axis: 0 | 1,
  available: number
): LayoutWarning | undefined {
  const big = largestChild(node, axis);
  return big === undefined ? undefined : fixedOverflow(big, axis, available);
}

/** A `fixed-overflow` warning for the spread `node`, whose spacing alone
 *  needs more than the `available` pixels it is given along `axis` (its
 *  parts have no size of their own, so they claim nothing; see
 *  `GoFishNode.sharesRoom`), or undefined when it fits. */
export function spacingOverflow(
  node: GoFishNode,
  axis: 0 | 1,
  available: number
): LayoutWarning | undefined {
  const chain = chainOn(node, axis);
  if (chain === undefined || !Number.isFinite(available)) return undefined;
  const gaps = chain.children.length - 1;
  const needed = chain.spacing * gaps;
  if (needed <= available + 0.5) return undefined;
  return fixedWarning(
    node,
    axis,
    needed,
    available,
    [{ part: `spacing ${chain.spacing} × ${gaps}`, px: needed }],
    "Its parts are drawn as if the spacing took no room"
  );
}

/** An `ink-overflow` warning: what the graphic draws spans `[lo, hi]` on
 *  `axis`, past a canvas of `size` pixels, reaching farthest at `node`. */
export function inkOverflow(
  axis: 0 | 1,
  [lo, hi]: [number, number],
  size: number,
  node: GoFishNode | undefined
): LayoutWarning | undefined {
  const before = Math.max(0, -lo);
  const after = Math.max(0, hi - size);
  if (before <= 0.5 && after <= 0.5) return undefined;
  const name = axisName(axis);
  const what = node === undefined ? "graphic" : describeNode(node);
  const message =
    `the graphic draws past the canvas on ${name}: ${px(before)} before ` +
    `it, ${px(after)} after it. ` +
    (node === undefined
      ? `Its own box reaches there, not a part the claim walk left out: ` +
        `layout drew it larger than its claim, or away from it.`
      : `The farthest is ${what}, which the claim walk could not place ` +
        `(ink), so it took no room.`);
  return {
    kind: "ink-overflow",
    node: what,
    axis: name,
    needed: hi - lo,
    available: size,
    parts: [],
    overflow: [before, after],
    message,
  };
}

/** Print each warning. A render's warnings are already one per problem
 *  (`warnLayout`); a chart that renders again passes the messages it has
 *  `printed`, so it prints each problem once. */
export function reportLayoutWarnings(
  warnings: readonly LayoutWarning[],
  printed?: Set<string>
): void {
  for (const w of warnings) {
    if (printed?.has(w.message)) continue;
    printed?.add(w.message);
    if (typeof console !== "undefined")
      console.warn(`${LAYOUT_WARNING_PREFIX} ${w.message}`);
  }
}
