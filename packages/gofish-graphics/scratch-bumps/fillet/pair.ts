// SCRATCH: two padded discs at a range of gaps: the exact closing against the raster one.
import { closingRings } from "../../src/ast/graphicalOperators/enclose/arcs";
import { closingError, sharpest } from "./rastercheck";
import type { BlobMember } from "../../src/ast/graphicalOperators/enclose/blob";
const a = 5,
  pad = 6,
  r = 12;
const A = a + pad;
const gJoin = 2 * (-A + Math.sqrt(A * A + 2 * A * r));
console.log(
  `padded radius ${A}, r ${r}: joins below g ${gJoin.toFixed(2)}, dilations touch at ${2 * r}`
);
for (const g of [10, 16, 17, 17.5, 18, 20, 23, 24, 26]) {
  const D = 2 * A + g;
  const M: BlobMember[] = [
    { kind: "disc", cx: 0, cy: 0, r: a },
    { kind: "disc", cx: D, cy: 0, r: a },
  ];
  const rings = closingRings(M, pad, r);
  const e = closingError(rings, M, pad, r, 0.05, 0.25);
  const s = sharpest(rings);
  console.log(
    `g ${g}: rings ${rings.length} err out→true ${e.outToTrue.toFixed(3)} true→out ${e.trueToOut.toFixed(3)} at ${e.at2.map((v) => v.toFixed(1))} sharpest ${s.deg.toFixed(0)}° at ${s.at.map((v) => v.toFixed(1))}`
  );
}
