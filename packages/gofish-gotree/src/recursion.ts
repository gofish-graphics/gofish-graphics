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
// Free space is now y-DOWN (issue #143/#16), so the default `order: "forward"`
// puts the parent at LOW y = TOP of screen (root-at-top cartesian trees) with no
// orientation hack. Polar/radial stories override (or run under a `coord` scope,
// which stays y-up).
const DEFAULT_PARENT_CHILD: Combiner = distribute({
  dir: "y",
  spacing: 32,
  alignment: "middle",
  order: "forward",
});
const DEFAULT_SIBLING: Combiner = distribute({
  dir: "x",
  spacing: 16,
  alignment: "start",
});

// The growth axis of the parent↔child relationship at a given depth — i.e. the
// direction along which a parent and its children separate. Links read it to
// bend/curve along the tree's actual growth direction (a vertical tree's
// orthogonal elbow bends on y, a horizontal one on x). Undefined when the
// combiner doesn't declare a single axis (a diagonal cascade, or a user-
// supplied plain function), in which case links fall back to geometry.
export const growthDirAtDepth = (
  spec: GoTreeSpec,
  depth: number
): "x" | "y" | undefined =>
  resolve(spec.parentChild ?? DEFAULT_PARENT_CHILD, depth).growthDir;

const nameMark = (mark: any, pathName: string) => {
  if (mark && typeof mark.name === "function") return mark.name(pathName);
  return mark;
};

export function renderSubtree(node: HierarchyNode<any>, spec: GoTreeSpec): any {
  const datum = toDatum(node);
  const pathName = nodePath(node);
  const nodeMark = nameMark(spec.node!(datum, pathName), pathName);

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
