import type { GoFishRef } from "../_ref";
import { ref } from "../shapes/ref";
import type { LayerContext } from "./markResult";

/**
 * Resolve a `GoFishRef` used as chart data against the layer registry, the
 * node-unit way: NO flattening of array data, NO datum spreading, NO `__ref`
 * on plain objects.
 *
 * Either way the result is a list of refs, as all data is a list:
 *
 * - A non-string selection (token / path-array / node-backed ref) is a direct
 *   reference: the list of that one ref (and `selectAll` over one is an
 *   error — it requires a string layer name).
 * - A string selection looks up the named layer, nearest scope first
 *   (`LayerContext.lookup`). `multiplicity === "all"`
 *   (from `selectAll`) yields a ref per matching node; the singular `ref`
 *   yields the list of the one matching ref, throwing if the layer matched
 *   zero or more than one node. Being singular is a check on how many nodes
 *   match, not a different data shape.
 */
export function resolveRefData(
  r: GoFishRef,
  layerContext: LayerContext
): GoFishRef[] {
  if (typeof r.selection !== "string") {
    if (r.multiplicity === "all") {
      throw new Error("selectAll requires a string layer name");
    }
    return [r];
  }

  const layer = layerContext.lookup(r.selection);
  if (!layer) {
    throw new Error(
      `Layer "${r.selection}" not found. Make sure to call .name("${r.selection}") on the mark first.`
    );
  }

  const refs = layer.nodes.map((node) => ref({ __ref: node }));

  if (r.multiplicity === "all") return refs;

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
