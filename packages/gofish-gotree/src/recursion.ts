import { spread } from "gofish-graphics";
import type { HierarchyNode } from "d3-hierarchy";
import type { Alignment, GoTreeSpec, Rel } from "./spec";
import { nodePath, toDatum } from "./data";

type ResolvedSpread = {
  dir: "x" | "y";
  spacing: number;
  alignment: Alignment;
};

const PARENT_CHILD_DEFAULT: ResolvedSpread = {
  dir: "y",
  spacing: 32,
  alignment: "middle",
};
const SIBLING_DEFAULT: ResolvedSpread = {
  dir: "x",
  spacing: 16,
  alignment: "start",
};

function resolveRel(
  rel: Rel | Rel[] | undefined,
  fallback: ResolvedSpread,
  defaultSpacing: number
): ResolvedSpread {
  const rels = rel ? (Array.isArray(rel) ? rel : [rel]) : [];
  const spreadRel = rels.find((r) => r.type === "spread");
  const alignRel = rels.find((r) => r.type === "align");
  const nestRel = rels.find((r) => r.type === "nest");

  if (nestRel) {
    throw new Error(
      "gofish-gotree: 'nest' relation is M2+ and not yet implemented. Use 'spread' relations for M1."
    );
  }
  if (!spreadRel && !alignRel) return fallback;

  if (spreadRel && spreadRel.type === "spread") {
    return {
      dir: spreadRel.dir,
      spacing: spreadRel.spacing ?? defaultSpacing,
      alignment:
        spreadRel.alignment ??
        (alignRel?.type === "align" ? alignRel.alignment : fallback.alignment),
    };
  }
  // Only an `align` rel: synthesize a spread on the orthogonal axis with that alignment.
  if (alignRel && alignRel.type === "align") {
    return {
      dir: alignRel.dir === "x" ? "y" : "x",
      spacing: defaultSpacing,
      alignment: alignRel.alignment,
    };
  }
  return fallback;
}

const nameMark = (mark: any, pathName: string) => {
  if (mark && typeof mark.name === "function") return mark.name(pathName);
  return mark;
};

export function renderSubtree(node: HierarchyNode<any>, spec: GoTreeSpec): any {
  const datum = toDatum(node);
  const pathName = nodePath(node);
  const nodeMark = nameMark(spec.node!(datum), pathName);

  if (!node.children?.length) return nodeMark;

  const kids = node.children.map((c) => renderSubtree(c, spec));

  const sib = resolveRel(spec.sibling, SIBLING_DEFAULT, 16);
  const childGroup = spread(
    {
      dir: sib.dir,
      spacing: sib.spacing,
      alignment: sib.alignment,
    },
    kids
  );

  const pc = resolveRel(spec.parentChild, PARENT_CHILD_DEFAULT, 32);
  // GoFish is y-up: the first child of spreadY lands at low y (bottom of screen).
  // For visually conventional trees (parent at top for vertical, parent at left for
  // horizontal), pick the order accordingly. `mode` is the GoTree sizing-direction
  // knob and doesn't affect visual orientation; it'll route to size/intrinsic-dim
  // wiring in M5.
  const orderedChildren =
    pc.dir === "y" ? [childGroup, nodeMark] : [nodeMark, childGroup];

  return spread(
    {
      dir: pc.dir,
      spacing: pc.spacing,
      alignment: pc.alignment,
    },
    orderedChildren
  );
}
