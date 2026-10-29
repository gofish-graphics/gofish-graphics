// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

// ── Gaps ─────────────────────────────────────────────────────────────────────
//
// A chain (`distribute`) and a table (`grid`) lay a gap out between the parts
// they place along an axis. A gap is authored as pixels or as a length the
// layer that holds the constraint lays out in its room (#1176 step 6), and
// the layer reads it as a value in σ (`GoFishNode.gapOf`).

import type * as Pwl from "../solver/pwl";
import type { Length, LengthValue } from "../length";
import type { ConstraintSpec } from ".";
import type { DistributeConstraint } from "./distribute";
import type { GridConstraint } from "./grid";
import { axisIndex } from "./shared";

/** One gap between parts: pixels, a percent of the room on its axis, or an
 *  `fr` weight in its scope (#1176 step 6). */
export type Gap = number | Length | LengthValue;

/** A constraint that lays a gap out between the parts it places along an
 *  axis: a chain's spacing, a table's gap between tracks. */
export type GapConstraint = DistributeConstraint | GridConstraint;

/** The gap `c` lays out between the parts it places along `axis`, as
 *  authored: a table's gap between tracks there, and a chain's spacing when
 *  the chain runs along `axis`. Undefined when `c` lays no gap out there. */
export const spacingOn = (c: ConstraintSpec, axis: 0 | 1): Gap | undefined =>
  c.type === "grid"
    ? c.spacing[axis]
    : c.type === "distribute" && axisIndex(c.dir) === axis
      ? c.spacing
      : undefined;

/** Reads the gap a chain or table lays out between its parts along an
 *  axis, as a value in σ: the layer that holds it lays it out in its room
 *  (`GoFishNode.gapOf`). The claim walk and layout pass it to the
 *  placement lowering, as they pass a grid's tracks. */
export type GapOf = (c: GapConstraint, axis: 0 | 1) => Pwl.Value;
