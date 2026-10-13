/**
 * IDENTITY across keyframes: which mark in one keyframe IS which mark in the
 * next, so a transition can move it instead of fading one out and another in.
 *
 * PROTOTYPE (animation grammar proposal). One rule for charts and hand-built
 * diagrams alike:
 *
 *   A node's identity is its PATH from the keyframe's root: the components of
 *   the nodes on the way down, where a node's component is its data key (the
 *   value of the field an operator split it by) or, when it has none, the
 *   name it was given with `.name(...)`. Nodes with neither add nothing.
 *   Leaves that share a path are told apart by their order in the tree.
 *
 * So a bar in `spread lake | stack species` and the same bar in `spread lake
 * | spread species` are both `Lake A/Bass`, whatever the two layouts do with
 * them; a diagram's `rect(...).name("A")` is `A` in every state it appears in;
 * and the circle and the label inside `layer([...]).name("A")` are `A#0` and
 * `A#1`. This is Figma Smart Animate's and Motion's `layoutId` rule (match by
 * name), with a chart's data key standing in for a name it never had to write.
 *
 * PROTOTYPE SHORTCUT: identities are read off the resolved tree, so chrome a
 * later pass adds (axes, legends) has none: it stays with its keyframe and
 * switches at the keyframe's band edge instead of moving.
 *
 * Names the library generates for itself (`__spread#31`) are not names a
 * person wrote, so they are not identities.
 */
import { GoFishNode } from "../ast/_node";
import { GoFishRef } from "../ast/_ref";

/** What one node adds to the path: its data key, else its own name. */
function componentOf(node: GoFishNode): string | undefined {
  if (node.key !== undefined && node.key !== null) return String(node.key);
  const name = node._name;
  if (typeof name === "string" && !name.startsWith("__")) return name;
  return undefined;
}

/** A RELATIONAL node draws between other nodes it only refers to (an arrow,
 *  a connector, a tween): its children are all refs. Its geometry is derived
 *  from its operands, so it has no identity of its own to interpolate. */
export const isRelational = (node: GoFishNode): boolean =>
  node.children.length > 0 &&
  node.children.every((child) => child instanceof GoFishRef);

export type Identities = {
  /** The leaves (nodes that draw and have no children), by identity. */
  leaves: Map<string, GoFishNode>;
  /** Every node that adds a component to the path, by its path. These are
   *  what a relational mark's operands are matched by. */
  named: Map<string, GoFishNode>;
  /** The relational nodes under the root, in tree order. */
  relational: GoFishNode[];
  /** The path of each node in `named`, the other way round. */
  pathOf: Map<GoFishNode, string>;
};

/** The identities of everything under `root` (see the header). */
export function identities(root: GoFishNode): Identities {
  const out: Identities = {
    leaves: new Map(),
    named: new Map(),
    relational: [],
    pathOf: new Map(),
  };
  const ordinals = new Map<string, number>();
  const walk = (node: GoFishNode, path: string): void => {
    if (isRelational(node)) {
      out.relational.push(node);
      return;
    }
    const component = node === root ? undefined : componentOf(node);
    const here =
      component === undefined
        ? path
        : path === ""
          ? component
          : `${path}/${component}`;
    if (component !== undefined && !out.named.has(here)) {
      out.named.set(here, node);
      out.pathOf.set(node, here);
    }
    const kids = node.children.filter(
      (c): c is GoFishNode => c instanceof GoFishNode
    );
    if (kids.length === 0 && node !== root) {
      const n = ordinals.get(here) ?? 0;
      ordinals.set(here, n + 1);
      const id = `${here}#${n}`;
      out.leaves.set(id, node);
      return;
    }
    for (const kid of kids) walk(kid, here);
  };
  walk(root, "");
  return out;
}
