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
import { Constraint } from "../ast/constraints";
import { SlotOperand } from "../ast/constraints/shared";
import { fr } from "../ast/length";
import { atLeast, pitch } from "../families/spacing";
import { bandRegion } from "../bandRegion";

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

  console.log("# embedding: Route A (related extents) in context");
  // A relation that fixes both edges of a mark on an axis embeds that axis,
  // whatever the unit of the mark's size: the relation must still hold
  // after the transform. One that pins one point of a mark places it there
  // and leaves its extent to its own size.
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
  const both = JSON.stringify([true, true]);
  const radiusInk = JSON.stringify([true, false]);
  const polarOf = (child: any) => coord({ transform: polar() }, [child]);

  // A chain relates each part's end to the next part's start, so every part
  // embeds along the chain, for any box gap and for a minimum gap.
  for (const [label, spacing] of [
    ["a zero gap", 0],
    ["a positive gap", 4],
    ["an fr gap", fr(1)],
    ["a minimum gap", atLeast(4)],
  ] as const) {
    for (const i of [0, 1]) {
      ok(
        `polar pixel rings chained with ${label}: ring ${i} embeds the radius`,
        (await leafEmbeds(
          polarOf(Spread({ dir: "y", spacing }, [ring(), ring()])),
          [0, i]
        )) === both
      );
    }
  }
  // A pitch pins the same point of each part, not its edges.
  ok(
    "polar pixel rings set apart by a pitch: the radius stays ink",
    (await leafEmbeds(
      polarOf(Spread({ dir: "y", spacing: pitch(50) }, [ring(), ring()])),
      [0, 0]
    )) === radiusInk
  );

  // A bar of pixel width placed by no relation keeps its width as ink.
  const bar = () => Rect({ w: 16, h: q(5, "amount") });
  ok(
    "polar lone pixel-width bar: x stays ink (a line)",
    (await leafEmbeds(polarOf(bar()), [0])) === JSON.stringify([false, true])
  );
  ok(
    "polar pixel-width bars spread apart: x embeds (wedges)",
    (await leafEmbeds(
      polarOf(Spread({ dir: "x", spacing: 0.1 }, [bar(), bar()])),
      [0, 1]
    )) === both
  );

  // An align by one anchor pins one point of each operand; `start` and
  // `end` together, or `span`, relate both edges.
  const aligned = async (constraints: (a: any, b: any) => any[]) => {
    const node: any = await (layer as any)([ring(), ring(30)]);
    await node.INTERNAL_relate(
      constraints(new SlotOperand(node, 0), new SlotOperand(node, 1))
    );
    return polarOf(node);
  };
  for (const anchor of ["start", "end", "middle", "baseline"] as const) {
    ok(
      `rings aligned at ${anchor} on the radius: the radius stays ink`,
      (await leafEmbeds(
        aligned((a, b) => [Constraint.align({ y: anchor }, [a, b])]),
        [0, 1]
      )) === radiusInk
    );
  }
  ok(
    "rings aligned at start and at end on the radius: the radius embeds",
    (await leafEmbeds(
      aligned((a, b) => [
        Constraint.align({ y: "start" }, [a, b]),
        Constraint.align({ y: "end" }, [a, b]),
      ]),
      [0, 1]
    )) === both
  );
  ok(
    "rings aligned by span on the radius: the radius embeds",
    (await leafEmbeds(
      aligned((a, b) => [Constraint.align({ y: "span" }, [a, b])]),
      [0, 1]
    )) === both
  );

  // A point glyph centered on a wedge is placed at a point: it stays ink on
  // both axes, though the wedge beside it is a part of a chain.
  ok(
    "a circle centered on a chained wedge stays a point",
    (await leafEmbeds(
      polarOf(
        Spread({ dir: "x", spacing: 0 }, [
          ring(),
          await (async () => {
            const node: any = await (layer as any)([
              ring(),
              Ellipse({ w: 8, h: 8 }),
            ]);
            await node.INTERNAL_relate([
              Constraint.align({ x: "middle", y: "middle" }, [
                new SlotOperand(node, 0),
                new SlotOperand(node, 1),
              ]),
            ]);
            return node;
          })(),
        ])
      ),
      [0, 1, 1]
    )) === JSON.stringify([false, false])
  );

  // An only child of a wrapper with no size of its own is the wrapper's
  // extent, so a relation on the wrapper fixes the child's. A wrapper with
  // a size of its own, or with two children, passes nothing down.
  for (const i of [0, 1]) {
    ok(
      `a ring wrapped alone, chained: ring ${i} embeds the radius`,
      (await leafEmbeds(
        polarOf(
          Spread({ dir: "y", spacing: 0 }, [
            await layer([ring()]),
            await layer([ring()]),
          ])
        ),
        i === 0 ? [0, 0, 0] : [0, 1, 0]
      )) === both
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
    )) === radiusInk
  );
  // The sunburst's shape: a ring, then its children's rings stacked along
  // the angle and aligned at their start on the radius. The stack is a part
  // of the radial chain, but the rings in it are only aligned at one point
  // on the radius, so their radius stays ink.
  ok(
    "sunburst child rings aligned at the start: the radius stays ink",
    (await leafEmbeds(
      polarOf(
        Spread({ dir: "y", spacing: 0, alignment: "middle" }, [
          ring(),
          Spread({ dir: "x", glue: true, alignment: "start" } as any, [
            ring(),
            ring(30),
          ]),
        ])
      ),
      [0, 1, 0]
    )) === radiusInk
  );

  console.log("# embedding: the band a one-axis rect draws in polar");
  {
    // A rect with its angle embedded and a pixel thickness along the radius
    // is an annular sector: its ends lie on the rays at its two angles and
    // its sides on the radii r ± thickness / 2.
    const space = polar();
    const [t0, t1, r, half] = [0.3, 1.4, 80, 9];
    const region = bandRegion(space, [t0, r], [t1, r], () => half);
    const dist = (p: [number, number], q2: [number, number]) =>
      Math.hypot(p[0] - q2[0], p[1] - q2[1]);
    const at = (t: number, rr: number) => space.transform([t, rr]);
    const caps = region.filter((s) => s.type === "line") as any[];
    ok("the band is closed by two straight caps", caps.length === 2);
    const onRay = (p: [number, number], t: number) =>
      dist(p, at(t, r - half)) < 1e-3 || dist(p, at(t, r + half)) < 1e-3;
    const capOk = caps.every((c: any) => {
      const [p, q2] = c.points as [number, number][];
      const t = onRay(p, t0) ? t0 : t1;
      return onRay(p, t) && onRay(q2, t) && dist(p, q2) > 2 * half - 1e-3;
    });
    ok(
      "its caps lie on the rays at the embedded edges, from r - t/2 to r + t/2",
      capOk,
      JSON.stringify(caps.map((c: any) => c.points))
    );
    const center = space.transform([0, 0]);
    const starts = region.map((s) => (s.type === "line" ? s.points[0] : s.start));
    ok(
      "its sides lie on the radii r ± t/2",
      starts.every((p) => {
        const d = dist(p, center);
        return Math.abs(d - (r - half)) < 1e-3 || Math.abs(d - (r + half)) < 1e-3;
      })
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
