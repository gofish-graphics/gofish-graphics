// SCRATCH: overlay outlines across convexity for one dataset as an SVG.  DS=chartaccent BENCH=sweepsvg node playground/bench.mjs > out.svg
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_STATS,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
const d = (DATA as any[]).find(
  (x) => x.id === (process.env.DS ?? "chartaccent")
);
const s = d.sets[0];
const cs = (
  process.env.C ??
  "0,0.05,0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.45,0.5,0.6,0.7,0.8,0.9,1"
)
  .split(",")
  .map(Number);
let paths = "";
const log: string[] = [];
cs.forEach((c, i) => {
  const rings = unifiedOutline(s.members, {
    padding: d.padding,
    convexity: c,
    neck: 1,
    connected: true,
    holes: false,
    avoiding: [],
    clearance: d.clearance,
  });
  log.push(`c ${c} r ${UNIFIED_STATS.radius?.toFixed(1)}`);
  const t = i / (cs.length - 1);
  const col = `hsl(${240 - 240 * t},70%,45%)`;
  paths += `<path d="${rings.map((l: any) => "M" + l.map((p: any) => p.join(",")).join("L") + "Z").join("")}" fill="none" stroke="${col}" stroke-width="1"/>`;
});
const T = s.T;
let dots = "";
for (const m of s.members)
  if (m.kind === "disc")
    dots += `<circle cx="${m.cx}" cy="${m.cy}" r="${m.r}" fill="#333"/>`;
console.error(log.join("\n"));
console.log(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${process.env.VB ?? "0 0 " + d.width + " " + d.height}" width="${d.width * 2}" height="${d.height * 2}"><rect x="-1000" y="-1000" width="4000" height="4000" fill="white"/><g transform="matrix(1 0 0 ${T[2]} ${T[0]} ${T[1]})">${dots}${paths}</g></svg>`
);
