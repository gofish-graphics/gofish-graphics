// SCRATCH: per dataset, a convexity change timed with the old bisection and with the filtration
// (cold: empty cache; warm: the same member set just computed at another convexity), the radius
// each picks and the exact closed-area share it reaches; then a sweep of c for monotonicity.
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  UNIFIED_STATS,
  UNIFIED_PROTOTYPE,
  clearUnifiedCache,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import type { BlobMember } from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/blob";

type DS = {
  id: string;
  padding: number;
  story: any;
  sets: { members: BlobMember[] }[];
};
const DSS = DATA as unknown as DS[];
const ONLY = process.env.ONLY;
const CS = [0.1, 0.25, 0.5, 0.75];
const H = process.env.H ? +process.env.H : undefined;
UNIFIED_PROTOTYPE.h = H;
const call = (s: { members: BlobMember[] }, pad: number, c: number) => {
  const t0 = performance.now();
  unifiedOutline(s.members, {
    padding: pad,
    convexity: c,
    neck: 1,
    holes: process.env.HOLES === "1",
  });
  return { ms: performance.now() - t0, S: { ...UNIFIED_STATS } };
};
const f = (x: number, d = 2) => (x === Infinity ? "inf" : x.toFixed(d));
const table: string[] = [
  "| dataset | c | bisection ms | filtration cold ms (build) | warm ms (closing + cut/smooth) | r bisection → filtration | exact share bisection → filtration |",
  "|---|---|---|---|---|---|---|",
];
for (const d of DSS) {
  if (ONLY && d.id !== ONLY) continue;
  const pad = d.padding;
  for (const c of CS) {
    let msOld = 0,
      msCold = 0,
      msWarm = 0,
      msBuild = 0,
      wClose = 0,
      wSmooth = 0;
    const rs: string[] = [],
      shares: string[] = [];
    for (const s of d.sets) {
      UNIFIED_PROTOTYPE.search = "bisection";
      const old = call(s, pad, c);
      msOld += old.ms;
      UNIFIED_PROTOTYPE.search = "filtration";
      clearUnifiedCache();
      const cold = call(s, pad, c);
      msCold += cold.ms;
      msBuild += cold.S.msFiltration ?? 0;
      call(s, pad, c + 0.01);
      const warm = call(s, pad, c);
      msWarm += warm.ms;
      wClose += warm.S.msClose!;
      wSmooth += warm.S.msSmooth!;
      const A0 = old.S.areaUnion!,
        A1 = old.S.areaHull!;
      const sh = (a: number) => (a - A0) / (A1 - A0);
      rs.push(`${f(old.S.radius!, 1)}→${f(warm.S.radius!, 1)}`);
      shares.push(`${f(sh(old.S.areaGot!), 3)}→${f(sh(warm.S.areaGot!), 3)}`);
    }
    const cut = (xs: string[]) =>
      xs.slice(0, 3).join(", ") + (xs.length > 3 ? ", …" : "");
    table.push(
      `| ${d.id} | ${c} | ${msOld.toFixed(0)} | ${msCold.toFixed(0)} (${msBuild.toFixed(0)}) | ${msWarm.toFixed(0)} (${wClose.toFixed(0)} + ${wSmooth.toFixed(0)}) | ${cut(rs)} | ${cut(shares)} |`
    );
  }
  // monotone: r and the exact share over a sweep of c, per set
  UNIFIED_PROTOTYPE.search = "filtration";
  let worstR = 0,
    worstShare = 0;
  const maxDev: number[] = [];
  d.sets.forEach((s) => {
    UNIFIED_PROTOTYPE.search = "bisection";
    const old = call(s, pad, 0.5);
    UNIFIED_PROTOTYPE.search = "filtration";
    const A0 = old.S.areaUnion!,
      A1 = old.S.areaHull!;
    let pr = -Infinity,
      ps = -Infinity,
      dev = 0;
    for (let c = 0; c <= 1.0001; c += 0.02) {
      const { S } = call(s, pad, Math.min(1, c));
      const sh = (S.areaGot! - A0) / (A1 - A0);
      worstR = Math.max(worstR, pr - S.radius!);
      worstShare = Math.max(worstShare, ps - sh);
      dev = Math.max(dev, Math.abs(sh - c));
      pr = S.radius!;
      ps = sh;
    }
    maxDev.push(dev);
  });
  const S = UNIFIED_STATS.filtration!;
  console.log(
    `${d.id}: sweep c 0..1 by 0.02: largest drop in r ${worstR.toFixed(3)}, in exact share ${worstShare.toFixed(4)}; max |share − c| per set ${maxDev.map((x) => x.toFixed(3)).join(" ")}; last filtration ${S.samples} samples ${S.triangles} triangles ${S.knots} knots`
  );
}
console.log(table.join("\n"));
