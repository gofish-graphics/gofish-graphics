// The Approach C stand-in wrapper, shared by Approach C and Round 2 stories.
// `layeredGeometry` computes every position; this emits placed marks.
import { layer, rect, ribbon, arrow, text, line, Curve } from "../../../src/lib";
import { layeredGeometry, type LayeredOptions, type Link } from "./_proto";

const palette = ["#4190c5", "#f2cf57", "#f39b72", "#58b38a", "#a98bd6", "#e56f8a", "#7fc3d6", "#c0a26b"];

// STAND-IN for the proposed `layered({ from, to, size, layering, ordering,
// coordinates, spacing }, { node, link })` operator.
export const layered = (names: string[], links: Link[], o: LayeredOptions, kind: "sankey" | "graph") => {
  const g = layeredGeometry(names, links, o);
  const color = (n: string) => palette[names.indexOf(n) % palette.length];
  const nw = o.nodeWidth;
  const marks: any[] = [];
  const rel: ((names: any) => any)[] = [];
  for (const n of g.nodes) {
    marks.push(rect({ x: n.x, y: n.y0, w: nw, h: Math.max(0.5, n.y1 - n.y0), fill: kind === "sankey" ? "#555" : "#f3f3f3", stroke: "#555", strokeWidth: kind === "sankey" ? 0 : 1 }).name(n.name));
    marks.push(kind === "sankey"
      ? text({ x: n.x + nw + 3, y: (n.y0 + n.y1) / 2 - 5, text: n.name, fontSize: 9 })
      : text({ x: n.x + 6, y: (n.y0 + n.y1) / 2 - 6, text: n.name, fontSize: 10 }));
  }
  for (const l of g.links) {
    const sx = g.nodes.find((n) => n.name === l.source)!.x + nw;
    const tx = g.nodes.find((n) => n.name === l.target)!.x;
    if (kind === "sankey") {
      marks.push(rect({ x: sx, y: l.out.y0, w: 0, h: l.out.y1 - l.out.y0 }).name(`o${l.i}`));
      marks.push(rect({ x: tx, y: l.in.y0, w: 0, h: l.in.y1 - l.in.y0 }).name(`i${l.i}`));
      rel.push((r) => ribbon({ dir: "x", fill: color(l.source), opacity: 0.4, curve: Curve.bezier() } as any, [r[`o${l.i}`], r[`i${l.i}`]]));
    } else {
      const vs = g.routes.get(l.i) ?? [];
      vs.forEach((v) => marks.push(rect({ x: v.x - 0.5, y: v.y - 0.5, w: 1, h: 1, fill: "none" }).name(v.name)));
      const last = vs.length ? vs[vs.length - 1].name : l.source;
      if (vs.length) {
        const s = g.nodes.find((n) => n.name === l.source)!;
        marks.push(rect({ x: sx + 2, y: (s.y0 + s.y1) / 2 - 0.5, w: 1, h: 1, fill: "none" }).name(`s${l.i}`));
        rel.push((r) => line({ stroke: "#777", strokeWidth: 1.5 } as any, [r[`s${l.i}`], ...vs.map((v) => r[v.name])]));
      }
      rel.push((r) => arrow({ stroke: "#777", strokeWidth: 1.5, bow: 0, stretch: 0, padStart: vs.length ? 0 : 2, padEnd: 4 } as any, [r[last], r[l.target]]));
    }
  }
  return layer(marks).relate((r: any) => rel.map((f) => f(r)));
};
