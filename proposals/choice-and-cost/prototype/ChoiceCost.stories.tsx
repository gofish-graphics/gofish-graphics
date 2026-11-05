import type { Meta, StoryObj } from "@storybook/html";
import { ticks } from "d3-array";
import { initializeContainer } from "../helper";
import { seafood } from "../../src/data/catch";
import {
  chart,
  chunk,
  derive,
  layer,
  rect,
  repeat,
  spread,
  text,
} from "../../src/lib";
import { estimateTextDimensions } from "../../src/ast/shapes/text";
import { FALLBACK_FONT_FAMILY } from "../../src/ast/shapes/fontUtils";

// Throwaway prototypes for the "layout as optimization over choices" proposal
// (a choice operator + a cost function + wrap). Nothing here is implemented in
// the library: each story computes the choice in plain JS, then draws the
// chosen (and rejected) candidates with today's API. Not gallery-tagged.
const meta: Meta = { title: "Proposals/Choice and Cost" };
export default meta;

// --- shared drawing helpers -------------------------------------------------

const INK = "#333";
const MUTED = "#777";
const ACCENT = "#c2410c"; // warm: the chosen candidate / a problem
const CATS = ["#6b8fb8", "#d9a55b", "#8bb58a"];
const MONO = "ui-monospace, Menlo, Consolas, monospace";

const T = (
  x: number,
  y: number,
  s: string,
  o: {
    size?: number;
    fill?: string;
    weight?: number | string;
    font?: string;
  } = {}
) =>
  text({
    x,
    y,
    text: s,
    fontSize: o.size ?? 11,
    fill: o.fill ?? INK,
    fontWeight: o.weight,
    fontFamily: o.font,
  });

// A caption with no position, for use inside spread().
const Tc = (
  s: string,
  o: { size?: number; fill?: string; weight?: number | string } = {}
) =>
  text({
    text: s,
    fontSize: o.size ?? 11,
    fill: o.fill ?? INK,
    fontWeight: o.weight,
  });

const R = (
  x: number,
  y: number,
  w: number,
  h: number,
  o: { fill?: string; stroke?: string; sw?: number } = {}
) =>
  rect({
    x,
    y,
    w,
    h,
    fill: o.fill ?? "none",
    stroke: o.stroke,
    strokeWidth: o.sw ?? (o.stroke ? 1 : 0),
  });

// A vertical dashed line made of short rects.
const dashedV = (x: number, y0: number, y1: number, fill = ACCENT) => {
  const out = [];
  for (let y = y0; y < y1; y += 7)
    out.push(R(x, y, 1, Math.min(4, y1 - y), { fill }));
  return out;
};

const measure = (s: string, size: number, font = FALLBACK_FONT_FAMILY) =>
  estimateTextDimensions(s, size, font).width;

// --- 1. waffle: choose the column count by wasted box area ------------------

// Choice: cols ∈ candidates. Each candidate's cell pitch is the largest square
// that fits the box given cols and rows = ceil(n / cols); cost = the fraction
// of the box the cells do not cover.
const waffleCandidate = (n: number, W: number, H: number, cols: number) => {
  const rows = Math.ceil(n / cols);
  const s = Math.min(W / cols, H / rows);
  const cost = 1 - (n * s * s) / (W * H);
  return { cols, rows, s, cost };
};

const argmin = <T,>(xs: T[], f: (x: T) => number) =>
  xs.reduce((best, x) => (f(x) < f(best) ? x : best));

const WAFFLE_COUNTS = [38, 22, 13]; // 73 cells, 3 categories
const WAFFLE_N = WAFFLE_COUNTS.reduce((a, b) => a + b, 0);
const cellCategory = (i: number) => {
  let acc = 0;
  for (let c = 0; c < WAFFLE_COUNTS.length; c++) {
    acc += WAFFLE_COUNTS[c];
    if (i < acc) return c;
  }
  return 0;
};

export const WaffleCandidates: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const W = 300,
      H = 200;
    const candidates = [4, 8, 12, 16, 24].map((k) =>
      waffleCandidate(WAFFLE_N, W, H, k)
    );
    const best = argmin(candidates, (c) => c.cost);

    const panel = (
      c: ReturnType<typeof waffleCandidate>,
      ox: number,
      oy: number
    ) => {
      const chosen = c === best;
      const gap = Math.max(1, c.s * 0.12);
      const cells = Array.from({ length: WAFFLE_N }, (_, i) =>
        R(
          ox + (i % c.cols) * c.s,
          oy + 22 + Math.floor(i / c.cols) * c.s,
          c.s - gap,
          c.s - gap,
          { fill: CATS[cellCategory(i)] }
        )
      );
      return [
        T(
          ox,
          oy,
          `cols = ${c.cols} · cell = ${c.s.toFixed(1)} px · cost = ${c.cost.toFixed(3)}`,
          { fill: chosen ? ACCENT : INK, weight: chosen ? 700 : 400 }
        ),
        ...cells,
        R(ox - 0.5, oy + 21.5, W + 1, H + 1, {
          stroke: chosen ? ACCENT : "#aaa",
          sw: chosen ? 2 : 1,
        }),
      ];
    };

    const PX = W + 44,
      PY = H + 56;
    const marks: any[] = [];
    candidates.forEach((c, i) =>
      marks.push(...panel(c, (i % 3) * PX, Math.floor(i / 3) * PY))
    );

    // Sixth slot: the cost of every candidate as a bar.
    const ox = 2 * PX,
      oy = PY + 22,
      bw = 40,
      bh = 150;
    marks.push(
      T(ox, PY, "cost = 1 − n·cell² / (W·H)   (lower is better)", {
        fill: MUTED,
      })
    );
    candidates.forEach((c, i) => {
      const chosen = c === best;
      const h = c.cost * bh;
      const x = ox + 12 + i * (bw + 16);
      marks.push(
        R(x, oy + 10 + bh - h, bw, h, { fill: chosen ? ACCENT : "#b8b8b8" }),
        T(x + 6, oy + bh - h - 4, c.cost.toFixed(2), { size: 10, fill: MUTED }),
        T(x + 8, oy + bh + 16, `${c.cols}`, { weight: chosen ? 700 : 400 })
      );
    });
    marks.push(R(ox, oy + 10 + bh, 5 * (bw + 16) + 8, 1, { fill: INK }));
    marks.push(T(ox + 100, oy + bh + 34, "cols", { fill: MUTED }));

    layer(marks).render(container, { w: 3 * PX, h: 2 * PY });
    return container;
  },
};

// --- 2. today's gallery waffle (chunk(5)) vs cols chosen for a box ----------

const lakeTotals = Object.values(
  seafood.reduce(
    (acc, d) => ((acc[d.lake] = (acc[d.lake] ?? 0) + d.count), acc),
    {} as Record<string, number>
  )
);

export const WaffleTodayVsChosen: StoryObj = {
  render: () => {
    const container = initializeContainer();
    // Target box for the whole chart; six lake columns share it.
    const BOX_W = 600,
      BOX_H = 200,
      LAKE_GAP = 12;
    const lakeW = (BOX_W - 5 * LAKE_GAP) / 6;
    const tallest = Math.max(...lakeTotals);
    const total = lakeTotals.reduce((a, b) => a + b, 0);
    // Same cost as above, with the box split into six lake columns: the
    // tallest lake decides the rows.
    const cand = (cols: number) => {
      const rows = Math.ceil(tallest / cols);
      const s = Math.min(lakeW / cols, BOX_H / rows);
      return { cols, rows, s, cost: 1 - (total * s * s) / (BOX_W * BOX_H) };
    };
    const candidates = Array.from({ length: 14 }, (_, i) => cand(i + 2));
    const best = argmin(candidates, (c) => c.cost);
    const today = cand(5);
    // Today's fixed waffle: 8 px squares, 2 px gaps, 5 per row.
    const todayH = Math.ceil(tallest / 5) * 10;

    const waffle = (cols: number, size: number, gap: number) =>
      chart(seafood, { axes: false })
        .flow(
          spread({ by: "lake", spacing: LAKE_GAP, dir: "x", alignment: "end" }),
          derive((d: any[]) => d.flatMap((d) => repeat(d, "count"))),
          spread({ by: chunk(cols), spacing: gap, dir: "y", reverse: true }),
          spread({ spacing: gap, dir: "x" })
        )
        .mark(rect({ w: size, h: size, fill: "species" }));

    const boxed = (
      caption: string,
      sub: string,
      body: any,
      bodyH: number,
      accent: boolean
    ) =>
      spread({ dir: "y", spacing: 8, alignment: "start" }, [
        Tc(caption, { weight: 700, fill: accent ? ACCENT : INK }),
        Tc(sub, { fill: MUTED }),
        layer([
          R(0, 0, BOX_W, BOX_H, {
            stroke: accent ? ACCENT : "#999",
            sw: accent ? 2 : 1,
          }),
          // bottom-align the waffle in the box (it overflows upward if taller)
          layer([body]).translate({ x: 0, y: BOX_H - bodyH }),
        ]),
      ]);

    const gap = Math.max(1, Math.round(best.s * 0.15));
    spread({ dir: "y", spacing: 36, alignment: "start" }, [
      boxed(
        "today: spread({ by: chunk(5) }), 8 px cells",
        `in a ${BOX_W}×${BOX_H} box: ${Math.ceil(tallest / 5)} rows, ${todayH} px tall, overflows; ` +
          `best-fit cell at 5 cols = ${today.s.toFixed(1)} px, cost = ${today.cost.toFixed(3)}`,
        waffle(5, 8, 2),
        todayH,
        false
      ),
      boxed(
        `chosen: cols = ${best.cols} (argmin over cols 2..15)`,
        `cell = ${best.s.toFixed(1)} px, ${best.rows} rows, cost = ${best.cost.toFixed(3)}`,
        waffle(best.cols, best.s - gap, gap),
        best.rows * best.s - gap,
        true
      ),
    ]).render(container);
    return container;
  },
};

// --- 3. Knuth–Plass vs greedy line breaking ---------------------------------

const PARAGRAPH =
  "A waffle chart shows a total as a grid of small squares, one square for each unit, colored by category. " +
  "Choosing how many columns the grid has is a layout decision: too few columns make a tall thin strip, " +
  "too many make a short wide band, and the best choice depends on the space the chart is given and on " +
  "what the reader needs to compare.";

type Break = { lines: [number, number][]; total: number; perLine: number[] };

const breakParagraph = (widths: number[], space: number, W: number) => {
  const n = widths.length;
  const lineW = (i: number, j: number) => {
    let s = 0;
    for (let k = i; k < j; k++) s += widths[k];
    return s + (j - i - 1) * space;
  };
  // badness of the line holding words i..j-1; the last line is free.
  const bad = (i: number, j: number) => {
    const lw = lineW(i, j);
    if (lw > W) return Infinity;
    return j === n ? 0 : 100 * Math.pow((W - lw) / W, 3);
  };
  const finish = (lines: [number, number][]): Break => {
    const perLine = lines.map(([i, j]) => bad(i, j));
    return { lines, perLine, total: perLine.reduce((a, b) => a + b, 0) };
  };

  // Greedy first fit.
  const greedy: [number, number][] = [];
  for (let i = 0; i < n; ) {
    let j = i + 1;
    while (j < n && lineW(i, j + 1) <= W) j++;
    greedy.push([i, j]);
    i = j;
  }

  // Knuth–Plass: f[i] = min total badness of setting words i..n-1.
  const f = new Array(n + 1).fill(Infinity);
  const next = new Array(n + 1).fill(n);
  f[n] = 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j <= n && lineW(i, j) <= W; j++) {
      const c = bad(i, j) + f[j];
      if (c < f[i]) {
        f[i] = c;
        next[i] = j;
      }
    }
  }
  const kp: [number, number][] = [];
  for (let i = 0; i < n; i = next[i]) kp.push([i, next[i]]);

  return { greedy: finish(greedy), kp: finish(kp), lineW };
};

export const KnuthPlassVsGreedy: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const W = 256,
      SIZE = 12,
      LH = 18;
    const words = PARAGRAPH.split(" ");
    const widths = words.map((w) => measure(w, SIZE));
    const space = measure(" ", SIZE);
    const { greedy, kp, lineW } = breakParagraph(widths, space, W);

    const panel = (title: string, b: Break, ox: number, accent: boolean) => {
      const marks: any[] = [
        T(ox, 0, title, { weight: 700, fill: accent ? ACCENT : INK }),
        T(
          ox,
          16,
          `total badness = ${b.total.toFixed(2)} · worst line = ${Math.max(...b.perLine.slice(0, -1)).toFixed(2)}  (${b.lines.length} lines)`,
          {
            fill: MUTED,
          }
        ),
      ];
      const oy = 42;
      b.lines.forEach(([i, j], li) => {
        const y = oy + li * LH;
        marks.push(R(ox, y, lineW(i, j), LH - 3, { fill: "#e6edf5" }));
        let x = ox;
        for (let k = i; k < j; k++) {
          marks.push(T(x, y + 1, words[k], { size: SIZE }));
          x += widths[k] + space;
        }
        const bl = b.perLine[li];
        marks.push(
          T(ox + W + 8, y + 2, j === words.length ? "last" : bl.toFixed(2), {
            size: 10,
            fill: bl > 0.3 ? ACCENT : MUTED,
          })
        );
      });
      const hgt = b.lines.length * LH;
      marks.push(...dashedV(ox + W, oy - 4, oy + hgt, "#999"));
      return marks;
    };

    layer([
      ...panel("greedy first fit", greedy, 0, false),
      ...panel("Knuth–Plass (min total badness)", kp, W + 80, true),
      T(
        0,
        44 + Math.max(greedy.lines.length, kp.lines.length) * LH + 6,
        `measure = ${W} px · badness per line = 100·(slack / ${W})³ · last line free · numbers at right = each line's badness (warm if > 0.3)`,
        { size: 10, fill: MUTED }
      ),
    ]).render(container, { w: 2 * W + 130, h: 44 + 14 * LH + 20 });
    return container;
  },
};

// --- 4. a tiny pretty-expressive style printer -------------------------------

type Doc =
  | { t: "text"; s: string }
  | { t: "nl" }
  | { t: "cat"; a: Doc; b: Doc }
  | { t: "nest"; n: number; d: Doc }
  | { t: "align"; d: Doc }
  | { t: "choice"; a: Doc; b: Doc };

const txt = (s: string): Doc => ({ t: "text", s });
const nl: Doc = { t: "nl" };
const cat = (...ds: Doc[]): Doc => ds.reduce((a, b) => ({ t: "cat", a, b }));
const nest = (n: number, d: Doc): Doc => ({ t: "nest", n, d });
const align = (d: Doc): Doc => ({ t: "align", d });
const choice = (a: Doc, b: Doc): Doc => ({ t: "choice", a, b });
const flatten = (d: Doc): Doc => {
  switch (d.t) {
    case "nl":
      return txt(" ");
    case "cat":
      return cat(flatten(d.a), flatten(d.b));
    case "nest":
    case "align":
      return flatten(d.d);
    case "choice":
      return flatten(d.a);
    default:
      return d;
  }
};
const vsep = (ds: Doc[]) => ds.reduce((a, b) => cat(a, nl, b));
const hsep = (ds: Doc[]) => ds.reduce((a, b) => cat(a, txt(" "), b));

type SExp = string | SExp[];
// One list, three candidate layouts: all on one line; arguments hung and
// aligned after the head; or arguments on their own lines, indented 2.
const sexpDoc = (e: SExp): Doc => {
  if (typeof e === "string") return txt(e);
  const [head, ...args] = e.map(sexpDoc);
  if (args.length === 0) return cat(txt("("), head, txt(")"));
  const flat = flatten(cat(txt("("), hsep([head, ...args]), txt(")")));
  const hang = cat(txt("("), head, txt(" "), align(vsep(args)), txt(")"));
  const indent = align(
    cat(txt("("), head, nest(2, cat(nl, vsep(args))), txt(")"))
  );
  return choice(flat, choice(hang, indent));
};

const parseSExp = (src: string): SExp => {
  const toks = src
    .replace(/\(/g, " ( ")
    .replace(/\)/g, " ) ")
    .trim()
    .split(/\s+/);
  let i = 0;
  const read = (): SExp => {
    const t = toks[i++];
    if (t !== "(") return t;
    const out: SExp[] = [];
    while (toks[i] !== ")") out.push(read());
    i++;
    return out;
  };
  return read();
};

type Cost = [overflow: number, newlines: number];
const costOf = (lines: string[], limit: number): Cost => [
  lines.reduce((s, l) => s + Math.max(0, l.length - limit) ** 2, 0),
  lines.length - 1,
];
const lexLess = (a: Cost, b: Cost) =>
  a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

// Exhaustive search over every resolution of the choices (the doc is small);
// keeps the first layout with the lexicographically least cost.
const prettyPrint = (doc: Doc, limit: number) => {
  type Item = { i: number; d: Doc };
  type Stack = { head: Item; tail: Stack } | null;
  let best: { lines: string[]; cost: Cost } | null = null;
  let explored = 0;
  const go = (stack: Stack, lines: string[], cur: string) => {
    if (stack === null) {
      explored++;
      const all = [...lines, cur];
      const cost = costOf(all, limit);
      if (best === null || lexLess(cost, best.cost))
        best = { lines: all, cost };
      return;
    }
    const {
      head: { i, d },
      tail,
    } = stack;
    switch (d.t) {
      case "text":
        return go(tail, lines, cur + d.s);
      case "nl":
        return go(tail, [...lines, cur], " ".repeat(i));
      case "cat":
        return go(
          { head: { i, d: d.a }, tail: { head: { i, d: d.b }, tail } },
          lines,
          cur
        );
      case "nest":
        return go({ head: { i: i + d.n, d: d.d }, tail }, lines, cur);
      case "align":
        return go({ head: { i: cur.length, d: d.d }, tail }, lines, cur);
      case "choice":
        go({ head: { i, d: d.a }, tail }, lines, cur);
        go({ head: { i, d: d.b }, tail }, lines, cur);
        return;
    }
  };
  go({ head: { i: 0, d: doc }, tail: null }, [], "");
  return { ...best!, explored };
};

const FOLD_SRC =
  "(define (fold f acc xs) (if (null? xs) acc (fold f (f acc (car xs)) (cdr xs))))";

export const PrettyPrinterWidths: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const SIZE = 12,
      LH = 17;
    const cw = measure("0123456789", SIZE, MONO) / 10;
    const doc = sexpDoc(parseSExp(FOLD_SRC));

    const marks: any[] = [];
    let oy = 0;
    for (const limit of [80, 40, 24]) {
      const { lines, cost, explored } = prettyPrint(doc, limit);
      const widths = lines.map((l) => l.length);
      marks.push(
        T(0, oy, `width limit = ${limit}`, { weight: 700 }),
        T(
          120,
          oy,
          `cost = (overflow ${cost[0]}, newlines ${cost[1]}) · shape: first ${widths[0]}, max ${Math.max(
            ...widths
          )}, last ${widths[widths.length - 1]} cols · ${explored} candidate layouts`,
          { fill: MUTED }
        )
      );
      const top = oy + 22;
      lines.forEach((l, li) => {
        const y = top + li * LH;
        const lead = l.length - l.trimStart().length;
        marks.push(
          R(lead * cw, y - 1, (l.length - lead) * cw, LH - 1, {
            fill: "rgba(107,143,184,0.22)",
            stroke: "rgba(107,143,184,0.6)",
            sw: 0.75,
          }),
          // SVG collapses leading spaces, so place the text at its indent.
          T(lead * cw, y + 1, l.trimStart(), { size: SIZE, font: MONO })
        );
      });
      const bottom = top + lines.length * LH;
      marks.push(...dashedV(limit * cw, top - 6, bottom + 2));
      marks.push(
        T(limit * cw + 4, top - 6, `${limit}`, { size: 10, fill: ACCENT })
      );
      oy = bottom + 26;
    }
    layer(marks).render(container, { w: 82 * cw + 40, h: oy });
    return container;
  },
};

// --- 5. label angle candidates -----------------------------------------------

const regionProduct = [
  "Laptops",
  "Smartphones",
  "Accessories",
  "Wearables",
].flatMap((product, i) =>
  ["North", "South", "West"].map((region, j) => ({
    region,
    product,
    sales: 30 + ((i * 17 + j * 11) % 40),
  }))
);

export const LabelAngleCandidates: StoryObj = {
  render: () => {
    const container = initializeContainer();
    container.style.display = "grid";
    container.style.gridTemplateColumns = "repeat(2, 520px)";
    container.style.gap = "18px 30px";
    container.style.font = "11px " + FALLBACK_FONT_FAMILY;
    // Each candidate is its own chart (rendered standalone: nested in a
    // spread(), the chart's axes options did not take effect). The caption is
    // an HTML line above it.
    const panel = (angle: any, caption: string, chosen: boolean) => {
      const cell = document.createElement("div");
      const cap = document.createElement("div");
      cap.textContent = caption;
      cap.style.color = chosen ? ACCENT : INK;
      cap.style.fontWeight = chosen ? "700" : "400";
      cap.style.marginBottom = "6px";
      const host = document.createElement("div");
      cell.append(cap, host);
      container.append(cell);
      chart(regionProduct, {
        axes: { x: { label: { angle } } },
        w: 400,
        h: 140,
      })
        .flow(
          spread({ by: "region", dir: "x", spacing: 24 }),
          spread({ by: "product", dir: "x", spacing: 0 })
        )
        .mark(rect({ h: "sales", fill: "product" }))
        .render(host);
    };
    panel([0], "candidate: product labels at 0 deg (collide)", false);
    panel(
      [45],
      "candidate: product labels at 45 deg (first angle with no collision)",
      true
    );
    panel([90], "candidate: product labels at 90 deg (clear, tallest)", false);
    panel(
      "auto",
      'today: label: { angle: "auto" } at w = 400 (picks 45 deg)',
      false
    );
    return container;
  },
};

// --- 6. tick count candidates ------------------------------------------------

export const TickCountCandidates: StoryObj = {
  render: () => {
    const container = initializeContainer();
    const PW = 200,
      SIZE = 11,
      MAX = 12000;
    const fmt = (v: number) => v.toLocaleString("en-US");
    // Candidates: d3's tick sets for a few requested counts. Cost: overlapping
    // label pairs; among the overlap-free candidates, prefer more ticks.
    const candidates = [3, 5, 10, 20].map((count) => {
      const ts = ticks(0, MAX, count);
      const labels = ts.map((v) => {
        const s = fmt(v);
        const w = measure(s, SIZE);
        const cx = (v / MAX) * PW;
        return { v, s, w, x0: cx - w / 2, x1: cx + w / 2, cx, hit: false };
      });
      // Two neighboring labels overlap when their measured boxes intersect.
      let overlaps = 0;
      for (let k = 1; k < labels.length; k++) {
        if (labels[k].x0 < labels[k - 1].x1) {
          overlaps++;
          labels[k].hit = labels[k - 1].hit = true;
        }
      }
      return { count, ts, labels, overlaps };
    });
    const best = argmin(candidates, (c) => c.overlaps * 1000 - c.ts.length);
    const marks: any[] = [];
    let oy = 0;
    for (const { count, ts, labels, overlaps } of candidates) {
      const chosen =
        candidates[candidates.findIndex((c) => c.count === count)] === best;
      marks.push(
        T(
          0,
          oy,
          `count ≈ ${count} → ${ts.length} ticks, step ${fmt(ts[1] - ts[0])} · ${overlaps} overlapping label pair${overlaps === 1 ? "" : "s"}${
            chosen ? "   (chosen: most ticks with no overlap)" : ""
          }`,
          {
            weight: chosen ? 700 : 400,
            fill: overlaps === 0 ? INK : ACCENT,
          }
        )
      );
      const ax = 24,
        ay = oy + 30;
      marks.push(R(ax, ay, PW, 1, { fill: INK }));
      for (const l of labels) {
        marks.push(R(ax + l.cx - 0.5, ay, 1, 5, { fill: INK }));
        marks.push(
          T(ax + l.x0, ay + 8, l.s, { size: SIZE, fill: l.hit ? ACCENT : INK })
        );
      }
      oy = ay + 40;
    }
    marks.push(
      T(
        0,
        oy - 8,
        `plot width ${PW} px, domain 0..${fmt(MAX)}; ticks from d3-array ticks(0, ${MAX}, count)`,
        {
          size: 10,
          fill: MUTED,
        }
      )
    );
    layer(marks).render(container, { w: 560, h: oy + 8 });
    return container;
  },
};
