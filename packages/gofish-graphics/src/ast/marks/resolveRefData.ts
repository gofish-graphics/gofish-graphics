import type { GoFishRef } from "../_ref";
import { isToken } from "../createName";
import { ref } from "../shapes/ref";
import { layerKey, type LayerContext } from "./markResult";

/**
 * Resolve a `GoFishRef` used as chart data against the layer registry, the
 * node-unit way: NO flattening of array data, NO datum spreading, NO `__ref`
 * on plain objects.
 *
 * Either way the result is a list of refs, as all data is a list:
 *
 * - `selectAll` over a string or a `createName` token looks up the named
 *   layer, nearest scope first (`LayerContext.lookup`), and yields a ref per
 *   matching node.
 * - The singular `ref` over a string looks the layer up the same way and
 *   yields the list of the one matching ref, throwing if the layer matched
 *   zero or more than one node. Being singular is a check on how many nodes
 *   match, not a different data shape.
 * - Any other singular selection (a token, a path, a node) is a direct
 *   reference, resolved in the tree like every inline ref: the list of that
 *   one ref. A token there that names several nodes errors when it is
 *   resolved ("matched N nodes").
 */
export function resolveRefData(
  r: GoFishRef,
  layerContext: LayerContext
): GoFishRef[] {
  const sel = r.selection;
  const plural = r.multiplicity === "all";
  if (typeof sel !== "string" && !(plural && isToken(sel))) {
    if (plural) {
      throw new Error(
        "selectAll requires a layer name: a string or a createName token"
      );
    }
    return [r];
  }

  const shown = typeof sel === "string" ? sel : `createName("${sel.__tag}")`;
  const layer = layerContext.lookup(layerKey(sel)!);
  if (!layer) {
    throw new Error(
      `Layer ${typeof sel === "string" ? `"${sel}"` : shown} not found. Make sure to call .name(...) with it on the mark first.`
    );
  }

  const refs = layer.nodes.map((node) => ref({ __ref: node }));

  if (plural) return refs;

  // Singular: exactly one node expected.
  if (refs.length === 0) {
    throw new Error(`ref("${r.selection}") matched no nodes.`);
  }
  if (refs.length > 1) {
    throw new Error(
      `ref("${r.selection}") matched ${refs.length} nodes; use selectAll("${r.selection}").`
    );
  }
  return refs;
}
