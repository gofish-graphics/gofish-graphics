// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki The Mark Factory — /internals/frontend/mark-factory
// </gofish-wiki>

/**
 * The default paint order of relational marks (`line`, `ribbon`, `enclose`,
 * built by `createRelationalMark`): a connector paints under the nodes it
 * reads. `layer` installs it for its children, and `GoFishNode.relate` for
 * its drawing clauses, through the one pass below.
 */
import { GoFishNode } from "../_node";
import type { GoFishAST } from "../_ast";
import { GoFishRef, findPathToRoot } from "../_ref";
import { Constraint, type ConstraintSpec } from "./index";
import { NodeOperand, type ConstraintRef } from "./shared";

/** Find every relational-mark connector node (tagged `__relationalOperands`
 *  by `createRelationalMark`, chart.ts) anywhere in `node`'s subtree that
 *  hasn't already been claimed by an inner enclosing layer. Bounded to
 *  `GoFishNode`s (a ref carries no children of its own). */
function findUnclaimedConnectors(node: GoFishAST, out: GoFishNode[]): void {
  if (!(node instanceof GoFishNode)) return;
  if ((node as any).__relationalOperands) out.push(node);
  for (const child of node.children ?? []) {
    findUnclaimedConnectors(child, out);
  }
}

/** The node identity of a `GoFishAST` (a ref's target, or the node itself). */
export function targetOf(n: GoFishAST): GoFishNode | undefined {
  return n instanceof GoFishRef ? n.targetNode : (n as GoFishNode);
}

/**
 * Install the default `zBelow(connector, operand)` paint-order constraint for
 * every relational-mark connector (`line`, `ribbon`, …) found anywhere in
 * `children`'s subtrees, against whichever of `children` contains the node(s)
 * it references — in EVERY call form (bag, pairwise, `by`-split, and the
 * low-level explicit-children form), since all of them route through the same
 * `createRelationalMark` tagging (chart.ts). No dispatch on mark kind here:
 * any node carrying the tag participates.
 *
 * A connector whose author already set an explicit `.zOrder(...)` (including
 * `.zOrder(0)` — the unset state is `undefined`, so any explicit call counts
 * as an author decision) or `.relate(...)` (a non-empty constraints array)
 * is left alone — the explicit choice wins over the default.
 *
 * An operand is a node or a ref that holds one (a `.relate()` operand's
 * ref holds the node its name was bound to), claimed by the layer whose
 * children hold it. A ref the author wrote by name has no node before the
 * round: the constraint holds the ref, and paint order reads its target.
 *
 * A connector whose referenced node lies outside `children`'s subtrees (e.g.
 * both live several `.layer()` tiers up) is left tagged so an OUTER `layer()`
 * call gets a chance to resolve it — the tag is only cleared once consumed.
 *
 * The defaults are appended to `node.constraints` and returned. `layer`
 * keeps the ones it installs for its children as `node._paintDefaults`, so a
 * later `.relate()` on that layer, which replaces the author's constraints
 * with its own, keeps them: it rebuilds `constraints` as the layer's defaults
 * plus its clauses' constraints, then runs this pass over its drawing
 * clauses. A connector's own `.zOrder(...)` or `.relate(...)` still wins.
 */
export function applyRelationalZBelowDefaults(
  node: GoFishNode,
  children: GoFishAST[]
): ConstraintSpec[] {
  const connectors: GoFishNode[] = [];
  for (const child of children) findUnclaimedConnectors(child, connectors);
  if (connectors.length === 0) return [];

  const pairs: [GoFishNode, ConstraintRef][] = [];
  for (const connector of connectors) {
    const operands: GoFishAST[] | undefined = (connector as any)
      .__relationalOperands;
    if (!operands) continue;
    // Explicit author override (zOrder hint or their own constraints) wins.
    if (
      connector.getZOrder() !== undefined ||
      connector.constraints.length > 0
    ) {
      delete (connector as any).__relationalOperands;
      continue;
    }
    let claimedAny = false;
    for (const operand of operands) {
      // A ref the author wrote by name inside a clause (`ref("a")`) has no
      // node until the round resolves it: the constraint holds the ref, and
      // paint order reads its target then. Every other operand is a node or
      // a ref that holds one (a handle, as a `.relate()` operand's ref is).
      // A token ref has no node before the round either, and is left
      // unclaimed, as it always was.
      if (
        operand instanceof GoFishRef &&
        operand.handle === undefined &&
        typeof operand.selection === "string"
      ) {
        pairs.push([connector, new NodeOperand(operand)]);
        claimedAny = true;
        continue;
      }
      const target =
        operand instanceof GoFishRef ? operand.handle : (operand as GoFishNode);
      if (target === undefined) continue;
      // Only claim an operand that lives within this layer's children
      // (found via an ancestor walk), other than the connector's own:
      // otherwise leave the tag for an outer `layer()` call to resolve. The
      // constraint holds the operand itself (a handle): paint order lifts
      // it to whichever child holds it, or pushes it down when the
      // connector shares that child.
      const path = findPathToRoot(target);
      const withinScope = node.children.some(
        (c) => c !== connector && path.includes(c as GoFishAST)
      );
      if (!withinScope) continue;
      // An operand that is itself a plain layer (a `layer([...])` mark, a
      // `time.history`) is that whole layer, so the connector goes under
      // everything it paints.
      pairs.push([connector, new NodeOperand(target)]);
      claimedAny = true;
    }
    // Consumed (fully or partially) at this level — don't let an outer layer
    // re-process it. An operand this level couldn't place (e.g. it lives
    // further up the tree) is simply not constrained; that's a rarer shape
    // than the sibling-tier case this covers.
    if (claimedAny) delete (connector as any).__relationalOperands;
  }
  if (pairs.length === 0) return [];
  const zBelowConstraints = pairs.map(([a, b]) =>
    Constraint.zBelow(new NodeOperand(a), b)
  );
  node.constraints = [...node.constraints, ...zBelowConstraints];
  return zBelowConstraints;
}
