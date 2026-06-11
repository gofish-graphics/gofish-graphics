import { GoFishNode } from "./_node";

/** Run `build` to wrap `node` in new structure, moving the node's identity
 * (_name/key) onto whatever `build` returns — so the parent (faceting/refs/
 * select) still resolves to this node. Shared by the axis and legend
 * elaboration passes. */
export async function wrapPreservingIdentity(
  node: GoFishNode,
  build: (node: GoFishNode) => GoFishNode | Promise<GoFishNode>
): Promise<GoFishNode> {
  const origName = node._name;
  const origKey = node.key;
  node._name = undefined;
  node.key = undefined;
  const root = await build(node);
  if (origName !== undefined) root._name = origName;
  if (origKey !== undefined) root.setKey(origKey);
  return root;
}
