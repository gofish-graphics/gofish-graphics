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

export type PlacementSpan = {
  type: "span";
  name: NodeId;
  axis: Axis;
  min: number;
  max: number;
  owner: string;
};

export type PlacementFact =
  | PlacementPin
  | PlacementWeakPin
  | PlacementRelation
  | PlacementSpan;

export type PlacementProgram = {
  axes: [PlacementFact[], PlacementFact[]];
};

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

export const spanFact = (
  name: NodeId,
  axis: Axis,
  min: number,
  max: number,
  owner: string
): PlacementSpan => ({ type: "span", name, axis, min, max, owner });
