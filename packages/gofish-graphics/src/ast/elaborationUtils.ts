import { GoFishNode } from "./_node";
import type { LayerSharingPlan } from "./constraints/compose";
import { round12 } from "./cells";
import { layer } from "./graphicalOperators/layer";
import { Constraint } from "./constraints";
import { SlotOperand, type ConstraintRef } from "./constraints/shared";
import type { GoFishAST } from "./_ast";

/** Run `build` to wrap `node` in new structure, moving the node's data key
 * onto whatever `build` returns, so the parent (faceting, keyed positions)
 * still finds the node's place by its key. The node keeps its name: the
 * wrapper is hygienic (see `wrapRing`), so a name lookup goes through it to
 * the node. Its paint-time visibility rule moves
 * with it, so whatever the wrap adds beside the node (a label's `Text`, an
 * axis's ticks) shows and hides with it. Its `.zOrder()` moves with it too:
 * the hint orders the node among its siblings, which are now the wrapper's,
 * and left on the node it would instead reorder the node against the
 * chrome beside it (a label would paint under its mark, and before it). Shared
 * by the axis, legend and label elaboration passes. */
export async function wrapPreservingIdentity(
  node: GoFishNode,
  build: (node: GoFishNode) => GoFishNode | Promise<GoFishNode>
): Promise<GoFishNode> {
  const origKey = node.key;
  const origVisible = node.__gfVisible;
  const origZOrder = node._zOrder;
  node.key = undefined;
  node.__gfVisible = undefined;
  node._zOrder = undefined;
  const root = await build(node);
  if (origKey !== undefined) root.setKey(origKey);
  if (origVisible !== undefined) root.__gfVisible = origVisible;
  if (origZOrder !== undefined) root._zOrder = origZOrder;
  return root;
}

/** Builds a ring's constraints from handles: `at(node)` is the handle on
 *  one of the ring's shapes, and `inner` the handle on the box inside the
 *  ring. Handles name no one, so chrome never looks a name up. */
export type RingConstraints = (
  at: (node: GoFishAST) => ConstraintRef,
  inner: ConstraintRef
) => any[];

/** One ring of chrome: its shapes, and the constraints that seat them past
 *  the box inside the ring. */
export type ChromeRing = {
  nodes: GoFishNode[];
  constraints: RingConstraints;
};

/** Wrap `inner` in one ring: a `layer` of `inner` and the ring's shapes,
 *  each referred to by its slot. The ring is hygienic (`_transparent`): it
 *  takes no name and adds no depth to a name lookup, and `inner`, its slot
 *  0, keeps its own, so `ref("bar")` on a dressed bar means the bar alone.
 *  `inner` is seated first
 *  (constraints apply in order and
 *  placement is first-write-wins, so the box the ring reads is placed before
 *  anything seats off it): at `seat`, by its baseline. A seat with neither
 *  axis given leaves `inner` to the layer. */
export async function wrapRing(
  inner: GoFishNode,
  ring: ChromeRing,
  seat: { x?: any; y?: any } = { x: 0, y: 0 }
): Promise<GoFishNode> {
  const root = (await (layer as any)([inner, ...ring.nodes])) as GoFishNode;
  root._transparent = true;
  // A ring's content is the box it dresses, seated in the ring's own frame:
  // it is the ring's own set on both axes, so the ring reports the content's
  // type (the literal pixel seat would otherwise detach it), and the keyed
  // domains seat the ring where its content was (`KeyedDomains`, built
  // before chrome, #1114). The ring's shapes (an axis's ticks and line, a
  // legend, a title) are each a set of their own: none joins the content's
  // type, whatever constraint seats it. Ticks still sit at data positions in
  // the ring's frame, through their position constraints. The rule reads no
  // constraint: whatever seats the content (a literal pin, or a delta axis's
  // datum `contentAt`), the content is neither nested nor datum-placed. The
  // content is the ring's first child, by construction, and the rule reads
  // it by that slot, not by identity: a later pass (label elaboration) may
  // wrap the content and put its wrapper in the content's place.
  root.INTERNAL_setSharing((childNodes): LayerSharingPlan => {
    const sets = childNodes.map((_, k) => (k === 0 ? 0 : k + 1));
    const none = (): [Set<number>, Set<number>] => [new Set(), new Set()];
    return { sets: [sets, [...sets]], nested: none(), datumPlaced: none() };
  });
  // Every handle is a slot: the content is slot 0, and each of the ring's
  // shapes is the slot of the child `layer` made of it. A shape may be
  // handed in as the promise its builder returned, which the layer awaits:
  // awaiting it again gives the same node, so each entry is matched to its
  // child by identity, and a shape the layer did not keep is an error, not
  // a shifted slot.
  const slots = new Map<unknown, number>();
  for (const entry of ring.nodes) {
    const node = await entry;
    const k = root.indexOfChild(node);
    if (k === undefined || k === 0)
      throw new Error(
        "[gofish] wrapRing: a shape of the ring is not a child of its layer"
      );
    slots.set(entry, k);
    slots.set(node, k);
  }
  const at = (node: GoFishAST): SlotOperand => {
    const k = slots.get(node);
    if (k === undefined)
      throw new Error("[gofish] wrapRing: the node is not one of the ring's");
    return new SlotOperand(root, k);
  };
  const content = new SlotOperand(root, 0);
  await root.INTERNAL_relate([
    ...(seat.x === undefined && seat.y === undefined
      ? []
      : [Constraint.position({ ...seat, anchor: "baseline" }, [content])]),
    ...ring.constraints(at, content),
  ]);
  return root;
}

/** `root` and the nodes below it, breadth first: every node at one depth
 *  before any deeper one. */
export function* breadthFirst(root: GoFishNode): Generator<GoFishNode> {
  const queue: GoFishNode[] = [root];
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    yield n;
    for (const c of n.children) if (c instanceof GoFishNode) queue.push(c);
  }
}

/** Stringify a tick value without floating-point noise (0.1 + 0.2 → "0.3").
 *  Shared by the axis and legend (colorbar) tick-label builders. It ignores
 *  the runtime's locale (no digit grouping, a period as the decimal point),
 *  as time labels use en-US (`LABEL_LOCALE` in calendar.ts); a chart-level
 *  locale option is #1098. */
export const fmtNum = (n: number): string => String(round12(n));
