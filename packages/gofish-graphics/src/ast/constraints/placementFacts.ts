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

/** An anchor a relation can tie: a box anchor ({@link AlignAnchor}), or one
 *  end of a part laid end to end along a stack (#773). A part's `tail` is
 *  where its baseline sits, or its `start` when it has no data baseline. Its
 *  `head` is the tail moved by `ascent − descent`, which is the point as far
 *  from its `end` as the tail is from its `start`. A positive bar's tail is
 *  its start and its head its end; a negative bar's are the other way round.
 *  The offsets are `anchorOffset` (placementProgramLowerer.ts). */
export type RelationAnchor = AlignAnchor | "tail" | "head";

export type AnchorRef = { node: NodeId; anchor: RelationAnchor };

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
  /** Set on an edge of a distribute chain. The chain places its members'
   *  baselines along the axis, so the free origin seats none of them but the
   *  stack's origin, and a chain with no pin starts at its first member (the
   *  sequence origin). */
  chain?: boolean;
};

export type AnchorParticipantFact = {
  type: "anchor-participant";
  node: NodeId;
  axis: Axis;
  owner: string;
  /** Set when this participant carries a stack's origin (#773, #984): the
   *  `fraction` of its `StackOrigin` (distribute.ts; 0 = the participant's
   *  `tail`).
   *  The solver's free-origin fallback seats that point. */
  origin?: number;
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
  from: { name: NodeId; anchor: RelationAnchor };
  to: { name: NodeId; anchor: RelationAnchor };
  gap: number;
  owner: string;
  /** See {@link AnchorRelationFact.chain}. */
  chain?: boolean;
};

export type PlacementParticipantRequest = {
  axis: Axis;
  name: NodeId;
  owner: string;
  /** See {@link AnchorParticipantFact.origin}. */
  origin?: number;
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
  /** See {@link AnchorRelationFact.chain}. */
  chain?: boolean;
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
  owner: string,
  chain?: boolean
): PlacementRelation => ({ type: "relation", from, to, offset, owner, chain });

export const participantFact = (
  name: NodeId,
  axis: Axis,
  owner: string
): PlacementParticipant => ({ type: "participant", name, axis, owner });
