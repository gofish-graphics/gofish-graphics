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

/** Stable policy order for weak pins. Strong facts do not consult ranks. */
export type WeakRank = [number, number, number, string];

export type PlacementPin = {
  type: "pin";
  expr: AnchorExpr;
  value: number;
  owner: string;
};

export type PlacementWeakPin = {
  type: "weak-pin";
  expr: AnchorExpr;
  value: number;
  rank: WeakRank;
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
  | PlacementWeakPin
  | PlacementRelation
  | PlacementEdgePin;

export type PlacementProgram = {
  axes: [PlacementFact[], PlacementFact[]];
};

export interface PlacementFactEmitter {
  pin(
    axis: Axis,
    name: NodeId,
    anchor: AlignAnchor,
    value: number,
    owner: string
  ): void;
  weakPin(
    axis: Axis,
    name: NodeId,
    anchor: AlignAnchor,
    value: number,
    kindRank: number,
    arityRank: number,
    anchorRank: number,
    signature: string,
    owner: string
  ): void;
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

export const weakPinFact = (
  expr: AnchorExpr,
  value: number,
  rank: WeakRank,
  owner: string
): PlacementWeakPin => ({ type: "weak-pin", expr, value, rank, owner });

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
