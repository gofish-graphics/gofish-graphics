import { connect, ref } from "gofish-graphics";
import type { HierarchyNode } from "d3-hierarchy";
import type { LinkOptions, LinkSpec } from "./spec";
import { nodePath, toDatum } from "./data";

const DEFAULTS: Required<
  Pick<LinkOptions, "interpolation" | "stroke" | "strokeWidth">
> = {
  interpolation: "linear",
  stroke: "gray",
  strokeWidth: 1,
};

const M2_INTERPOLATIONS = new Set(["orthogonal", "arc"]);

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
  const interpolation = opts.interpolation ?? DEFAULTS.interpolation;
  if (M2_INTERPOLATIONS.has(interpolation)) {
    throw new Error(
      `gofish-gotree: link interpolation '${interpolation}' is M4+ and not yet implemented`
    );
  }
  return connect(
    {
      mode: "center",
      interpolation: interpolation as "linear" | "bezier",
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
