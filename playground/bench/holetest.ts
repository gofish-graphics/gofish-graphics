// SCRATCH: a mouthless pocket (a spine hole) shrinks evenly from its wall: a ring of discs
// around an empty middle, holes on; per c, the hole left in the outline and the spread of its
// points' distances to the spine's hole wall (even shrink: min ≈ max), mesh and grid.
//   BENCH=holetest node playground/bench.mjs
import {
  unifiedOutline,
  UNIFIED_PROTOTYPE,
  UNIFIED_STATS,
  clearUnifiedCache,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import { closingRings } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import { signedArea2 } from "../../packages/gofish-graphics/src/ast/geometry/plane";
import type { Pt } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/blob";

const members = Array.from({ length: 16 }, (_, k) => ({
  kind: "disc" as const,
  cx: 100 + 40 * Math.cos((2 * Math.PI * k) / 16) * (k % 2 ? 1.15 : 1),
  cy: 100 + 40 * Math.sin((2 * Math.PI * k) / 16),
  r: 5,
}));
const pad = 8;
const spine = closingRings(members as any, pad, pad, true);
const holes = spine.filter((r) => signedArea2(r) < 0);
console.log(`spine rings ${spine.length}, holes ${holes.length}`);
const dist = (p: Pt, ring: Pt[]) => {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)
      )
    );
    best = Math.min(
      best,
      Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
    );
  }
  return best;
};
for (const solver of ["grid", "mesh"] as const) {
  UNIFIED_PROTOTYPE.blend = solver;
  clearUnifiedCache();
  let wall: Pt[] = holes[0];
  for (const c of [0, 0.25, 0.5, 0.75, 1]) {
    const rs = unifiedOutline(members as any, {
      padding: pad,
      convexity: c,
      neck: 1,
      holes: true,
      means: "blend",
      smooth: null,
    });
    const hs = rs.filter((r) => signedArea2(r) < 0);
    if (c === 0) wall = hs[0];
    const ds = hs.flatMap((r) => r.map((p) => dist(p, wall)));
    const area = hs.reduce((t, r) => t - signedArea2(r) / 2, 0);
    console.log(
      `${solver} c ${c}: hole rings ${hs.length}, hole area ${area.toFixed(1)} , distance to wall min ${ds.length ? Math.min(...ds).toFixed(3) : "-"} max ${ds.length ? Math.max(...ds).toFixed(3) : "-"}, areaGot ${UNIFIED_STATS.areaGot?.toFixed(1)}`
    );
  }
}
