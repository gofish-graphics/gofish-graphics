// SCRATCH: piece/curvature report for the CA_Proto_ArcsSpine24 outline.
import { load } from "./load";
import { curvature, classify, pieces } from "./analyze";
import {
  arcsOutline,
  ARCS_PROTOTYPE,
  spineLinks,
} from "../src/ast/graphicalOperators/enclose/arcs";
import type { Pt } from "../src/ast/graphicalOperators/enclose/blob";

const { members } = load(process.argv[2]);
const pad = 6,
  radius = +(process.argv[3] ?? 24);
ARCS_PROTOTYPE.spine = process.argv[4] === "none" ? undefined : 0;
const ring = arcsOutline(members, { padding: pad, radius }).sort(
  (a, b) => b.length - a.length
)[0];
const links = spineLinks(members, 0).map(
  (m: any) => [m.a, m.b, m.w] as [Pt, Pt, number]
);
const ms = members as any[];
const kap = curvature(ring);
const cls = classify(ring, ms, pad, radius, links);
const ps = pieces(ring, cls, kap);
const OX = 20; // png = html + (20, 0)
for (const p of ps)
  console.log(
    p.kind.padEnd(5),
    `png(${(p.mid[0] + OX).toFixed(0)},${p.mid[1].toFixed(0)})`,
    `len ${p.len.toFixed(1)}`.padEnd(10),
    `turn ${((p.turn * 180) / Math.PI).toFixed(1)}°`.padEnd(13),
    `R ${(1 / p.kappa).toFixed(1)}`
  );
