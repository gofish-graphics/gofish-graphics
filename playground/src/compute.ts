// The geometry the playground runs, bundled straight from the prototype's source files (no
// copies): the unified outline (enclose/unified.ts and what it imports: arcs.ts, arcsSmooth.ts,
// beyond.ts, oval.ts) and, for the comparison, today's Shape.blob (enclose/blob.ts) and
// Shape.arcs (enclose/arcs.ts).
import {
  unifiedOutline,
  UNIFIED_STATS,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import {
  blobOutline,
  type BlobMember,
  type Pt,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/blob";
import { arcsOutline } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import { signedArea2 } from "../../packages/gofish-graphics/src/ast/geometry/plane";

export type { BlobMember, Pt };

export type Params = {
  convexity: number;
  neck: number;
  padding: number;
  connected: boolean;
  radius: number;
  holes: boolean;
  avoid: boolean;
  clearance: number;
  smooth: boolean;
  compare: boolean;
};

export type SetInput = { members: BlobMember[]; avoiding: BlobMember[] };

export type SetResult = {
  rings: Pt[][];
  /** the closing radius the outline used (Infinity: the hull, or beyond it) */
  radius: number;
  iterations: number;
  links: BlobMember[];
  pieces: number;
  holes: number;
  ms: { links: number; close: number; smooth: number; total: number };
  /** today's outline (Shape.blob, or Shape.arcs when not connected), when asked */
  today?: { rings: Pt[][]; ms: number };
};

const count = (rings: Pt[][]) => {
  let pieces = 0,
    holes = 0;
  for (const r of rings) {
    if (r.length < 3) continue;
    if (signedArea2(r) > 0) pieces++;
    else holes++;
  }
  return { pieces, holes };
};

export function computeSet(s: SetInput, p: Params): SetResult {
  const avoiding = p.avoid ? s.avoiding : [];
  const t0 = performance.now();
  const rings = unifiedOutline(s.members, {
    padding: p.padding,
    ...(p.connected
      ? { convexity: p.convexity, neck: p.neck }
      : { radius: p.radius }),
    connected: p.connected,
    holes: p.holes,
    avoiding,
    clearance: p.clearance,
    smooth: p.smooth ? undefined : null,
  });
  const total = performance.now() - t0;
  const S = UNIFIED_STATS;
  const out: SetResult = {
    rings,
    radius: S.radius ?? NaN,
    iterations: S.iterations ?? 0,
    links: S.linkMembers ?? [],
    ...count(rings),
    ms: {
      links: S.msLinks ?? 0,
      close: S.msClose ?? 0,
      smooth: S.msSmooth ?? 0,
      total,
    },
  };
  if (p.compare) {
    const t1 = performance.now();
    const today = p.connected
      ? blobOutline(s.members, {
          padding: p.padding,
          convexity: Math.min(1, p.convexity),
          neck: Math.max(0.1, p.neck),
          holes: p.holes,
          avoiding,
          clearance: p.clearance,
        })
      : arcsOutline(s.members, { padding: p.padding, radius: p.radius });
    out.today = { rings: today, ms: performance.now() - t1 };
  }
  return out;
}
