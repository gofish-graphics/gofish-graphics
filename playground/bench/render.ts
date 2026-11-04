// SCRATCH: draw outlines of the playground's datasets to SVG, as the page draws them (scenery
// over the outlines, each set in its paint). CASES: a JSON list of { ds, name, opts, avoid? }
// (opts passed to unifiedOutline as they are, with the dataset's padding unless given; avoid:
// the dataset's keep-outs); OUTDIR: where the SVGs go. A case's opts may hold
// per-set overrides under "sets" (a list of opts).
//   BENCH=render CASES='[…]' OUTDIR=… node playground/bench.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  filletLinks,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";

type Pt = [number, number];
const f2 = (v: number) => v.toFixed(2);
const pathOf = (rings: Pt[][]) =>
  rings
    .filter((l) => l.length > 1)
    .map((l) => "M" + l.map((p) => `${f2(p[0])},${f2(p[1])}`).join("L") + "Z")
    .join("");
const cases = JSON.parse(process.env.CASES!) as {
  ds: string;
  name: string;
  opts: Record<string, unknown>;
  avoid?: boolean;
  crop?: number[];
  scale?: number;
  /** with avoid: draw the keep-out discs (dashed red) */
  keepouts?: boolean;
  /** draw the fillet's links (their axes, red) */
  links?: boolean;
}[];
const dir = process.env.OUTDIR!;
mkdirSync(dir, { recursive: true });
for (const c of cases) {
  const d = (DATA as any[]).find((x) => x.id === c.ds);
  let g = "";
  const t0 = performance.now();
  d.sets.forEach((s: any) => {
    const rings = unifiedOutline(s.members, {
      padding: d.padding,
      ...(c.avoid ? { avoiding: s.avoiding, clearance: d.clearance } : {}),
      ...c.opts,
    } as never) as Pt[][];
    const P = s.paint;
    g += `<path transform="matrix(1 0 0 ${s.T[2]} ${s.T[0]} ${s.T[1]})" d="${pathOf(rings)}" fill="${P.fill}" fill-opacity="${P.fillOpacity}" stroke="${P.stroke}" stroke-width="${Math.max(1, P.strokeWidth)}" stroke-linejoin="round"/>`;
    if (c.avoid && c.keepouts)
      for (const m of s.avoiding as any[])
        if (m.kind === "disc")
          g += `<circle transform="matrix(1 0 0 ${s.T[2]} ${s.T[0]} ${s.T[1]})" cx="${f2(m.cx)}" cy="${f2(m.cy)}" r="${f2(m.r + d.clearance)}" fill="none" stroke="#d62728" stroke-width="0.4" stroke-dasharray="1.5 1"/>`;
    if (c.links) {
      const o = c.opts as any;
      for (const L of filletLinks(
        s.members,
        (o.padding as number) ?? d.padding,
        o.radius ?? d.padding,
        o.neck ?? 0.5
      ) as any[])
        g += `<line transform="matrix(1 0 0 ${s.T[2]} ${s.T[0]} ${s.T[1]})" x1="${f2(L.a[0])}" y1="${f2(L.a[1])}" x2="${f2(L.b[0])}" y2="${f2(L.b[1])}" stroke="red" stroke-width="0.5"/>`;
    }
  });
  const ms = performance.now() - t0;
  const vb = c.crop ?? [-10, -10, d.width + 20, d.height + 20];
  const sc = c.scale ?? 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" width="${vb[2] * sc}" height="${vb[3] * sc}" style="background:#fff"><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#fff"/><g>${g}</g><g>${d.scenery}</g></svg>`;
  writeFileSync(`${dir}/${c.name}.svg`, svg);
  console.log(`${c.name}: ${ms.toFixed(0)} ms`);
}
