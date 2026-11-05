// Round 2 numbers: ribbon overlap before/after link-driven column gaps, and
// tree breadths under box nesting, contour packing and the cluster rule.
// Run from packages/gofish-graphics: pnpm exec tsx ../../proposals/sankey-layout/d3-reference/r2-metrics.ts
import fs from "node:fs";
import {
  layeredGeometry,
  gapsFromLinks,
  ribbonMetrics,
  flatTree,
  boxTree,
  contourTree,
  clusterTree,
  layers,
  extent,
  type LayeredOptions,
  type Link,
  type TreeNode,
} from "../../../packages/gofish-graphics/stories/_proposals/sankey-layout/_proto";
import fs from "node:fs";
import {
  energyNames,
  energyLinks,
  smallNames,
  smallLinks,
  flare,
} from "../../../packages/gofish-graphics/stories/_proposals/sankey-layout/data";

const opts = (
  w: number,
  h: number,
  coordinates: "stack" | "relax"
): LayeredOptions => ({
  w: w - 160,
  h,
  layering: "justify",
  ordering: "barycenter",
  coordinates,
  spacing: 10,
  nodeSize: "value",
  nodeWidth: 12,
});

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
for (const [name, names, links, w, h] of [
  ["energy", energyNames, energyLinks, 960, 600],
  ["small", smallNames, smallLinks, 480, 300],
] as [string, string[], Link[], number, number][]) {
  for (const coordinates of ["stack", "relax"] as const)
    for (const rule of ["steepest", "sum"] as const) {
      const o = opts(w, h, coordinates);
      const even = layeredGeometry(names, links, o);
      const { colX, need } = gapsFromLinks(even, {
        w: o.w,
        nodeWidth: 12,
        minGap: 30,
        rule,
      });
      const fitted = layeredGeometry(names, links, { ...o, colX });
      const a = ribbonMetrics(even, 12);
      const b = ribbonMetrics(fitted, 12);
      console.log(
        `${name} ${coordinates} ${rule}: overplot ${fmt(a.overplot)} -> ${fmt(b.overplot)} px² ` +
          `(${((100 * a.overplot) / a.ribbonArea).toFixed(1)}% -> ${((100 * b.overplot) / b.ribbonArea).toFixed(1)}% of ribbon area, ` +
          `${(100 * (1 - b.overplot / a.overplot)).toFixed(0)}% less); behind nodes ${fmt(a.behind)} -> ${fmt(b.behind)}; ` +
          `max slope ${a.maxSlope.toFixed(2)} -> ${b.maxSlope.toFixed(2)}; ` +
          `thinning ${(100 * a.thinning).toFixed(1)}% -> ${(100 * b.thinning).toFixed(1)}%`
      );
      console.log(
        `   need ${need.map((n) => n.toFixed(0)).join(" ")}  gaps ${colX
          .slice(1)
          .map((x, i) => (x - colX[i] - 12).toFixed(0))
          .join(
            " "
          )} (even ${((o.w - 12 * colX.length) / (colX.length - 1)).toFixed(0)})`
      );
    }
}

// Overlap by y placement alone (even columns): data order, barycenter, relaxed.
for (const [name, names, links, w, h] of [
  ["energy", energyNames, energyLinks, 960, 600],
  ["small", smallNames, smallLinks, 480, 300],
] as [string, string[], Link[], number, number][]) {
  const row = (label: string, o: LayeredOptions) => {
    const m = ribbonMetrics(layeredGeometry(names, links, o), 12);
    return `${label} ${((100 * m.overplot) / m.ribbonArea).toFixed(1)}% (behind nodes ${fmt(m.behind)} px², max slope ${m.maxSlope.toFixed(2)})`;
  };
  console.log(
    `${name} overplot by y placement: ` +
      [
        row("data order", { ...opts(w, h, "stack"), ordering: "input" }),
        row("barycenter", opts(w, h, "stack")),
        row("relaxed", opts(w, h, "relax")),
      ].join("; ")
  );
}

const size = 8;
const gap = 6;
const tree = (label: string, root: TreeNode) => {
  const t = flatTree(root);
  const box = extent(boxTree(t, size, gap), size);
  const contour = extent(contourTree(t, size, gap), size);
  const { y: cy, layer } = clusterTree(t, size, gap);
  const cluster = extent(cy, size);
  // flat A: each column stacked and centered on its own
  const cols = new Map<number, number>();
  for (const n of t.names)
    cols.set(t.depth.get(n)!, (cols.get(t.depth.get(n)!) ?? 0) + 1);
  const flatA = Math.max(...cols.values()) * (size + gap) - gap;
  console.log(
    `${label} (${t.names.length} nodes): breadth box ${box}, contour ${contour} (${(100 * (1 - contour / box)).toFixed(0)}% less), cluster ${cluster}, flat A ${flatA}`
  );
  const roots = contourTree(t, size, gap, "roots");
  const boxC = contourTree(t, size, gap, "box");
  const moved = t.names.filter(
    (n) => Math.abs(roots.get(n)! - boxC.get(n)!) > 0.5
  );
  console.log(
    `   contour packing + centered on the children's outline (spread alignment "middle"): breadth ${extent(boxC, size)}, ` +
      `${moved.length} nodes differ from RT (max ${Math.max(...t.names.map((n) => Math.abs(roots.get(n)! - boxC.get(n)!))).toFixed(0)} px)`
  );
  // against d3 (written by r2-render-d3-tree.mjs, flare only)
  for (const [file, ours] of [
    ["d3-tree", roots],
    ["d3-cluster", cy],
  ] as const) {
    const p = `../../tests/tmp/sankey-proposal/out/${file}.json`;
    if (label !== "flare subset" || !fs.existsSync(p)) continue;
    const d3: Record<string, number> = JSON.parse(fs.readFileSync(p, "utf8"));
    const err = Math.max(...t.names.map((n) => Math.abs(d3[n] - ours.get(n)!)));
    console.log(`   ${file} vs stand-in: max |Δy| ${err.toFixed(2)} px`);
  }
  const justify = layers(t.names, t.links, "justify");
  const right = layers(t.names, t.links, "right");
  const diff = (m: Map<string, number>) =>
    t.names.filter((n) => m.get(n) !== layer.get(n));
  console.log(
    `   cluster layer == Layering justify? differs at [${diff(justify).join(", ")}]`
  );
  console.log(
    `   cluster layer == Layering right (from sinks)? differs at [${diff(right).join(", ")}]`
  );
};
tree("flare subset", flare);

// The SankeyTree story's shape: titanic class → sex → survived (every path
// has the same depth), here with unit node sizes.
const titanic: TreeNode = {
  name: "all",
  children: ["First", "Second", "Third", "Crew"].map((c) => ({
    name: c,
    children: ["Female", "Male"].map((s) => ({
      name: `${c}-${s}`,
      children: ["Yes", "No"].map((v) => ({ name: `${c}-${s}-${v}` })),
    })),
  })),
};
tree("titanic sankey tree", titanic);
