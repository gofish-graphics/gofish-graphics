// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import type { GoFishNode } from "./_node";
import type { DistributeConstraint } from "./constraints/distribute";
import { axisIndex, axisName } from "./constraints/shared";
import type { Extent } from "./extent";
import { room } from "../util";
import * as Pwl from "./solver/pwl";
import { printLength } from "./length";

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
 * - `mixed-sizes`: a flexible size (a part of a chain with no size of its
 *   own, an `fr` size or gap: a share of the chain's room) sits in a scope
 *   that data sizes. It is drawn that many data units wide.
 * - `no-room`: an `fr` gap sits in a scope that nothing gives room (an
 *   axis the render gives no size), so it is 0.
 */
export type LayoutWarning = {
  kind: "fixed-overflow" | "ink-overflow" | "mixed-sizes" | "no-room";
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

/** Record `warning` (if any) on the render of `node`, once per message. */
export const warnLayout = (
  node: GoFishNode,
  warning: LayoutWarning | undefined
): void => {
  if (warning === undefined) return;
  const session = node.tryGetRenderSession();
  if (session === undefined) return;
  const list = (session.warnings ??= []);
  if (!list.some((w) => w.message === warning.message)) list.push(warning);
};

/** The prefix every layout warning is printed with. */
const LAYOUT_WARNING_PREFIX = "[gofish:layout]";

const px = (v: number) => `${Math.round(v * 10) / 10} px`;

/** The distribute of the spread or stack `node` is along `axis`, if it is
 *  one (a ring that seats its chrome with a distribute is not). */
export const chainOn = (
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
  const claim = node.resolveExtent()[axis];
  return room(claim === undefined ? 0 : Pwl.at(claim.width, 0));
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
 * `startPx` is the fixed pixels of the claim `start` fits to its slot.
 */
function culprit(
  start: GoFishNode,
  axis: 0 | 1,
  available: number,
  startPx: number
): { node: GoFishNode; available: number; px: number } {
  let node = start;
  let nodePx = startPx;
  for (;;) {
    if (chainOn(node, axis) !== undefined) break;
    if (node !== start && node.claimWalk?.ownSize(axis) !== undefined) break;
    const big = largestChild(node, axis);
    if (big === undefined) break;
    // Mostly one child's: more than half of the node's fixed pixels. A
    // node whose fixed pixels are spread over its children (a literal
    // position here, a fixed-size box there) holds them itself.
    const bigPx = fixedPx(big, axis);
    if (bigPx * 2 <= nodePx) break;
    available -= nodePx - bigPx;
    node = big;
    nodePx = bigPx;
  }
  return { node, available, px: nodePx };
}

/**
 * The fixed parts under `node` on `axis`, which come to `total` pixels: the
 * spacing of each spread along it and the size of each node with a size of
 * its own (parts of one description summed, with how many there are), and
 * the rest (text, literal sizes and positions, chrome). `ofContent` says
 * the pixels are those of the content `node` fits into its own size, not
 * its own claim, which for a node with a size of its own is that size.
 */
function fixedParts(
  node: GoFishNode,
  axis: 0 | 1,
  total: number,
  ofContent: boolean
): { part: string; px: number }[] {
  const spacing = new Map<string, { each: number; count: number }>();
  const add = (key: string, each: number) => {
    const cur = spacing.get(key) ?? { each, count: 0 };
    cur.count++;
    spacing.set(key, cur);
  };
  const visit = (n: GoFishNode) => {
    if (
      n.claimWalk?.ownSize(axis) !== undefined &&
      !(ofContent && n === node)
    ) {
      add(`${describeNode(n)}: its own size`, fixedPx(n, axis));
      return;
    }
    const chain = chainOn(n, axis);
    if (chain !== undefined && !chain.glue && chain.anchor === "edge") {
      const gaps = chain.children.length - 1;
      // A length spacing's fixed pixels are its gap at σ = 0.
      const each =
        typeof chain.spacing === "number"
          ? chain.spacing
          : chain.gap === undefined
            ? 0
            : Pwl.at(chain.gap, 0);
      const spelled =
        typeof chain.spacing === "number"
          ? `${chain.spacing}`
          : printLength(chain.spacing);
      if (each > 0 && gaps > 0)
        add(`${describeNode(n)}: spacing ${spelled} × ${gaps}`, each * gaps);
    }
    for (const c of composing(n, axis)) visit(c);
  };
  // A node with a size of its own holds that size, whatever is in it.
  if (!ofContent && node.claimWalk?.ownSize(axis) !== undefined)
    return [{ part: "its own size", px: total }];
  visit(node);
  const parts = [...spacing].map(([key, { each, count }]) => ({
    part: count > 1 ? `${key}, ×${count}` : key,
    px: each * count,
  }));
  const rest = total - parts.reduce((a, p) => a + p.px, 0);
  if (rest > 0.5)
    parts.push({
      part: "other fixed sizes (text, literal sizes and positions, chrome)",
      px: rest,
    });
  return parts.sort((a, b) => b.px - a.px);
}

/**
 * A `fixed-overflow` warning for `start`, which fits `claim` into the
 * `available` pixels of its slot on `axis` (`ScopeRegistry.fit`), or
 * undefined when the claim's fixed parts (its pixels at σ = 0) fit. The
 * claim is `start`'s own, or for a node with a size of its own, that of
 * the content it maps into that size. It names the node that holds the
 * fixed parts (see {@link culprit}).
 */
export function fixedOverflow(
  start: GoFishNode,
  axis: 0 | 1,
  claim: Extent,
  available: number
): LayoutWarning | undefined {
  if (!Number.isFinite(available)) return undefined;
  const needed = room(Pwl.at(claim.width, 0));
  if (needed <= available + 0.5) return undefined;
  const at = culprit(start, axis, available, needed);
  return fixedWarning(
    at.node,
    axis,
    at.px,
    at.available,
    fixedParts(at.node, axis, at.px, at.node === start)
  );
}

/** A `fixed-overflow` warning: `node`'s fixed `parts` need `needed` pixels
 *  on `axis`, more than the `available` pixels of its slot, so the parts
 *  that scale are drawn as if the fixed parts took no room. */
function fixedWarning(
  node: GoFishNode,
  axis: 0 | 1,
  needed: number,
  available: number,
  parts: { part: string; px: number }[]
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
      `. The parts that scale are drawn as if the fixed parts took no ` +
      `room, and the graphic overflows on ${name}.`,
  };
}

/**
 * A `mixed-sizes` warning for a flexible size along `axis` in a scope
 * that data sizes there (#1176 step 5): `part`, a part of a chain with no
 * size of its own or with an `fr` size, or, when `gap` names it, the
 * `fr` spacing of the chain `part` (#1176 step 6). A flexible size has no
 * data type, so it shares no scale with the data: it is a σ weight in the
 * scope, that many data units wide. It names the chain's parts that data
 * sizes, or the scope when none of them is.
 */
export function mixedSizes(
  part: GoFishNode,
  axis: 0 | 1,
  gap?: string
): LayoutWarning {
  const chain = gap === undefined ? part.parent! : part;
  const name = axisName(axis);
  const what = gap ?? describeNode(part);
  const own = part.lengthOn(axis);
  const flexible =
    gap !== undefined
      ? `${what} is flexible`
      : own !== undefined
        ? `${what} has the size ${printLength(own)}, which is flexible`
        : `${what} has no size of its own, so its size is flexible`;
  const data = chain.children.filter(
    (c): c is GoFishNode =>
      c !== part &&
      "carriesData" in c &&
      !(c as GoFishNode).isScope(axis) &&
      (c as GoFishNode).carriesData(axis)
  );
  const scope = chain.scopeOf(axis);
  const sized =
    data.length === 0
      ? `${describeNode(scope)} sizes its other parts by data`
      : `${[...new Set(data.map(describeNode))].join(", ")} ` +
        `${data.length === 1 ? "is" : "are"} sized by data`;
  return {
    kind: "mixed-sizes",
    node: describeNode(chain),
    axis: name,
    needed: 0,
    available: 0,
    parts: [],
    message:
      `${describeNode(chain)} on ${name} mixes data-driven and flexible ` +
      `sizes: ${flexible}, ` +
      `but ${sized}. A flexible size is like a data type with no name, so ` +
      `this is like sizing two parts along ${name} by two different data ` +
      `types: no one scale fits both. ${what} is drawn ${
        gap === undefined && own === undefined
          ? "one data unit"
          : "its weight in data units"
      } wide. ` +
      `Give it a size of its own, or put the data-driven parts in a ` +
      `container with a size of its own.`,
  };
}

/**
 * A `no-room` warning: the `fr` spacing `spelled` of the chain `chain`
 * sits in a scope of shares on an axis the render gives no size, so
 * nothing gives it room, and it is 0 (as in CSS and Typst).
 */
export function noRoom(
  chain: GoFishNode,
  axis: 0 | 1,
  spelled: string
): LayoutWarning {
  const name = axisName(axis);
  const what = describeNode(chain);
  return {
    kind: "no-room",
    node: what,
    axis: name,
    needed: 0,
    available: 0,
    parts: [],
    message:
      `${what}: \`spacing: ${spelled}\` has no room on ${name}, so its gaps ` +
      `are 0; give the chart a ${axis === 0 ? "w" : "h"}.`,
  };
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
