import {
  line,
  ref,
  straight,
  bezier,
  orthogonal,
  arc,
  type Curve,
} from "gofish-graphics";
import type { HierarchyNode } from "d3-hierarchy";
import type { GoTreeSpec, LinkOptions, LinkSpec } from "./spec";
import { nodePath, toDatum } from "./data";
import { growthDirAtDepth } from "./recursion";

const DEFAULTS: Required<
  Pick<LinkOptions, "curve" | "stroke" | "strokeWidth">
> = {
  curve: "straight",
  stroke: "gray",
  strokeWidth: 1,
};

// GoTree's Link style → a GoFish screen-space curve factory.
const CURVE_FOR: Record<NonNullable<LinkOptions["curve"]>, () => Curve> = {
  straight,
  bezier,
  orthogonal,
  arc,
};

function resolveLinkOptions(
  link: LinkSpec | undefined,
  sourceNode: HierarchyNode<any>,
  targetNode: HierarchyNode<any>
): LinkOptions | null {
  if (link === "none") return null;
  if (!link) return {};
  if (typeof link === "function") {
    return link(toDatum(sourceNode), toDatum(targetNode));
  }
  return link;
}

function linkMark(
  opts: LinkOptions,
  sourcePath: string,
  targetPath: string,
  growthDir: "x" | "y" | undefined
): any {
  const curveName = opts.curve ?? DEFAULTS.curve;
  // Bend/curve along the tree's growth axis: pass it as the connector's `dir`
  // so the orthogonal elbow (and bezier control points) fold on the axis the
  // tree actually grows along. When the growth axis is ambiguous (a diagonal
  // cascade), leave `dir` unset and let `orthogonal({ bend: "auto" })` infer the
  // bend from the endpoint geometry.
  const curve =
    curveName === "orthogonal" && growthDir === undefined
      ? orthogonal({ bend: "auto" })
      : CURVE_FOR[curveName]();
  return line(
    {
      curve,
      dir: growthDir,
      // The connector's default `fill` falls back to children[0].color ?? "black".
      // For a straight cartesian line that's invisible (fill area of a
      // zero-thickness line is zero), but under a polar coord transform the
      // line is resampled into an arc — and SVG fills the segment between
      // the arc and its implicit closing chord, producing wide filled bands.
      // Force fill: "none" so only the stroke renders.
      fill: "none",
      stroke: opts.stroke ?? DEFAULTS.stroke,
      strokeWidth: opts.strokeWidth ?? DEFAULTS.strokeWidth,
      opacity: opts.opacity,
    },
    [ref(sourcePath), ref(targetPath)]
  ).zOrder(-1);
}

export function collectEdges(
  root: HierarchyNode<any>,
  spec: GoTreeSpec
): any[] {
  const link = spec.link;
  if (link === "none") return [];
  const edges: any[] = [];
  root.each((node) => {
    if (!node.children) return;
    // The parent↔child combiner (and thus the growth axis) is resolved at the
    // parent's depth — matching how `renderSubtree` assembles that level.
    const growthDir = growthDirAtDepth(spec, node.depth);
    for (const child of node.children) {
      const opts = resolveLinkOptions(link, node, child);
      if (opts === null) continue;
      edges.push(linkMark(opts, nodePath(node), nodePath(child), growthDir));
    }
  });
  return edges;
}
