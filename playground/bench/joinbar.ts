// SCRATCH: checks for the pieces measure and the mutual reachability distance.
//  - join "all" (∞, share 1, pieces 1) gives one outline in every measure × distance
//  - pieces: exactly k pieces per set at every whole k from (pieces at the floor) down to 1
//  - area monotone along each measure × distance's slider (smoothed and raw)
//  - scale test: positions × 0.5 / × 2, sizes kept: pieces at fixed joins
//  - "mutual" on the gap tree vs HDBSCAN's own tree (single linkage over all pairs on the
//    mutual reachability, touching pairs first): the same pieces at each k?
//  - the time of a join drag (warm cache)
//   BENCH=joinbar node playground/bench.mjs   (DS=<ids>, NOAREA=1 to skip the slow area check)
import DATA from "../src/datasets.json";
import {
  unifiedOutline,
  ringsArea,
  clearUnifiedCache,
  joinLinks,
  coreDistances,
  type ReachMeasure,
  type ReachDistance,
} from "../../packages/gofish-graphics/src/ast/graphicalOperators/enclose/unified";

const IDS = (
  process.env.DS ?? "chartaccent,penguins,u,hyperedges,bubble"
).split(",");
const C = 0.25;
const f = (v: number) => (v === Infinity ? "∞" : String(+v.toFixed(2)));
const COMBOS: [ReachMeasure, ReachDistance][] = [
  ["px", "plain"],
  ...(["share", "typical", "local", "pieces"] as ReachMeasure[]).flatMap((m) =>
    (["plain", "mutual"] as ReachDistance[]).map(
      (d) => [m, d] as [ReachMeasure, ReachDistance]
    )
  ),
];
const scaled = (ms: any[], s: number): any[] =>
  ms.map((m) => {
    if (m.kind === "disc") return { ...m, cx: m.cx * s, cy: m.cy * s };
    if (m.kind === "segment")
      return { ...m, a: [m.a[0] * s, m.a[1] * s], b: [m.b[0] * s, m.b[1] * s] };
    const cx = (m.x + m.w / 2) * s,
      cy = (m.y + m.h / 2) * s;
    return { ...m, x: cx - m.w / 2, y: cy - m.h / 2 };
  });
const floorPieces = (d: any, set: any, dist: ReachDistance, s = 1) =>
  1 +
  joinLinks(
    scaled(set.members, s),
    d.padding,
    1,
    d.story?.neck ?? 1,
    "pieces",
    dist
  ).tree.filter((e) => !e.floor).length;
// each measure's slider, in slider order (joined more to the right)
const slider = (d: any, m: ReachMeasure, dist: ReachDistance): number[] => {
  if (m === "px")
    return [
      0,
      ...Array.from({ length: 99 }, (_, k) => 0.5 * 2 ** (k / 10)),
      Infinity,
    ];
  if (m === "share") return Array.from({ length: 101 }, (_, k) => k / 100);
  if (m === "pieces") {
    const P = Math.max(...d.sets.map((s: any) => floorPieces(d, s, dist)));
    return Array.from(
      { length: 101 },
      (_, k) => +(P ** (1 - k / 100)).toFixed(2)
    );
  }
  return [
    0,
    ...Array.from({ length: 99 }, (_, k) => 0.05 * 2 ** (k / 12)),
    Infinity,
  ];
};
const run = (
  d: any,
  m: ReachMeasure,
  dist: ReachDistance,
  join: number,
  smooth: boolean
) => {
  let area = 0,
    rings = "";
  const t0 = performance.now();
  for (const s of d.sets) {
    const r = unifiedOutline(s.members, {
      padding: d.padding,
      convexity: C,
      neck: d.story?.neck ?? 1,
      reach: join,
      reachMeasure: m,
      reachDistance: dist,
      means: "blend",
      holes: d.story?.holes ?? false,
      avoiding: [],
      clearance: d.clearance,
      smooth: smooth ? undefined : null,
    });
    area += ringsArea(r);
    rings += JSON.stringify(r);
  }
  return { area, ms: performance.now() - t0, rings };
};
// HDBSCAN's own tree: Kruskal over all pairs, touching pairs first, then by mutual
// reachability; pieces at k = cut the k − 1 longest non-touching edges
const hdbscanPieces = (d: any, set: any, k: number): string => {
  const ms = set.members;
  const n = ms.length;
  const J = joinLinks(ms, d.padding, Infinity, 1, "px", "plain");
  // pairwise centre distances and touching, from a 2-member joinLinks (cheap enough here)
  const core = coreDistances(ms, 4);
  const pairs: [number, number, number, boolean][] = [];
  const c = (m: any) => [m.cx, m.cy];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const [a, b] = [c(ms[i]), c(ms[j])];
      const dd = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const touch = dd - ms[i].r - ms[j].r - 2 * d.padding <= 0;
      pairs.push([i, j, Math.max(core[i], core[j], dd), touch]);
    }
  pairs.sort((p, q) => Number(q[3]) - Number(p[3]) || p[2] - q[2]);
  const par = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number =>
    par[i] === i ? i : (par[i] = find(par[i]));
  const edges: [number, number, number, boolean][] = [];
  for (const p of pairs) {
    const [a, b] = [find(p[0]), find(p[1])];
    if (a === b) continue;
    par[a] = b;
    edges.push(p);
  }
  const free = edges.filter((e) => !e[3]).sort((p, q) => q[2] - p[2]);
  const cut = new Set(free.slice(0, k - 1));
  const par2 = Array.from({ length: n }, (_, i) => i);
  const find2 = (i: number): number =>
    par2[i] === i ? i : (par2[i] = find2(par2[i]));
  for (const e of edges) if (!cut.has(e)) par2[find2(e[0])] = find2(e[1]);
  void J;
  return canon(Array.from({ length: n }, (_, i) => find2(i)));
};
const canon = (lab: number[]) => {
  const g = new Map<number, number[]>();
  lab.forEach((l, i) => g.set(l, [...(g.get(l) ?? []), i]));
  return [...g.values()]
    .map((x) => x.join(","))
    .sort()
    .join("|");
};
const oursPieces = (d: any, set: any, k: number) => {
  const P = joinLinks(set.members, d.padding, k, 1, "pieces", "mutual").pieces;
  const lab = new Array(set.members.length);
  P.forEach((p, pi) => p.forEach((i) => (lab[i] = pi)));
  return canon(lab);
};

const out: string[] = [];
const timing: string[] = [];
const scale: string[] = [];
for (const id of IDS) {
  const d = (DATA as any[]).find((x) => x.id === id);
  out.push(`\n## ${d.label}`);
  // join all: one outline
  const base = run(d, "px", "plain", Infinity, true).rings;
  const notSame = COMBOS.filter(([m, dist]) => {
    const j = m === "pieces" || m === "share" ? 1 : Infinity;
    return run(d, m, dist, j, true).rings !== base;
  }).map(([m, dist]) => `${m} ${dist}`);
  const allSame = !notSame.length;
  const piecesDefault = (["plain", "mutual"] as ReachDistance[]).every(
    (dist) => {
      const r = unifiedOutline(d.sets[0].members, {
        padding: d.padding,
        convexity: C,
        neck: d.story?.neck ?? 1,
        reachMeasure: "pieces",
        reachDistance: dist,
        means: "blend",
        holes: d.story?.holes ?? false,
        clearance: d.clearance,
      });
      const r0 = unifiedOutline(d.sets[0].members, {
        padding: d.padding,
        convexity: C,
        neck: d.story?.neck ?? 1,
        means: "blend",
        holes: d.story?.holes ?? false,
        clearance: d.clearance,
      });
      return JSON.stringify(r) === JSON.stringify(r0);
    }
  );
  out.push(
    `join all (∞ / share 1 / pieces 1) one outline in every measure × distance: ${allSame ? "yes" : "NO " + notSame.join(", ")}; pieces with join left out = the default: ${piecesDefault ? "yes" : "NO"}`
  );
  // pieces: exactly k at whole k
  for (const dist of ["plain", "mutual"] as ReachDistance[]) {
    const bad: string[] = [];
    const seq: string[] = [];
    d.sets.forEach((set: any, si: number) => {
      const P0 = floorPieces(d, set, dist);
      seq.push(`set ${si + 1}: ${P0}..1`);
      for (let k = 1; k <= P0 + 2; k++) {
        const got = joinLinks(
          set.members,
          d.padding,
          k,
          d.story?.neck ?? 1,
          "pieces",
          dist
        ).pieces.length;
        if (got !== Math.min(k, P0)) bad.push(`set ${si + 1} k ${k}: ${got}`);
      }
    });
    out.push(
      `pieces ${dist}: exactly k pieces at every whole k (${seq.join(", ")}): ${bad.length ? "NO " + bad.slice(0, 6).join("; ") : "yes"}`
    );
  }
  // reach on the gap tree vs HDBSCAN's tree (discs only)
  if (
    d.sets.every((s: any) => s.members.every((m: any) => m.kind === "disc"))
  ) {
    const rows: string[] = [];
    d.sets.forEach((set: any, si: number) => {
      const P0 = floorPieces(d, set, "mutual");
      let same = 0;
      const diff: number[] = [];
      for (let k = 1; k <= P0; k++)
        if (oursPieces(d, set, k) === hdbscanPieces(d, set, k)) same++;
        else diff.push(k);
      rows.push(
        `set ${si + 1} ${same}/${P0} k same${diff.length ? ` (differ at k ${diff.slice(0, 8).join(",")}${diff.length > 8 ? "…" : ""})` : ""}`
      );
    });
    out.push(
      `reach on the gap tree vs HDBSCAN's all-pairs tree, pieces per k: ${rows.join("; ")}`
    );
  }
  // monotone area
  if (!process.env.NOAREA)
    for (const [m, dist] of COMBOS) {
      const drops: string[] = [];
      for (const smooth of [true, false]) {
        let prev = -Infinity;
        for (const j of slider(d, m, dist)) {
          const a = run(d, m, dist, j, smooth).area;
          if (a < prev - 0.5)
            drops.push(
              `${smooth ? "smoothed" : "raw"} ${f(j)} −${(prev - a).toFixed(1)}`
            );
          prev = Math.max(prev, a);
        }
      }
      out.push(
        `   ${m} ${dist}: area monotone along the slider: ${drops.length ? "NO " + drops.slice(0, 4).join(", ") : "yes"}`
      );
    }
  // scale test
  const FIX: [ReachMeasure, number[]][] = [
    ["pieces", [2, 4, 6]],
    ["typical", [1.5, 2.5]],
  ];
  for (const [m, js] of FIX)
    for (const dist of ["plain", "mutual"] as ReachDistance[])
      for (const j of js)
        scale.push(
          `| ${d.label} | ${m} ${dist} ${f(j)} | ${[0.5, 1, 2]
            .map((s) =>
              d.sets.reduce(
                (t: number, set: any) =>
                  t +
                  joinLinks(
                    scaled(set.members, s),
                    d.padding,
                    j,
                    d.story?.neck ?? 1,
                    m,
                    dist
                  ).pieces.length,
                0
              )
            )
            .join(" | ")} |`
        );
  // timing
  for (const [m, dist] of COMBOS) {
    if (m === "px" || m === "share" || m === "local") continue;
    clearUnifiedCache();
    const ms = slider(d, m, dist).map((j) => run(d, m, dist, j, true).ms);
    const st = ms.slice().sort((a, b) => a - b);
    timing.push(
      `| ${d.label} | ${m} ${dist} | ${st[st.length >> 1].toFixed(0)} | ${st[Math.floor(st.length * 0.9)].toFixed(0)} | ${st.at(-1)!.toFixed(0)} |`
    );
  }
}
console.log(out.join("\n"));
console.log(
  "\n# scale test: positions × s, sizes kept; pieces (all sets)\n| dataset | join | × 0.5 | × 1 | × 2 |\n|---|---|---|---|---|"
);
console.log(scale.join("\n"));
console.log(
  "\n# join drag, warm cache, ms per step (median, p90, max)\n| dataset | measure | median | p90 | max |\n|---|---|---|---|---|"
);
console.log(timing.join("\n"));
