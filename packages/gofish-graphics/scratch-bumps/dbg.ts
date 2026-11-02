// SCRATCH: members near a point, and the rings there
import { writeFileSync } from "node:fs";
import { loadDump } from "./round3";
import {
  closingRings,
  setArcsSampling,
} from "../src/ast/graphicalOperators/enclose/arcs";
import { nearLinks } from "../src/ast/graphicalOperators/enclose/unified";
setArcsSampling(true);
const [name, xs, ys, rs, ps] = process.argv.slice(2);
const c = loadDump(name)[0];
const M = c.members as any[];
const [x, y, r, pad] = [+xs, +ys, +(rs ?? 12), +(ps ?? c.padding)];
for (const m of M) {
  const d = Math.hypot(m.cx - x, m.cy - y);
  if (d < 50)
    console.log(
      "member",
      m.cx.toFixed(2),
      m.cy.toFixed(2),
      m.r,
      "dist",
      d.toFixed(1)
    );
}
const rings = closingRings(M, pad, r);
const L = nearLinks(M, pad, r);
console.log("links", L.length, JSON.stringify(L.slice(0, 2)));
const r2 = closingRings([...M, ...L], pad, r);
console.log("loops without", rings.length, "with", r2.length);
for (const l of L as any[])
  if (Math.hypot(l.a[0] - x, l.a[1] - y) < 50)
    console.log(
      "link",
      l.a.map((v: number) => v.toFixed(1)),
      l.b.map((v: number) => v.toFixed(1))
    );
{
  // an SVG zoom (8x) of 60 px around (x, y)
  const S = 8,
    W = 60;
  const tx = (p: number[]) => [(p[0] - x + W / 2) * S, (p[1] - y + W / 2) * S];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${W * S}"><rect width="100%" height="100%" fill="white"/>`;
  for (const ring of r2)
    svg += `<path d="M${ring.map((p) => tx(p).join(",")).join("L")}Z" fill="#47b8a033" stroke="#0a6" stroke-width="1"/>`;
  for (const ring of rings)
    svg += `<path d="M${ring.map((p) => tx(p).join(",")).join("L")}Z" fill="none" stroke="#c00" stroke-width="1" stroke-dasharray="4 3"/>`;
  for (const m of M) {
    const [cx, cy] = tx([m.cx, m.cy]);
    svg += `<circle cx="${cx}" cy="${cy}" r="${m.r * S}" fill="#333"/><circle cx="${cx}" cy="${cy}" r="${(m.r + pad) * S}" fill="none" stroke="#999" stroke-dasharray="2 2"/>`;
  }
  for (const l of L as any[]) {
    const [a, b] = [tx(l.a), tx(l.b)];
    svg += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="blue" stroke-width="2"/>`;
  }
  svg += "</svg>";
  writeFileSync(new URL("./out/dbg.svg", import.meta.url).pathname, svg);
}
rings.forEach((ring, i) => {
  const near = ring.filter((p) => Math.hypot(p[0] - x, p[1] - y) < 6);
  if (near.length)
    console.log("ring", i, "len", ring.length, "near pts", near.length);
});
