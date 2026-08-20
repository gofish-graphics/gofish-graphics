// <gofish-wiki> AUTO-GENERATED — see covers: in the essay; run `pnpm --filter docs sync-backlinks`
// @wiki Frontend IR — /internals/frontend/serialization
// </gofish-wiki>

import type { Mark } from "gofish-graphics";
import type { HierarchyNode } from "d3-hierarchy";

export type Alignment = "start" | "middle" | "end" | "baseline";

/**
 * A `Combiner` is a function that takes an array of GoFish AST children and
 * returns a composed AST. The `parentChild` slot receives `[parent, group]`;
 * `sibling` receives the full children list. Users can pass any function with
 * this shape — the `spread()` and `nest()` helpers (re-exported from
 * `gofish-gotree`) are ergonomic conveniences but not the only option.
 *
 * The optional `growthDir` tag records the axis along which the combiner
 * separates parent from child (its distribute/spread direction). Links read it
 * to bend/curve along the tree's actual growth axis; it's absent when the axis
 * is ambiguous (e.g. a diagonal cascade that distributes on both axes) or when
 * the combiner is a user-supplied plain function.
 */
export type Combiner = ((children: any[]) => any) & {
  growthDir?: "x" | "y";
};

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

/**
 * `path` is the node's stable position key (`nodePath` in data.ts — index
 * chain from the root, e.g. `"root/0/1"`). It's an optional 2nd argument so
 * existing single-arg factories are unaffected; the Python-bridge
 * reconstruction (`gofish-gotree/src/serialize.ts`) needs it to key its
 * pre-expanded per-node Mark map (RPC-backed node templates must resolve
 * their lambdas before `tree()` runs, since this factory is called
 * synchronously from `renderSubtree`).
 */
export type NodeFactory = (datum: HierarchyDatum, path?: string) => Mark<any>;

export type LinkOptions = {
  // Screen-space path shape for the link (GoTree's `Link` element). Maps to a
  // GoFish `curve` of the same name (GoTree's "straight" link → `straight`,
  // "curve" → `bezier`).
  curve?: "straight" | "bezier" | "orthogonal" | "arc";
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
};

/**
 * `sourcePath`/`targetPath` are the endpoints' stable position keys
 * (`nodePath`) — optional trailing arguments for the same reason as
 * `NodeFactory`'s `path`: the Python-bridge reconstruction pre-resolves
 * lambda-backed link options per edge (keyed by these paths) before
 * `tree()`'s synchronous `collectEdges` walk runs.
 */
export type LinkSpec =
  | "none"
  | LinkOptions
  | ((
      source: HierarchyDatum,
      target: HierarchyDatum,
      sourcePath?: string,
      targetPath?: string
    ) => LinkOptions);

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
