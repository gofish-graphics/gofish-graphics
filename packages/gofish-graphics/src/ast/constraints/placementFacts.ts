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

/** An anchor on a part: a box anchor ({@link AlignAnchor}), or one end of a
 *  part as a stack lays it (#773). A part's `tail` is where its baseline
 *  sits, or its `start` when it has no data baseline. Its `head` is the tail
 *  moved by `ascent − descent`, which is the point as far from its `end` as
 *  the tail is from its `start`. A positive bar's tail is its start and its
 *  head its end; a negative bar's are the other way round. The offsets are
 *  `anchorOffset` (placementProgramLowerer.ts). */
export type RelationAnchor = AlignAnchor | "tail" | "head";

export type AnchorRef = { node: NodeId; anchor: RelationAnchor };

export type AnchorPinFact<T = number> = {
  type: "anchor-pin";
  node: NodeId;
  axis: Axis;
  anchor: AlignAnchor;
  value: T;
  owner: string;
};

export type AnchorRelationFact<T = number> = {
  type: "anchor-relation";
  axis: Axis;
  from: AnchorRef;
  to: AnchorRef;
  gap: T;
  owner: string;
  /** Set on an edge of a spread's chain. The chain places its members
   *  along the axis, so the free origin seats none of their baselines, and
   *  a chain with no pin starts at its first member (the sequence origin).
   *  A spread packs boxes and has no baseline, so a component holding one
   *  is never seated by the free origin unless the spread states its 0. (A
   *  stack has no chain: it places each part by its data offset, a
   *  {@link StackPoint} `tail`.) */
  chain?: boolean;
};

export type AnchorParticipantFact<T = number> = {
  type: "anchor-participant";
  node: NodeId;
  axis: Axis;
  owner: string;
  /** Set when this participant carries the 0 of a chain (#773, #984): each
   *  part of a stack, or the part of a spread that states one, from its
   *  `StackBaseline` (distribute.ts). The solver's free-origin fallback
   *  seats that point. */
  origin?: StackPoint<T>;
};

/**
 * Where a chain's 0 is, on the participant that carries it: a point on the
 * participant (a fraction of the way from its `tail` to its `head`, or one
 * of its anchors, `"baseline"` being its tail), a place `along` the whole
 * chain, a fraction of the way along its {@link ChainPath}, whose first part
 * is the participant, or `tail` before the participant's tail. The last is
 * a stack's part: its tail lies its data offset from the stack's 0, times σ
 * (`stackPlaces` in distribute.ts), so the 0 is that far before it.
 */
export type StackPoint<T = number> =
  | { point: number | "start" | "middle" | "end" | "baseline" }
  | { along: number; chain: ChainPath<T> }
  | { tail: T };

/**
 * A chain from its start to its end: its `parts` in placement order, from
 * the `start` anchor of the first part to the `end` anchor of the last. On
 * the way each part is entered at `to` and left at `from`, the anchors the
 * chain's edges tie, and `gap` lies between neighbors. A spread runs from
 * its first part's start to its last part's end, and its gaps are part of
 * the way. One part on its own runs from its tail to its head.
 */
export type ChainPath<T = number> = {
  parts: readonly NodeId[];
  start: RelationAnchor;
  end: RelationAnchor;
  from: RelationAnchor;
  to: RelationAnchor;
  gap?: T;
};

/** A size-cell equation independent of any anchor (#726, align `"size"`): the
 *  target's `size` box key := `value`, with no coupling to `min`/`max`/`center`.
 *  Consumed directly by `closeSizes` — it feeds the SAME per-node `BBox` an
 *  anchor pin would, so it combines with a companion anchor pin (from another
 *  constraint or an authoritative position pin) to reach rank 2, but alone it
 *  stays under-determined for POSITION (by design — "size" must not move the
 *  target) while still being read back by `reduceToAxisProblem`'s strong-size
 *  substitution. */
export type SizePinFact<T = number> = {
  type: "size-pin";
  node: NodeId;
  axis: Axis;
  value: T;
  owner: string;
};

export type AnchorFact<T = number> =
  | AnchorPinFact<T>
  | AnchorRelationFact<T>
  | AnchorParticipantFact<T>
  | SizePinFact<T>;

export type AnchorProgram<T = number> = {
  axes: [AnchorFact<T>[], AnchorFact<T>[]];
};

export const emptyAnchorProgram = <T>(): AnchorProgram<T> => ({
  axes: [[], []],
});

/** A concrete anchor on one node axis. Datum coordinates have already been
 *  elaborated through the layer's scale before facts are emitted, so the
 *  placement algebra holds pixels: numbers, or values in σ when the claim
 *  walk solves with σ unknown (`Arith`, solver/arith.ts). */
export type AnchorExpr = {
  node: NodeId;
  axis: Axis;
  anchor: AlignAnchor;
};

export type PlacementAnchorRef = {
  key: NodeId;
  anchor: AlignAnchor;
};

export type PlacementRelationRequest<T = number> = {
  axis: Axis;
  from: { key: NodeId; anchor: RelationAnchor };
  to: { key: NodeId; anchor: RelationAnchor };
  gap: T;
  owner: string;
  /** See {@link AnchorRelationFact.chain}. */
  chain?: boolean;
};

export type PlacementParticipantRequest<T = number> = {
  axis: Axis;
  key: NodeId;
  owner: string;
  /** See {@link AnchorParticipantFact.origin}. */
  origin?: StackPoint<T>;
};

export type PlacementPinRequest<T = number> = {
  axis: Axis;
  target: PlacementAnchorRef;
  value: T;
  owner: string;
};

/** Request a size-only equation on `key` (#726, align `"size"`) — see
 *  {@link SizePinFact}. */
export type PlacementSizePinRequest<T = number> = {
  axis: Axis;
  key: NodeId;
  value: T;
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
export type PlacementRelation<T = number> = {
  type: "relation";
  from: AnchorExpr;
  to: AnchorExpr;
  offset: T;
  owner: string;
  /** See {@link AnchorRelationFact.chain}. */
  chain?: boolean;
};

/** The lowering interface: constraints emit anchor pins, relations, and
 *  participants without pre-evaluating any offset (that is the solver's job). */
export interface PlacementFactEmitter<T = number> {
  pin(request: PlacementPinRequest<T>): void;
  include(request: PlacementParticipantRequest<T>): void;
  relate(request: PlacementRelationRequest<T>): void;
  pinSize(request: PlacementSizePinRequest<T>): void;
}

export const anchorExpr = (
  node: NodeId,
  axis: Axis,
  anchor: AlignAnchor
): AnchorExpr => ({ node, axis, anchor });

export const relationFact = <T>(
  from: AnchorExpr,
  to: AnchorExpr,
  offset: T,
  owner: string,
  chain?: boolean
): PlacementRelation<T> => ({
  type: "relation",
  from,
  to,
  offset,
  owner,
  chain,
});

export const participantFact = (
  name: NodeId,
  axis: Axis,
  owner: string
): PlacementParticipant => ({ type: "participant", name, axis, owner });
