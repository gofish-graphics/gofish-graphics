// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Underlying Space — /internals/core/underlying-space
// </gofish-wiki>

import type { AlignAnchor, Axis } from "./shared";

export type NodeId = string;

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

export type PlacementPin = {
  type: "pin";
  expr: AnchorExpr;
  value: number;
  owner: string;
};

export type PlacementParticipant = {
  type: "participant";
  name: NodeId;
  axis: Axis;
  owner: string;
};

export type PlacementRelation = {
  type: "relation";
  /** `to = from + offset` after anchor offsets are evaluated. */
  from: AnchorExpr;
  to: AnchorExpr;
  offset: number;
  owner: string;
};

export type PlacementEdge = "min" | "max";

export type PlacementEdgePin = {
  type: "edge-pin";
  name: NodeId;
  axis: Axis;
  edge: PlacementEdge;
  value: number;
  owner: string;
};

export type PlacementFact =
  | PlacementPin
  | PlacementRelation
  | PlacementEdgePin
  | PlacementParticipant;

export type PlacementProgram = {
  axes: [PlacementFact[], PlacementFact[]];
};

export interface PlacementFactEmitter {
  pin(request: PlacementPinRequest): void;
  include(request: PlacementParticipantRequest): void;
  relate(request: PlacementRelationRequest): void;
}

export const emptyPlacementProgram = (): PlacementProgram => ({
  axes: [[], []],
});

export const anchorExpr = (
  node: NodeId,
  axis: Axis,
  anchor: AlignAnchor
): AnchorExpr => ({ node, axis, anchor });

export const pinFact = (
  expr: AnchorExpr,
  value: number,
  owner: string
): PlacementPin => ({ type: "pin", expr, value, owner });

export const relationFact = (
  from: AnchorExpr,
  to: AnchorExpr,
  offset: number,
  owner: string
): PlacementRelation => ({ type: "relation", from, to, offset, owner });

export const edgePinFact = (
  name: NodeId,
  axis: Axis,
  edge: PlacementEdge,
  value: number,
  owner: string
): PlacementEdgePin => ({ type: "edge-pin", name, axis, edge, value, owner });

export const participantFact = (
  name: NodeId,
  axis: Axis,
  owner: string
): PlacementParticipant => ({ type: "participant", name, axis, owner });
