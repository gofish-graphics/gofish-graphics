import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "./helper";
import {
  chart,
  circle,
  enclose,
  filter,
  group,
  layer,
  line,
  pack,
  position,
  project,
  ref,
  scatter,
  selectAll,
  spread,
  text,
  Color,
  Shape,
} from "../src/lib";
import { penguins } from "../src/data/penguins";
import { gapminderCountries } from "../src/data/gapminderCountries";
import { countryPopulations } from "../src/data/countryPopulations";

const meta: Meta = { title: "Enclose/Shapes" };
export default meta;

// ── 1. Combinator form, fresh children ──────────────────────────────────────

const planets = [
  { name: "mercury", r: 15, fill: "#F5E3C8", stroke: "#EFC9A2" },
  { name: "venus", r: 36, fill: "#D2913C", stroke: "#A96F26" },
  { name: "earth", r: 38, fill: "#3E8CCC", stroke: "#2F6FA6" },
  { name: "mars", r: 21, fill: "#F4BC80", stroke: "#E0954C" },
];

// The planets laid out by `spread` inside the enclosure, which draws their
// padded box behind them.
export const PlanetsBox: StoryObj = {
  render: () => {
    const container = initializeContainer();
    enclose(
      {
        padding: 20,
        fill: "#252150",
        stroke: "none",
        shape: Shape.box({ rx: 16 }),
      },
      [
        spread(
          { dir: "x", spacing: 50, alignment: "middle" },
          planets.map((d) =>
            circle({ r: d.r, fill: d.fill, stroke: d.stroke, strokeWidth: 3 })
          )
        ),
      ]
    ).render(container);
    return container;
  },
};

// ── 2. Combinator form over `.relate()` operands ────────────────────────────

// Munkres' three points (Topology, Figure 12.1): the sets {a, b, c}, {a, b}
// and {b, c} as ellipses, and {a, c}, which does not hold b, as a spine that
// routes under b and keeps 6 px from it.
export const MunkresFigure: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Munkres Three Point Sets",
      description:
        "Three points in a row with four of their subsets drawn as outlines: ellipses around all three and around each neighboring pair, and a spine that holds the outer two while routing under the middle one.",
    },
  },
  render: () => {
    const container = initializeContainer();
    const outline = { fill: "none", stroke: "#111", strokeWidth: 1.5 };
    layer([
      spread({ dir: "x", spacing: 95, alignment: "middle" }, [
        circle({ r: 5, fill: "#111" }).name("a"),
        circle({ r: 5, fill: "#111" }).name("b"),
        circle({ r: 5, fill: "#111" }).name("c"),
      ]),
    ])
      .relate(({ a, b, c }: any) => [
        enclose({ shape: Shape.oval(), padding: 30, ...outline }, [a, b, c]),
        enclose({ shape: Shape.oval(), padding: 16, ...outline }, [a, b]),
        enclose({ shape: Shape.oval(), padding: 16, ...outline }, [b, c]),
        enclose(
          {
            shape: Shape.spine({ avoiding: [b], clearance: 6 }),
            padding: 12,
            ...outline,
          },
          [a, c]
        ),
      ])
      .render(container);
    return container;
  },
};

// ── 3. Combinator form over explicit `ref(...)` children ────────────────────

// The hull of three named circles, enclosed where they were placed.
export const RefHull: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      position({ x: 20, y: 70 }, [circle({ r: 12, fill: "#4c78a8" }).name("p")]),
      position({ x: 130, y: 10 }, [circle({ r: 8, fill: "#4c78a8" }).name("q")]),
      position({ x: 200, y: 90 }, [circle({ r: 16, fill: "#4c78a8" }).name("s")]),
    ])
      .relate(() => [
        enclose(
          {
            shape: Shape.hull(),
            padding: 10,
            fill: "#4c78a8",
            fillOpacity: 0.15,
            stroke: "#1f3b63",
            strokeWidth: 1.5,
          },
          [ref("p"), ref("q"), ref("s")]
        ),
      ])
      .render(container);
    return container;
  },
};

// ── 4. Chart mark form: one outline per group ───────────────────────────────

const beaks = penguins.filter(
  (d) => d["Beak Length (mm)"] != null && d["Beak Depth (mm)"] != null
);

/** The penguins' beaks with one outline per species, in a `w` × `h` plot. */
const penguinShapes = (shape: Shape.Shape, w: number, h: number) =>
  chart(beaks, {
    axes: true,
    w,
    h,
  })
    .flow(scatter({ x: "Beak Length (mm)", y: "Beak Depth (mm)" }))
    .mark(circle({ r: 2.5, fill: "Species" }).name("points"))
    .layer(
      chart(selectAll("points"))
        .flow(group({ by: "Species" }))
        .mark(
          enclose({
            shape,
            padding: 6,
            fill: "Species",
            stroke: "Species",
            fillOpacity: 0.2,
          })
        )
    );

/** A story of the penguins with one `shape` per species. */
const penguinStory = (shape: Shape.Shape): StoryObj => ({
  render: () => {
    const container = initializeContainer();
    penguinShapes(shape, 420, 320).render(container);
    return container;
  },
});

export const PenguinBoxes = penguinStory(Shape.box());
export const PenguinHulls = penguinStory(Shape.hull());
export const PenguinBlobs = penguinStory(Shape.blob());
export const PenguinSpines = penguinStory(Shape.spine());
export const PenguinOvals = penguinStory(Shape.oval());

// The four shapes on the same points: pick one from the menu, then tune it.
export const PenguinsFourShapes: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Penguins Four Shapes",
      description:
        "Penguin beak length against depth with one outline per species, drawn four ways: the padded box, the convex hull, a smooth blob, and the spine that only links the points.",
    },
  },
  render: () => {
    const container = initializeContainer();
    const shapes: [string, Shape.Shape][] = [
      ["Shape.box()", Shape.box()],
      ["Shape.hull()", Shape.hull()],
      ["Shape.blob()", Shape.blob()],
      ["Shape.spine()", Shape.spine()],
    ];
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(2, 500px)";
    for (const [title, shape] of shapes) {
      const cell = document.createElement("div");
      const heading = document.createElement("div");
      heading.textContent = title;
      heading.style.font = "600 13px sans-serif";
      cell.append(heading);
      container.append(cell);
      penguinShapes(shape, 360, 270).render(cell);
    }
    return container;
  },
};

// ── 5. Chart mark form over one selection, no group ─────────────────────────

const REGION_COLORS = {
  America: "#5aa3b8",
  "East Asia & Pacific": "#9cb850",
  "Europe & Central Asia": "#f2b45c",
  "Middle East & North Africa": "#a99bc0",
  "South Asia": "#e07b9b",
  "Sub-Saharan Africa": "#47b8a0",
};

// ChartAccent's bubble set around the Sub-Saharan African countries (Ren et
// al., PacificVis 2017), as one blob over the selected countries.
export const ChartAccentSubSaharanAfrica: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "ChartAccent Sub-Saharan Africa",
      description:
        "Fertility rate against life expectancy for 191 countries, with a smooth outline that gathers the Sub-Saharan African countries into one region.",
    },
  },
  render: () => {
    const container = initializeContainer();
    chart(gapminderCountries, {
      axes: true,
      w: 520,
      h: 320,
      color: Color.palette(REGION_COLORS),
    })
      .flow(scatter({ x: "FertilityRate", y: "LifeExpectancy" }))
      .mark(circle({ r: 3.5, fill: "Region", opacity: 0.8 }).name("countries"))
      .layer(
        chart(selectAll("countries"))
          .flow(
            filter(
              (country: any) =>
                project(country, "Region") === "Sub-Saharan Africa"
            )
          )
          .mark(
            enclose({
              shape: Shape.blob({ convexity: 0.1, neck: 0.6 }),
              padding: 6,
              fill: "#47b8a0",
              stroke: "#47b8a0",
              fillOpacity: 0.3,
            })
          )
      )
      .render(container);
    return container;
  },
};

// ── 6. avoiding and holes ───────────────────────────────────────────────────

type Pt = [number, number];
// A band of points two dots thick around a U-shaped path, with two gray
// non-members inside its opening.
const U: Pt[] = (() => {
  const path: Pt[] = [
    [35, 22],
    [35, 150],
    [190, 150],
    [190, 22],
  ];
  const out: Pt[] = [];
  for (let s = 0; s < 3; s++) {
    const [a, b] = [path[s], path[s + 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / L,
      ny = (b[0] - a[0]) / L;
    const k = Math.round(L / 26);
    for (let i = s === 0 ? 0 : 1; i <= k; i++) {
      const t = i / k,
        jit = ((i * 7 + s * 3) % 5) - 2;
      for (const side of [-1, 1])
        out.push([
          a[0] + t * (b[0] - a[0]) + side * 11 * nx + jit,
          a[1] + t * (b[1] - a[1]) + side * 11 * ny - jit,
        ]);
    }
  }
  return out;
})();
const GRAY: Pt[] = [
  [112, 50],
  [112, 100],
];
const dot = ([x, y]: Pt, fill: string, name: string) =>
  position({ x: x - 5, y: y - 5 }, [circle({ r: 5, fill }).name(name)]);

/** The U with a blob around its points that keeps out the gray ones. */
const uBlob = (holes: boolean) =>
  layer([
    ...U.map((p, i) => dot(p, "#3366aa", `u${i}`)),
    ...GRAY.map((p, i) => dot(p, "#9aa0a6", `g${i}`)),
  ]).relate((names: any) => [
    enclose(
      {
        shape: Shape.blob({
          convexity: 0.75,
          holes,
          avoiding: GRAY.map((_, i) => names[`g${i}`]),
        }),
        padding: 8,
        fill: "#3366aa",
        stroke: "#3366aa",
        fillOpacity: 0.25,
      },
      U.map((_, i) => names[`u${i}`])
    ),
  ]);

// holes off (the default): the gap the blob closes is filled, and each gray
// point inside it is cut back out as its clearance circle.
export const HolesFilled: StoryObj = {
  render: () => {
    const container = initializeContainer();
    uBlob(false).render(container);
    return container;
  },
};

// holes on: the gap stays open as it is.
export const HolesKept: StoryObj = {
  render: () => {
    const container = initializeContainer();
    uBlob(true).render(container);
    return container;
  },
};

// ── 7. Hyperedges: graph edges as members ───────────────────────────────────

const NODES: Record<string, Pt> = {
  n1: [40, 50],
  n2: [110, 30],
  n3: [100, 110],
  n4: [170, 90],
  n5: [240, 50],
  n6: [250, 130],
  n7: [180, 170],
  n8: [60, 180],
  n9: [310, 190],
  n10: [320, 80],
};
const EDGES: [string, string][] = [
  ["n1", "n2"],
  ["n1", "n3"],
  ["n2", "n4"],
  ["n3", "n4"],
  ["n4", "n5"],
  ["n4", "n6"],
  ["n6", "n7"],
  ["n3", "n8"],
  ["n7", "n9"],
  ["n5", "n10"],
  ["n6", "n9"],
  ["n8", "n7"],
];
const SETS = [
  { nodes: ["n1", "n2", "n3"], color: "#e45756" },
  { nodes: ["n4", "n5", "n6", "n10"], color: "#4c78a8" },
  { nodes: ["n3", "n8", "n7", "n9"], color: "#54a24b" },
];
const edgeName = ([p, q]: [string, string]) => `${p}-${q}`;

// Three sets over a node-link graph. Each set's members are its nodes and the
// edges between them, so its outline follows the drawn edges; every other
// node is avoided.
export const Hyperedges: StoryObj = {
  tags: ["gallery"],
  parameters: {
    gallery: {
      title: "Hyperedges over a Graph",
      description:
        "A small node-link graph with three overlapping sets, each drawn as a smooth band along its own nodes and edges that steers around the nodes outside the set.",
    },
  },
  render: () => {
    const container = initializeContainer();
    layer([
      layer(
        Object.entries(NODES).map(([id, [x, y]]) =>
          position({ x: x - 9, y: y - 9 }, [
            circle({ r: 9, fill: "white", stroke: "#333", strokeWidth: 1.5 }).name(
              id
            ),
          ])
        )
      ).relate((n: any) =>
        EDGES.map(([p, q]) =>
          line({ stroke: "#555", strokeWidth: 1.5 }, [n[p], n[q]]).name(
            edgeName([p, q])
          )
        )
      ),
    ])
      .relate((n: any) =>
        SETS.map((set) =>
          enclose(
            {
              shape: Shape.spine({
                avoiding: Object.keys(NODES).map((id) => n[id]),
                clearance: 3,
              }),
              padding: 6,
              fill: set.color,
              stroke: set.color,
              fillOpacity: 0.3,
            },
            [
              ...set.nodes.map((id) => n[id]),
              ...EDGES.filter(
                ([p, q]) => set.nodes.includes(p) && set.nodes.includes(q)
              ).map((e) => n[edgeName(e)]),
            ]
          )
        )
      )
      .render(container);
    return container;
  },
};

// ── 8. Shape.arcs: the radius of the closing disc ───────────────────────────

// Africa's countries packed 6 px apart (pixel radius, area proportional to
// population), outlined with `Shape.arcs` at growing radii. At radius 0 the
// outline is the padded circles' union; each concave corner becomes an arc
// of `radius`, and a large radius nears the convex hull.
const africa = countryPopulations
  .filter((d) => d.continent === "Africa")
  .map((d) => 1.6 * Math.sqrt(d.pop));

const arcsPanel = (radius: number) =>
  spread({ dir: "y", spacing: 8, alignment: "middle" }, [
    text({ text: `Shape.arcs({ radius: ${radius} })`, fontSize: 12 }),
    enclose(
      {
        shape: Shape.arcs({ radius }),
        padding: 6,
        fill: "#f2c14e",
        fillOpacity: 0.25,
        stroke: "#333",
        strokeWidth: 1.5,
      },
      [
        pack(
          { spacing: 6 },
          africa.map((r) => circle({ r, fill: "#f2c14e" }))
        ),
      ]
    ),
  ]);

export const ArcsRadiusSweep: StoryObj = {
  render: () => {
    const container = initializeContainer();
    spread({ dir: "y", spacing: 24 }, [
      spread({ dir: "x", spacing: 24 }, [0, 6, 12].map(arcsPanel)),
      spread({ dir: "x", spacing: 24 }, [24, 48, 200].map(arcsPanel)),
    ]).render(container);
    return container;
  },
};
