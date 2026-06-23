/**
 * Embedding resolution (Track 2, Route B): the `resolveEmbedding` pass authors
 * each dim's `embedded` flag — the flag a shape's render switches on to draw a
 * mark as point (0 embedded axes) / line (1) / area (2). These pin the converged
 * two-route model's *intrinsic, measure-gated* route:
 *
 *   A dim's own size becomes a coordinate-space extent (so a coord warps it) iff
 *   its size is a data value AND — inside a coordinate space — its size's measure
 *   matches the dim's position measure. A size in a measure FOREIGN to where the
 *   mark sits (a scatter bubble's area ≠ its position units) stays ink: a flat
 *   point at the mapped center.
 *
 * The discriminator depends on #534 (the size now carries the source measure).
 * Run via `tsx`. Builds real nodes via the factories and runs the same passes
 * `gofish()` runs (resolveAliases → resolveUnderlyingSpace → resolveEmbedding),
 * then reads `args.dims[dir].embedded` — the value render consumes.
 */
import { coord } from "../ast/coordinateTransforms/coord";
import { polar } from "../ast/coordinateTransforms/polar";
import { Rect } from "../ast/shapes/rect";
import { Ellipse } from "../ast/shapes/ellipse";
import { value, baseEmbedded } from "../ast/data";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Build a node (awaiting the coord operator's promise), run the real passes, and
// return the embedded flags of the leaf at `path` (indices into children).
async function embedOf(
  rootIn: any,
  path: number[] = []
): Promise<[boolean | undefined, boolean | undefined]> {
  const root = await rootIn;
  root.resolveAliases();
  root.resolveUnderlyingSpace();
  root.resolveEmbedding();
  let n = root;
  for (const i of path) n = n.children[i];
  const dims = n.args?.dims;
  return [dims?.[0]?.embedded, dims?.[1]?.embedded];
}

console.log("# embedding: baseEmbedded predicate (measure-free half)");
{
  ok("data size embeds", baseEmbedded({ size: value(5, "amount") }) === true);
  ok("pixel (number) size does not embed", baseEmbedded({ size: 10 }) === false);
  ok("unsized embeds (nest-growth case)", baseEmbedded({}) === true);
  ok(
    "min in a clashing measure blocks embed",
    baseEmbedded({ size: value(5, "pop"), min: value(2, "amount") }) === false
  );
  ok(
    "min in the same measure still embeds",
    baseEmbedded({ size: value(5, "amount"), min: value(2, "amount") }) === true
  );
}

console.log("# embedding: Route B in context");
(async () => {
  // Cartesian bar: pixel width, data height → line (bar). No coord, no gate.
  ok(
    "cartesian bar: x ink, y embedded",
    JSON.stringify(await embedOf(Rect({ w: 10, h: value(5, "amount") }))) ===
      JSON.stringify([false, true])
  );

  // Polar, size measures match the (absent) position → both embed → area wedge.
  ok(
    "polar same-measure rect: both embedded (area)",
    JSON.stringify(
      await embedOf(
        coord({ transform: polar() }, [
          Rect({ w: value(3, "amount"), h: value(5, "amount") }),
        ]),
        [0]
      )
    ) === JSON.stringify([true, true]),
    "matching-measure sizes under polar should sweep"
  );

  // THE ORACLE: a bubble (size in a foreign measure to its position) under polar
  // must stay a flat circle — size "pop" ≠ position "amount" → revoked both axes.
  ok(
    "polar bubble: foreign-measure size stays a point",
    JSON.stringify(
      await embedOf(
        coord({ transform: polar() }, [
          Ellipse({
            w: value(5, "pop"),
            h: value(5, "pop"),
            cx: value(2, "amount"),
            cy: value(3, "amount"),
          }),
        ]),
        [0]
      )
    ) === JSON.stringify([false, false]),
    "a foreign-measure size must not warp into a wedge"
  );

  // The SAME bubble in Cartesian space is unchanged from the old inferEmbedded
  // (the Route B revocation is coord-scoped) — pins that cartesian didn't move.
  ok(
    "cartesian bubble: unchanged (coord-scoped gate)",
    JSON.stringify(
      await embedOf(
        Ellipse({
          w: value(5, "pop"),
          h: value(5, "pop"),
          cx: value(2, "amount"),
          cy: value(3, "amount"),
        })
      )
    ) === JSON.stringify([true, true])
  );

  // Explicit emX/emY is a hard claim: it survives even a foreign-measure size.
  ok(
    "explicit emX/emY locks embed against the gate",
    JSON.stringify(
      await embedOf(
        coord({ transform: polar() }, [
          Rect({
            w: value(5, "pop"),
            h: value(5, "pop"),
            cx: value(2, "amount"),
            cy: value(3, "amount"),
            emX: true,
            emY: true,
          }),
        ]),
        [0]
      )
    ) === JSON.stringify([true, true]),
    "emX/emY must override the measure gate"
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
