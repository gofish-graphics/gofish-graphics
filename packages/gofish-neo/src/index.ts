/**
 * gofish-neo: a clean-room reimplementation of the Neo (Görtler et al.,
 * CHI 2022) hierarchical-confusion-matrix data algebra.
 *
 * This module (Part A/B of the package) exposes only the pure data algebra:
 * path parsing, the shared label tree, the condition/filter/linearize/
 * nest/marginalize pipeline, the dense matrix + block-sum queries,
 * normalization scaling, and classification measures. A renderer (a later
 * package addition) consumes `buildMatrix`'s `{ tree, matrix }`, the
 * `frontier()`/`leaves()` traversal utilities, `buildNormalizer`, and
 * `computeMeasure`.
 */

export {
  tokenize,
  parsePath,
  segments,
  dimension,
  isPathPrefix,
} from "./paths";
export type { Token, Chain } from "./paths";

export {
  buildLabelTree,
  isLeaf,
  preorder,
  postorder,
  leaves,
  frontier,
  findNode,
} from "./labelTree";
export type { TreeNode } from "./labelTree";

export {
  dimensions,
  normalizeRecords,
  condition,
  filter,
  linearize,
  linearizeRecords,
  nestPaths,
  nest,
  marginalize,
} from "./pipeline";
export type { Confusion, Condition, Cell } from "./pipeline";

export { buildMatrix, frequency, total, totalRow, totalColumn } from "./matrix";
export type { Matrix, Built } from "./matrix";

export { buildNormalizer } from "./normalize";
export type { Normalizer } from "./normalize";

export {
  truePositives,
  falsePositives,
  falseNegatives,
  trueNegatives,
  countActual,
  countObserved,
  precision,
  recall,
  accuracy,
  computeMeasure,
} from "./measures";
export type { Measure } from "./measures";

export { applyDefaults } from "./spec";
export type { NeoSpec, ResolvedNeoSpec, Normalization, Encoding } from "./spec";

export {
  confusionMatrix,
  DEFAULT_COLORS,
  ZERO_FILL,
  PALETTE_DEPTH,
} from "./confusionMatrix";
export type { ConfusionMatrixSpec } from "./confusionMatrix";
