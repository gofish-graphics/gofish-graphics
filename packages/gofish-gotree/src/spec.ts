import type { Mark } from "gofish-graphics";
import type { HierarchyNode } from "d3-hierarchy";

export type Alignment = "start" | "middle" | "end" | "baseline";

export type Rel =
  | { type: "spread"; dir: "x" | "y"; spacing?: number; alignment?: Alignment }
  | { type: "nest"; dir: "x" | "y"; padding?: number; fill?: boolean }
  | { type: "align"; dir: "x" | "y"; alignment: Alignment };

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
  parentChild?: Rel | Rel[];
  sibling?: Rel | Rel[];
  mode?: "topDown" | "bottomUp";
  sortBy?: (d: HierarchyDatum) => number;
  coord?: unknown;
};

export type TreeData =
  | { name?: string; value?: number; children?: TreeData[]; [k: string]: any }
  | HierarchyNode<any>;
