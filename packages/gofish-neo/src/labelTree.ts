/**
 * The shared label tree: one hierarchy of labels built from every label
 * string seen on either axis (actual and observed both walk the same tree),
 * with leaves assigned contiguous postorder ranges so that any
 * (rowNode, colNode) frequency is a rectangular block-sum over the dense
 * matrix.
 */

import { segments } from "./paths";

/** A node in the shared label tree. */
export interface TreeNode {
  /** Cumulative colon-joined id, e.g. "animal:walking:cat". Unique per node. */
  id: string;
  /** This node's own label segment (last segment of `id`, post-pruning may be joined). */
  name: string;
  parent: TreeNode | undefined;
  children: TreeNode[];
  /** Half-open leaf-index range `[start, end)` this node covers. */
  start: number;
  end: number;
}

/** True if `node` is a leaf (has no children) in the full, unpruned/uncollapsed sense. */
export function isLeaf(node: TreeNode): boolean {
  return node.children.length === 0;
}

interface MutableNode {
  id: string;
  name: string;
  parent: MutableNode | undefined;
  children: MutableNode[];
  start: number;
  end: number;
}

function makeNode(
  id: string,
  name: string,
  parent: MutableNode | undefined
): MutableNode {
  return { id, name, parent, children: [], start: -1, end: -1 };
}

/**
 * Builds the shared label tree from a list of label strings (e.g. every
 * resolved actual/observed path in the dataset). Each string is split on
 * `:` into a chain of segments; chains are trie-merged under a synthetic
 * root, matching children by cumulative id. Sibling order follows first
 * occurrence. Leaves get postorder-assigned half-open ranges starting at 0;
 * internal nodes' ranges are the union of their children's (first child's
 * start to last child's end) — this is what makes block-sum lookups valid.
 * Finally, degenerate single-leaf-child chains are pruned (see
 * {@link pruneDegenerateChains}).
 */
export function buildLabelTree(labels: string[]): TreeNode {
  const root: MutableNode = makeNode("", "", undefined);

  for (const label of labels) {
    const segs = segments(label);
    let cur = root;
    let id = "";
    for (const seg of segs) {
      id = id === "" ? seg : `${id}:${seg}`;
      let child = cur.children.find((c) => c.id === id);
      if (!child) {
        child = makeNode(id, seg, cur);
        cur.children.push(child);
      }
      cur = child;
    }
  }

  assignPostorderRanges(root);
  return prune(freeze(root));
}

function assignPostorderRanges(node: MutableNode): number {
  let counter = 0;
  function visit(n: MutableNode): void {
    if (n.children.length === 0) {
      n.start = counter;
      n.end = counter + 1;
      counter++;
      return;
    }
    for (const c of n.children) visit(c);
    n.start = n.children[0]!.start;
    n.end = n.children[n.children.length - 1]!.end;
  }
  visit(node);
  return counter;
}

function freeze(node: MutableNode): TreeNode {
  const out: TreeNode = {
    id: node.id,
    name: node.name,
    parent: undefined,
    children: [],
    start: node.start,
    end: node.end,
  };
  out.children = node.children.map((c) => {
    const child = freeze(c);
    child.parent = out;
    return child;
  });
  return out;
}

/**
 * Postorder-collapses any internal node with exactly one child, where that
 * child is a leaf, into a single node named `"parent:child"` (using the
 * dropped child's id as the surviving node's id, so downstream lookups by
 * leaf id remain valid). The synthetic root itself is never collapsed away.
 */
function pruneDegenerateChains(root: TreeNode): TreeNode {
  function visit(node: TreeNode): TreeNode {
    node.children = node.children.map(visit);
    if (
      node.parent !== undefined &&
      node.children.length === 1 &&
      isLeaf(node.children[0]!)
    ) {
      const onlyChild = node.children[0]!;
      const collapsed: TreeNode = {
        id: onlyChild.id,
        name: `${node.name}:${onlyChild.name}`,
        parent: node.parent,
        children: [],
        start: onlyChild.start,
        end: onlyChild.end,
      };
      return collapsed;
    }
    return node;
  }
  const newRoot = visit(root);
  // Re-parent children to point at (possibly replaced) parents.
  reparent(newRoot, undefined);
  return newRoot;
}

function reparent(node: TreeNode, parent: TreeNode | undefined): void {
  node.parent = parent;
  for (const c of node.children) reparent(c, node);
}

function prune(root: TreeNode): TreeNode {
  return pruneDegenerateChains(root);
}

/**
 * Walks the tree in preorder (node before children), calling `visit` on
 * each node. `descend(node)` decides whether to recurse into a node's
 * children; if it returns false, the node's subtree is not visited further
 * (but `visit` still fires for the node itself).
 */
export function preorder(
  root: TreeNode,
  visit: (node: TreeNode) => void,
  descend: (node: TreeNode) => boolean = () => true
): void {
  visit(root);
  if (descend(root)) {
    for (const c of root.children) preorder(c, visit, descend);
  }
}

/** Walks the tree in postorder (children before node). */
export function postorder(
  root: TreeNode,
  visit: (node: TreeNode) => void
): void {
  for (const c of root.children) postorder(c, visit);
  visit(root);
}

/**
 * Returns the *frontier* of leaves under `descend`'s control: a node whose
 * `descend` predicate returns false is reported as a leaf itself (even if it
 * has children in the full tree), and its subtree is not explored further.
 * True leaves (no children) are always reported. This is the mechanism
 * behind both plain leaf enumeration (`descend: () => true`) and collapse
 * (`descend: (n) => !collapsedIds.has(n.id)`).
 */
export function leaves(
  root: TreeNode,
  descend: (node: TreeNode) => boolean = () => true
): TreeNode[] {
  const out: TreeNode[] = [];
  function visit(node: TreeNode): void {
    if (isLeaf(node) || !descend(node)) {
      out.push(node);
      return;
    }
    for (const c of node.children) visit(c);
  }
  visit(root);
  return out;
}

/**
 * Computes the rendering frontier given a set of collapsed node ids: true
 * leaves plus any collapsed node, stopping descent at collapsed ids.
 * Collapse only changes which nodes are treated as frontier leaves for
 * rendering/aggregation purposes — it never changes the underlying tree or
 * data.
 */
export function frontier(
  root: TreeNode,
  collapsed: Iterable<string> = []
): TreeNode[] {
  const collapsedIds = new Set(collapsed);
  return leaves(root, (n) => !collapsedIds.has(n.id));
}

/** Finds a node by id via a simple tree walk, or undefined if absent. */
export function findNode(root: TreeNode, id: string): TreeNode | undefined {
  let found: TreeNode | undefined;
  preorder(root, (n) => {
    if (n.id === id) found = n;
  });
  return found;
}
