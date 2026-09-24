import { GoFishNode } from "./_node";
import { moveKeyframe } from "../timeWindow";

/** Run `build` to wrap `node` in new structure, moving the node's identity
 * (_name/key) onto whatever `build` returns — so the parent (faceting/refs/
 * select) still resolves to this node. Its paint-time visibility rule moves
 * with it, so whatever the wrap adds beside the node (a label's `Text`, an
 * axis's ticks) shows and hides with it, and so does its keyframe record, so
 * those additions are part of the same keyframe. Shared by the axis, legend
 * and label elaboration passes. */
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
  moveKeyframe(node, root);
  return root;
}

/** Stringify a tick value without floating-point noise (0.1 + 0.2 → "0.3").
 *  Shared by the axis and legend (colorbar) tick-label builders. */
export const fmtNum = (n: number): string => String(+n.toPrecision(12));
