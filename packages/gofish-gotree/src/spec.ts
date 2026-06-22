import type { Mark } from "gofish-graphics";
import type { HierarchyNode } from "d3-hierarchy";

export type Alignment = "start" | "middle" | "end" | "baseline";

/**
 * A `Combiner` is a function that takes an array of GoFish AST children and
 * returns a composed AST. The `parentChild` slot receives `[parent, group]`;
 * `sibling` receives the full children list. Users can pass any function with
 * this shape — the `spread()` and `nest()` helpers (re-exported from
 * `gofish-gotree`) are ergonomic conveniences but not the only option.
 */
export type Combiner = (children: any[]) => any;

/**
 * A depth-indexed combiner: picks a `Combiner` based on the depth of the subtree
 * being assembled. Used to express layouts that alternate their template by level
 * (H-tree, HV-drawing, slice-and-dice treemaps). Build one with `alternate(...)`
 * or `perDepth(...)`. It's a branded object (not a bare `(depth) => Combiner`)
 * so it stays distinguishable from a plain `Combiner` — both are unary functions.
 */
export type DepthCombiner = { atDepth: (depth: number) => Combiner };

/** Either a plain combiner (applied at every depth) or a depth-indexed one. */
export type CombinerSpec = Combiner | DepthCombiner;

export type HierarchyDatum = {
  data: any;
  depth: number;
  height: number;
  value?: number;
  width: number;
};

export type NodeFactory = (datum: HierarchyDatum) => Mark<any>;

export type LinkOptions = {
  interpolation?: "linear" | "bezier" | "orthogonal" | "arc";
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
};

export type LinkSpec =
  | "none"
  | LinkOptions
  | ((source: HierarchyDatum, target: HierarchyDatum) => LinkOptions);

export type GoTreeSpec = {
  node?: NodeFactory;
  link?: LinkSpec;
  /** Combiner for parent ↔ children-group. Called with `[parentMark, childGroup]`. May be depth-indexed. */
  parentChild?: CombinerSpec;
  /** Combiner for the sibling group. Called with the full children list. May be depth-indexed. */
  sibling?: CombinerSpec;
  mode?: "topDown" | "bottomUp";
  sortBy?: (d: HierarchyDatum) => number;
  coord?: unknown;
};

export type TreeData =
  | { name?: string; value?: number; children?: TreeData[]; [k: string]: any }
  | HierarchyNode<any>;
