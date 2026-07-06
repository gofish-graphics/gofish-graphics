/**
 * GoFish interaction layer — Meros-style declarative interaction on the
 * GoFish substrate. See notes/design/interaction.md for the design.
 *
 * Kept out of `lib.ts` for now: the static path must stay zero-cost. Once the
 * surface settles this becomes the `gofish-graphics/interact` subpath export.
 */
export {
  when,
  isStateChannel,
  StateChannel,
  above,
  below,
  inside,
  insideCommitted,
  intersectsX,
} from "./states";
export type { StateCase, DeferredSelector } from "./states";
export { InteractionRuntime } from "./runtime";
export type { InteractCallback, InteractRefs } from "./runtime";
export { hover, hovered } from "./instruments/hover";
export type { HoverInstrument } from "./instruments/hover";
export { rule } from "./marks/rule";
export type { InteractiveRuleMark, RuleOptions } from "./marks/rule";
export { live, isLive } from "./live";
export type { LiveValue } from "./live";
export { drawWithTransform } from "./marks/brushRect";
export type { InteractiveBrushMark, DrawWithStyle } from "./marks/brushRect";
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
export { bind, Bind, executeBind, isBindSpec, invertAffine } from "./bindings";
export type {
  Anchor,
  BindSpec,
  RangeAnchor,
  ScalarAnchor,
  SetAnchor,
} from "./bindings";
export { from } from "./dataRef";
export type { DataRef } from "./dataRef";
export { param, iscale, wheel, wheelBind } from "./params";
export type {
  IScale,
  IScaleOptions,
  LiveNumber,
  LiveWheelOptions,
  Param,
  WheelBindOptions,
} from "./params";
export { withInteractiveResolve, ambientRegistrar } from "./resolveContext";
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
