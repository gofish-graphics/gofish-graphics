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
 * Round 2 adds STATE BLOCKS (`.when(cond, { ...overrides, rest })` chained
 * after a mark). They do not run yet, so `desugarStates` below is a
 * PROTOTYPE OF THE REWRITE: it turns state blocks into today's per-channel
 * `when(c).then(v).otherwise(base)` chains. `raise` has no such rewrite
 * today (see BirdStates), so the stories stand it in by data order.
 * `StatePrecedence` (through the rewrite) and `StatePrecedenceExplicit`
 * (hand-written explicit form) must render the same DOM.
 *
 * Not gallery-tagged, and exempt from Python parity: review material.
 */
import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../../helper";
import { seafood, catchLocationsArray } from "../../../src/data/catch";
import { penguins } from "../../../src/data/penguins";
import { birds } from "../../../src/data/birds";
import { titanic } from "../../../src/data/titanic";
import { color6, gray } from "../../../src/color";
import { world110m } from "../../../src/data/world110m";
import {
  Color,
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
  stack,
  sumBy,
  text,
  when,
} from "../../../src/lib";
import type { Expr } from "../../../src/ast/expr";

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

/* 7. Round 2: the state-block rewrite -------------------------------- */

/** One state block, `.when(cond, { ...set, rest })`. `any` is `cond.any()`
 *  over the mark's shapes (is the condition true for at least one of them);
 *  the capture holds the inputs fixed, so the panel passes it in. */
type State = {
  cond: Expr;
  any: boolean;
  set: Record<string, unknown>;
  rest?: Record<string, unknown>;
};

/**
 * PROTOTYPE of the rewrite. For each channel a state block touches:
 *
 *   k: when(c_n).then(v_n)                       // later blocks first
 *        .when(c_n.not().and(c_n.any())).then(r_n)
 *        ...
 *        .otherwise(base_k)
 *
 * First true branch wins,
 * so a later block overrides an earlier one channel by channel (the CSS
 * cascade by source order).
 */
function desugarStates(base: Record<string, unknown>, states: State[]) {
  const keys = new Set<string>();
  for (const s of states)
    for (const k of [...Object.keys(s.set), ...Object.keys(s.rest ?? {})])
      keys.add(k);
  const chainFor = (k: string, baseValue: unknown): any => {
    const branches: [Expr, unknown][] = [];
    for (const s of [...states].reverse()) {
      if (k in s.set) branches.push([s.cond, s.set[k]]);
      if (s.rest && k in s.rest)
        branches.push([s.cond.not().and(s.any), s.rest[k]]);
    }
    if (branches.length === 0) return baseValue;
    let chain: any = when(branches[0][0]).then(branches[0][1] as any);
    for (const [c, v] of branches.slice(1)) chain = chain.when(c).then(v);
    return chain.otherwise(baseValue as any);
  };
  const opts: Record<string, unknown> = { ...base };
  for (const k of keys) opts[k] = chainFor(k, base[k]);
  return { opts };
}

const inSet = (k: string, vals: string[]): Expr =>
  vals.length === 0
    ? (when(false).then(true).otherwise(false) as Expr)
    : vals
        .map((v) => field(k).eq(v) as Expr)
        .reduce((a, b) => a.or(b) as Expr);

/* 7a. Click multi-select with "fade the rest" -------------------------- */

export const ClickRest: StoryObj = {
  render: () =>
    strip(
      [[], ["Lake B"], ["Lake B", "Lake D"]] as string[][],
      (sel) =>
        sel.length
          ? `toggled on: ${sel.join(", ")}; the rest fade`
          : "nothing clicked: nothing fades",
      (box, sel) => {
        const picked = inSet("lake", sel);
        const { opts } = desugarStates({ h: "count", fill: BLUE, opacity: 1 }, [
          {
            cond: picked,
            any: sel.length > 0,
            set: { fill: RED },
            rest: { opacity: 0.3 },
          },
        ]);
        chart(seafood)
          .flow(spread({ by: "lake", dir: "x" }))
          .mark(rect(opts as any))
          .render(sub(box), { w: 240, h: 220 });
      }
    ),
};

/* 7b. Two states at once: selected, then hovered (later wins) ---------- */

const PICKED = ["Lake B", "Lake D"];
const precedenceStates = (hov: string | undefined): State[] => [
  {
    cond: inSet("lake", PICKED),
    any: true,
    set: { fill: RED },
    rest: { opacity: 0.3 },
  },
  {
    cond: inSet("lake", hov ? [hov] : []),
    any: hov !== undefined,
    set: { strokeWidth: 3, opacity: 1 },
  },
];
const precedenceCaption = (hov: string | undefined) =>
  `selected: B, D; hovered: ${hov ?? "none"}`;
const PRECEDENCE_HOVERS = [undefined, "Lake C", "Lake D"];
const BASE_BAR = {
  h: "count",
  fill: BLUE,
  opacity: 1,
  stroke: "#222",
  strokeWidth: 0,
};

export const StatePrecedence: StoryObj = {
  render: () =>
    strip(PRECEDENCE_HOVERS, precedenceCaption, (box, hov) => {
      const { opts } = desugarStates(BASE_BAR, precedenceStates(hov));
      chart(seafood)
        .flow(spread({ by: "lake", dir: "x" }))
        .mark(rect(opts as any))
        .render(sub(box), { w: 240, h: 220 });
    }),
};

/** The same picture written by hand in the explicit form: one `when` chain
 *  per channel. Must match `StatePrecedence` exactly. */
export const StatePrecedenceExplicit: StoryObj = {
  render: () =>
    strip(PRECEDENCE_HOVERS, precedenceCaption, (box, hov) => {
      const picked = inSet("lake", PICKED);
      const hover = inSet("lake", hov ? [hov] : []);
      chart(seafood)
        .flow(spread({ by: "lake", dir: "x" }))
        .mark(
          rect({
            h: "count",
            fill: when(picked).then(RED).otherwise(BLUE),
            opacity: when(hover)
              .then(1)
              .when(picked.not().and(true))
              .then(0.3)
              .otherwise(1),
            stroke: "#222",
            strokeWidth: when(hover).then(3).otherwise(0),
          } as any)
        )
        .render(sub(box), { w: 240, h: 220 });
    }),
};

/* 7c. Bird migration: per-channel conditions vs a state with raise ----- */

const BIRD = "Black-and-white_Warbler";
// A fixed species -> color map, so reordering the rows (the raise stand-in)
// does not reshuffle the colors between panels.
const TABLEAU = ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac"];
const BIRD_COLORS = Color.palette(
  Object.fromEntries(
    [...new Set(birds.map((b: any) => b.species as string))].map((sp, i) => [
      sp,
      TABLEAU[i % TABLEAU.length],
    ])
  )
);
const eastMap = () =>
  chart(world110m, {
    coord: Coord.geo("equalEarth", { lon: [-100, -60], lat: [5, 50] }),
    legend: false,
  }).mark(polygon({ points: "ring", fill: "#f7f7f7", stroke: "#aaa" }));

export const BirdStates: StoryObj = {
  render: () =>
    strip(
      ["round 1", "state", "state + rest"] as const,
      (v) =>
        v === "round 1"
          ? "round 1: two per-channel conditions, no raise"
          : v === "state"
            ? "round 2: one state block with raise: true"
            : "round 2: the same block with rest: { opacity: 0.15 }",
      (box, v) => {
        const hot = field("species").eq(BIRD) as Expr;
        const base = { stroke: "species", strokeWidth: 1.5, opacity: 0.7 };
        const set: Record<string, unknown> = { strokeWidth: 5, opacity: 1 };
        // `raise: true` has no per-channel rewrite: `.zOrder()` sorts only
        // siblings, and under `group({ by: "species" })` each path is alone
        // in its group's frame (#982), so `.zOrder(1)` on it changes nothing.
        // Its explicit form is a z constraint over selections (proposed). The
        // stand-in here: paint order follows data order, so the hovered
        // species' rows go last.
        const rows =
          v === "round 1"
            ? birds
            : [
                ...birds.filter((b: any) => b.species !== BIRD),
                ...birds.filter((b: any) => b.species === BIRD),
              ];
        const { opts } = desugarStates(base, [
          {
            cond: hot,
            any: true,
            set,
            rest: v === "state + rest" ? { opacity: 0.15 } : undefined,
          },
        ]);
        eastMap()
          .layer(
            chart(rows, { color: BIRD_COLORS })
              .flow(
                group({ by: "species" }),
                scatter({ by: "day", x: "lon", y: "lat" })
              )
              .mark(line(opts as any))
          )
          .layer(
            text({ text: BIRD.replace(/_/g, " "), fontSize: 14, fill: "#333" })
          )
          .render(sub(box), { w: 400, h: 440 });
      }
    ),
};

/* 8. Diagram: hover a node; its edges turn red, rise, and the rest fade */

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
        // After `resolve`, source and target hold refs; the held hover is
        // precomputed as a field standing in for
        // `field("source").isIn(hover).or(field("target").isIn(hover))`.
        // `raise: true` stand-in, as in BirdStates: the touching edges go
        // last in data order.
        const tagged = edges.map((e) => ({
          ...e,
          touches: e.source === hov || e.target === hov,
        }));
        const hotEdges = [
          ...tagged.filter((e) => !e.touches),
          ...tagged.filter((e) => e.touches),
        ];
        const nodeState = desugarStates({ r: 14, fill: BLUE }, [
          { cond: field("id").eq(hov) as Expr, any: true, set: { fill: RED } },
        ]);
        const edgeState = desugarStates(
          { stroke: "#999", strokeWidth: 1.5, opacity: 1 },
          [
            {
              cond: field("touches").eq(true) as Expr,
              any: true,
              // `.zOrder(fn)` on this relational line runs once with the bag
              // of all five edges, not once per edge, so `raise` cannot
              // desugar to it (a finding; see the proposal).
              set: { stroke: RED, strokeWidth: 3 },
              rest: { opacity: 0.3 },
            },
          ]
        );
        chart(nodes, { axes: false })
          .flow(scatter({ by: "id", x: "grp", y: "id" }))
          .mark(circle(nodeState.opts as any).name("nodes"))
          .layer(
            chart(hotEdges)
              .flow(resolve(["source", "target"], { from: selectAll("nodes") }))
              .mark(
                line({
                  from: "source",
                  to: "target",
                  ...(edgeState.opts as any),
                }).zOrder(-1)
              )
          )
          .render(sub(box), { w: 260, h: 220 });
      }
    ),
};

/* ===================== Round 3: channel conditionals ==================== */
// Real conditionals from the corpus, written in the explicit expression form
// that runs today (polars' `when(c).then(v)...otherwise(d)`). Every candidate
// spelling in round 3 (`when(c, v)`, `cases([c, v], ...)`) builds this same
// IR `when` node, so one render serves all of them.

const CLASS_COLOR: Record<string, string> = {
  First: color6[0],
  Second: color6[1],
  Third: color6[2],
  Crew: color6[3],
};

/** `stories/lowlevel/NestedMosaicChart.stories.tsx`, with its closure
 *  `d.survived === "No" ? gray : classColor[d.class]` written as an
 *  expression (left) beside the original closure (right). */
export const TitanicCases: StoryObj = {
  render: () =>
    strip(
      ["as an expression", "as the closure (the story today)"] as const,
      (v) => v,
      (box, v) => {
        const fill =
          v === "as an expression"
            ? when(field("survived").eq("No"))
                .then(gray)
                .when(field("class").eq("First"))
                .then(color6[0])
                .when(field("class").eq("Second"))
                .then(color6[1])
                .when(field("class").eq("Third"))
                .then(color6[2])
                .otherwise(color6[3])
            : (d: any) =>
                one(d, "survived") === "No"
                  ? gray
                  : CLASS_COLOR[one(d, "class")];
        chart(titanic)
          .flow(
            stack({ by: "class", dir: "y", size: field("count").normalize() }),
            stack({ by: "sex", dir: "x", size: field("count").normalize() }),
            stack({
              by: "survived",
              dir: "y",
              size: field("count").normalize(),
            })
          )
          .mark(rect({ fill: fill as any, stroke: "white", strokeWidth: 1 }))
          .render(sub(box), { w: 300, h: 300 });
      }
    ),
};

/** `stories/forwardsyntax/Bar/BarNegative.stories.tsx` "UnroundedMin", with
 *  an added three-case diverging fill by sign and size. */
export const SignedFill: StoryObj = {
  render: () =>
    strip(
      [
        "three cases on value: < -25, < 0, otherwise",
        "one arm (< 0), no otherwise: null elsewhere",
      ] as const,
      (v) => v,
      (box, v) => {
        const fill =
          v === "one arm (< 0), no otherwise: null elsewhere"
            ? when(field("value").lt(0)).then("#ef8a62")
            : when(field("value").lt(-25))
                .then("#b2182b")
                .when(field("value").lt(0))
                .then("#ef8a62")
                .otherwise("#4393c3");
        chart([
          { category: "A", value: 30 },
          { category: "B", value: -20 },
          { category: "C", value: 45 },
          { category: "D", value: -35 },
          { category: "E", value: 10 },
          { category: "F", value: -5 },
        ])
          .flow(spread({ by: "category", dir: "x" }))
          .mark(
            rect({ h: "value", fill })
          )
          .render(sub(box), { w: 320, h: 240 });
      }
    ),
};

/** A size conditional (pipeline tier): the brushed penguins drawn larger. The
 *  brush is held fixed; its test is an expression over the row. FINDING: an
 *  expression on `r` is read as a data accessor, so its branch values are
 *  data values sent through the size scale, not pixels (right panel). */
const BRUSH_HELD = { x0: 185, x: 200, y0: 3200, y: 4200 };
export const BrushRadius: StoryObj = {
  render: () =>
    strip(
      ["r: 2.5 (a literal), fill conditional", "r: when(...) 4.5 / 2"] as const,
      (v) => v,
      (box, v) => {
        const b = BRUSH_HELD;
        const inBrush = field(FLIP)
          .gtEq(b.x0)
          .and(field(FLIP).ltEq(b.x))
          .and(field(MASS).gtEq(b.y0))
          .and(field(MASS).ltEq(b.y));
        chart(peng, { axes: true })
          .flow(scatter({ x: FLIP, y: MASS }))
          .mark(
            circle({
              r:
                v === "r: 2.5 (a literal), fill conditional"
                  ? 2.5
                  : when(inBrush).then(4.5).otherwise(2),
              fill: when(inBrush).then(RED).otherwise("#bbb"),
            } as any)
          )
          .layer(
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
          .render(sub(box), { w: 300, h: 260 });
      }
    ),
};
