import { hierarchy } from "d3-hierarchy";
import type { HierarchyNode } from "d3-hierarchy";
import type { HierarchyDatum, TreeData } from "./spec";

const isHierarchyNode = (d: any): d is HierarchyNode<any> =>
  d != null &&
  typeof d === "object" &&
  "data" in d &&
  "depth" in d &&
  "height" in d;

export function normalize(data: TreeData): HierarchyNode<any> {
  if (isHierarchyNode(data)) return data;
  return hierarchy<any>(data, (d) => d?.children);
}

export function nodePath(node: HierarchyNode<any>): string {
  const segments: number[] = [];
  let curr: HierarchyNode<any> | null = node;
  while (curr && curr.parent) {
    const siblings = curr.parent.children ?? [];
    segments.unshift(siblings.indexOf(curr));
    curr = curr.parent;
  }
  return "root" + (segments.length ? "/" + segments.join("/") : "");
}

export function toDatum(node: HierarchyNode<any>): HierarchyDatum {
  return {
    data: node.data,
    depth: node.depth,
    height: node.height,
    value: node.value,
    width: node.leaves().length,
  };
}
