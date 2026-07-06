/**
 * GoFish interaction layer — Meros-style declarative interaction on the
 * GoFish substrate. See notes/design/interaction.md for the design.
 *
 * Kept out of `lib.ts` for now: the static path must stay zero-cost. Once the
 * surface settles this becomes the `gofish-graphics/interact` subpath export.
 */
export { when, isStateChannel, StateChannel } from "./states";
export type { StateCase } from "./states";
export { InteractionRuntime } from "./runtime";
export { hover } from "./instruments/hover";
export type { HoverInstrument } from "./instruments/hover";
export { threshold } from "./instruments/threshold";
export type {
  ThresholdInstrument,
  ThresholdOptions,
} from "./instruments/threshold";
export { brush } from "./instruments/brush";
export type {
  BrushInstrument,
  BrushOptions,
  Extent2D,
} from "./instruments/brush";
export { overlayText } from "./instruments/overlayText";
export type { OverlayTextOptions } from "./instruments/overlayText";
export { xBands } from "./instruments/bands";
export type { BandsInstrument } from "./instruments/bands";
export { drag } from "./inputs";
export type { DragInput, DragOptions } from "./inputs";
export { bind, invertAffine } from "./bindings";
export type { Anchor, RangeAnchor, ScalarAnchor, SetAnchor } from "./bindings";
export { from } from "./dataRef";
export type { DataRef } from "./dataRef";
export { param, iscale, wheelBind } from "./params";
export type { IScale, IScaleOptions, Param, WheelBindOptions } from "./params";
export { frameConversions } from "./frameScales";
export type { FrameConversions } from "./frameScales";
export type {
  Hit,
  Instrument,
  InteractionEventType,
  InteractionFrame,
  ItemPatch,
  StatePredicate,
} from "./types";
