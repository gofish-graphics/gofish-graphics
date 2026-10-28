import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  chart,
  circle,
  enclose,
  group,
  layer,
  pack,
  position,
  selectAll,
  Shape,
} from "../../src/lib";
import { packSiblings } from "d3-hierarchy";
import { nameableMark } from "../../src/ast/marks/createOperator";
import { countries, type Country } from "./bubbleTreemapData";

// Throwaway prototypes for the #1221 bubble treemap proposal (Görtler et al.,
// TVCG 2018). Not gallery-tagged; not for merge.
const meta: Meta = { title: "Proposals/BubbleTreemap" };
export default meta;

const K = 1.6; // pixels per sqrt(million people); pack keeps pixel radii (#967)
// A pixel radius per row (pack cannot scale a data radius, #967), named so
// the outline layers can select the leaves.
const leafOf = (k: number) =>
  nameableMark((d: Country[], ...rest: any[]) =>
    (circle({ r: k * Math.sqrt(d[0].pop), fill: "continent" }) as any)(
      d,
      ...rest
    )
  ).name("leaves");
const leaf = leafOf(K);

const show = (build: (c: HTMLElement) => void): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    build(container);
    return container;
  },
});

// ── A. As-is: nested pack + one enclose layer per level ─────────────────────

/** The nested pack with region and continent outlines of `shape`. */
const asIs = (shape: Shape.Shape) =>
  chart(countries, { w: 520, h: 520 })
    .flow(pack({ by: "continent" }), pack({ by: "region" }), pack())
    .mark(leaf)
    .layer(
      chart(selectAll("leaves"))
        .flow(group({ by: "region" }))
        .mark(
          enclose({
            shape,
            padding: 4,
            fill: "none",
            stroke: "#333",
            strokeWidth: 1,
          })
        )
    )
    .layer(
      chart(selectAll("leaves"))
        .flow(group({ by: "continent" }))
        .mark(
          enclose({
            shape,
            padding: 10,
            fill: "none",
            stroke: "#000",
            strokeWidth: 2,
          })
        )
    );

export const AsIsBlob = show((c) => asIs(Shape.blob()).render(c));
export const AsIsHull = show((c) => asIs(Shape.hull()).render(c));
export const AsIsOval = show((c) => asIs(Shape.oval()).render(c));
export const AsIsBox = show((c) => asIs(Shape.box()).render(c));

// ── B. Shape grid: one level (regions), one outline per region ──────────────

const oneLevel = (shape: Shape.Shape, padding: number) =>
  chart(countries, { w: 290, h: 290 })
    .flow(pack({ by: "region", padding: 2 * padding + 2 } as any), pack())
    .mark(leafOf(0.95))
    .layer(
      chart(selectAll("leaves"))
        .flow(group({ by: "region" }))
        .mark(
          enclose({
            shape,
            padding,
            fill: "continent",
            fillOpacity: 0.15,
            stroke: "continent",
            strokeWidth: 1.5,
          })
        )
    );

export const ShapeGrid: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const shapes: [string, Shape.Shape][] = [
      ["Shape.box()", Shape.box()],
      ["Shape.oval()", Shape.oval()],
      ["Shape.hull()", Shape.hull()],
      ["Shape.blob()", Shape.blob()],
      ["Shape.blob({ convexity: 0.1 })", Shape.blob({ convexity: 0.1 })],
      [
        "Shape.blob({ convexity: 0.9, roundness: 16 })",
        Shape.blob({ convexity: 0.9, roundness: 16 }),
      ],
      [
        "Shape.blob({ convexity: 0, neck: 0.5 })",
        Shape.blob({ convexity: 0, neck: 0.5 }),
      ],
      ["Shape.spine()", Shape.spine()],
    ];
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(4, 312px)";
    for (const [title, shape] of shapes) {
      const cell = document.createElement("div");
      const heading = document.createElement("div");
      heading.textContent = title;
      heading.style.font = "600 12px sans-serif";
      cell.append(heading);
      container.append(cell);
      oneLevel(shape, 6).render(cell);
    }
    return container;
  },
};

// ── C1. Pack reserves room: per-level pack padding (PROTOTYPE #973) ─────────
// Region contours at PR px from the leaves, continent contours at PC px; each
// pack keeps siblings 2 × (their contour distance) + GAP px apart.

const GAP = 4;
const PR = 4; // region contour distance from the leaves
const PC = PR + GAP + 2; // continent contour distance from the leaves

const leavesWithPadding = () =>
  chart(countries, { w: 560, h: 560 })
    .flow(
      pack({ by: "continent", padding: 2 * PC + GAP } as any),
      pack({ by: "region", padding: 2 * PR + GAP } as any),
      pack({ padding: 1 } as any)
    )
    .mark(leaf)
    .layer(
      chart(selectAll("leaves"))
        .flow(group({ by: "region" }))
        .mark(
          enclose({
            shape: Shape.blob(),
            padding: PR,
            fill: "continent",
            fillOpacity: 0.12,
            stroke: "#444",
            strokeWidth: 1,
          })
        )
    )
    .layer(
      chart(selectAll("leaves"))
        .flow(group({ by: "continent" }))
        .mark(
          enclose({
            shape: Shape.blob(),
            padding: PC,
            fill: "none",
            stroke: "#000",
            strokeWidth: 2,
          })
        )
    );

export const C1PackPadding = show((c) => leavesWithPadding().render(c));

// ── C2. Nesting: the outline is a child of the pack (PROTOTYPE enclose
// geometry). Combinator form: pack(enclose(pack(enclose(pack(circles))))).
// The pack packs each outline's own smallest circle, so it reserves room for
// the contour with no padding arithmetic, and the continent outline reads the
// region outlines (rings, fill "none") as its members: the outer contour
// hugs the inner contours, not the leaves.

const COLORS: Record<string, string> = {
  Asia: "#4c78a8",
  Africa: "#f2c14e",
  Europe: "#a17fc9",
  Americas: "#f58c5c",
};

const groupBy = <T, K extends keyof T>(rows: T[], key: K) => {
  const m = new Map<T[K], T[]>();
  for (const r of rows) m.set(r[key], [...(m.get(r[key]) ?? []), r]);
  return [...m.values()];
};

type Level = { padding: number; stroke: string; strokeWidth: number };

/** The bubble treemap as nested combinators; `inner` and `outer` style the
 *  region and continent outlines, `regionPadding(rows)` the region distance. */
const nested = (
  shape: Shape.Shape,
  inner: Level,
  outer: Level,
  regionPadding: (rows: Country[]) => number = () => inner.padding
) =>
  pack(
    { padding: GAP } as any,
    groupBy(countries, "continent").map((cont) =>
      enclose({ shape, fill: "none", ...outer }, [
        pack(
          { padding: GAP } as any,
          groupBy(cont, "region").map((reg) =>
            enclose(
              { shape, fill: "none", ...inner, padding: regionPadding(reg) },
              [
                pack(
                  { padding: 1 } as any,
                  reg.map((d) =>
                    circle({
                      r: K * Math.sqrt(d.pop),
                      fill: COLORS[d.continent],
                    })
                  )
                ),
              ]
            )
          )
        ),
      ])
    )
  );

const INNER: Level = { padding: PR, stroke: "#444", strokeWidth: 1 };
const OUTER: Level = { padding: GAP, stroke: "#000", strokeWidth: 2 };

const SIZE = { w: 640, h: 640 };
export const C2NestedBlob = show((c) =>
  nested(Shape.blob(), INNER, OUTER).render(c, SIZE)
);
export const C2NestedHull = show((c) =>
  nested(Shape.hull(), INNER, OUTER).render(c, SIZE)
);
export const C2NestedBlobTight = show((c) =>
  nested(Shape.blob({ convexity: 0.1 }), INNER, OUTER).render(c, SIZE)
);

// ── C4. Uncertainty: per-region contour distance from a data field ─────────

/** Region contour distance: 2 px plus 1 px per percent of uncertainty. */
const uncertainPadding = (rows: Country[]) => 2 + rows[0].uncertainty;

// Combinator form: padding is plain JS, so it can be anything per group.
export const C4PaddingFromData = show((c) =>
  nested(Shape.blob(), INNER, OUTER, uncertainPadding).render(c, SIZE)
);

// Uncertainty as a band: the region contour at PR from the leaves, and a
// second, filled contour `uncertainty` px outside it (enclose of enclose).
export const C4Band = show((c) =>
  pack(
    { padding: GAP } as any,
    groupBy(countries, "continent").map((cont) =>
      enclose({ shape: Shape.blob(), fill: "none", ...OUTER }, [
        pack(
          { padding: GAP } as any,
          groupBy(cont, "region").map((reg) =>
            enclose(
              {
                shape: Shape.blob(),
                padding: reg[0].uncertainty,
                fill: COLORS[reg[0].continent],
                fillOpacity: 0.35,
                stroke: "none",
              },
              [
                enclose(
                  {
                    shape: Shape.blob(),
                    padding: 2,
                    fill: "none",
                    stroke: "#333",
                    strokeWidth: 1,
                  },
                  [
                    pack(
                      { padding: 1 } as any,
                      reg.map((d) =>
                        circle({
                          r: K * Math.sqrt(d.pop),
                          fill: COLORS[d.continent],
                        })
                      )
                    ),
                  ]
                ),
              ]
            )
          )
        ),
      ])
    )
  ).render(c, SIZE)
);

// ── C3. The paper's contour vs Shape.blob, on one fixed set of discs ────────
// Görtler et al. build each contour from circular arcs only: the union of the
// padded circles, with every concave corner filled by a circular arc of
// radius s tangent to both circles. That is the morphological closing of the
// padded union by a disc of radius s: grow every padded circle by s, trace
// the union's outer boundary, then shrink it back by s, which turns each
// boundary arc into an arc of the padded circle and each vertex into a
// concave arc of radius s. Here it is computed exactly (story-level JS, raw
// SVG) beside the blob gofish draws around the same discs.

type Disc = { x: number; y: number; r: number };
const TAU = 2 * Math.PI;
const mod = (a: number) => ((a % TAU) + TAU) % TAU;

/** The arcs of the outer boundary of the union of `cs`, as circle index and
 *  angles (increasing), in boundary order. */
function unionBoundary(cs: Disc[]): { k: number; a0: number; a1: number }[] {
  const arcs: { k: number; a0: number; a1: number }[] = [];
  cs.forEach((c, k) => {
    const cover: [number, number][] = [];
    let inside = false;
    cs.forEach((o, j) => {
      if (j === k) return;
      const d = Math.hypot(o.x - c.x, o.y - c.y);
      if (d >= c.r + o.r) return;
      if (d + c.r <= o.r) return void (inside = true);
      if (d + o.r <= c.r) return;
      const al = Math.acos((c.r * c.r + d * d - o.r * o.r) / (2 * c.r * d));
      const a = mod(Math.atan2(o.y - c.y, o.x - c.x) - al);
      const b = a + 2 * al;
      if (b > TAU) cover.push([a, TAU], [0, b - TAU]);
      else cover.push([a, b]);
    });
    if (inside) return;
    cover.sort((p, q) => p[0] - q[0]);
    const gaps: [number, number][] = [];
    let at = 0;
    for (const [a, b] of cover) {
      if (a > at) gaps.push([at, a]);
      at = Math.max(at, b);
    }
    if (at < TAU) gaps.push([at, TAU]);
    if (gaps.length > 1 && gaps[0][0] === 0 && gaps.at(-1)![1] === TAU) {
      const last = gaps.pop()!;
      gaps[0] = [last[0], gaps[0][1] + TAU];
    }
    for (const [a0, a1] of gaps) arcs.push({ k, a0, a1 });
  });
  // Link each arc's end to the arc starting there; keep the longest loop.
  const pt = (k: number, a: number) => [
    cs[k].x + cs[k].r * Math.cos(a),
    cs[k].y + cs[k].r * Math.sin(a),
  ];
  const used = new Set<number>();
  let best: typeof arcs = [];
  for (let s0 = 0; s0 < arcs.length; s0++) {
    if (used.has(s0)) continue;
    const loop: typeof arcs = [];
    let i = s0;
    while (!used.has(i)) {
      used.add(i);
      loop.push(arcs[i]);
      const [ex, ey] = pt(arcs[i].k, arcs[i].a1);
      let next = -1;
      let bestD = Infinity;
      arcs.forEach((q, j) => {
        const [sx, sy] = pt(q.k, q.a0);
        const d = Math.hypot(sx - ex, sy - ey);
        if (d < bestD) [bestD, next] = [d, j];
      });
      i = next;
    }
    if (loop.length > best.length) best = loop;
  }
  return best;
}

/** The closing of the union of `discs` by a disc of radius `s`, sampled: a
 *  ring made of arcs of the discs and concave arcs of radius `s`. */
function arcContour(discs: Disc[], s: number): [number, number][] {
  const grown = discs.map((d) => ({ ...d, r: d.r + s }));
  const loop = unionBoundary(grown);
  const out: [number, number][] = [];
  const sample = (cx: number, cy: number, r: number, a: number, b: number) => {
    const n = Math.max(2, Math.ceil((Math.abs(b - a) * r) / 1.5));
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n;
      out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
  };
  loop.forEach((arc, i) => {
    const c = discs[arc.k];
    sample(c.x, c.y, c.r, arc.a0, arc.a1);
    const nxt = loop[(i + 1) % loop.length];
    const g = grown[arc.k];
    const vx = g.x + g.r * Math.cos(arc.a1);
    const vy = g.y + g.r * Math.sin(arc.a1);
    const f0 = Math.atan2(c.y - vy, c.x - vx);
    let f1 = Math.atan2(discs[nxt.k].y - vy, discs[nxt.k].x - vx);
    while (f1 - f0 > Math.PI) f1 -= TAU;
    while (f1 - f0 < -Math.PI) f1 += TAU;
    sample(vx, vy, s, f0, f1);
  });
  return out;
}

// Africa's 21 countries, packed with a 6 px gap so the concave corners show.
const africa: Disc[] = (() => {
  const rows = countries.filter((d) => d.continent === "Africa");
  const packed = packSiblings(
    rows.map((d) => ({ r: K * Math.sqrt(d.pop) + 3, x: 0, y: 0 }))
  );
  return packed.map((p) => ({ x: p.x + 170, y: p.y + 170, r: p.r - 3 }));
})();
const P3 = 6; // contour distance

const svgPanel = (title: string, contour: [number, number][]) => {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "340");
  svg.setAttribute("height", "340");
  const path = document.createElementNS(ns, "path");
  const pts = contour.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`);
  path.setAttribute("d", "M" + pts.join("L") + "Z");
  path.setAttribute("fill", "#f2c14e");
  path.setAttribute("fill-opacity", "0.25");
  path.setAttribute("stroke", "#000");
  path.setAttribute("stroke-width", "1.5");
  svg.append(path);
  for (const d of africa) {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", `${d.x}`);
    c.setAttribute("cy", `${d.y}`);
    c.setAttribute("r", `${d.r}`);
    c.setAttribute("fill", "#f2c14e");
    svg.append(c);
  }
  return [title, svg] as const;
};

const blobPanel = (title: string, shape: Shape.Shape) => {
  const cell = document.createElement("div");
  layer([
    // An invisible anchor at the origin, so the panel keeps the SVG panels'
    // coordinates and the outline is not clipped at the left edge.
    position({ x: 0, y: 0 }, [circle({ r: 0.5, fill: "none" })]),
    ...africa.map((d, i) =>
      position({ x: d.x - d.r, y: d.y - d.r }, [
        circle({ r: d.r, fill: "#f2c14e" }).name(`d${i}`),
      ])
    ),
  ])
    .relate((n: any) => [
      enclose(
        {
          shape,
          padding: P3,
          fill: "#f2c14e",
          fillOpacity: 0.25,
          stroke: "#000",
          strokeWidth: 1.5,
        },
        africa.map((_, i) => n[`d${i}`])
      ),
    ])
    .render(cell, { w: 340, h: 340 });
  return [title, cell] as const;
};

export const C3ArcsVsBlob: StoryObj = {
  render: () => {
    const container = initializeContainer();
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(3, 350px)";
    const padded = africa.map((d) => ({ ...d, r: d.r + P3 }));
    const panels = [
      svgPanel("paper: arcs, s = 0 (padded union)", arcContour(padded, 0.01)),
      svgPanel("paper: arcs, s = 12", arcContour(padded, 12)),
      svgPanel("paper: arcs, s = 40", arcContour(padded, 40)),
      blobPanel("Shape.blob()", Shape.blob()),
      blobPanel("Shape.blob({ convexity: 0.2 })", Shape.blob({ convexity: 0.2 })),
      blobPanel("Shape.hull()", Shape.hull()),
    ];
    for (const [title, el] of panels) {
      const cell = document.createElement("div");
      const h = document.createElement("div");
      h.textContent = title;
      h.style.font = "600 12px sans-serif";
      cell.append(h, el);
      container.append(cell);
    }
    return container;
  },
};

// Chart form: can `padding` be read per group? Only paint channels resolve
// from data, so wrap the mark in a function of the group's refs.
export const C4ChartFormFunctionMark = show((c) =>
  chart(countries, { w: 560, h: 560 })
    .flow(
      pack({ by: "continent", padding: 2 * (PR + 12) + GAP } as any),
      pack({ by: "region", padding: 2 * 14 + GAP } as any),
      pack({ padding: 1 } as any)
    )
    .mark(leaf)
    .layer(
      chart(selectAll("leaves"))
        .flow(group({ by: "region" }))
        .mark((refs: any[], ...rest: any[]) =>
          (
            enclose({
              shape: Shape.blob(),
              padding: 2 + refs[0].datum[0].uncertainty,
              fill: "continent",
              fillOpacity: 0.15,
              stroke: "#444",
              strokeWidth: 1,
            }) as any
          )(refs, ...rest)
        )
    )
    .render(c)
);
