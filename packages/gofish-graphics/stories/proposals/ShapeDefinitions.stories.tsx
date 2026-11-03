import type { Meta, StoryObj } from "@storybook/html";
import { initializeContainer } from "../helper";
import {
  Bin,
  Calendar,
  chart,
  circle,
  Color,
  Constraint,
  createMark,
  createName,
  derive,
  enclose,
  exclude,
  field,
  intersect,
  layer,
  line,
  mask,
  paint,
  partition,
  quantileRows,
  rect,
  ref,
  region,
  ribbon,
  scatter,
  image,
  v,
  Shape,
  spread,
  struct,
  subtract,
  text,
  blank,
  Unit,
} from "../../src/lib";
import { penguins } from "../../src/data/penguins";
import { seattleWeather } from "../../src/data/seatle-weather";
import bottlePng from "../assets/wilsonblanco.png";

/**
 * THROWAWAY prototype stories for the #1267 proposal
 * (`proposals/shape-definitions/proposal.md`). Not gallery stories.
 *
 * Each example has a `Current` story (today's spelling, copied from the
 * gallery story) and a `Proposed` story. The proposed spelling is
 * `mark.hidden()`, which does not exist. The `Proposed` stories use a
 * story-local shim, `hidden(mark)`, that lays the mark out exactly as usual
 * and then silences its whole subtree with the same rule `blank()` uses
 * (`INTERNAL_emitNothing`: no display items, no SVG element, no hit-test
 * entry). The shim wraps a mark function, so it cannot sit on a mark that
 * `.mark()` fuses (`.mark(ribbon)` ⇒ `.mark(blank).layer(ribbon)`). Those
 * stories write the fusion out by hand. A real `.hidden()` would be a mark
 * modifier like `.zOrder()` and would not need that.
 */
const meta: Meta = { title: "Proposals/Shape Definitions" };
export default meta;

type Args = { w: number; h: number };

// ── The shim ────────────────────────────────────────────────────────────────

/** Silence a node and everything under it: it keeps its layout, datum and
 *  name, and draws nothing. */
const silence = (node: any) => {
  if (!node || typeof node.INTERNAL_emitNothing !== "function") return;
  node.INTERNAL_emitNothing();
  for (const c of node.children ?? []) silence(c);
};

/** Story-only stand-in for the proposed `mark.hidden()`. */
function hidden<M extends (...args: any[]) => any>(mark: M): M {
  const wrapped = async (...args: any[]) => {
    const out = await mark(...args);
    if (Array.isArray(out)) out.forEach(silence);
    else silence(out);
    return out;
  };
  // Keep the mark's own tags (its kind, its IR tag).
  for (const key of Reflect.ownKeys(mark)) {
    if (key === "length" || key === "name" || key === "prototype") continue;
    const d = Object.getOwnPropertyDescriptor(mark, key);
    if (d) Object.defineProperty(wrapped, key, d);
  }
  return wrapped as unknown as M;
}

// ── Croissant data (copied from forwardsyntax/Croissant.stories.tsx) ─────────

const FILL = "#D1E4F6";
const STROKE = "#467DA8";

const normPdf = (x: number, mu = 0, sd = 1) =>
  Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

const gridOf = (f: (x: number) => number, lo: number, hi: number, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const x = lo + ((hi - lo) * i) / (n - 1);
    return { x, pdf: f(x) };
  });

const kde = (values: number[]) => {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  );
  const bw = 1.06 * sd * n ** -0.2;
  return {
    bw,
    f: (x: number) => values.reduce((s, v) => s + normPdf(x, v, bw), 0) / n,
  };
};

const normalGrid = gridOf((x) => normPdf(x), -4, 4, 401);

/** The cells of one croissant, as in the gallery story. */
const cells = (
  data: any[] | undefined,
  density: any,
  x: string,
  n: number,
  inset: number,
  strokeWidth: number,
  r: number,
  cy: number
) =>
  (data === undefined ? chart() : chart(data as any))
    .flow(
      derive((rows: any[]) =>
        quantileRows(rows, { x, density: "pdf", n: 1000 })
      ),
      partition({ by: field(x).bin(Bin.quantiles(n)), dir: "x" })
    )
    .mark(
      layer([
        intersect({ fill: FILL, stroke: STROKE, strokeWidth }, [
          density,
          region({ inset }),
        ]),
        circle({ cx: field(x).median(), cy, r, fill: STROKE }),
      ])
    );

// ── 1. Croissant ────────────────────────────────────────────────────────────

export const CroissantCurrent: StoryObj<Args> = {
  args: { w: 480, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer([
      chart(normalGrid)
        .flow(scatter({ x: "x" }))
        .mark(ribbon({ h: "pdf", fill: "none" }).name("density")),
    ])
      .relate(({ density }) => [
        cells(normalGrid, density, "x", 10, 3, 2, 3, 6),
      ])
      .render(container, { w: args.w, h: args.h, axes: { x: true, y: false } });
    return container;
  },
};

export const CroissantProposed: StoryObj<Args> = {
  args: { w: 480, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    // Proposed: .mark(ribbon({ h: "pdf" }).name("density").hidden())
    layer([
      chart(normalGrid)
        .flow(scatter({ x: "x" }))
        .mark(blank({ h: "pdf" }))
        .layer(hidden(ribbon({}).name("density"))),
    ])
      .relate(({ density }) => [
        cells(normalGrid, density, "x", 10, 3, 2, 3, 6),
      ])
      .render(container, { w: args.w, h: args.h, axes: { x: true, y: false } });
    return container;
  },
};

/** What `.hidden()` is NOT: the same spec with the curve shown (no fill:
 *  "none", no hidden), to show that the curve really is there and laid out. */
export const CroissantShown: StoryObj<Args> = {
  args: { w: 480, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer([
      chart(normalGrid)
        .flow(scatter({ x: "x" }))
        .mark(ribbon({ h: "pdf", fill: "#eee" }).name("density")),
    ])
      .relate(({ density }) => [
        cells(normalGrid, density, "x", 10, 3, 2, 3, 6),
      ])
      .render(container, { w: args.w, h: args.h, axes: { x: true, y: false } });
    return container;
  },
};

// ── 2. Ridgeline (hard case: one hidden curve per row) ───────────────────────

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const monthlyDensity = months.flatMap((month, m) => {
  const highs = seattleWeather
    .filter((d) => new Date(d.date).getUTCMonth() === m)
    .map((d) => d.temp_max);
  const { f, bw } = kde(highs);
  const lo = Math.min(...highs) - 3 * bw;
  const hi = Math.max(...highs) + 3 * bw;
  return gridOf(f, lo, hi, 161).map(({ x, pdf }) => ({
    month,
    temp_max: x,
    pdf,
  }));
});

const ridgeline = (args: Args, curveTier: () => any) => {
  const container = initializeContainer();
  chart(monthlyDensity, {
    w: args.w,
    axes: { x: { title: "Daily high (°C)" }, y: false },
  })
    .flow(
      spread({
        by: field("month").sort(months),
        dir: "y",
        anchor: "baseline",
        spacing: 36,
      })
    )
    .mark(
      layer({ h: 34 }, [curveTier()]).relate(({ density }) => [
        cells(undefined, density, "temp_max", 5, 2, 1.5, 2.25, 5),
      ])
    )
    .render(container);
  return container;
};

export const RidgelineCurrent: StoryObj<Args> = {
  args: { w: 520, h: 0 },
  render: (args: Args) =>
    ridgeline(args, () =>
      chart()
        .flow(scatter({ x: "temp_max" }))
        .mark(ribbon({ h: "pdf", fill: "none" }).name("density"))
    ),
};

export const RidgelineProposed: StoryObj<Args> = {
  args: { w: 520, h: 0 },
  render: (args: Args) =>
    ridgeline(args, () =>
      chart()
        .flow(scatter({ x: "temp_max" }))
        .mark(blank({ h: "pdf" }))
        .layer(hidden(ribbon({}).name("density")))
    ),
};

// ── 3. Seattle highs cut by month (chrome from the hidden shape) ─────────────

const days2012 = seattleWeather.filter((d) => d.date.startsWith("2012"));
const highs2012 = days2012.map((d, i) => {
  const window = days2012.slice(Math.max(0, i - 7), i + 8);
  return {
    date: d.date.slice(0, 10),
    letter: months[new Date(d.date).getUTCMonth()][0],
    temp_smooth: window.reduce((s, w) => s + w.temp_max, 0) / window.length,
  };
});
const schema2012 = { date: Unit.time() };

const seattle = (args: Args, curve: () => any) => {
  const container = initializeContainer();
  layer([curve()])
    .relate(({ temps }) => [
      chart(highs2012, { schema: schema2012 })
        .flow(
          partition({
            by: field("date").bin([Calendar.year, Calendar.month]),
            dir: "x",
          })
        )
        .mark(
          layer([
            intersect({ fill: FILL, stroke: STROKE, strokeWidth: 1.5 }, [
              temps,
              region({ inset: 2 }),
            ]),
            text({
              cx: field("date").median(),
              y: 6,
              text: "letter",
              fontSize: 11,
              fill: "#333",
            }),
          ])
        ),
    ])
    .render(container, {
      w: args.w,
      h: args.h,
      axes: { x: false, y: { title: "Daily high, 15-day mean (°C)" } },
    });
  return container;
};

export const SeattleCurrent: StoryObj<Args> = {
  args: { w: 560, h: 220 },
  render: (args: Args) =>
    seattle(args, () =>
      chart(highs2012, { schema: schema2012 })
        .flow(scatter({ x: "date" }))
        .mark(ribbon({ h: "temp_smooth", fill: "none" }).name("temps"))
    ),
};

export const SeattleProposed: StoryObj<Args> = {
  args: { w: 560, h: 220 },
  render: (args: Args) =>
    seattle(args, () =>
      chart(highs2012, { schema: schema2012 })
        .flow(scatter({ x: "date" }))
        .mark(blank({ h: "temp_smooth" }))
        .layer(hidden(ribbon({}).name("temps")))
    ),
};

// ── 4. Venn lenses (new example: three shapes, each used by two regions) ────

const LENS = { strokeWidth: 1.5, stroke: "#444", opacity: 0.75 };

const venn = (circleOf: (cx: number, cy: number, name: string) => any) => {
  const container = initializeContainer();
  layer([
    circleOf(100, 100, "a"),
    circleOf(205, 100, "b"),
    circleOf(152, 190, "c"),
  ])
    .relate(({ a, b, c }) => [
      intersect({ fill: "#9ecae1", ...LENS }, [a, b]),
      intersect({ fill: "#fdd0a2", ...LENS }, [b, c]),
      intersect({ fill: "#c7e9c0", ...LENS }, [a, c]),
    ])
    .render(container, { w: 320, h: 280 });
  return container;
};

export const VennCurrent: StoryObj = {
  render: () =>
    venn((cx, cy, name) =>
      circle({ cx, cy, r: 90, fill: "none" }).name(name)
    ),
};

/** Diagnostic: the same lenses over circles that are painted. */
export const VennShown: StoryObj = {
  render: () =>
    venn((cx, cy, name) =>
      circle({ cx, cy, r: 90, fill: "#eeeeee" }).name(name)
    ),
};

export const VennProposed: StoryObj = {
  render: () =>
    venn((cx, cy, name) => hidden(circle({ cx, cy, r: 90 }).name(name))),
};

// ── 5. Quantum circuit (diagram: invisible slots and a spacer) ──────────────
// Copied from bluefish/QuantumCircuit.stories.tsx. `slotBox` and `spacer`
// are the only parts that differ between Current and Proposed.

const SLOT = 60;
const GATE = 50;

const quantum = (
  args: Args,
  slotBox: (w: number, h: number) => any,
  spacer: (w: number, h: number) => any
) => {
  const WireSlot = createMark(({ content }: { content: any }) =>
    layer([slotBox(GATE, GATE).name("slot"), content.name("content")]).relate(
      ({ slot, content }) => [
        Constraint.align({ x: "middle", y: "middle" }, [slot, content]),
      ]
    )
  );
  const EmptySlot = () => spacer(GATE, GATE);
  const BoxedSymbol = createMark(({ label }: { label: string }) =>
    layer([
      rect({
        w: GATE,
        h: GATE,
        fill: "white",
        stroke: "black",
        strokeWidth: 3,
      }).name("box"),
      text({
        text: label,
        fontSize: 30,
        fontFamily: "serif",
        fontStyle: "italic",
        fill: "black",
      }).name("label"),
    ]).relate(({ box, label }) => [
      Constraint.align({ x: "middle", y: "middle" }, [box, label]),
    ])
  );
  const OPlus = createMark(() =>
    layer([
      circle({
        r: 15,
        fill: "transparent",
        stroke: "black",
        strokeWidth: 3,
      }).name("ring"),
      rect({ w: 30, h: 3, fill: "black" }).name("hbar"),
      rect({ w: 3, h: 30, fill: "black" }).name("vbar"),
    ]).relate(({ ring, hbar, vbar }) => [
      Constraint.align({ x: "middle", y: "middle" }, [ring, hbar, vbar]),
    ])
  );
  const ControlDot = () => circle({ r: 5, fill: "black" });
  const Wire = createMark(({ slots, span }: { slots: any[]; span?: number }) =>
    layer([
      rect({
        w: (span ?? slots.length) * SLOT + 30,
        h: 3,
        fill: "black",
      }).name("line"),
      spread({ dir: "x", spacing: SLOT - GATE, alignment: "middle" }, [
        spacer(10, GATE),
        ...slots,
      ]).name("gates"),
    ]).relate(({ line, gates }) => [
      Constraint.align({ x: "start", y: "middle" }, [line, gates]),
    ])
  );

  const container = initializeContainer();
  const c1 = createName("c1");
  const z = createName("z");
  const c2 = createName("c2");
  const oplus = createName("oplus");
  const highlight = {
    padding: 10,
    shape: Shape.box({ rx: 10 }),
    fill: "rgba(255,200,0,0.333)",
    stroke: "none",
  } as const;
  const highlightedOPlus = enclose({ ...highlight }, [OPlus({})]);
  const highlightedDescription = enclose({ ...highlight }, [
    text({ text: "This is a controlled-NOT." }),
  ]);
  layer({ x: 20, y: 20 }, [
    spread({ dir: "x", spacing: 25, alignment: "middle" }, [
      spread({ dir: "y", spacing: 30, alignment: "start" }, [
        Wire({ slots: [WireSlot({ content: ControlDot() }).name(c1)] }),
        Wire({ slots: [BoxedSymbol({ label: "Z" }).name(z)] }),
      ]),
      text({ text: "≡", fontSize: 40, fontWeight: 300 }),
      spread({ dir: "y", spacing: 30, alignment: "start" }, [
        Wire({
          span: 3,
          slots: [EmptySlot(), WireSlot({ content: ControlDot() }).name(c2)],
        }),
        Wire({
          span: 3,
          slots: [
            BoxedSymbol({ label: "H" }),
            WireSlot({ content: highlightedOPlus }).name(oplus),
            BoxedSymbol({ label: "H" }),
          ],
        }),
      ]),
      highlightedDescription,
    ]),
    line({ stroke: "black", strokeWidth: 3 }, [ref(c1), ref(z)]).zOrder(-1),
    line({ stroke: "black", strokeWidth: 3 }, [ref(c2), ref(oplus)]).zOrder(-1),
  ]).render(container, { w: args.w, h: args.h });
  return container;
};

export const QuantumCurrent: StoryObj<Args> = {
  args: { w: 900, h: 260 },
  render: (args: Args) =>
    quantum(
      args,
      (w, h) => rect({ w, h, fill: "transparent" }),
      (w, h) => rect({ w, h, fill: "transparent" })
    ),
};

export const QuantumProposed: StoryObj<Args> = {
  args: { w: 900, h: 260 },
  render: (args: Args) =>
    quantum(
      args,
      // Proposed: rect({ w, h }).name("slot").hidden(). The shim wraps the
      // mark, so `.name` is applied by the caller through the wrapper's
      // copied modifiers; we wrap after naming to keep it.
      (w, h) => {
        const m = rect({ w, h });
        return { name: (n: string) => hidden(m.name(n)) };
      },
      (w, h) => hidden(rect({ w, h }))
    ),
};

export const DiagUnfused: StoryObj<Args> = {
  args: { w: 480, h: 200 },
  render: (args: Args) => {
    const container = initializeContainer();
    layer([
      chart(normalGrid)
        .flow(scatter({ x: "x" }))
        .mark(blank({ h: "pdf" }))
        .layer(ribbon({ fill: "none" }).name("density")),
    ])
      .relate(({ density }) => [
        cells(normalGrid, density, "x", 10, 3, 2, 3, 6),
      ])
      .render(container, { w: args.w, h: args.h, axes: { x: true, y: false } });
    return container;
  },
};

// ── Round 2: guides and masks ───────────────────────────────────────────────

// Voronoi. The seeds are data, not a shape: `Bin.voronoi({ seeds })` reads
// rows. Drawing the seeds is a second chart over the same rows, so there is
// no hidden mark either way.
const seedPenguins = penguins
  .filter((d) => d["Beak Length (mm)"] !== null && d["Beak Depth (mm)"] !== null)
  .filter((_, i) => i % 23 === 0);
const beaked2 = penguins.filter(
  (d) => d["Beak Length (mm)"] !== null && d["Beak Depth (mm)"] !== null
);
const voronoi = (args: Args, drawSeeds: boolean) => {
  const container = initializeContainer();
  const key = struct({ x: "Beak Length (mm)", y: "Beak Depth (mm)" });
  const cellsTier = chart(beaked2, { color: Color.gradient("blues") })
    .flow(partition({ by: key.bin(Bin.voronoi({ seeds: seedPenguins })) }))
    .mark(region({ fill: field("Species").count(), stroke: "white" }));
  const seedsTier = chart(seedPenguins)
    .flow(scatter({ x: "Beak Length (mm)", y: "Beak Depth (mm)" }))
    .mark(circle({ r: 3.5, fill: "black" }));
  layer(
    { w: args.w, h: args.h },
    drawSeeds ? [cellsTier, seedsTier] : [cellsTier]
  ).render(container, { axes: true });
  return container;
};
export const VoronoiNoSeeds: StoryObj<Args> = {
  args: { w: 420, h: 300 },
  render: (args: Args) => voronoi(args, false),
};
export const VoronoiSeeds: StoryObj<Args> = {
  args: { w: 420, h: 300 },
  render: (args: Args) => voronoi(args, true),
};

// Clip. The stencil is a luminance mask today, so its fill must be white or
// the stripes fade (a quirk of the SVG-mask lowering, noted in round 2).
// `mask` declares "my first operand is a stencil" and never draws it;
// `paint` is its twin that draws the first operand as a surface. Today the
// choice is two operators.
const stripes = (style: Record<string, any> = {}) =>
  layer(
    Array.from({ length: 11 }, (_, i) =>
      rect({
        x: i * 20,
        y: 0,
        w: 10,
        h: 200,
        fill: i % 2 ? "#E07A5F" : "#3D5A80",
        ...style,
      })
    )
  );
const disc = (style: Record<string, any> = {}) =>
  circle({ cx: 100, cy: 100, r: 80, ...style });
export const ClipMask: StoryObj = {
  render: () => {
    const container = initializeContainer();
    mask([disc({ fill: "white" }), stripes()]).render(container, { w: 220, h: 200 });
    return container;
  },
};
// The stencil drawn too, today: a second circle with the same geometry,
// laid out a second time.
export const ClipMaskOutline: StoryObj = {
  render: () => {
    const container = initializeContainer();
    layer([
      mask([disc({ fill: "white" }), stripes()]),
      disc({ fill: "none", stroke: "#222", strokeWidth: 3 }),
    ]).render(container, { w: 220, h: 200 });
    return container;
  },
};

// ── Round 3: children and operands ─────────────────────────────────────────

const RED = { fill: "#E07A5F" };
const BLUE = { fill: "#3D5A80" };
const pairA = () => circle({ cx: 90, cy: 90, r: 70, ...RED });
const pairB = () => rect({ x: 80, y: 30, w: 120, h: 120, ...BLUE });
const show = (node: any, w = 220, h = 180) => {
  const container = initializeContainer();
  node.render(container, { w, h });
  return container;
};

// The two shapes drawn as themselves, for reference.
export const IntersectInputs: StoryObj = {
  render: () => show(layer([pairA(), pairB()])),
};
// intersect with no paint: both operands draw their own paint, clipped to
// the overlap. Here the slots behave as children.
export const IntersectUnpainted: StoryObj = {
  render: () => show(intersect([pairA(), pairB()])),
};
// The same with the circle hidden (story shim).
export const IntersectUnpaintedHidden: StoryObj = {
  render: () => show(intersect([hidden(pairA()), pairB()])),
};
// intersect with paint: one new shape; the operands' paint is not drawn.
// Here the slots behave as operands.
export const IntersectPainted: StoryObj = {
  render: () =>
    show(
      intersect({ fill: "#D1E4F6", stroke: "#467DA8", strokeWidth: 2 }, [
        pairA(),
        pairB(),
      ])
    ),
};

// The stencil read through a ref while the circle is drawn once, as itself,
// as an outline on top.
export const MaskByRef: StoryObj = {
  render: () =>
    show(
      layer([
        disc({ fill: "none", stroke: "#222", strokeWidth: 3 }).name("disc"),
      ]).relate(({ disc: d }) => [mask([d, stripes()])]),
      220,
      200
    ),
};

// ── clip vs mask: shape vs paint ────────────────────────────────────────────

// Stripes behind a row of three circles.
const wideStripes = (style: Record<string, any> = {}) =>
  layer(
    Array.from({ length: 19 }, (_, i) =>
      rect({
        x: i * 20,
        y: 0,
        w: 10,
        h: 120,
        fill: i % 2 ? "#E07A5F" : "#3D5A80",
        ...style,
      })
    )
  );
const STENCIL_FILLS = ["white", "#808080", "#1f3b5c"];
const stencilRow = (fills: string[]) =>
  layer(
    fills.map((fill, i) => circle({ cx: 60 + i * 120, cy: 60, r: 50, fill }))
  );
// mask today: each circle lets the stripes through by its brightness.
export const ClipVsMaskMask: StoryObj = {
  render: () =>
    show(mask([stencilRow(STENCIL_FILLS), wideStripes()]), 380, 140),
};
// clip's output, rendered today as mask with every stencil fill white: only
// the outlines count.
export const ClipVsMaskClip: StoryObj = {
  render: () =>
    show(
      mask([stencilRow(STENCIL_FILLS.map(() => "white")), wideStripes()]),
      380,
      140
    ),
};

// ── Operator grid: the same two circles on every card ──────────────────────
// Each story draws, with today's operators, the pixels the proposed spelling
// would draw. The proposal page names the spelling under each render.

const gridA = (style: Record<string, any> = {}) =>
  circle({ cx: 70, cy: 70, r: 50, ...style });
const gridB = (style: Record<string, any> = {}) =>
  circle({ cx: 130, cy: 70, r: 50, ...style });
const GRID_FILL = { fill: FILL };
const GRID_W = 200;
const GRID_H = 140;
const grid = (node: any) => show(node, GRID_W, GRID_H);

// Proposed `intersect({ fill }, [a, b])`: the same today.
export const GridIntersect: StoryObj = {
  render: () => grid(intersect(GRID_FILL, [gridA(), gridB()])),
};
// Proposed `subtract({ fill }, [a, b])`. `subtract` takes no paint today,
// so both operands carry the fill and it composites their own paint.
// Today `subtract([a, b])` draws b − a, the reverse of its doc comment
// ("A − B"), so the operands are swapped here to draw a − b.
export const GridSubtract: StoryObj = {
  render: () => grid(subtract([gridB(GRID_FILL), gridA(GRID_FILL)])),
};
// Proposed `exclude({ fill }, [a, b])`. Today's composites gray their first
// operand (the grayscale-then-composite lowering in `paintSVG.tsx`, from
// PICCL), so `exclude` draws a's half gray; the two halves are drawn as two
// subtracts instead.
export const GridExclude: StoryObj = {
  render: () =>
    grid(
      layer([
        subtract([gridB(GRID_FILL), gridA(GRID_FILL)]),
        subtract([gridA(GRID_FILL), gridB(GRID_FILL)]),
      ])
    ),
};
// Today's `exclude([a, b])` as it draws now, for the record.
export const ExcludeDesaturatedToday: StoryObj = {
  render: () => grid(exclude([gridA(GRID_FILL), gridB(GRID_FILL)])),
};
// Proposed `union({ fill }, [a, b])`. With fill only, `layer` draws the same
// pixels; with a stroke it would draw two outlines, not one.
export const GridUnion: StoryObj = {
  render: () => grid(layer([gridA(GRID_FILL), gridB(GRID_FILL)])),
};

// ── Coverage blend: no fill, each part takes the covering operands' paint ──
// The rule follows PiCCL's `GroupShape.renderSVG`
// (github.com/PiCCL/PiCCL_core, src/compiler/shape.ts), whose default blend
// is "normal": the later operand paints over the earlier one. Today's
// composites differ: they gray the first operand and blend the second over it
// in "color". Where today's operators can draw the proposed pixels, the story
// draws them; the `Today*` stories draw today's own output.

const noFillA = () => gridA(RED);
const noFillB = () => gridB(BLUE);

// Proposed `union([a, b])`: a, then b over it. `layer` draws the same pixels.
export const NoFillUnion: StoryObj = {
  render: () => grid(layer([noFillA(), noFillB()])),
};
// Proposed `intersect([a, b])`: b over a, only where both are. Today: `mask`
// with a white a.
export const NoFillIntersect: StoryObj = {
  render: () => grid(mask([gridA({ fill: "white" }), noFillB()])),
};
// Today's `intersect([a, b])`: a grayed, b blended over it in "color".
export const TodayIntersect: StoryObj = {
  render: () => grid(intersect([noFillA(), noFillB()])),
};
// Proposed `subtract([a, b])`: a's part outside b. Today's operand order is
// reversed, so this is `subtract([b, a])`.
export const NoFillSubtract: StoryObj = {
  render: () => grid(subtract([noFillB(), noFillA()])),
};
// Proposed `exclude([a, b])`: each lobe in its own paint. Two subtracts.
export const NoFillExclude: StoryObj = {
  render: () =>
    grid(
      layer([
        subtract([noFillB(), noFillA()]),
        subtract([noFillA(), noFillB()]),
      ])
    ),
};
// Today's `exclude([a, b])`: a's lobe grayed.
export const TodayExclude: StoryObj = {
  render: () => grid(exclude([noFillA(), noFillB()])),
};
// Proposed `atop([a, b])`: all of a, and b over it only inside a.
export const NoFillAtop: StoryObj = {
  render: () =>
    grid(layer([noFillA(), mask([gridA({ fill: "white" }), noFillB()])])),
};
// Today's `paint([a, b])`: a grayed, b blended over it in "color".
export const TodayAtop: StoryObj = {
  render: () => grid(paint([noFillA(), noFillB()])),
};

// ── Masking: a hidden operand adds area and no paint ───────────────────────

// Proposed `intersect([stripes, a.hidden()])`: the stripes inside a. Today:
// `mask` with a white a.
const bandStripes = (style: Record<string, any> = {}) =>
  layer(
    Array.from({ length: 10 }, (_, i) =>
      rect({
        x: i * 20,
        y: 15,
        w: 10,
        h: 110,
        fill: i % 2 ? "#E07A5F" : "#3D5A80",
        ...style,
      })
    )
  );
// Framed like its inputs: the unpainted band keeps the band's box.
export const MaskingIntersect: StoryObj = {
  render: () =>
    grid(
      layer([
        mask([gridA({ fill: "white" }), bandStripes()]),
        bandStripes({ opacity: 0 }),
      ])
    ),
};
// Proposed `subtract([stripes, a.hidden()])`: the stripes outside a. Today's
// `subtract` draws its second operand minus its first, in the second's own
// paint, so `subtract([a, stripes])` draws exactly this.
// The stripes are cut to a 110 px band around a so the hole reads in the
// crop; the band is the stripes' own box.
export const MaskingSubtract: StoryObj = {
  render: () => grid(subtract([gridA(), bandStripes()])),
};
// Proposed `intersect({ mode: "luminance" }, [stripes, fade.hidden()])`:
// today's `mask`, a white and a gray circle.
export const MaskingLuminance: StoryObj = {
  render: () =>
    grid(
      layer([
        mask([
          layer([gridA({ fill: "white" }), gridB({ fill: "#808080" })]),
          bandStripes(),
        ]),
        bandStripes({ opacity: 0 }),
      ])
    ),
};


// ── The bottle: the image grays itself ─────────────────────────────────────
// Proposed `atop({ blendMode: "color" }, [image({ filter: "grayscale(1)" }),
// rect])`. The image's own `filter` exists today. Today's `paint` grays its
// base again, which does nothing to a gray image, so this draws the
// proposal's pixels.
const bottles = [
  { category: "a", amount: 30 },
  { category: "d", amount: 60 },
  { category: "b", amount: 75 },
  { category: "c", amount: 100 },
];
export const BottleGrayImage: StoryObj = {
  render: () => {
    const container = initializeContainer();
    chart(bottles, { axes: false })
      .flow(
        spread({ by: "category", dir: "x", spacing: 20, axes: { x: false } })
      )
      .mark(
        layer([
          paint({ blendMode: "color" }, [
            image({ href: bottlePng, h: v(100), filter: "grayscale(1)" }),
            rect({ h: "amount", w: 175, fill: "#00ff00" }),
          ]).name("bottle"),
          rect({ h: 1, fill: "#666", w: 175, y: "amount" }).name("line"),
          text({
            fontSize: 35,
            fill: "#666",
            text: (d: any) => `${d.amount}%`,
          }).name("label"),
        ]).relate(({ line, label, bottle }: any) => [
          Constraint.align({ x: "start" }, [bottle, line]),
          Constraint.distribute({ dir: "y", spacing: 0 }, [line, label]),
          Constraint.align({ x: "end" }, [label, line]),
        ])
      )
      .render(container, {});
    return container;
  },
};

// ── Inputs: each operand drawn alone, at the result's position and scale ───
// The proposal page shows these beside each result. Nothing is composited.
const HIDDEN = {
  fill: "none",
  stroke: "#888",
  strokeWidth: 1.5,
  strokeDasharray: "5 4",
};
// An unpainted partner keeps the card's frame, so each input sits where it
// sits in the result. Layout frames a lone shape at its own box.
const GHOST = { opacity: 0 };
// Story-local shim: circles take no strokeDasharray today, so a style rule
// dashes the hidden outline (stroke #888) after render.
const dashHidden = (container: HTMLElement) => {
  const style = document.createElement("style");
  style.textContent = '[stroke="#888"] { stroke-dasharray: 5 4; }';
  container.appendChild(style);
  return container;
};
export const InA: StoryObj = {
  render: () => grid(layer([gridA(RED), gridB(GHOST)])),
};
export const InB: StoryObj = {
  render: () => grid(layer([gridA(GHOST), gridB(BLUE)])),
};
export const InOutlines: StoryObj = {
  render: () =>
    grid(
      layer([
        gridA({ fill: "none", stroke: "#E07A5F", strokeWidth: 2 }),
        gridB({ fill: "none", stroke: "#3D5A80", strokeWidth: 2 }),
      ])
    ),
};
export const InStripes: StoryObj = {
  render: () => grid(layer([stripes(), gridA(GHOST)])),
};
export const InAHidden: StoryObj = {
  render: () => dashHidden(grid(layer([stripes(GHOST), gridA(HIDDEN)]))),
};
export const InBandStripes: StoryObj = {
  render: () => grid(layer([bandStripes(), gridA(GHOST)])),
};
export const InAHiddenBand: StoryObj = {
  render: () => dashHidden(grid(layer([bandStripes(GHOST), gridA(HIDDEN)]))),
};
// fade is read for its brightness, so it is drawn in its paint, with a
// dashed edge to mark it hidden.
export const InFade: StoryObj = {
  render: () =>
    dashHidden(
      grid(
        layer([
          bandStripes(GHOST),
          gridA({ ...HIDDEN, fill: "white" }),
          gridB({ ...HIDDEN, fill: "#808080" }),
        ])
      )
    ),
};
export const InStencil: StoryObj = {
  render: () =>
    dashHidden(
      show(
        layer([
          wideStripes(GHOST),
          ...STENCIL_FILLS.map((fill, i) =>
            circle({ cx: 60 + i * 120, cy: 60, r: 50, ...HIDDEN, fill })
          ),
        ]),
        380,
        140
      )
    ),
};
export const InWideStripes: StoryObj = {
  render: () =>
    show(
      layer([
        wideStripes(),
        ...STENCIL_FILLS.map((fill, i) =>
          circle({ cx: 60 + i * 120, cy: 60, r: 50, fill, ...GHOST })
        ),
      ]),
      380,
      140
    ),
};
// The bottle's inputs, in the same chart so the scale matches: the gray
// image alone, and the rect alone (the image kept for scale, unpainted).
const bottleChart = (showImage: boolean, showRect: boolean) => {
  const container = initializeContainer();
  chart(bottles, { axes: false })
    .flow(
      spread({ by: "category", dir: "x", spacing: 20, axes: { x: false } })
    )
    .mark(
      layer([
        image({
          href: bottlePng,
          h: v(100),
          filter: "grayscale(1)",
          opacity: showImage ? 1 : 0,
        }),
        rect({
          h: "amount",
          w: 175,
          fill: "#00ff00",
          opacity: showRect ? 1 : 0,
        }),
      ])
    )
    .render(container, {});
  return container;
};
export const InBottleImage: StoryObj = {
  render: () => bottleChart(true, false),
};
export const InBottleRect: StoryObj = {
  render: () => bottleChart(false, true),
};

// ── Alpha is shape: a soft edge ────────────────────────────────────────────
// Proposed `intersect([stripes, soft.hidden()])`, where `soft` is a rect
// blurred by its existing `filter` option. Its alpha is its shape, so the
// stripes fade out at its edge. Today: `mask` with the rect white (white's
// luminance is 1, so luminance and alpha agree).
const SOFT = { x: 40, y: 30, w: 120, h: 80, filter: "blur(8px)" };
export const SoftEdge: StoryObj = {
  render: () =>
    grid(
      layer([
        mask([rect({ ...SOFT, fill: "white" }), bandStripes()]),
        bandStripes({ opacity: 0 }),
      ])
    ),
};
// The input: the blurred rect's alpha, drawn gray, with a dashed edge for
// hidden.
export const InSoft: StoryObj = {
  render: () =>
    dashHidden(
      grid(
        layer([
          bandStripes(GHOST),
          rect({ ...SOFT, fill: "#888" }),
          rect({
            x: 40,
            y: 30,
            w: 120,
            h: 80,
            fill: "none",
            stroke: "#888",
            strokeWidth: 1.5,
          }),
        ])
      )
    ),
};
// The luminance card's input after `.filter("luminance-to-alpha")`: white
// gives alpha 1, mid gray about 0.5. Drawn dark, at that opacity.
export const InFadeAlpha: StoryObj = {
  render: () =>
    dashHidden(
      grid(
        layer([
          bandStripes(GHOST),
          // b is drawn over a in fade, so the overlap has b's brightness.
          // Today's subtract([b, a]) draws a minus b.
          subtract([gridB(), gridA({ fill: "#444" })]),
          gridB({ fill: "#444", opacity: 0.5 }),
          gridA(HIDDEN),
          gridB(HIDDEN),
        ])
      )
    ),
};

// Spelling check: luminance-to-alpha through the existing `filter` option.
// There is no CSS filter function for it, so the rect points at a
// story-local SVG <filter> with feColorMatrix type="luminanceToAlpha".
// Rendered: white gives alpha 1, #808080 about 0.5 (in sRGB, as a luminance
// mask reads it), black 0. The result is black at that alpha.
const lumToAlphaDef = (container: HTMLElement) => {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.innerHTML =
    '<filter id="lumToAlpha" color-interpolation-filters="sRGB"><feColorMatrix type="luminanceToAlpha"/></filter>';
  container.appendChild(svg);
  return container;
};
const L2A = { y: 20, w: 55, h: 80, filter: "url(#lumToAlpha)" };
export const LumToAlphaCheck: StoryObj = {
  render: () =>
    lumToAlphaDef(
      grid(
        layer([
          rect({ ...L2A, x: 10, fill: "white" }),
          rect({ ...L2A, x: 72, fill: "#808080" }),
          rect({ ...L2A, x: 134, fill: "black" }),
        ])
      )
    ),
};
