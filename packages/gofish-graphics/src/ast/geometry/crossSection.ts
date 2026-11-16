// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import { constant, type Fun, type Interval } from "../fun";
import type { Geometry } from "./index";

/** A shape that knows its cross-sections: for each position u on the other
 *  axis, the interval it covers along `axis` there, in the node's local
 *  frame. */
export interface HasCrossSection {
  readonly crossSection?: (axis: 0 | 1) => Fun<Interval>;
}

/** A geometry's cross-section along `axis`, falling back to its box: the
 *  box's interval on `axis` at every u across the box. */
export function crossSection(g: Geometry, axis: 0 | 1): Fun<Interval> {
  if (g.crossSection) return g.crossSection(axis);
  const across = axis === 0 ? 1 : 0;
  return constant(
    { min: g.box.min[axis], max: g.box.max[axis] },
    { min: g.box.min[across], max: g.box.max[across] }
  );
}
