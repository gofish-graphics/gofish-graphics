import type { HierarchyNode } from "d3-hierarchy";
import type { Combiner, CombinerSpec, GoTreeSpec } from "./spec";
import { distribute } from "./helpers";
import { nodePath, toDatum } from "./data";

// Resolve a CombinerSpec to a concrete Combiner for this depth. A plain combiner
// is a function; a depth-indexed one is a branded { atDepth } object.
const resolve = (c: CombinerSpec, depth: number): Combiner =>
  typeof c === "function" ? c : c.atDepth(depth);

// Default combiners use `distribute` constraints (one axis each) rather
// than the coupled `spread` operator, mirroring the in-example convention.
// `order: "reverse"` puts parent at HIGH y (top of screen in y-up) for the
// cartesian default — polar/radial stories override with `order: "forward"`
// or pass a custom combiner.
const DEFAULT_PARENT_CHILD: Combiner = distribute({
  dir: "y",
  spacing: 32,
  alignment: "middle",
  order: "reverse",
});
const DEFAULT_SIBLING: Combiner = distribute({
  dir: "x",
  spacing: 16,
  alignment: "start",
});

const nameMark = (mark: any, pathName: string) => {
  if (mark && typeof mark.name === "function") return mark.name(pathName);
  return mark;
};

export function renderSubtree(node: HierarchyNode<any>, spec: GoTreeSpec): any {
  const datum = toDatum(node);
  const pathName = nodePath(node);
  const nodeMark = nameMark(spec.node!(datum), pathName);

  if (!node.children?.length) return nodeMark;

  const kids = node.children.map((c) => renderSubtree(c, spec));
  // Resolve both combiners at this node's depth, so a level's parentChild and
  // its children's sibling grouping alternate in sync (see `alternate`/`perDepth`).
  const sibling = resolve(spec.sibling ?? DEFAULT_SIBLING, node.depth);
  const childGroup = sibling(kids);

  const parentChild = resolve(
    spec.parentChild ?? DEFAULT_PARENT_CHILD,
    node.depth
  );
  return parentChild([nodeMark, childGroup]);
}
