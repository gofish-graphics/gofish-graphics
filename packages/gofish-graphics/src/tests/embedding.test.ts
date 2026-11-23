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
import { DatumValueImpl, baseEmbedded } from "../ast/data";
import { fresh } from "./testHelpers";
import { Spread } from "../ast/graphicalOperators/spread";
import { resolveReferences } from "../ast/_ref";
import { layer } from "../ast/graphicalOperators/layer";

/** A data value read from column `name`, i.e. an amount of that quantity. */
const q = (v: number, name: string) => new DatumValueImpl(v, { name });

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
  await root.resolveAliases();
  root.resolveUnderlyingSpace();
  root.resolveEmbedding();
  let n = root;
  for (const i of path) n = n.children[i];
  const dims = n.args?.dims;
  return [dims?.[0]?.embedded, dims?.[1]?.embedded];
}

console.log("# embedding: baseEmbedded predicate (coord-free half)");
// Called on its own, outside any walk: it compares unknown units, so it
// needs a union-find of its own.
fresh(() => {
  ok("data size embeds", baseEmbedded({ size: q(5, "amount") }) === true);
  ok(
    "pixel (number) size does not embed",
    baseEmbedded({ size: 10 }) === false
  );
  ok("unsized embeds (nest-growth case)", baseEmbedded({}) === true);
  ok(
    "min in a clashing measure blocks embed",
    baseEmbedded({ size: q(5, "pop"), min: q(2, "amount") }) === false
  );
  ok(
    "min in the same measure still embeds",
    baseEmbedded({ size: q(5, "amount"), min: q(2, "amount") }) === true
  );
});

console.log("# embedding: Route B in context");
(async () => {
  // Cartesian bar: pixel width, data height → line (bar). No coord, no gate.
  ok(
    "cartesian bar: x ink, y embedded",
    JSON.stringify(await embedOf(Rect({ w: 10, h: q(5, "amount") }))) ===
      JSON.stringify([false, true])
  );

  // Polar, size measures match the (absent) position → both embed → area wedge.
  ok(
    "polar same-measure rect: both embedded (area)",
    JSON.stringify(
      await embedOf(
        coord({ transform: polar() }, [
          Rect({ w: q(3, "amount"), h: q(5, "amount") }),
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
            w: q(5, "pop"),
            h: q(5, "pop"),
            cx: q(2, "amount"),
            cy: q(3, "amount"),
          }),
        ]),
        [0]
      )
    ) === JSON.stringify([false, false]),
    "a foreign-measure size must not warp into a wedge"
  );

  // Embedding and sizing ask one question (#972, `GoFishNode.isGlyph`): the
  // bubble's own center places it at a datum in another unit, so its size is
  // a glyph size on both axes, the same verdict that keeps it flat above.
  // They used to disagree: the embedding pass compared the mark's own
  // positions with its size, while sizing read only its parent's placement,
  // so this bubble was drawn flat but sized as a length of the space.
  {
    const root: any = await coord({ transform: polar() }, [
      Ellipse({
        w: q(5, "pop"),
        h: q(5, "pop"),
        cx: q(2, "amount"),
        cy: q(3, "amount"),
      }),
    ]);
    await root.resolveAliases();
    root.resolveUnderlyingSpace();
    const leaf = root.children[0];
    ok(
      "a bubble placed by its own center is a glyph on both axes",
      leaf.isGlyph(0) && leaf.isGlyph(1)
    );
  }

  // The SAME bubble in Cartesian space is unchanged from the old inferEmbedded
  // (the Route B revocation is coord-scoped) — pins that cartesian didn't move.
  ok(
    "cartesian bubble: unchanged (coord-scoped gate)",
    JSON.stringify(
      await embedOf(
        Ellipse({
          w: q(5, "pop"),
          h: q(5, "pop"),
          cx: q(2, "amount"),
          cy: q(3, "amount"),
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
            w: q(5, "pop"),
            h: q(5, "pop"),
            cx: q(2, "amount"),
            cy: q(3, "amount"),
            emX: true,
            emY: true,
          }),
        ]),
        [0]
      )
    ) === JSON.stringify([true, true]),
    "emX/emY must override the measure gate"
  );

  console.log("# embedding: Route A (shared edges) in context");
  // Pixel rings laid end to end along the radius: each ring's radial edge is
  // a neighbor's, so the radius embeds (an annular sector that touches its
  // neighbor), though the ring's height is pixels.
  const ring = (h = 40) => Rect({ w: q(1, "amount"), h });
  const leafEmbeds = async (rootIn: any, path: number[]) => {
    const root = await rootIn;
    await root.resolveAliases();
    resolveReferences(root);
    root.resolveUnderlyingSpace();
    root.resolveEmbedding();
    let n = root;
    for (const i of path) n = n.children[i];
    return JSON.stringify([n.args.dims[0].embedded, n.args.dims[1].embedded]);
  };
  const polarOf = (child: any) => coord({ transform: polar() }, [child]);
  for (const i of [0, 1]) {
    ok(
      `polar pixel rings edge to edge: ring ${i} embeds on both axes`,
      (await leafEmbeds(
        polarOf(Spread({ dir: "y", spacing: 0 }, [ring(), ring()])),
        [0, i]
      )) === JSON.stringify([true, true])
    );
  }
  ok(
    "polar pixel rings apart: the radius stays ink",
    (await leafEmbeds(
      polarOf(Spread({ dir: "y", spacing: 4 }, [ring(), ring()])),
      [0, 0]
    )) === JSON.stringify([true, false])
  );
  // A bar of pixel width touches nothing: it keeps its width as ink.
  const bar = () => Rect({ w: 16, h: q(5, "amount") });
  ok(
    "polar lone pixel-width bar: x stays ink (a line)",
    (await leafEmbeds(polarOf(bar()), [0])) === JSON.stringify([false, true])
  );
  ok(
    "polar pixel-width bars apart: x stays ink",
    (await leafEmbeds(
      polarOf(Spread({ dir: "x", spacing: 0.1 }, [bar(), bar()])),
      [0, 1]
    )) === JSON.stringify([false, true])
  );
  ok(
    "polar pixel-width bars edge to edge: x embeds (wedges)",
    (await leafEmbeds(
      polarOf(Spread({ dir: "x", spacing: 0 }, [bar(), bar()])),
      [0, 1]
    )) === JSON.stringify([true, true])
  );
  // The sunburst's shape: a ring, then its children's rings stacked along
  // the angle and aligned at their start on the radius. A child's inner
  // edge lies on the stack's inner edge, which touches the parent ring, so
  // it is shared too. Aligned at the end (or the middle), the child's inner
  // edge touches nothing.
  const sunburst = (alignment: string) =>
    polarOf(
      Spread({ dir: "y", spacing: 0, alignment: "middle" }, [
        ring(),
        Spread({ dir: "x", glue: true, alignment } as any, [ring(), ring(30)]),
      ])
    );
  for (const i of [0, 1]) {
    ok(
      `sunburst child ring ${i} aligned at the start: the radius embeds`,
      (await leafEmbeds(sunburst("start"), [0, 1, i])) ===
        JSON.stringify([true, true])
    );
  }
  ok(
    "sunburst child ring aligned at the end: the radius stays ink",
    (await leafEmbeds(sunburst("end"), [0, 1, 1])) ===
      JSON.stringify([true, false])
  );
  ok(
    "sunburst child ring aligned at the middle: the radius stays ink",
    (await leafEmbeds(sunburst("middle"), [0, 1, 1])) ===
      JSON.stringify([true, false])
  );
  // A chain inside a node with a size of its own: the node's edge is set by
  // its size, not by its first part, so nothing passes down.
  ok(
    "a sized chain passes no edge down",
    (await leafEmbeds(
      polarOf(
        Spread({ dir: "y", spacing: 0 }, [
          ring(),
          Spread({ dir: "y", spacing: 4, h: 200 } as any, [ring(), ring()]),
        ])
      ),
      [0, 1, 0]
    )) === JSON.stringify([true, false])
  );

  // An only child is its hull: a wrapper with no size of its own (gotree
  // wraps each node this way) has the child's edges, so a ring inside one
  // still touches its neighbor. A wrapper with a size of its own does not.
  for (const i of [0, 1]) {
    ok(
      `a ring wrapped alone, edge to edge: ring ${i} embeds on both axes`,
      (await leafEmbeds(
        polarOf(
          Spread({ dir: "y", spacing: 0 }, [
            await layer([ring()]),
            await layer([ring()]),
          ])
        ),
        i === 0 ? [0, 0, 0] : [0, 1, 0]
      )) === JSON.stringify([true, true])
    );
  }
  ok(
    "a ring wrapped alone in a sized wrapper: the radius stays ink",
    (await leafEmbeds(
      polarOf(
        Spread({ dir: "y", spacing: 0 }, [
          ring(),
          await layer({ h: 200 }, [ring()]),
        ])
      ),
      [0, 1, 0]
    )) === JSON.stringify([true, false])
  );
  // Rings of one pixel size aligned at the middle take one interval, the
  // hull's, so each lies on both of its edges and touches the parent ring.
  for (const i of [0, 1]) {
    ok(
      `sunburst child rings of one size aligned at the middle: ring ${i} embeds`,
      (await leafEmbeds(
        polarOf(
          Spread({ dir: "y", spacing: 0, alignment: "middle" }, [
            ring(),
            Spread({ dir: "x", glue: true, alignment: "middle" } as any, [
              ring(),
              ring(),
            ]),
          ])
        ),
        [0, 1, i]
      )) === JSON.stringify([true, true])
    );
  }
  // The rose: each month a stack of pixel-width bars aligned at their
  // baseline, months edge to edge. Bars of one width take the hull's
  // interval, so the first month's bars touch the second month too.
  const rose = (w2: number) =>
    polarOf(
      Spread({ dir: "x", spacing: 0 }, [
        Spread({ dir: "y", glue: true, alignment: "baseline" } as any, [
          bar(),
          Rect({ w: w2, h: q(3, "amount") }),
        ]),
        Spread({ dir: "y", glue: true, alignment: "baseline" } as any, [
          bar(),
          bar(),
        ]),
      ])
    );
  for (const i of [0, 1]) {
    ok(
      `rose bars of one width: the first month's bar ${i} embeds x`,
      (await leafEmbeds(rose(16), [0, 0, i])) === JSON.stringify([true, true])
    );
  }
  ok(
    "rose bars of two widths: the first month's bar stays a line",
    (await leafEmbeds(rose(10), [0, 0, 0])) === JSON.stringify([false, true])
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
