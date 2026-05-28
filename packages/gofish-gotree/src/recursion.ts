import type { HierarchyNode } from "d3-hierarchy";
import type { Combiner, GoTreeSpec } from "./spec";
import { distribute } from "./helpers";
import { nodePath, toDatum } from "./data";

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
  const sibling = spec.sibling ?? DEFAULT_SIBLING;
  const childGroup = sibling(kids);

  const parentChild = spec.parentChild ?? DEFAULT_PARENT_CHILD;
  return parentChild([nodeMark, childGroup]);
}
