/**
 * THROWAWAY prototype stories for the proposal in
 * `proposals/source-reads/proposal.md` (how a spec reads hover, drag, brush
 * and click-select).
 *
 * Each story is a STRIP: the same spec held at several input states, side by
 * side. The capture harness cannot send pointer events (#672), so every panel
 * fixes the value the input would produce (the hovered lake, the brush
 * extent, the clicked set) and draws it with today's JS closures. The proposed
 * spellings live in the proposal; the code here is only the rendering.
 *
 * Not gallery-tagged, and exempt from Python parity: review material.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood, catchLocationsArray } from "../../../src/data/catch";
import { penguins } from "../../../src/data/penguins";
import { birds } from "../../../src/data/birds";
import { world110m } from "../../../src/data/world110m";
import {
  Coord,
  chart,
  circle,
  datum,
  enclose,
  field,
  filter,
  group,
  line,
  polygon,
  rect,
  resolve,
  scatter,
  selectAll,
  spread,
  sumBy,
  text,
  when,
} from "../../../src/lib";

const meta: Meta = { title: "Proposals/Source Reads" };
export default meta;

const FONT = "system-ui, -apple-system, sans-serif";
const RED = "#d62728";
const BLUE = "#6b9bd1";

const rowsOf = (d: unknown): any[] => (Array.isArray(d) ? d : [d]);
/** Projection with homogeneity collapse: the field's value when every row
 *  agrees, else undefined (the rule `by: "datum.k"` uses). */
const one = (d: unknown, k: string) => {
  const vals = new Set(rowsOf(d).map((r) => r?.[k]));
  return vals.size === 1 ? [...vals][0] : undefined;
};

/** A row of captioned panels; `draw` renders one panel into its box. */
const strip = <T,>(
  values: T[],
  caption: (v: T) => string,
  draw: (box: HTMLElement, v: T) => void
) => {
  const page = initializeContainer();
  Object.assign(page.style, {
    fontFamily: FONT,
    display: "flex",
    flexWrap: "wrap",
    maxWidth: "1400px",
    gap: "14px 22px",
    alignItems: "flex-start",
  });
  for (const v of values) {
    const cell = document.createElement("div");
    const label = document.createElement("div");
    Object.assign(label.style, { fontSize: "13px", color: "#555" });
    label.textContent = caption(v);
    const box = document.createElement("div");
    Object.assign(box.style, { display: "flex", gap: "16px" });
    cell.append(label, box);
    page.appendChild(cell);
    draw(box, v);
  }
  return page;
};

const sub = (box: HTMLElement) => {
  const el = document.createElement("div");
  box.appendChild(el);
  return el;
};

/* 1. Hover highlight on bars ------------------------------------------- */

export const HoverBars: StoryObj = {
  render: () =>
    strip(
      [undefined, "Lake B", "Lake E"] as (string | undefined)[],
      (lake) => (lake ? `hovered: the ${lake} bar` : "no pointer"),
      (box, lake) => {
        chart(seafood)
          .flow(spread({ by: "lake", dir: "x" }))
          .mark(
            rect({
              h: "count",
              fill: (d: any) => (one(d, "lake") === lake ? RED : BLUE),
            }).name("bars")
          )
          .render(sub(box), { w: 240, h: 220 });
      }
    ),
};

/* 1b. The same hover consumed as DATA: an outline layer over the picked ref */

export const HoverOverlay: StoryObj = {
  render: () =>
    strip(
      ["Lake B", "Lake E"],
      (lake) => `hovered: ${lake}, drawn as a layer over the picked ref`,
      (box, lake) => {
        chart(seafood)
          .flow(spread({ by: "lake", dir: "x" }))
          .mark(rect({ h: "count", fill: BLUE }).name("bars"))
          .layer(
            chart(selectAll("bars"))
              .flow(filter((r: any) => one(r.datum, "lake") === lake))
              .mark(
                enclose({
                  padding: 4,
                  fill: "none",
                  stroke: RED,
                  strokeWidth: 2.5,
                } as any)
              )
          )
          .render(sub(box), { w: 240, h: 220 });
      }
    ),
};

/* 2. Bird migration hover: line width, opacity, readout ---------------- */

const basemap = () =>
  chart(world110m, {
    coord: Coord.geo("equalEarth", { lon: [-170, -30], lat: [-60, 75] }),
    legend: false,
  }).mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }));

export const BirdHover: StoryObj = {
  render: () =>
    strip(
      [undefined, "Red-eyed_Vireo", "Lapland_Longspur"] as (
        | string
        | undefined
      )[],
      (s) => (s ? `hovered: the ${s} path` : "no pointer"),
      (box, species) => {
        // `line`'s paint channels take expressions, not closures: the held
        // species as a literal stands in for `when(hover)`.
        const hot = when(field("species").eq(species ?? ""));
        basemap()
          .layer(
            chart(birds)
              .flow(
                group({ by: "species" }),
                scatter({ by: "day", x: "lon", y: "lat" })
              )
              .mark(
                line({
                  stroke: "species",
                  strokeWidth: hot.then(3).otherwise(0.1),
                  opacity: hot.then(1).otherwise(0.5),
                }).name("paths")
              )
          )
          .layer(
            text({
              text: species ?? "",
              fontSize: 14,
              fill: "#333",
            })
          )
          .render(sub(box), { w: 290, h: 340 });
      }
    ),
};

/* 3. Draggable threshold ----------------------------------------------- */

const bars = [
  { cat: "a", count: 30 },
  { cat: "b", count: 95 },
  { cat: "c", count: 55 },
  { cat: "d", count: 72 },
  { cat: "e", count: 40 },
  { cat: "f", count: 88 },
];

export const Threshold: StoryObj = {
  render: () =>
    strip(
      [35, 60, 85],
      (c) => `drag y = ${c}`,
      (box, cut) => {
        chart(bars)
          .flow(spread({ by: "cat", dir: "x" }))
          .mark(
            rect({
              h: "count",
              fill: (d: any) => (sumBy(rowsOf(d), "count") > cut ? RED : BLUE),
            })
          )
          .layer(rect({ y: () => cut, h: 3, w: 240, fill: "#333" }))
          .render(sub(box), { w: 240, h: 200 });
      }
    ),
};

/* 4. Brush on a scatterplot -------------------------------------------- */

const FLIP = "Flipper Length (mm)";
const MASS = "Body Mass (g)";
const peng = penguins.filter((p) => p[FLIP] != null && p[MASS] != null);

type Brush = { x0: number; x: number; y0: number; y: number } | undefined;

export const BrushScatter: StoryObj = {
  render: () =>
    strip(
      [
        undefined,
        { x0: 185, x: 200, y0: 3200, y: 4200 },
        { x0: 208, x: 228, y0: 4800, y: 6100 },
      ] as Brush[],
      (b) =>
        b ? `brush: flipper ${b.x0} to ${b.x}, mass ${b.y0} to ${b.y}` : "no brush",
      (box, b) => {
        const inside = (r: any) =>
          b !== undefined &&
          r[FLIP] >= b.x0 &&
          r[FLIP] <= b.x &&
          r[MASS] >= b.y0 &&
          r[MASS] <= b.y;
        const dots = chart(peng, { axes: true })
          .flow(scatter({ x: FLIP, y: MASS }))
          .mark(
            circle({
              r: 2.5,
              fill: ((d: any) => (rowsOf(d).some(inside) ? RED : "#bbb")) as any,
            }).name("dots")
          );
        const c = b
          ? dots.layer(
              rect({
                x: datum(b.x0),
                y: datum(b.y0),
                w: datum(b.x - b.x0),
                h: datum(b.y - b.y0),
                fill: "#4c78a8",
                opacity: 0.15,
                stroke: "#4c78a8",
              } as any)
            )
          : dots;
        c.render(sub(box), { w: 270, h: 240 });
      }
    ),
};

/* 5. Click-to-select multi-select -------------------------------------- */

export const ClickMulti: StoryObj = {
  render: () =>
    strip(
      [[], ["Lake B"], ["Lake B", "Lake D"]] as string[][],
      (sel) =>
        sel.length ? `toggled on by clicks: ${sel.join(", ")}` : "nothing clicked",
      (box, sel) => {
        chart(seafood)
          .flow(spread({ by: "lake", dir: "x" }))
          .mark(
            rect({
              h: "count",
              fill: (d: any) => (sel.includes(one(d, "lake")) ? RED : BLUE),
            }).name("bars")
          )
          .render(sub(box), { w: 240, h: 220 });
      }
    ),
};

/* 6. Linked views: hover a bar, highlight the same lake on the map ----- */

export const LinkedLakes: StoryObj = {
  render: () =>
    strip(
      ["Lake D", "Lake F"],
      (lake) => `hovered in the bar chart: ${lake}`,
      (box, lake) => {
        chart(seafood)
          .flow(spread({ by: "lake", dir: "x" }))
          .mark(
            rect({
              h: "count",
              fill: (d: any) => (one(d, "lake") === lake ? RED : BLUE),
            }).name("bars")
          )
          .render(sub(box), { w: 220, h: 200 });
        chart(catchLocationsArray, { axes: true })
          .flow(scatter({ by: "lake", x: "x", y: "y" }))
          .mark(
            circle({
              r: 9,
              fill: ((d: any) => (one(d, "lake") === lake ? RED : BLUE)) as any,
            })
          )
          .render(sub(box), { w: 220, h: 200 });
      }
    ),
};

/* 7. Diagram: hover a node, highlight its incident edges --------------- */

const nodes = [
  { id: "a", grp: 0 },
  { id: "b", grp: 1 },
  { id: "c", grp: 1 },
  { id: "d", grp: 2 },
  { id: "e", grp: 2 },
];
const edges = [
  { source: "a", target: "b" },
  { source: "a", target: "c" },
  { source: "b", target: "d" },
  { source: "c", target: "d" },
  { source: "c", target: "e" },
];

export const GraphHover: StoryObj = {
  render: () =>
    strip(
      ["b", "c"],
      (id) => `hovered node: ${id}`,
      (box, hov) => {
        // `line`'s paint channels take expressions, not closures, so the
        // held hover is precomputed as a field: does this edge touch it?
        const hotEdges = edges.map((e) => ({
          ...e,
          touches: e.source === hov || e.target === hov,
        }));
        const touches = when(field("touches"));
        chart(nodes, { axes: false })
          .flow(scatter({ by: "id", x: "grp", y: "id" }))
          .mark(
            circle({
              r: 14,
              fill: ((d: any) => (one(d, "id") === hov ? RED : BLUE)) as any,
            }).name("nodes")
          )
          .layer(
            chart(hotEdges)
              .flow(resolve(["source", "target"], { from: selectAll("nodes") }))
              .mark(
                line({
                  from: "source",
                  to: "target",
                  stroke: touches.then(RED).otherwise("#bbb"),
                  strokeWidth: touches.then(3).otherwise(1.5),
                }).zOrder(-1)
              )
          )
          .render(sub(box), { w: 260, h: 220 });
      }
    ),
};
