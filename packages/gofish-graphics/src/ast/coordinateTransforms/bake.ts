// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import type { GoFishAST } from "../_ast";
import { displayTranslate } from "../dims";

/* takes in a GoFishNode and converts it to some set of DisplayObjects
- layout: during layout, they flatten their child hierarchy completely, so it's easy to transform them (and
  also because coord doesn't care about graphical operators, only positions)
- rendering: then, during rendering, each mark applies its coordinate transform context. its behavior is
  influenced by its mark embedding "mode"
- DisplayObjects don't have children (inspired by tldraw a bit). also makes stuff like z-indexing
  easier later...
- TODO: we can actually mix DisplayObjects with GoFishNodes and Refs, which wil require some
  additional thought...

  For now we'll just assume that it's a GoFishNode tho... maybe it's a GoFishNode that contains DisplayObjects
  inside it?
*/

/* TODO: implement this. I don't actually need it until I have more complex examples tho */
export const flattenLayout = (
  node: GoFishAST,
  transform: [number, number] = [0, 0],
  scale: [number, number] = [1, 1]
): GoFishAST[] => {
  // recursive function
  // as we go down the tree we accumulate transforms
  // we apply the cumulative transform to all nodes we hit and remove their children
  //   this includes operators and marks
  // for now we return GoFishNodes, but we could return DisplayObjects
  // DisplayObjects are probably more principled b/c of how rendering them works... idk yet

  /* TODO: `connect` is a hack to get the operator to render in coordinate spaces
       A more principled way to do this would be to have "connect" produce a child path mark.
  */
  if (
    !("children" in node) ||
    !node.children ||
    node.children.length === 0 ||
    node.type === "connect" ||
    node.type === "box"
  ) {
    const [ownTx, ownTy] = displayTranslate(node.transform);
    node.transform = {
      translate: [ownTx + transform[0]!, ownTy + transform[1]!],
      scale: [
        (node.transform?.scale?.[0] ?? 1) * (scale[0] ?? 1),
        (node.transform?.scale?.[1] ?? 1) * (scale[1] ?? 1),
      ],
    };
    return [node];
  }

  const [ownTx, ownTy] = displayTranslate(node.transform);
  const newTransform: [number, number] = [
    transform[0]! + ownTx,
    transform[1]! + ownTy,
  ];

  const newScale: [number, number] = [
    (node.transform?.scale?.[0] ?? 1) * (scale[0] ?? 1),
    (node.transform?.scale?.[1] ?? 1) * (scale[1] ?? 1),
  ];

  return node.children.flatMap((child) =>
    flattenLayout(child, newTransform, newScale)
  );
};
