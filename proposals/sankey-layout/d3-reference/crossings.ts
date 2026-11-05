// Count link crossings (node-center approximation, links with the same
// source and target columns only) for each prototype layout and for d3.
import fs from "node:fs";
import {
  layers,
  relax,
  barycenterOrder,
  type Link,
} from "../../../packages/gofish-graphics/stories/_proposals/sankey-layout/_proto";
import {
  energyNames,
  energyLinks,
  smallNames,
  smallLinks,
} from "../../../packages/gofish-graphics/stories/_proposals/sankey-layout/data";

const count = (
  links: Link[],
  layer: Map<string, number>,
  y: Map<string, number>
) => {
  let n = 0;
  let w = 0;
  for (let i = 0; i < links.length; i++)
    for (let j = i + 1; j < links.length; j++) {
      const a = links[i],
        b = links[j];
      if (
        layer.get(a.source) !== layer.get(b.source) ||
        layer.get(a.target) !== layer.get(b.target)
      )
        continue;
      if (a.source === b.source || a.target === b.target) continue;
      if (
        (y.get(a.source)! - y.get(b.source)!) *
          (y.get(a.target)! - y.get(b.target)!) <
        0
      ) {
        n++;
        w += a.value * b.value;
      }
    }
  const slope = links.reduce(
    (s, l) => s + l.value * Math.abs(y.get(l.target)! - y.get(l.source)!),
    0
  );
  return `${n} crossings (weight ${w.toFixed(0)}), value-weighted |dy| ${slope.toFixed(0)}`;
};
for (const [name, names, links, h] of [
  ["energy", energyNames, energyLinks, 600],
  ["small", smallNames, smallLinks, 300],
] as const) {
  const col = layers(names as any, links as any, "justify");
  const ident = new Map((names as string[]).map((n, i) => [n, i]));
  console.log(name, "A input order   ", count(links as any, col, ident));
  console.log(
    name,
    "A barycenter    ",
    count(links as any, col, barycenterOrder(names as any, links as any, col))
  );
  for (const interleave of [true, false]) {
    const { box } = relax(names as any, links as any, col, {
      height: h,
      padding: 10,
      interleave,
    });
    console.log(
      name,
      `B interleave=${interleave}`.padEnd(16),
      count(
        links as any,
        col,
        new Map([...box].map(([k, b]) => [k, (b.y0 + b.y1) / 2]))
      )
    );
  }
  for (const ref of ["", "-no-relax"]) {
    const d3 = JSON.parse(
      fs.readFileSync(
        `tests/tmp/sankey-proposal/out/d3-${name}${ref}.json`,
        "utf8"
      )
    );
    console.log(
      name,
      `d3-sankey${ref}`.padEnd(16),
      count(
        links as any,
        col,
        new Map(d3.map((n: any) => [n.name, (n.y0 + n.y1) / 2]))
      )
    );
  }
}
