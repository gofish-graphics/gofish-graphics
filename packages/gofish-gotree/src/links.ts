import {
  connect,
  ref,
  straight,
  bezier,
  orthogonal,
  arc,
  type Route,
} from "gofish-graphics";
import type { HierarchyNode } from "d3-hierarchy";
import type { LinkOptions, LinkSpec } from "./spec";
import { nodePath, toDatum } from "./data";

const DEFAULTS: Required<
  Pick<LinkOptions, "route" | "stroke" | "strokeWidth">
> = {
  route: "straight",
  stroke: "gray",
  strokeWidth: 1,
};

// GoTree's Link style → a GoFish layout-time route factory.
const ROUTE_FOR: Record<NonNullable<LinkOptions["route"]>, () => Route> = {
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
  targetPath: string
): any {
  const route = opts.route ?? DEFAULTS.route;
  return connect(
    {
      mode: "center",
      route: ROUTE_FOR[route](),
      // connect's default `fill` falls back to children[0].color ?? "black".
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
  link: LinkSpec | undefined
): any[] {
  if (link === "none") return [];
  const edges: any[] = [];
  root.each((node) => {
    if (!node.children) return;
    for (const child of node.children) {
      const opts = resolveLinkOptions(link, node, child);
      if (opts === null) continue;
      edges.push(linkMark(opts, nodePath(node), nodePath(child)));
    }
  });
  return edges;
}
