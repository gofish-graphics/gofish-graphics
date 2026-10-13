import { smoothBlob, type Pt, type Skeleton } from "./blob";
import type { Dataset } from "./datasets";

export type Params = {
  convexity: number;
  neck: number;
  smoothing: number;
  padding: number;
  clearance: number;
};
export type SetResult = { loops: Pt[][]; skel: Skeleton };

/** One smoothBlob call per set, exactly as the stories call it. `res` (grid cell, px)
 *  overrides the construction's own choice; the page passes a coarser one while dragging. */
export const computeDataset = (
  d: Dataset,
  p: Params,
  res?: number
): SetResult[] =>
  d.sets.map((s) => {
    const r = smoothBlob(s.members, {
      avoiding: s.avoiding,
      via: s.via,
      pad: p.padding,
      convexity: p.convexity,
      neck: p.neck,
      smoothing: p.smoothing,
      clearance: p.clearance,
      ...(res ? { res } : {}),
    });
    return { loops: r.loops, skel: r.skel };
  });
