// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { AlignAnchor, Axis } from "./shared";

export type NodeId = string;

// --- Anchor program (#39 stage 5) ----------------------------------------
// The placement fact form: facts name a node anchor directly
// (`start`/`middle`/`end`/`baseline`), and the offset from `min` is derived in
// the solver post-closure (once sizes are known) rather than at lowering time
// against an already-known size. Consumed by the rank-2 solve in
// `placementSolver.ts`.

export type AnchorRef = { node: NodeId; anchor: AlignAnchor };

export type AnchorPinFact = {
  type: "anchor-pin";
  node: NodeId;
  axis: Axis;
  anchor: AlignAnchor;
  value: number;
  owner: string;
};

export type AnchorRelationFact = {
  type: "anchor-relation";
  axis: Axis;
  from: AnchorRef;
  to: AnchorRef;
  gap: number;
  owner: string;
};

export type AnchorParticipantFact = {
  type: "anchor-participant";
  node: NodeId;
  axis: Axis;
  owner: string;
};

/** A size-cell equation independent of any anchor (#726, align `"size"`): the
 *  target's `size` box key := `value`, with no coupling to `min`/`max`/`center`.
 *  Consumed directly by `closeSizes` — it feeds the SAME per-node `BBox` an
 *  anchor pin would, so it combines with a companion anchor pin (from another
 *  constraint or an authoritative position pin) to reach rank 2, but alone it
 *  stays under-determined for POSITION (by design — "size" must not move the
 *  target) while still being read back by `reduceToAxisProblem`'s strong-size
 *  substitution. */
export type SizePinFact = {
  type: "size-pin";
  node: NodeId;
  axis: Axis;
  value: number;
  owner: string;
};

export type AnchorFact =
  | AnchorPinFact
  | AnchorRelationFact
  | AnchorParticipantFact
  | SizePinFact;

export type AnchorProgram = { axes: [AnchorFact[], AnchorFact[]] };

export const emptyAnchorProgram = (): AnchorProgram => ({ axes: [[], []] });

/** A concrete anchor on one node axis. Datum coordinates have already been
 *  elaborated through the layer's scale before facts are emitted, so the raw
 *  placement algebra is numeric. */
export type AnchorExpr = {
  node: NodeId;
  axis: Axis;
  anchor: AlignAnchor;
};

export type PlacementAnchorRef = {
  name: NodeId;
  anchor: AlignAnchor;
};

export type PlacementRelationRequest = {
  axis: Axis;
  from: PlacementAnchorRef;
  to: PlacementAnchorRef;
  gap: number;
  owner: string;
};

export type PlacementParticipantRequest = {
  axis: Axis;
  name: NodeId;
  owner: string;
};

export type PlacementPinRequest = {
  axis: Axis;
  target: PlacementAnchorRef;
  value: number;
  owner: string;
};

/** Request a size-only equation on `name` (#726, align `"size"`) — see
 *  {@link SizePinFact}. */
export type PlacementSizePinRequest = {
  axis: Axis;
  name: NodeId;
  value: number;
  owner: string;
};

export type PlacementParticipant = {
  type: "participant";
  name: NodeId;
  axis: Axis;
  owner: string;
};

/** A relation reduced to `min`-anchored form: `to.min = from.min + offset`,
 *  after the solver substitutes each endpoint's anchor offset post-closure. The
 *  shared difference graph consumes these. */
export type PlacementRelation = {
  type: "relation";
  from: AnchorExpr;
  to: AnchorExpr;
  offset: number;
  owner: string;
};

/** The lowering interface: constraints emit anchor pins, relations, and
 *  participants without pre-evaluating any offset (that is the solver's job). */
export interface PlacementFactEmitter {
  pin(request: PlacementPinRequest): void;
  include(request: PlacementParticipantRequest): void;
  relate(request: PlacementRelationRequest): void;
  pinSize(request: PlacementSizePinRequest): void;
}

export const anchorExpr = (
  node: NodeId,
  axis: Axis,
  anchor: AlignAnchor
): AnchorExpr => ({ node, axis, anchor });

export const relationFact = (
  from: AnchorExpr,
  to: AnchorExpr,
  offset: number,
  owner: string
): PlacementRelation => ({ type: "relation", from, to, offset, owner });

export const participantFact = (
  name: NodeId,
  axis: Axis,
  owner: string
): PlacementParticipant => ({ type: "participant", name, axis, owner });
