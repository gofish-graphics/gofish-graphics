/**
 * GoFish reactive interaction layer — signals live OUTSIDE the layout
 * pipeline (which stays synchronous and signal-free); the read LOCATION of an
 * input decides whether a change patches paint reactively or re-runs the whole
 * pipeline. See apps/docs/docs/internals/frontend/reactivity.md.
 *
 * Public surface (re-exported from lib.ts): `live`, `pointer`, `drag`,
 * `wheel`, `timer`, `signal`.
 */
export { live, isLive } from "./live";
export type { LiveValue } from "./live";
export { pointer, drag, wheel, timer, signal } from "./inputs";
export type {
  Pointer,
  Drag,
  DragOptions,
  Wheel,
  WheelOptions,
  Timer,
  TimerOptions,
  Signal,
} from "./inputs";
export { InteractionRuntime } from "./runtime";
export {
  withInteractiveResolve,
  ambientRegistrar,
  inLiveEval,
  runInLiveEval,
} from "./resolveContext";
export type { AmbientRegistrar } from "./resolveContext";
export { frameConversions, invertAffine } from "./frameScales";
export type { FrameConversions } from "./frameScales";
export { getLiveSlots, setLiveSlots } from "./liveSlots";
export type { LiveSlots } from "./liveSlots";
export type {
  Hit,
  InputPrimitive,
  InteractionEventType,
  InteractionFrame,
  SpecInvalidator,
  SvgPoint,
} from "./types";
