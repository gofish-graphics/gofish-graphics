// SCRATCH: the checks of the simplified outline.   BENCH=checks node playground/bench.mjs
// 1. area monotone in connection (every link entry) and in convexity 0 → 2
// 2. fillet against a raster closing of each piece (several radii, near-tangent pairs), and
//    the sharpest turn of every fillet outline
// 3. avoiding: no outline point inside a keep-out, for every shape
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  pieceLinks,
  ringsArea,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";
import {
  closingError,
  sharpest,
} from "../../packages/gofish-graphics/scratch-bumps/fillet/rastercheck";
type Pt = [number, number];
const D = DATA as any[];
const only = process.env.ONLY ?? "123";
const inRing = (p: Pt, r: Pt[]) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if (
      r[i][1] > p[1] !== r[j][1] > p[1] &&
      p[0] <
        ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]
    )
      c = !c;
  return c;
};
const signed = (r: Pt[]) =>
  r.reduce((s, p, i) => {
    const q = r[(i + 1) % r.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0);
const segD = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    L = dx * dx + dy * dy;
  const t = L
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const memberDist = (p: Pt, m: any) => {
  if (m.kind === "disc") return Math.hypot(p[0] - m.cx, p[1] - m.cy) - m.r;
  if (m.kind === "segment")
    return segD(p, m.a, m.b) - Math.max(m.w, m.w2 ?? m.w) / 2;
  const dx = Math.max(m.x - p[0], 0, p[0] - m.x - m.w),
    dy = Math.max(m.y - p[1], 0, p[1] - m.y - m.h);
  return dx === 0 && dy === 0 ? -1 : Math.hypot(dx, dy);
};
const centre = (m: any): Pt =>
  m.kind === "disc"
    ? [m.cx, m.cy]
    : m.kind === "segment"
      ? [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2]
      : [m.x + m.w / 2, m.y + m.h / 2];

if (only.includes("1")) {
  console.log("## 1. area monotone");
  let bad = 0,
    cases = 0;
  for (const d of D)
    for (const [si, s] of d.sets.entries()) {
      for (const convexity of [0, 0.5, 1]) {
        const tree = pieceLinks(s.members, d.padding, 1, 1).tree.filter(
          (e: any) => !e.floor
        );
        const cs = [
          0,
          ...tree
            .map((e: any) => Math.min(1, e.enter + 1e-6))
            .sort((a: number, b: number) => a - b),
          1,
        ];
        let prev = -Infinity;
        for (const c of cs) {
          const a = ringsArea(
            unifiedOutline(s.members, {
              padding: d.padding,
              convexity,
              connection: c,
            })
          );
          cases++;
          if (a < prev - 1e-6) {
            bad++;
            console.log(
              `  connection drop ${d.id}/${si} cx ${convexity} c ${c.toFixed(3)}: ${prev.toFixed(1)} → ${a.toFixed(1)}`
            );
          }
          prev = a;
        }
      }
      for (const connection of [1, 0.8]) {
        let prev = -Infinity;
        for (let k = 0; k <= 40; k++) {
          const a = ringsArea(
            unifiedOutline(s.members, {
              padding: d.padding,
              convexity: k / 20,
              connection,
            })
          );
          cases++;
          if (a < prev - 1e-6) {
            bad++;
            console.log(
              `  convexity drop ${d.id}/${si} conn ${connection} cx ${k / 20}: ${prev.toFixed(1)} → ${a.toFixed(1)}`
            );
          }
          prev = a;
        }
      }
    }
  console.log(`  ${bad} drops in ${cases} steps`);
}

if (only.includes("2")) {
  console.log("## 2. fillet");
  const filletCheck = (
    name: string,
    members: any[],
    pad: number,
    r: number
  ) => {
    const rings = unifiedOutline(members, {
      padding: pad,
      shape: "fillet",
      radius: r,
      // with holes, so each piece is its outer ring and the holes in it: without them the
      // raster closing's hole boundaries, and members in a hole, would count as errors
      holes: true,
    }) as Pt[][];
    const outers = rings.filter((x) => signed(x) > 0);
    const holes = rings.filter((x) => signed(x) < 0);
    let at2: Pt = [0, 0],
      e1 = 0,
      e2 = 0;
    for (const o of outers) {
      const mine = holes.filter((h) => inRing(h[0], o));
      const ms = members.filter(
        (m) => inRing(centre(m), o) && !mine.some((h) => inRing(centre(m), h))
      );
      if (!ms.length) continue;
      const e = closingError([o, ...mine], ms, pad, r, 0.1, 0.5);
      if (e.outToTrue > 1)
        console.log(
          `    piece of ${ms.length} members, ${mine.length} holes: out→true ${e.outToTrue.toFixed(2)} at ${e.at1.map((v) => v.toFixed(0))}, true→out ${e.trueToOut.toFixed(2)} at ${e.at2.map((v) => v.toFixed(0))}`
        );
      e1 = Math.max(e1, e.outToTrue);
      if (e.trueToOut > e2) [e2, at2] = [e.trueToOut, e.at2];
    }
    const s = sharpest(rings);
    console.log(
      `  ${name} r ${r}: ${outers.length} pieces, out→true ${e1.toFixed(3)} px, true→out ${e2.toFixed(3)} px${e2 > 1 ? ` at ${at2.map((v) => v.toFixed(0))}` : ""}, sharpest turn ${s.deg.toFixed(0)}°`
    );
  };
  for (const [id, rs] of [
    ["bubble", [0, 4, 8]],
    ["chartaccent", [3, 6, 12]],
    ["munkres", [6, 20]],
    ["hyperedges", [8, 16]],
  ] as const) {
    const d = D.find((x) => x.id === id)!;
    for (const r of rs)
      for (const [si, s] of d.sets.entries())
        if (si < 3) filletCheck(`${id}/${si}`, s.members, d.padding, r);
  }
  // two padded discs a = 11 (r 5, pad 6), r = 12: gaps around g_join (about 17.3) and 2r
  for (const g of [0, 5, 10, 15, 16.5, 17, 17.5, 18, 20, 23, 23.9, 24, 24.1]) {
    const ms = [
      { kind: "disc", cx: 0, cy: 0, r: 5 },
      { kind: "disc", cx: 22 + g, cy: 0, r: 5 },
    ];
    filletCheck(`pair gap ${g}`, ms, 6, 12);
  }
}

if (only.includes("3")) {
  console.log("## 3. avoiding");
  const SHAPES: [string, any][] = [
    ["spine", { convexity: 0 }],
    ["blob", {}],
    ["hull", { convexity: 1 }],
    ["oval", { convexity: 2 }],
    ["blob conn 0.8", { connection: 0.8 }],
    ["fillet", { shape: "fillet" }],
    ["fillet r0", { shape: "fillet", radius: 0 }],
    ["box", { shape: "box" }],
  ];
  for (const d of D.filter((x) => x.avoidable))
    for (const [name, o] of SHAPES) {
      let worst = Infinity,
        ownAt = NaN,
        pts = 0,
        area = 0;
      for (const s of d.sets) {
        const rings = unifiedOutline(s.members, {
          padding: d.padding,
          ...o,
          avoiding: s.avoiding,
          clearance: d.clearance,
        }) as Pt[][];
        area += ringsArea(rings);
        for (const ring of rings)
          for (const p of ring) {
            // the cut never goes into the padded members, so a point on them may be near a
            // kept-out member; only points off them count
            let own = Infinity;
            for (const m of s.members) own = Math.min(own, memberDist(p, m));
            if (own <= d.padding + 0.25) continue;
            pts++;
            for (const m of s.avoiding) {
              const v = memberDist(p, m);
              if (v < worst) [worst, ownAt] = [v, own];
            }
          }
      }
      console.log(
        `  ${d.id} ${name}: min distance to a kept-out member ${worst.toFixed(2)} px (clearance ${d.clearance}; that point is ${(ownAt - d.padding).toFixed(2)} px off the padded members), ${pts} points, area ${area.toFixed(0)}`
      );
    }
}
