/**
 * THROWAWAY PROTOTYPE for #1266 (React wrapper). See convert.ts for the
 * approach and its limits. Not published; the JSX spelling is not signed off.
 */
export * from "./components";
export { toGoFish, flatten } from "./convert";
export { displayListOf, GoFishRoot } from "./render";
export { DisplayListSVG } from "./DisplayListSVG";
// The fluent API from the same gofish-graphics module instance the components
// use (spelling B mixes fluent values into JSX; two module instances would
// break `instanceof` checks and the name registries).
export * from "gofish-graphics";
