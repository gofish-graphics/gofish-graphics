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
  field,
  intersect,
  layer,
  line,
  mask,
  partition,
  quantileRows,
  rect,
  ref,
  region,
  ribbon,
  scatter,
  Shape,
  spread,
  struct,
  text,
  blank,
  Unit,
} from "../../src/lib";
import { penguins } from "../../src/data/penguins";
import { seattleWeather } from "../../src/data/seatle-weather";

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
const stripes = () =>
  layer(
    Array.from({ length: 11 }, (_, i) =>
      rect({
        x: i * 20,
        y: 0,
        w: 10,
        h: 200,
        fill: i % 2 ? "#E07A5F" : "#3D5A80",
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
