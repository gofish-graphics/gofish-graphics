import {
  chart as gofishChart,
  Layer,
  color,
  value,
  spread as gofishSpread,
  stack as gofishStack,
  scatter as gofishScatter,
  derive,
  table as gofishTable,
  rect,
  blank as scaffold,
  line,
  selectAll as select,
  clock,
  polar,
  area,
  group as gofishGroup,
  layer as markLayer,
  Frame,
  stackX,
  ellipse,
  petal,
  wavy,
  palette,
  gradient,
} from "gofish-graphics";
import _ from "lodash";
import { seafood, catchLocations } from "@gofish-data/catch";

const CHART_W = 480;
const CHART_H = 320;

const Chart = (data?: unknown, options: Record<string, unknown> = {}) =>
  data === undefined
    ? gofishChart()
    : gofishChart(data, { axes: true, ...options });

const spread = (byOrOptions: string | Record<string, unknown>, options = {}) =>
  typeof byOrOptions === "string"
    ? gofishSpread({ by: byOrOptions, ...options })
    : gofishSpread(byOrOptions);

const stack = (byOrOptions: string | Record<string, unknown>, options = {}) =>
  typeof byOrOptions === "string"
    ? gofishStack({ by: byOrOptions, ...options })
    : gofishStack(byOrOptions);

const scatter = (
  byOrOptions: string | Record<string, unknown>,
  options = {}
) =>
  typeof byOrOptions === "string"
    ? gofishScatter({ by: byOrOptions, ...options })
    : gofishScatter(byOrOptions);

const group = (byOrOptions: string | Record<string, unknown>) =>
  typeof byOrOptions === "string"
    ? gofishGroup({ by: byOrOptions })
    : gofishGroup(byOrOptions);

const table = (
  xOrOptions: string | Record<string, unknown>,
  y?: string,
  options = {}
) =>
  typeof xOrOptions === "string"
    ? gofishTable({ by: { x: xOrOptions, y }, ...options })
    : gofishTable(xOrOptions);

const color6 = [
  "#4190c5",
  "#f2cf57",
  "#a181c8",
  "#ff9666",
  "#43b780",
  "#d45e83",
];

function getContainer(id: string): HTMLElement | null {
  return document.getElementById(id);
}

// ── Opening: Franconeri — same data, two groupings ────────────────────────
type HeightSample = {
  age: string;
  person: "Charlie" | "River";
  height: number;
};

const franconeriHeights: HeightSample[] = [
  { age: "8", person: "Charlie", height: 50 },
  { age: "8", person: "River", height: 48 },
  { age: "10", person: "Charlie", height: 54 },
  { age: "10", person: "River", height: 53 },
  { age: "12", person: "Charlie", height: 58 },
  { age: "12", person: "River", height: 51 }, // slight but real decrease
];

const FRANCONERI_BAR_COLOR = "#7c8a99";

function renderFranconeriA() {
  const el = getContainer("chart-franconeri-a");
  if (!el || el.children.length > 0) return;
  // Outer: age. Inner: Charlie vs River side-by-side via inner spread.
  // Easy query: "who is taller at each age?"
  Chart(franconeriHeights)
    .flow(
      spread("age", { dir: "x", spacing: 32 }),
      spread("person", { dir: "x", spacing: 8 })
    )
    .mark(rect({ h: "height", fill: FRANCONERI_BAR_COLOR }))
    .render(el, { w: CHART_W, h: CHART_H, axes: true });
}

const KEY_W = 280;
const KEY_H = 190;

function renderFranconeriAKey() {
  const el = getContainer("chart-franconeri-a-key");
  if (!el || el.children.length > 0) return;
  Chart(franconeriHeights)
    .flow(
      spread("age", { dir: "x", spacing: 16 }),
      spread("person", { dir: "x", spacing: 4 })
    )
    .mark(rect({ h: "height", fill: FRANCONERI_BAR_COLOR }))
    .render(el, { w: KEY_W, h: KEY_H, axes: true });
}

function renderFranconeriAColor() {
  const el = getContainer("chart-franconeri-a-color");
  if (!el || el.children.length > 0) return;
  Chart(franconeriHeights)
    .flow(
      spread("age", { dir: "x", spacing: 16 }),
      spread("person", { dir: "x", spacing: 4 })
    )
    .mark(rect({ h: "height", fill: "person" }))
    .render(el, { w: CHART_W, h: CHART_H, axes: true });
}

function renderFranconeriAColorKey() {
  const el = getContainer("chart-franconeri-a-color-key");
  if (!el || el.children.length > 0) return;
  Chart(franconeriHeights)
    .flow(
      spread("age", { dir: "x", spacing: 16 }),
      spread("person", { dir: "x", spacing: 4 })
    )
    .mark(rect({ h: "height", fill: "person" }))
    .render(el, { w: KEY_W, h: KEY_H, axes: true });
}

function renderFranconeriC() {
  const el = getContainer("chart-franconeri-c");
  if (!el || el.children.length > 0) return;
  // Line chart over age, one line per person, color encodes person.
  // Easy query: "how does each person's height change over time?"
  Layer([
    Chart(franconeriHeights)
      .flow(group("person"), scatter("age", { x: "age", y: "height" }))
      .mark(scaffold().name("franconeri-pts")),
    Chart(select("franconeri-pts"))
      .flow(group("person"))
      .mark(line({ strokeWidth: 2 })),
  ]).render(el, { w: CHART_W, h: CHART_H, axes: true });
}

function renderFranconeriB() {
  const el = getContainer("chart-franconeri-b");
  if (!el || el.children.length > 0) return;
  // Outer: person. Inner: ages side-by-side via inner spread.
  // Easy query: "how does height change across ages for each person?"
  Chart(franconeriHeights)
    .flow(
      spread("person", { dir: "x", spacing: 32 }),
      spread("age", { dir: "x", spacing: 8 })
    )
    .mark(rect({ h: "height", fill: FRANCONERI_BAR_COLOR }))
    .render(el, { w: CHART_W, h: CHART_H, axes: true });
}

function renderFranconeriBKey() {
  const el = getContainer("chart-franconeri-b-key");
  if (!el || el.children.length > 0) return;
  Chart(franconeriHeights)
    .flow(
      spread("person", { dir: "x", spacing: 16 }),
      spread("age", { dir: "x", spacing: 4 })
    )
    .mark(rect({ h: "height", fill: FRANCONERI_BAR_COLOR }))
    .render(el, { w: KEY_W, h: KEY_H, axes: true });
}

const SPEC_BAR_W = 440;
const SPEC_BAR_H = 260;

/** Live bar chart on “our first GoFish spec” slides (bottom-left). */
function renderSpecBarChart(id: string) {
  const el = getContainer(id);
  if (!el || el.children.length > 0) return;
  Chart(seafood)
    .flow(spread("lake", { dir: "x" }))
    .mark(rect({ h: "count" }))
    .render(el, { w: SPEC_BAR_W, h: SPEC_BAR_H, axes: true });
}

// ── Part 1 — Step 2: Stacked bar ─────────────────────────────────────────
function renderStackedChart() {
  const el = getContainer("chart-stacked");
  if (!el || el.children.length > 0) return;
  Chart(seafood)
    .flow(spread("lake", { dir: "x" }), stack("species", { dir: "y" }))
    .mark(rect({ h: "count", fill: "species" }))
    .render(el, { w: CHART_W, h: CHART_H, axes: true });
}

// ── Part 1 — Step 5: Color/labels discussion — same chart, second instance
function renderStackedChart2() {
  const el = getContainer("chart-stacked-2");
  if (!el || el.children.length > 0) return;
  Chart(seafood)
    .flow(spread("lake", { dir: "x" }), stack("species", { dir: "y" }))
    .mark(rect({ h: "count", fill: "species" }))
    .render(el, { w: CHART_W, h: 240, axes: true });
}

// ── Part 1 — Step 2b: Sorted stacked bar ─────────────────────────────────
function renderSortedChart() {
  const el = getContainer("chart-sorted");
  if (!el || el.children.length > 0) return;
  Chart(seafood)
    .flow(
      spread("lake", { dir: "x" }),
      derive((d) => _.orderBy(d, "count", "asc")),
      stack("species", { dir: "y" })
    )
    .mark(rect({ h: "count", fill: "species" }))
    .render(el, { w: CHART_W, h: CHART_H, axes: true });
}

// ── Part 1 — Step 3: Ribbon (stacked area) ───────────────────────────────
function renderRibbonChart() {
  const el = getContainer("chart-ribbon");
  if (!el || el.children.length > 0) return;
  Layer([
    Chart(seafood)
      .flow(
        spread("lake", { dir: "x", spacing: 64 }),
        derive((d) => _.orderBy(d, "count", "asc")),
        stack("species", { dir: "y" })
      )
      .mark(rect({ h: "count", fill: "species" }).name("bars")),
    Chart(select("bars"))
      .flow(group("species"))
      .mark(area({ opacity: 0.8 })),
  ]).render(el, { w: CHART_W, h: CHART_H, axes: true });
}

// ── Part 1 — Step 4: Polar ribbon ────────────────────────────────────────
function renderPolarChart() {
  const el = getContainer("chart-polar");
  if (!el || el.children.length > 0) return;
  Layer({ coord: clock() }, [
    Chart(seafood)
      .flow(
        spread("lake", {
          dir: "x",
          spacing: (2 * Math.PI) / 6,
          mode: "center",
          y: 50,
          label: false,
        }),
        derive((d) => _.orderBy(d, "count", "asc")),
        stack("species", { dir: "y", label: false })
      )
      .mark(rect({ w: 0.1, h: "count", fill: "species" }).name("bars")),
    Chart(select("bars"))
      .flow(group("species"))
      .mark(area({ opacity: 0.8 })),
  ]).render(el, { w: CHART_H, h: CHART_H, axes: true });
}

// ── Part 1 — Step 4b: Highlighted ribbon ─────────────────────────────────
function renderRibbonHighlightChart() {
  const el = getContainer("chart-ribbon-highlight");
  if (!el || el.children.length > 0) return;
  Layer([
    Chart(seafood, {
      color: palette({ Salmon: "#e15759", Trout: "#4e79a7" }),
    })
      .flow(
        spread("lake", { dir: "x", spacing: 64 }),
        derive((d) => _.orderBy(d, "count", "asc")),
        stack("species", { dir: "y" })
      )
      .mark(rect({ h: "count", fill: "species" }).name("bars")),
    Chart(select("bars"))
      .flow(group("species"))
      .mark(area({ opacity: 0.6 })),
  ]).render(el, { w: CHART_W, h: CHART_H, axes: true });
}

// ── Part 1 — Step 4b: Highlighted polar ribbon ───────────────────────────
function renderPolarHighlightChart() {
  const el = getContainer("chart-polar-highlight");
  if (!el || el.children.length > 0) return;
  Layer({ coord: clock() }, [
    Chart(seafood, {
      color: palette({ Salmon: "#e15759", Trout: "#4e79a7" }),
    })
      .flow(
        spread("lake", {
          dir: "x",
          spacing: (2 * Math.PI) / 6,
          mode: "center",
          y: 50,
          label: false,
        }),
        derive((d) => _.orderBy(d, "count", "asc")),
        stack("species", { dir: "y", label: false })
      )
      .mark(rect({ w: 0.1, h: "count", fill: "species" }).name("bars")),
    Chart(select("bars"))
      .flow(group("species"))
      .mark(area({ opacity: 0.6 })),
  ]).render(el, { w: CHART_H, h: CHART_H, axes: true });
}

// ── Part 2: Scatter pie ───────────────────────────────────────────────────
const scatterByLake = _(seafood)
  .groupBy("lake")
  .map((lakeData, lake) => ({
    lake,
    x: catchLocations[lake as keyof typeof catchLocations].x,
    y: catchLocations[lake as keyof typeof catchLocations].y,
    collection: lakeData.map((item) => ({
      species: item.species,
      count: item.count,
    })),
  }))
  .value();

function renderScatterPieChart() {
  const el = getContainer("chart-scatter-pie");
  if (!el || el.children.length > 0) return;
  Chart(scatterByLake)
    .flow(scatter("lake", { x: "x", y: "y" }))
    .mark((data) =>
      Chart(data[0].collection, { coord: clock() })
        .flow(stack("species", { dir: "x", h: 20 }))
        .mark(rect({ w: "count", fill: "species" }))
    )
    .render(el, { w: CHART_W, h: CHART_H, axes: true });
}

function renderFlowerChart() {
  const el = getContainer("chart-flower");
  if (!el || el.children.length > 0) return;

  const FLOWER_RADIUS = 40;
  const stemData = seafood.map((d) => ({
    ...d,
    x: catchLocations[d.lake as keyof typeof catchLocations].x,
  }));

  Layer([
    gofishChart(stemData)
      .flow(gofishScatter({ by: "lake", x: "x" }))
      .mark(rect({ w: 4, h: "count", fill: color.green[5] }).name("stems")),
    gofishChart(select("stems"))
      .flow(gofishGroup({ by: "lake" }))
      .mark(((d: any[]) =>
        gofishSpread(
          { dir: "y", alignment: "middle", spacing: -FLOWER_RADIUS },
          [
            d[0],
            markLayer({ coord: polar() }, [
              stackX(
                {
                  h: FLOWER_RADIUS,
                  spacing: 0,
                  alignment: "start",
                  sharedScale: true,
                },
                (d[0].datum as { species: string; count: number }[]).map((r) =>
                  petal({
                    w: value(r.count),
                    fill: value(r.species).lighten(0.5),
                  })
                )
              ),
            ]),
          ]
        )) as any),
  ]).render(el, { w: CHART_W, h: CHART_H, axes: false });
}

// ── Part 2: Balloon chart ─────────────────────────────────────────────────
// Species appear in seafood in this order → map to color6 indices
const speciesColorMap: Record<string, string> = {
  Bass: color6[0],
  Trout: color6[1],
  Catfish: color6[2],
  Perch: color6[3],
  Salmon: color6[4],
};

function renderBalloonChart() {
  const el = getContainer("chart-balloon");
  if (!el || el.children.length > 0) return;

  const Balloon = (
    x: number,
    y: number,
    scale: number,
    colors: { body: string; highlight: string; knot: string }
  ) =>
    Frame(
      {
        x: x - 15 * scale,
        y: y + 27 * scale,
        box: true,
        transform: { scale: { x: scale, y: -scale } },
      },
      [
        ellipse({
          cx: 15,
          cy: 15,
          w: 24,
          h: 30,
          fill: colors.body,
        }),
        ellipse({
          cx: 12,
          cy: 11,
          w: 7,
          h: 11,
          fill: colors.highlight,
        }),
        rect({
          cx: 15,
          cy: 32,
          w: 8,
          h: 4,
          fill: colors.knot,
          rx: 3,
          ry: 2,
        }),
        rect({
          cx: 15,
          cy: 32,
          w: 5,
          h: 2.4,
          fill: colors.knot,
          rx: 2,
          ry: 1,
        }),
      ]
    );

  Frame(
    { coord: wavy(), x: 0, y: 0 },
    scatterByLake.map((data) => {
      const top3 = _.orderBy(data.collection, "count", "desc").slice(0, 3);
      const colors = {
        body: speciesColorMap[top3[0]?.species] ?? color6[0],
        highlight: speciesColorMap[top3[1]?.species] ?? color6[1],
        knot: speciesColorMap[top3[2]?.species] ?? color6[2],
      };
      return Frame({ x: data.x }, [
        rect({ x: 0, y: 0, w: 1, h: data.y, emY: true, fill: "#333" }),
        Balloon(0, data.y, 1, colors),
      ]);
    })
  ).render(el, { w: CHART_W, h: CHART_H, axes: true });
}

// ── Public API ────────────────────────────────────────────────────────────
export function renderCharts() {
  renderFranconeriA();
  renderFranconeriAColor();
  renderFranconeriAColorKey();
  renderFranconeriB();
  renderFranconeriC();
  renderFranconeriAKey();
  renderFranconeriBKey();
  renderSpecBarChart("chart-spec-bar-1");
  renderSpecBarChart("chart-spec-bar-2");
  renderSpecBarChart("chart-spec-bar-3");
  renderStackedChart();
  renderSortedChart();
  renderStackedChart2();
  renderRibbonChart();
  renderPolarChart();
  renderRibbonHighlightChart();
  renderPolarHighlightChart();
  renderScatterPieChart();
  renderFlowerChart();
  renderBalloonChart();
  // ribbon build sequence
  renderChartById("chart-ribbon-build-sorted");
  renderChartById("chart-ribbon-build-spaced");
  renderChartById("chart-ribbon-build-ribbon");
}

function renderChartById(id: string) {
  const fn = chartRenderers[id];
  if (fn) fn();
}

export const chartRenderers: Record<string, () => void> = {
  "chart-spec-bar-1": () => renderSpecBarChart("chart-spec-bar-1"),
  "chart-spec-bar-2": () => renderSpecBarChart("chart-spec-bar-2"),
  "chart-spec-bar-3": () => renderSpecBarChart("chart-spec-bar-3"),
  "chart-franconeri-a": renderFranconeriA,
  "chart-franconeri-a-color": renderFranconeriAColor,
  "chart-franconeri-a-color-key": renderFranconeriAColorKey,
  "chart-franconeri-a-key-2": () => {
    const el = getContainer("chart-franconeri-a-key-2");
    if (!el || el.children.length > 0) return;
    Chart(franconeriHeights)
      .flow(
        spread("age", { dir: "x", spacing: 16 }),
        spread("person", { dir: "x", spacing: 4 })
      )
      .mark(rect({ h: "height", fill: FRANCONERI_BAR_COLOR }))
      .render(el, { w: KEY_W, h: KEY_H, axes: true });
  },
  "chart-franconeri-b-key-2": () => {
    const el = getContainer("chart-franconeri-b-key-2");
    if (!el || el.children.length > 0) return;
    Chart(franconeriHeights)
      .flow(
        spread("person", { dir: "x", spacing: 16 }),
        spread("age", { dir: "x", spacing: 4 })
      )
      .mark(rect({ h: "height", fill: FRANCONERI_BAR_COLOR }))
      .render(el, { w: KEY_W, h: KEY_H, axes: true });
  },
  "chart-franconeri-a-color-key-2": () => {
    const el = getContainer("chart-franconeri-a-color-key-2");
    if (!el || el.children.length > 0) return;
    Chart(franconeriHeights)
      .flow(
        spread("age", { dir: "x", spacing: 16 }),
        spread("person", { dir: "x", spacing: 4 })
      )
      .mark(rect({ h: "height", fill: "person" }))
      .render(el, { w: KEY_W, h: KEY_H, axes: true });
  },
  "chart-franconeri-b": renderFranconeriB,
  "chart-franconeri-c": renderFranconeriC,
  "chart-franconeri-a-key": renderFranconeriAKey,
  "chart-franconeri-b-key": renderFranconeriBKey,
  // bar→stacked transition
  "chart-ba1-a": () => {
    const el = getContainer("chart-ba1-a");
    if (!el || el.children.length > 0) return;
    Chart(seafood)
      .flow(spread("lake", { dir: "x" }))
      .mark(rect({ h: "count" }))
      .render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  "chart-ba1-b": () => {
    const el = getContainer("chart-ba1-b");
    if (!el || el.children.length > 0) return;
    Chart(seafood)
      .flow(spread("lake", { dir: "x" }), stack("species", { dir: "y" }))
      .mark(rect({ h: "count", fill: "species" }))
      .render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  // stacked→ribbon transition
  "chart-ba2-a": () => {
    const el = getContainer("chart-ba2-a");
    if (!el || el.children.length > 0) return;
    Chart(seafood)
      .flow(spread("lake", { dir: "x" }), stack("species", { dir: "y" }))
      .mark(rect({ h: "count", fill: "species" }))
      .render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  "chart-ba2-b": () => {
    const el = getContainer("chart-ba2-b");
    if (!el || el.children.length > 0) return;
    Layer([
      Chart(seafood)
        .flow(
          spread("lake", { dir: "x", spacing: 64 }),
          derive((d) => _.orderBy(d, "count", "asc")),
          stack("species", { dir: "y" })
        )
        .mark(rect({ h: "count", fill: "species" }).name("bars-ba2")),
      Chart(select("bars-ba2"))
        .flow(group("species"))
        .mark(area({ opacity: 0.8 })),
    ]).render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  // ribbon→color transition
  "chart-ba3-a": () => {
    const el = getContainer("chart-ba3-a");
    if (!el || el.children.length > 0) return;
    Layer([
      Chart(seafood)
        .flow(
          spread("lake", { dir: "x", spacing: 64 }),
          derive((d) => _.orderBy(d, "count", "asc")),
          stack("species", { dir: "y" })
        )
        .mark(rect({ h: "count", fill: "species" }).name("bars-ba3a")),
      Chart(select("bars-ba3a"))
        .flow(group("species"))
        .mark(area({ opacity: 0.8 })),
    ]).render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  "chart-ba3-b": () => {
    const el = getContainer("chart-ba3-b");
    if (!el || el.children.length > 0) return;
    Layer([
      Chart(seafood, {
        color: palette({ Salmon: "#e15759", Trout: "#4e79a7" }),
      })
        .flow(
          spread("lake", { dir: "x", spacing: 64 }),
          derive((d) => _.orderBy(d, "count", "asc")),
          stack("species", { dir: "y" })
        )
        .mark(rect({ h: "count", fill: "species" }).name("bars-ba3b")),
      Chart(select("bars-ba3b"))
        .flow(group("species"))
        .mark(area({ opacity: 0.6 })),
    ]).render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  // retrospective — three Franconeri charts with specs
  "chart-retro-a": () => {
    const el = getContainer("chart-retro-a");
    if (!el || el.children.length > 0) return;
    Chart(franconeriHeights)
      .flow(
        spread("age", { dir: "x", spacing: 16 }),
        spread("person", { dir: "x", spacing: 4 })
      )
      .mark(rect({ h: "height", fill: FRANCONERI_BAR_COLOR }))
      .render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  "chart-retro-b": () => {
    const el = getContainer("chart-retro-b");
    if (!el || el.children.length > 0) return;
    Chart(franconeriHeights)
      .flow(
        spread("person", { dir: "x", spacing: 16 }),
        spread("age", { dir: "x", spacing: 4 })
      )
      .mark(rect({ h: "height", fill: FRANCONERI_BAR_COLOR }))
      .render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  "chart-retro-c": () => {
    const el = getContainer("chart-retro-c");
    if (!el || el.children.length > 0) return;
    Layer([
      Chart(franconeriHeights)
        .flow(group("person"), scatter("age", { x: "age", y: "height" }))
        .mark(scaffold().name("retro-pts")),
      Chart(select("retro-pts"))
        .flow(group("person"))
        .mark(line({ strokeWidth: 2 })),
    ]).render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  "chart-sorted": renderSortedChart,
  "chart-sort-before": () => {
    const el = getContainer("chart-sort-before");
    if (!el || el.children.length > 0) return;
    Chart(seafood)
      .flow(spread("lake", { dir: "x" }), stack("species", { dir: "y" }))
      .mark(rect({ h: "count", fill: "species" }))
      .render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  "chart-sort-after": () => {
    const el = getContainer("chart-sort-after");
    if (!el || el.children.length > 0) return;
    Chart(seafood)
      .flow(
        spread("lake", { dir: "x" }),
        derive((d) => _.orderBy(d, "count", "asc")),
        stack("species", { dir: "y" })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  "chart-stacked": renderStackedChart,
  "chart-stacked-2": renderStackedChart2,
  // ── Key/value structure digression ──────────────────────────────────────
  "chart-kv-stacked-2": () => {
    const el = getContainer("chart-kv-stacked-2");
    if (!el || el.children.length > 0) return;
    Chart(seafood)
      .flow(spread("lake", { dir: "x" }), stack("species", { dir: "y" }))
      .mark(rect({ h: "count", fill: "species" }))
      .render(el, { w: 280, h: 220, axes: true });
  },
  "chart-kv-stacked": () => {
    const el = getContainer("chart-kv-stacked");
    if (!el || el.children.length > 0) return;
    Chart(seafood)
      .flow(spread("lake", { dir: "x" }), stack("species", { dir: "y" }))
      .mark(rect({ h: "count", fill: "species" }))
      .render(el, { w: 280, h: 220, axes: true });
  },
  "chart-kv-grouped": () => {
    const el = getContainer("chart-kv-grouped");
    if (!el || el.children.length > 0) return;
    Chart(seafood)
      .flow(
        spread("lake", { dir: "x" }),
        spread("species", { dir: "x", spacing: 2 })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .render(el, { w: 280, h: 220, axes: true });
  },
  "chart-kv-grouped-r": () => {
    const el = getContainer("chart-kv-grouped-r");
    if (!el || el.children.length > 0) return;
    Chart(seafood)
      .flow(
        spread("species", { dir: "x" }),
        spread("lake", { dir: "x", spacing: 2 })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .render(el, { w: 280, h: 220, axes: true });
  },
  "chart-kv-heatmap": () => {
    const el = getContainer("chart-kv-heatmap");
    if (!el || el.children.length > 0) return;
    Chart(seafood, { color: gradient(["#e8f4f8", "#1a5276"]) })
      .flow(table("lake", "species", { spacing: 4 }))
      .mark(rect({ fill: "count" }))
      .render(el, { w: 280, h: 220, axes: true, legend: false });
  },
  // ribbon progressive build
  "chart-ribbon-build-sorted": () => {
    const el = getContainer("chart-ribbon-build-sorted");
    if (!el || el.children.length > 0) return;
    Chart(seafood)
      .flow(
        spread("lake", { dir: "x" }),
        derive((d) => _.orderBy(d, "count", "asc")),
        stack("species", { dir: "y" })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  "chart-ribbon-build-spaced": () => {
    const el = getContainer("chart-ribbon-build-spaced");
    if (!el || el.children.length > 0) return;
    Chart(seafood)
      .flow(
        spread("lake", { dir: "x", spacing: 64 }),
        derive((d) => _.orderBy(d, "count", "asc")),
        stack("species", { dir: "y" })
      )
      .mark(rect({ h: "count", fill: "species" }))
      .render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  "chart-ribbon-build-ribbon": () => {
    const el = getContainer("chart-ribbon-build-ribbon");
    if (!el || el.children.length > 0) return;
    Layer([
      Chart(seafood)
        .flow(
          spread("lake", { dir: "x", spacing: 64 }),
          derive((d) => _.orderBy(d, "count", "asc")),
          stack("species", { dir: "y" })
        )
        .mark(rect({ h: "count", fill: "species" }).name("bars-rbuild")),
      Chart(select("bars-rbuild"))
        .flow(group("species"))
        .mark(area({ opacity: 0.8 })),
    ]).render(el, { w: CHART_W, h: CHART_H, axes: true });
  },
  "chart-ribbon": renderRibbonChart,
  "chart-polar": renderPolarChart,
  "chart-ribbon-highlight": renderRibbonHighlightChart,
  "chart-polar-highlight": renderPolarHighlightChart,
  "chart-scatter-pie": renderScatterPieChart,
  "chart-flower": renderFlowerChart,
  "chart-balloon": renderBalloonChart,
};
