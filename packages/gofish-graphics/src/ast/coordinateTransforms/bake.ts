// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Flattening the Scenegraph — /internals/layout/coord-flattening
// </gofish-wiki>

import type { GoFishAST } from "../_ast";
import type { DisplayObject } from "../_displayObject";

/** The node's parent-frame translate as the bake should compose it, via the
 *  polymorphic `projectedTranslate`: a `GoFishNode` reports the LEDGER projection
 *  (so the bake stays correct once a mutator records a position in the ledger but
 *  stops writing `transform.translate`, stage 3); a `GoFishRef` has no ledger and
 *  reports its computed transform. Inert today (projection == written field). */
const bakeTranslate = (node: GoFishAST): [number, number] => [
  node.projectedTranslate(0) ?? 0,
  node.projectedTranslate(1) ?? 0,
];

/* takes in a GoFishNode and bakes it into a flat list of DisplayObjects (the
   rendering IR; see `../_displayObject.ts`)
- layout: during layout, they flatten their child hierarchy completely, so it's easy to transform them (and
  also because coord doesn't care about graphical operators, only positions)
- rendering: then, during rendering, each mark applies its coordinate transform context. its behavior is
  influenced by its mark embedding "mode"
- DisplayObjects don't have children (inspired by tldraw a bit). also makes stuff like z-indexing
  easier later...
- TODO: a DisplayObject still references its source GoFishAST as the renderer; the end-state
  is self-contained primitives with no `node` back-reference.
*/

export const flattenLayout = (
  node: GoFishAST,
  transform: [number, number] = [0, 0],
  scale: [number, number] = [1, 1]
): DisplayObject[] => {
  // recursive function
  // as we go down the tree we accumulate transforms
  // we apply the cumulative transform to all nodes we hit and remove their children
  //   this includes operators and marks
  // we EMIT the baked absolute transform on each DisplayObject rather than
  // MUTATING node.transform — render reads it via INTERNAL_render's transform
  // override, so the scenegraph's parent-relative transforms stay intact.

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
    const [ownTx, ownTy] = bakeTranslate(node);
    return [
      {
        node,
        transform: {
          translate: [ownTx + transform[0]!, ownTy + transform[1]!],
          scale: [
            (node.transform?.scale?.[0] ?? 1) * (scale[0] ?? 1),
            (node.transform?.scale?.[1] ?? 1) * (scale[1] ?? 1),
          ],
        },
      },
    ];
  }

  const [ownTx, ownTy] = bakeTranslate(node);
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
