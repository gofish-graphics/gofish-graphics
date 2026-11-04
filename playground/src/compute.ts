// The geometry the playground runs, bundled straight from the prototype's source files (no
// copies): the unified outline (enclose/unified.ts and what it imports: arcs.ts, arcsSmooth.ts,
// beyond.ts, oval.ts, meshBlend.ts, separate.ts).
import {
  unifiedOutline,
  UNIFIED_STATS,
  UNIFIED_PROTOTYPE,
  type JoinEdge,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import type {
  BlobMember,
  Pt,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/blob";
import { signedArea2 } from "../../packages/gofish-graphics/src/ast/geometry/plane";

export type { BlobMember, Pt, JoinEdge };

export type ShapeKind = "blob" | "fillet";

export type Params = {
  shape: ShapeKind;
  /** blob */
  convexity: number;
  connection: number;
  neck: number;
  /** blob, connection below 1: each piece is cut out of the others (true) or pieces may overlap */
  separate: boolean;
  /** fillet: the closing radius, px; null follows the padding (the default) */
  radius: number | null;
  /** shared */
  padding: number;
  holes: boolean;
  avoid: boolean;
  clearance: number;
  /** PROTOTYPE: a slider is being dragged: the coarser mesh (UNIFIED_PROTOTYPE.draft) */
  draft?: boolean;
};

export type SetInput = { members: BlobMember[]; avoiding: BlobMember[] };

export type SetResult = {
  rings: Pt[][];
  links: BlobMember[];
  /** blob: the join tree's edges (kept or cut) */
  tree: JoinEdge[];
  pieces: number;
  holes: number;
  ms: number;
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
  UNIFIED_PROTOTYPE.draft = !!p.draft;
  const t0 = performance.now();
  const rings = unifiedOutline(s.members, {
    padding: p.padding,
    shape: p.shape,
    ...(p.shape === "blob"
      ? {
          convexity: p.convexity,
          connection: p.connection,
          neck: p.neck,
          separate: p.separate,
        }
      : { radius: p.radius ?? undefined, neck: p.neck }),
    holes: p.holes,
    ...(p.avoid ? { avoiding: s.avoiding, clearance: p.clearance } : {}),
  });
  const S = UNIFIED_STATS;
  return {
    rings,
    links: S.linkMembers ?? [],
    tree: S.joinTree ?? [],
    ...count(rings),
    ms: performance.now() - t0,
  };
}
