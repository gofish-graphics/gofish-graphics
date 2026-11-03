// The geometry the playground runs, bundled straight from the prototype's source files (no
// copies): the unified outline (enclose/unified.ts and what it imports: arcs.ts, arcsSmooth.ts,
// beyond.ts, oval.ts) and, for the comparison, today's Shape.blob (enclose/blob.ts) and
// Shape.arcs (enclose/arcs.ts).
import {
  unifiedOutline,
  UNIFIED_STATS,
  UNIFIED_PROTOTYPE,
  REACH_PROTOTYPE,
  type Means,
  type Seal,
  type JoinEdge,
  type ReachMeasure,
  type ReachDistance,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import {
  blobOutline,
  type BlobMember,
  type Pt,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/blob";
import { arcsOutline } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/arcs";
import { signedArea2 } from "../../packages/gofish-graphics/src/ast/geometry/plane";

export type {
  BlobMember,
  Pt,
  Means,
  Seal,
  JoinEdge,
  ReachMeasure,
  ReachDistance,
};

export type ShapeKind = "blob" | "arcs";

// PROTOTYPE: the comparison switches, from the page's query string (a worker is told it by
// the page: it has no query of its own). ?search=bisection: the earlier radius search;
// ?blend=grid: the per-bay blend on the old 1 px grid (localFill.ts) instead of the mesh
// (meshBlend.ts); ?links=gap: each piece drawn with its own gap tree (the join tree still
// picks the pieces); ?typical=all: "typical"'s unit over every tree edge, touching ones too.
export function configure(search: string) {
  const q = new URLSearchParams(search);
  if (q.get("search") === "bisection") UNIFIED_PROTOTYPE.search = "bisection";
  if (q.get("blend") === "grid") UNIFIED_PROTOTYPE.blend = "grid";
  if (q.get("links") === "gap") REACH_PROTOTYPE.links = "gap";
  if (q.get("typical") === "all") REACH_PROTOTYPE.typical = "all";
}
export const searchOf = () => UNIFIED_PROTOTYPE.search;
export const blendOf = () => UNIFIED_PROTOTYPE.blend ?? "mesh";

export type Params = {
  convexity: number;
  neck: number;
  padding: number;
  /** blob: reach, convexity, neck; arcs: radius (the exact closing) */
  shape: ShapeKind;
  /** the longest padded gap a link may cross, px (Infinity: every gap) */
  reach: number;
  /** PROTOTYPE: what reach is measured in */
  reachMeasure: ReachMeasure;
  /** PROTOTYPE: the distance the relative measures and pieces rank by, and
   *  the mutual reachability's k */
  reachDistance: ReachDistance;
  reachCore: number;
  radius: number;
  holes: boolean;
  avoid: boolean;
  clearance: number;
  smooth: boolean;
  compare: boolean;
  /** PROTOTYPE: what convexity means, and what a sealing bay does */
  means: Means;
  seal: Seal;
  /** PROTOTYPE: a slider is being dragged: the coarser mesh (UNIFIED_PROTOTYPE.draft) */
  draft?: boolean;
};

export type SetInput = { members: BlobMember[]; avoiding: BlobMember[] };

export type SetResult = {
  rings: Pt[][];
  /** the closing radius the outline used (Infinity: the hull, or beyond it) */
  radius: number;
  iterations: number;
  links: BlobMember[];
  /** blob: the spanning tree's edges (kept, ramping in, or not kept) */
  tree: JoinEdge[];
  /** the median tree edge in the ranked distance ("typical"'s unit) */
  typical: number;
  pieces: number;
  holes: number;
  /** cached: the part of total spent building the per-set cache (spine, hull,
   *  filtration), which a convexity change on the same set skips */
  ms: {
    links: number;
    close: number;
    smooth: number;
    total: number;
    cached: number;
    /** grid work (lid, blend), part of close */
    grid: number;
    /** keeping the pieces apart (0 when cached) */
    separate: number;
  };
  /** sealed bays the lid was filling */
  lidActive: number;
  /** today's outline (Shape.blob, or Shape.arcs for the arcs shape), when asked */
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
  UNIFIED_PROTOTYPE.draft = !!p.draft;
  const avoiding = p.avoid ? s.avoiding : [];
  const blob = p.shape === "blob";
  const t0 = performance.now();
  const rings = unifiedOutline(s.members, {
    padding: p.padding,
    ...(blob
      ? {
          convexity: p.convexity,
          neck: p.neck,
          reach: p.reach,
          reachMeasure: p.reachMeasure,
          reachDistance: p.reachDistance,
          reachCore: p.reachCore,
          means: p.means,
          seal: p.seal,
        }
      : { radius: p.radius }),
    connected: blob,
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
    tree: S.joinTree ?? [],
    typical: S.joinTypical ?? NaN,
    ...count(rings),
    ms: {
      links: S.msLinks ?? 0,
      close: S.msClose ?? 0,
      smooth: S.msSmooth ?? 0,
      total,
      cached: S.msCached ?? 0,
      grid: S.msGrid ?? 0,
      separate: S.msSeparate ?? 0,
    },
    lidActive: S.lidActive ?? 0,
  };
  if (p.compare) {
    const t1 = performance.now();
    const today = blob
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
