// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Reactivity — /internals/frontend/reactivity
// </gofish-wiki>

/**
 * GoFish reactive interaction layer — signals live OUTSIDE the layout
 * pipeline (which stays synchronous and signal-free); the read LOCATION of an
 * input decides whether a change patches paint reactively or re-runs the whole
 * pipeline. See apps/docs/docs/internals/frontend/reactivity.md.
 *
 * Public surface (re-exported from lib.ts): `live`, `pointer`, `drag`,
 * `click`, `wheel`, `timer`, `signal`, plus the `slider` / `button` controls.
 */
export { live, isLive } from "./live";
export type { LiveValue } from "./live";
export { pointer, drag, click, wheel, timer, signal } from "./inputs";
export type {
  FrameBoxReader,
  Pointer,
  Drag,
  DragOptions,
  Click,
  ClickOptions,
  Wheel,
  WheelOptions,
  Timer,
  TimerOptions,
  TimerValues,
  Signal,
} from "./inputs";
export { slider, button } from "./widgets";
export type { Control, SliderOptions, ButtonOptions } from "./widgets";
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
  SvgBox,
  SvgPoint,
} from "./types";
