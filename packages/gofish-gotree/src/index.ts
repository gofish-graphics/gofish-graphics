export { tree } from "./tree";
export {
  spread,
  nest,
  distribute,
  combine,
  perDepth,
  alternate,
} from "./helpers";
export type {
  SpreadOptions,
  NestOptions,
  DistributeOptions,
  CombineOptions,
  CombineAxis,
} from "./helpers";
export type {
  GoTreeSpec,
  NodeFactory,
  LinkSpec,
  LinkOptions,
  HierarchyDatum,
  Combiner,
  DepthCombiner,
  CombinerSpec,
  Alignment,
  TreeData,
} from "./spec";
// Python-bridge reconstruction (issue #792) — injected into gofish-graphics'
// deserializer as a `markBridges["gotree-tree"]` entry; see serialize.ts.
export { reconstructGotreeTree } from "./serialize";
export type { GotreeReconstructCtx } from "./serialize";
