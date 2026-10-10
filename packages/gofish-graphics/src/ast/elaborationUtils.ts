import { GoFishNode } from "./_node";
import { planSharing } from "./constraints/compose";
import { layer } from "./graphicalOperators/layer";
import { Constraint } from "./constraints";

/** Run `build` to wrap `node` in new structure, moving the node's identity
 * (_name/key) onto whatever `build` returns — so the parent (faceting/refs/
 * select) still resolves to this node. Its paint-time visibility rule moves
 * with it, so whatever the wrap adds beside the node (a label's `Text`, an
 * axis's ticks) shows and hides with it. Shared by the axis, legend and label
 * elaboration passes. */
export async function wrapPreservingIdentity(
  node: GoFishNode,
  build: (node: GoFishNode) => GoFishNode | Promise<GoFishNode>
): Promise<GoFishNode> {
  const origName = node._name;
  const origKey = node.key;
  const origVisible = node.__gfVisible;
  node._name = undefined;
  node.key = undefined;
  node.__gfVisible = undefined;
  const root = await build(node);
  if (origName !== undefined) root._name = origName;
  if (origKey !== undefined) root.setKey(origKey);
  if (origVisible !== undefined) root.__gfVisible = origVisible;
  return root;
}

/** One ring of chrome: its shapes, and the constraints that seat them past
 *  the box inside the ring (named `inner`), built from the ring's
 *  name→ref map. */
export type ChromeRing = {
  nodes: GoFishNode[];
  constraints: (g: Record<string, any>, inner: string) => any[];
};

/** Wrap `inner` in one ring: a `layer` of `inner` (named `name`) and the
 *  ring's shapes. `inner` is seated first (constraints apply in order and
 *  placement is first-write-wins, so the box the ring reads is placed before
 *  anything seats off it): at `seat`, by its baseline. A seat with neither
 *  axis given leaves `inner` to the layer. */
export async function wrapRing(
  inner: GoFishNode,
  name: string,
  ring: ChromeRing,
  seat: { x?: any; y?: any } = { x: 0, y: 0 }
): Promise<GoFishNode> {
  inner.name(name);
  const root = (await (layer as any)([inner, ...ring.nodes])) as GoFishNode;
  // A ring's content is the box it dresses, seated in the ring's own frame:
  // it is the ring's own set on both axes, so the ring reports the content's
  // type (the literal pixel seat would otherwise detach it), and the keyed
  // domains seat the ring where its content was (`KeyedDomains`, built
  // before chrome, #1114). The ring's shapes (an axis's ticks and line, a
  // legend, a title) are each a set of their own: none joins the content's
  // type, whatever constraint seats it. Ticks still sit at data positions in
  // the ring's frame, through their position constraints.
  root.INTERNAL_setSharing((childNodes, constraints) => {
    const plan = planSharing(constraints, childNodes);
    const sets = childNodes.map((c, k) => (c === inner ? 0 : k + 1));
    const i = childNodes.indexOf(inner);
    for (const axis of [0, 1] as const) plan.nested[axis].delete(i);
    return { ...plan, sets: [sets, [...sets]] };
  });
  await root.relate((g) => [
    ...(seat.x === undefined && seat.y === undefined
      ? []
      : [Constraint.position({ ...seat, anchor: "baseline" }, [g[name]])]),
    ...ring.constraints(g, name),
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
export const fmtNum = (n: number): string => String(+n.toPrecision(12));
