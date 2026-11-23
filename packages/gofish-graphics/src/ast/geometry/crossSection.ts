// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Overview — /internals/layout/passes
// </gofish-wiki>

import { constant, type Fun, type Interval } from "../fun";
import type { Box } from "./box";
import type { Geometry } from "./index";

/** A shape that knows its cross-sections: for each position u on the other
 *  axis, the interval it covers along `axis` there, in the node's local
 *  frame. */
export interface HasCrossSection {
  readonly crossSection?: (axis: 0 | 1) => Fun<Interval>;
}

/** The cross-section of a box along `axis`: the box's interval on `axis` at
 *  every u across the box. */
export function boxCrossSection(box: Box, axis: 0 | 1): Fun<Interval> {
  const across = axis === 0 ? 1 : 0;
  return constant(
    { min: box.min[axis], max: box.max[axis] },
    { min: box.min[across], max: box.max[across] }
  );
}

/** A geometry's cross-section along `axis`, falling back to its box. */
export function crossSection(g: Geometry, axis: 0 | 1): Fun<Interval> {
  return g.crossSection ? g.crossSection(axis) : boxCrossSection(g.box, axis);
}
