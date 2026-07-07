// gofish-gotree implements the GoTree grammar (Li et al., CHI 2020) on GoFish
// primitives. Paper: https://doi.org/10.1145/3313831.3376297 — source, editor,
// and gallery at https://github.com/BIT-VIS/gotree (https://bit-vis.github.io/gotree/).
// See README.md for the concept mapping and citation.
import { Layer, Frame, rect } from "gofish-graphics";
import type { GoTreeSpec, TreeData, NodeFactory } from "./spec";
import { normalize } from "./data";
import { renderSubtree } from "./recursion";
import { collectEdges } from "./links";

const DEFAULT_NODE: NodeFactory = () => rect({ w: 12, h: 12, fill: "#4682b4" });

export function tree(spec: GoTreeSpec, data: TreeData): any {
  const root = normalize(data);
  const filledSpec: GoTreeSpec = { node: DEFAULT_NODE, ...spec };

  const nodeTree = renderSubtree(root, filledSpec);
  const edges = collectEdges(root, filledSpec);

  // Layer order: nodeTree first so its named marks register before connects
  // try to resolve their refs (matches the sankey pattern); edges come after.
  // Paint order is also this, so edges draw on top of nodes — that's fine for
  // thin connector strokes passing through node bodies.
  const composed = Layer([nodeTree, ...edges]);

  if (filledSpec.coord !== undefined) {
    return Frame({ coord: filledSpec.coord as any }, [composed]);
  }
  return composed;
}
