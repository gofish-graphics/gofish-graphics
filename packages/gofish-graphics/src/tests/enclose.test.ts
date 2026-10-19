/**
 * The blob outline behind `Shape.blob()` (`ast/graphicalOperators/enclose/
 * blob.ts`), checked as pure geometry, on the two point sets of the proposal's
 * prototype: the U-shaped cloud with two avoided nodes in its opening, and the
 * Gentoo penguins with the other species avoided.
 *
 *  - `roundness` and `neck` never change the topology: the number of pieces
 *    and holes is the same over a sweep of each.
 *  - The hull preset (convexity 1, neck 1) is within half a pixel of the true
 *    padded convex hull.
 *  - With `holes: false` (the default) the only holes are the avoided nodes'
 *    clearance circles; with `holes: true` an open gap stays a hole.
 *  - A 1,000-point line and 300 dots outline well under a second (no step is
 *    quadratic in the members).
 *  - `Shape.oval()` (`enclose/oval.ts`): every padded member lies
 *    inside the ellipse and its drawn outline, for dots, boxes and segments
 *    of mixed sizes; it tilts to follow a diagonal; one member gives a
 *    circle; members on a line give a thin ellipse; it is fast on the
 *    penguins.
 *
 * Run: `tsx src/tests/enclose.test.ts` (wired as `pnpm test:enclose`).
 */
import {
  blobOutline,
  type BlobMember,
  type BlobOutlineOptions,
  type Pt,
} from "../ast/graphicalOperators/enclose/blob";
import {
  ellipseLoop,
  ovalOutline,
  ellipseValue,
  minEllipse,
  paddedHull,
  type Ellipse,
} from "../ast/graphicalOperators/enclose/oval";
import { penguins } from "../data/penguins";

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

type Disc = Extract<BlobMember, { kind: "disc" }>;
const C = (cx: number, cy: number, r: number): Disc => ({
  kind: "disc",
  cx,
  cy,
  r,
});
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// The U: a band of points two dots thick around a U-shaped path, with two
// avoided nodes inside its opening (the prototype's dataset (b)).
const U: Disc[] = (() => {
  const path: Pt[] = [
    [35, 22],
    [35, 150],
    [190, 150],
    [190, 22],
  ];
  const out: Disc[] = [];
  for (let s = 0; s < 3; s++) {
    const [a, b] = [path[s], path[s + 1]];
    const L = dist(a, b),
      nx = -(b[1] - a[1]) / L,
      ny = (b[0] - a[0]) / L;
    const k = Math.round(L / 26);
    for (let i = s === 0 ? 0 : 1; i <= k; i++) {
      const t = i / k,
        jit = ((i * 7 + s * 3) % 5) - 2;
      for (const side of [-1, 1])
        out.push(
          C(
            a[0] + t * (b[0] - a[0]) + side * 11 * nx + jit,
            a[1] + t * (b[1] - a[1]) + side * 11 * ny - jit,
            5
          )
        );
    }
  }
  return out;
})();
const NON = [C(112, 50, 5), C(112, 100, 5)];

// The penguins on the prototype's pixel scale: Gentoo are the members, the
// other species are avoided.
const xs = (v: number) => 44 + ((v - 32) / (60 - 32)) * 360;
const ys = (v: number) => 260 - ((v - 13) / (22 - 13)) * 260;
const pen = (penguins as any[]).filter(
  (d) => d["Beak Length (mm)"] != null && d["Beak Depth (mm)"] != null
);
const penDisc = (d: any) =>
  C(xs(d["Beak Length (mm)"]), ys(d["Beak Depth (mm)"]), 2.5);
const GENTOO = pen.filter((d) => d.Species === "Gentoo").map(penDisc);
const OTHERS = pen.filter((d) => d.Species !== "Gentoo").map(penDisc);

const signedArea = (l: Pt[]) =>
  l.reduce(
    (a, p, i) =>
      a + p[0] * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * p[1],
    0
  ) / 2;
/** Pieces (loops wound like the largest) and holes (wound the other way). */
const topology = (loops: Pt[][]) => {
  const areas = loops.map(signedArea);
  const outer = Math.sign(
    areas.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0)
  );
  const pieces = areas.filter((a) => Math.sign(a) === outer).length;
  return { pieces, holes: areas.length - pieces };
};
const show = (t: { pieces: number; holes: number }) =>
  `${t.pieces} pieces, ${t.holes} holes`;

// ── topology is the same over roundness and neck ───────────────────────────
const sets: [string, Disc[], BlobOutlineOptions][] = [
  ["U", U, { padding: 8, avoiding: NON, convexity: 0.5 }],
  ["U, convexity 0", U, { padding: 8, avoiding: NON, convexity: 0 }],
  ["U, convexity 0.75", U, { padding: 8, avoiding: NON, convexity: 0.75 }],
  [
    "U, convexity 0.75, holes",
    U,
    { padding: 8, avoiding: NON, convexity: 0.75, holes: true },
  ],
  ["Gentoo, holes", GENTOO, { padding: 4, avoiding: OTHERS, convexity: 0.05, holes: true }],
  ["Gentoo", GENTOO, { padding: 4, avoiding: OTHERS, convexity: 0.5 }],
  ["Gentoo, convexity 0", GENTOO, { padding: 4, avoiding: OTHERS, convexity: 0 }],
];
for (const [name, members, base] of sets) {
  const ref = topology(blobOutline(members, { ...base, roundness: 0, neck: 1 }));
  check(`${name}: has an outline (${show(ref)})`, ref.pieces >= 1);
  const pad = base.padding;
  for (const roundness of [0, pad / 2, pad, 2 * pad]) {
    const t = topology(blobOutline(members, { ...base, roundness }));
    check(
      `${name}: roundness ${roundness} keeps the topology`,
      t.pieces === ref.pieces && t.holes === ref.holes,
      `${show(t)}, want ${show(ref)}`
    );
  }
  for (const neck of [0.05, 0.1, 0.25, 0.5, 0.7, 0.85, 1]) {
    const t = topology(blobOutline(members, { ...base, neck }));
    check(
      `${name}: neck ${neck} keeps the topology`,
      t.pieces === ref.pieces && t.holes === ref.holes,
      `${show(t)}, want ${show(ref)}`
    );
  }
}

// ── the hull preset is within half a pixel of the true padded hull ─────────
/** Andrew's monotone chain. */
const convexHull = (pts: Pt[]): Pt[] => {
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (q: Pt[]) => {
    const h: Pt[] = [];
    for (const v of q) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], v) <= 0)
        h.pop();
      h.push(v);
    }
    return h.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
};
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const inPoly = (p: Pt, poly: Pt[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
};
/** Signed distance to the hull of equal discs grown by `R` (exact: the hull
 *  of the centers, grown by R). */
const hullDistance = (centers: Pt[], R: number) => {
  const h = convexHull(centers);
  return (p: Pt) => {
    let d = Infinity;
    for (let i = 0; i < h.length; i++)
      d = Math.min(d, segDist(p, h[i], h[(i + 1) % h.length]));
    return (inPoly(p, h) ? -d : d) - R;
  };
};
for (const [name, members, pad, roundness] of [
  ["U", U, 8, 8],
  ["U", U, 8, 15],
  ["Gentoo", GENTOO, 6, 6],
] as [string, Disc[], number, number][]) {
  const loops = blobOutline(members, { padding: pad, convexity: 1, neck: 1, roundness });
  const t = topology(loops);
  const sd = hullDistance(
    members.map((m) => [m.cx, m.cy] as Pt),
    members[0].r + pad
  );
  const worst = Math.max(...loops.flat().map((p) => Math.abs(sd(p))));
  check(
    `hull preset on ${name} (roundness ${roundness}) is one piece, no holes`,
    t.pieces === 1 && t.holes === 0,
    show(t)
  );
  check(
    `hull preset on ${name} (roundness ${roundness}) is within 0.5 px of the true hull`,
    worst <= 0.5,
    `${worst.toFixed(2)} px off`
  );
}

// ── members of different sizes: links taper, so the hull stays convex ──────
/** Signed distance to the convex hull of discs of any radii, each grown by
 *  `pad` (the hull of 2000 points on each grown circle). */
const discsHullDistance = (discs: Disc[], pad: number) => {
  const pts: Pt[] = discs.flatMap((m) =>
    Array.from({ length: 2000 }, (_, i): Pt => {
      const a = (i / 2000) * 2 * Math.PI;
      return [
        m.cx + (m.r + pad) * Math.cos(a),
        m.cy + (m.r + pad) * Math.sin(a),
      ];
    })
  );
  const h = convexHull(pts);
  return (p: Pt) => {
    let d = Infinity;
    for (let i = 0; i < h.length; i++)
      d = Math.min(d, segDist(p, h[i], h[(i + 1) % h.length]));
    return inPoly(p, h) ? -d : d;
  };
};
/** Seeded points (a linear congruential generator), so a run is the same
 *  every time. */
const seeded = (seed: number) => () =>
  ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const MIXED: Disc[] = (() => {
  const rand = seeded(7);
  return Array.from({ length: 18 }, () =>
    C(20 + rand() * 260, 20 + rand() * 180, 2 + rand() * 14)
  );
})();
const REF_HULL: Disc[] = [C(32, 82, 12), C(138, 18, 8), C(216, 106, 16)];
// A ring of circles of mixed radii around an avoided node, which is a hole.
const RING: Disc[] = Array.from({ length: 12 }, (_, i) =>
  C(
    150 + 80 * Math.cos((i / 12) * 2 * Math.PI),
    120 + 80 * Math.sin((i / 12) * 2 * Math.PI),
    3 + ((i * 5) % 10)
  )
);
for (const [name, members, pad] of [
  ["the RefHull story's circles", REF_HULL, 10],
  ["18 seeded circles of mixed radii", MIXED, 6],
] as [string, Disc[], number][]) {
  const loops = blobOutline(members, { padding: pad, convexity: 1, neck: 1 });
  const sd = discsHullDistance(members, pad);
  const worst = Math.max(...loops.flat().map((p) => Math.abs(sd(p))));
  check(
    `hull preset on ${name} is within 0.5 px of the true hull of the padded discs`,
    topology(loops).pieces === 1 && worst <= 0.5,
    `${show(topology(loops))}, ${worst.toFixed(2)} px off`
  );
}
for (const [name, members, base] of [
  ["mixed radii", MIXED, { padding: 6, convexity: 0.5 }],
  ["mixed radii, convexity 0", MIXED, { padding: 6, convexity: 0 }],
  [
    "mixed-radius ring",
    RING,
    { padding: 6, convexity: 0.75, avoiding: [C(150, 120, 6)] },
  ],
] as [string, Disc[], BlobOutlineOptions][]) {
  const ref = topology(blobOutline(members, { ...base, roundness: 0, neck: 1 }));
  check(`${name}: has an outline (${show(ref)})`, ref.pieces >= 1);
  for (const roundness of [0, 3, 6, 12]) {
    const t = topology(blobOutline(members, { ...base, roundness }));
    check(
      `${name}: roundness ${roundness} keeps the topology`,
      t.pieces === ref.pieces && t.holes === ref.holes,
      `${show(t)}, want ${show(ref)}`
    );
  }
  for (const neck of [0.05, 0.1, 0.25, 0.5, 0.7, 0.85, 1]) {
    const t = topology(blobOutline(members, { ...base, neck }));
    check(
      `${name}: neck ${neck} keeps the topology`,
      t.pieces === ref.pieces && t.holes === ref.holes,
      `${show(t)}, want ${show(ref)}`
    );
  }
}

// ── holes ──────────────────────────────────────────────────────────────────
{
  const clearance = 4;
  const base = { padding: 8, avoiding: NON, convexity: 0.75, neck: 1, roundness: 8, clearance };
  const closed = blobOutline(U, base);
  const areas = closed.map(signedArea);
  const outer = Math.sign(areas.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0));
  const holes = closed.filter((_, i) => Math.sign(areas[i]) !== outer);
  check(
    "holes: false leaves exactly the avoided nodes as holes",
    holes.length === NON.length,
    `${holes.length} holes, want ${NON.length}`
  );
  const offCircle = Math.max(
    ...holes.map((h) => {
      // the avoided node this hole is cut around: the nearest center
      const c = NON.map((m) => [m.cx, m.cy] as Pt).reduce((a, b) =>
        dist(h[0], a) < dist(h[0], b) ? a : b
      );
      return Math.max(...h.map((p) => Math.abs(dist(p, c) - (5 + clearance))));
    })
  );
  check(
    "holes: false cuts each avoided node as exactly its clearance circle",
    offCircle <= 0.1,
    `${offCircle.toFixed(3)} px off the circle`
  );
  const open = topology(blobOutline(U, { ...base, holes: true }));
  const openHoles = blobOutline(U, { ...base, holes: true })
    .map(signedArea)
    .filter((a) => Math.sign(a) !== outer)
    .reduce((s, a) => s + Math.abs(a), 0);
  const circles = NON.length * Math.PI * (5 + clearance) ** 2;
  check(
    "holes: true keeps an open gap as a hole larger than the clearance circles",
    open.holes >= 1 && openHoles > circles * 1.05,
    `${show(open)}, hole area ${openHoles.toFixed(0)} vs circles ${circles.toFixed(0)}`
  );
}

check("an empty member list has no outline", blobOutline([], { padding: 4 }).length === 0);

console.log("# a 1,000-point line and 300 dots");
{
  const rand = seeded(3);
  const members: BlobMember[] = [];
  let at: Pt = [50, 300];
  for (let i = 1; i < 1000; i++) {
    const next: Pt = [at[0] + 0.7 + rand() * 0.2, at[1] + (rand() - 0.5) * 6];
    members.push({ kind: "segment", a: at, b: next, w: 1.5 });
    at = next;
  }
  for (let i = 0; i < 300; i++) members.push(C(50 + rand() * 800, 100 + rand() * 400, 3));
  for (const convexity of [0, 0.5]) {
    const t0 = performance.now();
    const t = topology(blobOutline(members, { padding: 4, convexity }));
    const ms = performance.now() - t0;
    check(
      `convexity ${convexity}: one piece, in under a second`,
      t.pieces === 1 && ms < 1000,
      `${show(t)}, ${ms.toFixed(0)} ms`
    );
  }
}

console.log("# Shape.oval(): the minimum-area enclosing ellipse");
{
  /** The circles whose hull is the member grown by pad, sampled densely. */
  const boundary = (m: BlobMember, pad: number): Pt[] => {
    const circles: [number, number, number][] =
      m.kind === "disc"
        ? [[m.cx, m.cy, m.r + pad]]
        : m.kind === "box"
          ? [
              [m.x, m.y, pad],
              [m.x + m.w, m.y, pad],
              [m.x, m.y + m.h, pad],
              [m.x + m.w, m.y + m.h, pad],
            ]
          : [
              [m.a[0], m.a[1], m.w / 2 + pad],
              [m.b[0], m.b[1], m.w / 2 + pad],
            ];
    return circles.flatMap(([cx, cy, r]) =>
      Array.from({ length: 720 }, (_, i): Pt => [
        cx + r * Math.cos((i / 720) * 2 * Math.PI),
        cy + r * Math.sin((i / 720) * 2 * Math.PI),
      ])
    );
  };
  const ellipseOf = (members: BlobMember[], pad: number) =>
    minEllipse(paddedHull(members, pad));
  /** The semi-axes, larger first, and the larger one's angle in degrees. */
  const axes = (e: Ellipse) => {
    const mid = (e.a + e.d) / 2,
      half = Math.hypot((e.a - e.d) / 2, e.b);
    // the long axis is along A's smaller eigenvalue
    const angle = (0.5 * Math.atan2(2 * e.b, e.a - e.d) * 180) / Math.PI + 90;
    return {
      long: 1 / Math.sqrt(mid - half),
      short: 1 / Math.sqrt(mid + half),
      angle: ((angle % 180) + 180) % 180,
    };
  };
  const rand = seeded(11);
  const mixed: BlobMember[] = [
    ...Array.from({ length: 12 }, () => C(rand() * 300, rand() * 160, 1 + rand() * 12)),
    { kind: "box", x: 40, y: 170, w: 60, h: 24 },
    { kind: "box", x: 250, y: -30, w: 18, h: 50 },
    { kind: "segment", a: [-40, 60], b: [10, 120], w: 3 },
    { kind: "segment", a: [320, 40], b: [360, 150], w: 8 },
  ];
  for (const pad of [0, 6, 20]) {
    const e = ellipseOf(mixed, pad);
    const loop = ellipseLoop(e);
    let worst = -Infinity,
      outsideLoop = 0;
    for (const m of mixed)
      for (const q of boundary(m, pad)) {
        worst = Math.max(worst, ellipseValue(e, q));
        if (!inPoly(q, loop)) outsideLoop++;
      }
    check(
      `padding ${pad}: every padded dot, box and segment is inside the ellipse and its outline`,
      worst <= 1 + 1e-9 && outsideLoop === 0,
      `largest (p - c)ᵀA(p - c) ${worst.toFixed(6)}, ${outsideLoop} samples outside the loop`
    );
  }
  {
    const diagonal = Array.from({ length: 9 }, (_, i) => C(20 * i, 20 * i + (i % 2) * 6, 4));
    const { angle, long, short } = axes(ellipseOf(diagonal, 6));
    check(
      "points along a diagonal tilt the ellipse to it",
      Math.abs(angle - 45) < 3 && long > 2 * short,
      `long axis at ${angle.toFixed(1)}°, semi-axes ${long.toFixed(1)} and ${short.toFixed(1)}`
    );
  }
  {
    const e = ellipseOf([C(50, 40, 7)], 5);
    const { long, short } = axes(e);
    const R = 12 / Math.cos(Math.PI / 24);
    check(
      "a single member gives a circle around it",
      Math.abs(long - short) < 1e-3 * R && Math.abs(long - R) < 1e-2 * R && dist(e.c, [50, 40]) < 1e-6,
      `semi-axes ${long.toFixed(4)} and ${short.toFixed(4)}, circle ${R.toFixed(4)}`
    );
  }
  {
    const row = [C(0, 0, 3), C(50, 0, 3), C(100, 0, 3), C(160, 0, 3)];
    const loops = ovalOutline(row, 0);
    const { long, short } = axes(ellipseOf(row, 0));
    const finite = loops.flat().every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    check(
      "members on a line give a thin ellipse, with no NaN",
      finite && short >= 3 && short < 10 && long > 80,
      `semi-axes ${long.toFixed(2)} and ${short.toFixed(2)}`
    );
    const flat = ovalOutline([C(0, 0, 0), C(40, 0, 0), C(90, 0, 0)], 0);
    check(
      "points with no size and no padding give their segment, with no NaN",
      flat.length === 1 &&
        flat[0].every(([x, y]) => Number.isFinite(x) && y === 0) &&
        Math.max(...flat[0].map((p) => p[0])) === 90,
      JSON.stringify(flat)
    );
    check("no members give no outline", ovalOutline([], 6).length === 0);
  }
  {
    // A wide ellipse member, 200 by 20, padded by 4: the ellipse grown by 4 is
    // not an ellipse (its ends are blunter), so the least ellipse around it is
    // wider than 208 by 28. It must hold the true offset curve, and it is no
    // circle.
    const wide: BlobMember = { kind: "disc", cx: 0, cy: 0, r: 100, axes: [100, 10] };
    const [loop] = ovalOutline([wide], 4);
    const xs = loop.map((p) => p[0]),
      ys = loop.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs),
      h = Math.max(...ys) - Math.min(...ys);
    const offset = Array.from({ length: 2000 }, (_, i): Pt => {
      const t = (i / 2000) * 2 * Math.PI;
      const nx = 10 * Math.cos(t),
        ny = 100 * Math.sin(t),
        n = Math.hypot(nx, ny);
      return [100 * Math.cos(t) + (4 * nx) / n, 10 * Math.sin(t) + (4 * ny) / n];
    });
    const outside = offset.filter((q) => !inPoly(q, loop)).length;
    check(
      "an ellipse member gives an oval around the ellipse, not a circle",
      w > 208 && w < 230 && h > 28 && h < 31 && outside === 0,
      `${w.toFixed(1)} by ${h.toFixed(1)}, ${outside} offset points outside`
    );
  }
  {
    const species = ["Adelie", "Chinstrap", "Gentoo"].map((s) =>
      pen.filter((d) => d.Species === s).map(penDisc)
    );
    const t0 = performance.now();
    for (const members of species) ovalOutline(members, 6);
    const ms = performance.now() - t0;
    check("the three penguin species take under 100 ms", ms < 100, `${ms.toFixed(1)} ms`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
