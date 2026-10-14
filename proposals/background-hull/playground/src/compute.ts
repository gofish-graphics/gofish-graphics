import { smoothBlob, type Pt, type Skeleton } from "./blob";
import type { Dataset } from "./datasets";

export type Params = {
  convexity: number;
  neck: number;
  roundness: number;
  padding: number;
  clearance: number;
};
export type SetResult = { loops: Pt[][]; skel: Skeleton; sigma: number };

/** One smoothBlob call per set, exactly as the stories call it. */
export const computeDataset = (d: Dataset, p: Params): SetResult[] =>
  d.sets.map((s) => {
    const r = smoothBlob(s.members, {
      avoiding: s.avoiding,
      via: s.via,
      pad: p.padding,
      convexity: p.convexity,
      neck: p.neck,
      roundness: p.roundness,
      clearance: p.clearance,
    });
    return { loops: r.loops, skel: r.skel, sigma: r.sigma };
  });
