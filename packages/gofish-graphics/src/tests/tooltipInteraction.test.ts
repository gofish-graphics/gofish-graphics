/**
 * `.tooltip()` live (#1395): the box opens beside the focused bar, takes no
 * pointer, moves nothing, and the chart re-runs only when the focused key
 * changes. A tap focuses and holds.
 *
 * Run: `pnpm build && node --conditions browser --import tsx
 * src/tests/tooltipInteraction.test.ts` (wired as `pnpm test:tooltip-interaction`).
 */
import { settle } from "./interactionDomSetup";
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { check, report } from "./testHelpers";

const { chart, spread, rect, derive } = GoFish as any;

const rows = [
  { path: "VO→VO", n: 11902, share: 0.13 },
  { path: "INF→INF", n: 9811, share: 0.107 },
  { path: "PK→PK", n: 5310, share: 0.058 },
];

const container = document.createElement("div");
document.body.appendChild(container);
let resolves = 0;
await chart(rows, { w: 400, h: 200 })
  .flow(
    derive((r: any) => {
      resolves++;
      return r;
    }),
    spread({ by: "path", dir: "y", spacing: 4 })
  )
  .mark(rect({ w: "share" }).tooltip())
  .render(container, {});
await settle();

const svg = () => container.querySelector("svg")!;
const boxOf = () =>
  [...container.querySelectorAll("rect")].find(
    (r) => r.getAttribute("stroke") === "#c9ced6"
  );
const marks = () =>
  [...container.querySelectorAll("rect")]
    .filter((r) => r.getAttribute("stroke") !== "#c9ced6")
    .map((r) => ["x", "y", "width", "height"].map((a) => r.getAttribute(a)).join(","));
const texts = () =>
  [...container.querySelectorAll("text")].map((t) => t.textContent);
const send = (type: string, x: number, y: number, pointerType = "mouse") =>
  svg().dispatchEvent(
    new (globalThis as any).PointerEvent(type, {
      clientX: x,
      clientY: y,
      bubbles: true,
      pointerType,
    })
  );

console.log("# no focus");
check("one run", resolves === 1, resolves);
check("no box", boxOf() === undefined);
check("no <title> while live", container.querySelectorAll("title").length === 0);
const before = marks();
const beforeTexts = texts();
const beforePainted = svg().querySelectorAll("rect, text, line, path").length;

console.log("# hover the first bar");
// Bars sit at y 0-64, 68-132, 136-200; x from 72.
send("pointermove", 100, 30);
await settle();
check("one more run", resolves === 2, resolves);
const box = boxOf();
check("a box", box !== undefined);
check(
  "its rows",
  ["path", "n", "share", "VO→VO", "11,902", "0.13"].every((t) => texts().includes(t)),
  texts()
);
check("it takes no pointer", box?.getAttribute("pointer-events") === "none");
check(
  "the marks did not move",
  JSON.stringify(marks().slice(0, before.length)) === JSON.stringify(before),
  [marks(), before]
);
check(
  "the box sits inside the chart",
  Number(box?.getAttribute("x")) + Number(box?.getAttribute("width")) <= 472 + 0.5,
  box?.outerHTML
);
{
  // The box is the last thing painted: everything the drawing had before,
  // the axes' ticks and labels too, paints under it.
  const painted = [...svg().querySelectorAll("rect, text, line, path")];
  const at = box === undefined ? -1 : painted.indexOf(box);
  check(
    "it paints over the axes",
    beforePainted > 0 && at === beforePainted,
    [at, beforePainted]
  );
}

console.log("# over the box, the focus stays");
{
  // The first bar is full width, so its box hangs under its end, over the
  // second bar's row (x 366.8-472, y 72-132; the second bar ends at 401).
  const runs = resolves;
  send("pointermove", 450, 100);
  await settle();
  check("still the first bar's box", texts().includes("11,902"), texts());
  check("no re-run", resolves === runs, resolves - runs);
}

console.log("# 30 moves across 3 bars");
{
  const start = resolves;
  for (let i = 0; i < 30; i++) {
    const row = Math.floor(i / 10);
    send("pointermove", 100 + i * 3, row * 68 + 20 + (i % 10));
    await settle(2);
  }
  await settle();
  // Already on bar 1, so the key changes twice (to bar 2, then bar 3).
  check("re-runs only when the key changes: 2", resolves - start === 2, resolves - start);
  console.log(`  30 moves, ${resolves - start} re-runs`);
  check("now on the third bar", texts().includes("5310"), texts());
}

console.log("# the time of one re-run with the box open");
{
  const t0 = performance.now();
  send("pointermove", 100, 30);
  while (!texts().includes("11,902")) await settle(1);
  console.log(`  one re-run: ${(performance.now() - t0).toFixed(1)} ms`);
}

console.log("# leave");
send("pointermove", 1000, 1000);
await settle();
check("the box closes", boxOf() === undefined);
check("back to the first drawing", JSON.stringify(texts()) === JSON.stringify(beforeTexts));

console.log("# a re-run replaced the svg: the container hears the leave");
{
  // Each re-run paints a new svg. In a browser the pointer that was over the
  // old one is over none of the new one's elements until it moves, so a
  // move straight off the chart fires `pointerleave` on the container (and
  // its ancestors) only, which does not bubble.
  send("pointermove", 100, 30);
  await settle();
  const first = svg();
  check("open, in a new svg", boxOf() !== undefined && first.isConnected);
  container.dispatchEvent(
    new (globalThis as any).PointerEvent("pointerleave", {
      clientX: 1000,
      clientY: 1000,
      bubbles: false,
      pointerType: "mouse",
    })
  );
  await settle();
  check("the container's leave closes the box", boxOf() === undefined);
  // A move that lands in the container, off the svg, is a leave too.
  send("pointermove", 100, 30);
  await settle();
  container.dispatchEvent(
    new (globalThis as any).PointerEvent("pointermove", {
      clientX: 1000,
      clientY: 30,
      bubbles: true,
      pointerType: "mouse",
    })
  );
  await settle();
  check("a move onto the container, off the svg, closes it", boxOf() === undefined);
}

console.log("# touch: a tap focuses and holds");
send("pointerdown", 100, 100, "touch");
send("pointerup", 100, 100, "touch");
// A lifted finger leaves every element under it; the container hears its
// own `pointerleave`, which does not bubble.
container.dispatchEvent(
  new (globalThis as any).PointerEvent("pointerleave", {
    clientX: 100,
    clientY: 100,
    bubbles: false,
    pointerType: "touch",
  })
);
await settle();
check("the tapped bar's box", texts().includes("9811"), texts());
send("pointermove", 1000, 1000, "mouse");
await settle();
check("a mouse move off the chart closes it", boxOf() === undefined);

console.log("# a chart nested per group: one box, in any group");
{
  const { stack } = GoFish as any;
  const catches = [
    { lake: "A", species: "s1", count: 3 },
    { lake: "A", species: "s2", count: 4 },
    { lake: "B", species: "s1", count: 5 },
  ];
  const el = document.createElement("div");
  document.body.appendChild(el);
  await chart(catches, { w: 300, h: 200 })
    .flow(spread({ by: "lake", dir: "x", spacing: 40 }))
    .mark(
      chart()
        .flow(stack({ by: "species", dir: "y" }))
        .mark(rect({ h: "count", fill: "#4c78a8" }).tooltip())
    )
    .render(el, {});
  await settle();
  const segments = [...el.querySelectorAll('rect[fill="#4c78a8"]')];
  const boxes = () =>
    [...el.querySelectorAll("rect")].filter(
      (r) => r.getAttribute("stroke") === "#c9ced6"
    );
  for (const [i, lake] of ["A", "B"].entries()) {
    // The first segment of each lake, in drawing order: A's first, then B's.
    const seg = i === 0 ? segments[0] : segments[segments.length - 1];
    const x = Number(seg.getAttribute("x")) + 2;
    const y = Number(seg.getAttribute("y")) + 2;
    el.querySelector("svg")!.dispatchEvent(
      new (globalThis as any).PointerEvent("pointermove", {
        clientX: x,
        clientY: y,
        bubbles: true,
        pointerType: "mouse",
      })
    );
    await settle();
    const shown = [...el.querySelectorAll("text")].map((t) => t.textContent);
    check(
      `lake ${lake}: one box, with its lake`,
      boxes().length === 1 && shown.includes(lake),
      [boxes().length, shown.slice(0, 6)]
    );
  }
}

console.log("# a line drawn through rows: the box describes its nearest row");
{
  const { group, line } = GoFish as any;
  const budget = [
    { series: "Revenue", year: 2018, value: 1.6 },
    { series: "Revenue", year: 2019, value: 1.9 },
    { series: "Revenue", year: 2020, value: 1.7 },
    { series: "Revenue", year: 2021, value: 2.3 },
    { series: "Revenue", year: 2022, value: 2.6 },
    { series: "Cost", year: 2018, value: 1.2 },
    { series: "Cost", year: 2019, value: 1.3 },
    { series: "Cost", year: 2020, value: 1.5 },
    { series: "Cost", year: 2021, value: 1.6 },
    { series: "Cost", year: 2022, value: 2.0 },
  ];
  const el = document.createElement("div");
  document.body.appendChild(el);
  let runs = 0;
  const lineChart = (fields?: string[]) =>
    chart(budget, { w: 400, h: 260 })
      .flow(
        derive((r: any) => {
          runs++;
          return r;
        }),
        group({ by: "series" })
      )
      .mark(line({ x: "year", y: "value", stroke: "series" }).tooltip(fields));
  await lineChart().render(el, {});
  await settle();
  const stroke = { Revenue: "#4190c5", Cost: "#f2cf57" } as const;
  /** The points of a line's rows: the end of each command of its `d` (a
   *  curve's control points are off it). */
  const rowsOf = (series: keyof typeof stroke) => {
    const path = [...el.querySelectorAll("path")].find(
      (p) => p.getAttribute("stroke") === stroke[series]
    )!;
    return (path.getAttribute("d") ?? "")
      .split(/[A-Za-z]/)
      .map((c) => c.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [])
      .filter((n) => n.length >= 2)
      .map((n) => [n[n.length - 2], n[n.length - 1]] as [number, number]);
  };
  const boxRect = () =>
    [...el.querySelectorAll("rect")].find((r) => r.getAttribute("stroke") === "#c9ced6");
  const boxAt = () => {
    const r = boxRect();
    return r && ["x", "y", "width", "height"].map((a) => Number(r.getAttribute(a)));
  };
  /** The marker: a circle drawn over the chart, so no pointer target. */
  const markers = () =>
    [...el.querySelectorAll("ellipse")].filter(
      (e) => e.closest('[pointer-events="none"]') !== null
    );
  const shown = () => {
    const r = boxRect();
    const g = r?.parentElement;
    return g ? [...g.querySelectorAll("text")].map((t) => t.textContent) : [];
  };
  const move = (x: number, y: number) =>
    el.querySelector("svg")!.dispatchEvent(
      new (globalThis as any).PointerEvent("pointermove", {
        clientX: x,
        clientY: y,
        bubbles: true,
        pointerType: "mouse",
      })
    );
  const years = ["2018", "2019", "2020", "2021", "2022"];
  const values = {
    Revenue: ["1.6", "1.9", "1.7", "2.3", "2.6"],
    Cost: ["1.2", "1.3", "1.5", "1.6", "2"],
  };
  for (const series of ["Revenue", "Cost"] as const) {
    const pts = rowsOf(series);
    check(`${series}: five rows drawn`, pts.length === 5, pts);
    for (const [i, [x, y]] of pts.entries()) {
      // A little off the point, toward its neighbor (inside the chart).
      move(i === 4 ? x - 12 : x + 12, y + (series === "Revenue" ? -2 : 2));
      await settle();
      const text = shown();
      check(
        `${series} ${years[i]}: the box names its series, year and value`,
        text.includes(series) && text.includes(years[i]) && text.includes(values[series][i]),
        text
      );
      const m = markers();
      check(
        `${series} ${years[i]}: one marker, on the row's point`,
        m.length === 1 &&
          Math.abs(Number(m[0].getAttribute("cx")) - x) < 0.5 &&
          Math.abs(Number(m[0].getAttribute("cy")) - y) < 0.5,
        [m.map((e) => [e.getAttribute("cx"), e.getAttribute("cy")]), x, y]
      );
      check(
        `${series} ${years[i]}: the marker is drawn in the line's color`,
        m[0]?.getAttribute("stroke") === stroke[series] &&
          m[0]?.getAttribute("fill") === "white",
        m[0] && [m[0].getAttribute("stroke"), m[0].getAttribute("fill")]
      );
      check(
        `${series} ${years[i]}: the marker is no pointer target`,
        m[0] !== undefined &&
          (m[0].closest('[pointer-events="none"]') !== null ||
            m[0].getAttribute("pointer-events") === "none")
      );
      const b = boxAt()!;
      const gap = Math.hypot(
        Math.max(b[0] - x, 0, x - (b[0] + b[2])),
        Math.max(b[1] - y, 0, y - (b[1] + b[3]))
      );
      check(
        `${series} ${years[i]}: the box beside the point (${gap.toFixed(1)} px)`,
        gap <= 8 + 4 + 0.5,
        [b, x, y]
      );
    }
  }
  console.log("# a sweep along a line: one re-run per row crossed");
  {
    const pts = rowsOf("Revenue");
    move(pts[0][0], pts[0][1]);
    await settle();
    const before = runs;
    const svgs = new Set<Element>();
    for (let k = 0; k <= 80; k++) {
      const t = k / 80;
      const seg = Math.min(3, Math.floor(t * 4));
      const f = t * 4 - seg;
      const [ax, ay] = pts[seg];
      const [bx, by] = pts[seg + 1];
      move(ax + f * (bx - ax), ay + f * (by - ay) - 1);
      await settle();
      svgs.add(el.querySelector("svg")!);
    }
    check(
      `from the first row to the last: four re-runs (${runs - before})`,
      runs - before === 4,
      runs - before
    );
    const still = runs;
    const [lx, ly] = pts[4];
    for (let k = 0; k < 10; k++) {
      move(lx - 3 + k * 0.5, ly - 1);
      await settle();
    }
    check("moving about one row: no re-run", runs === still, runs - still);
  }
  for (const [fields, want] of [
    [["year", "value"], ["year", "value", "2020", "1.5"]],
    [["series", "value"], ["series", "value", "Cost", "1.5"]],
  ] as const) {
    console.log(`# a line's row: the field list ${JSON.stringify(fields)}`);
    const el2 = document.createElement("div");
    document.body.appendChild(el2);
    await lineChart([...fields]).render(el2, {});
    await settle();
    const path = [...el2.querySelectorAll("path")].find(
      (p) => p.getAttribute("stroke") === stroke.Cost
    )!;
    const [x, y] = (path.getAttribute("d") ?? "")
      .split(/[A-Za-z]/)
      .map((c) => c.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [])
      .filter((n) => n.length >= 2)
      .map((n) => [n[n.length - 2], n[n.length - 1]])[2];
    el2.querySelector("svg")!.dispatchEvent(
      new (globalThis as any).PointerEvent("pointermove", {
        clientX: x,
        clientY: y + 1,
        bubbles: true,
        pointerType: "mouse",
      })
    );
    await settle();
    // The box's text: what no pointer lands on.
    const text = [...el2.querySelectorAll("text")]
      .filter((t) => t.closest('[pointer-events="none"]') !== null)
      .map((t) => t.textContent);
    check(
      "the listed fields of the focused row, in order",
      JSON.stringify(text) === JSON.stringify(want),
      text
    );
  }
  console.log("# the same x: the Cost box sits below the Revenue box");
  {
    const [rx, ry] = rowsOf("Revenue")[2];
    move(rx, ry - 1);
    await settle();
    const rev = boxAt()!;
    const [cx, cy] = rowsOf("Cost")[2];
    move(cx, cy + 1);
    await settle();
    const cost = boxAt()!;
    check("the Cost box is below the Revenue box", cost[1] > rev[1], [rev, cost]);
  }
}

console.log("# a line drawn from a function, and a connector: one box, no snap");
{
  const { line, fun, scatter, circle, selectAll } = GoFish as any;
  const wave = fun((t: number) => 1 + 0.6 * Math.sin(t), { domain: [0, 10] });
  const boxIn = (el: Element) =>
    [...el.querySelectorAll("rect")].find((r) => r.getAttribute("stroke") === "#c9ced6");
  const textIn = (el: Element) => {
    const r = boxIn(el);
    return r ? [...r.parentElement!.querySelectorAll("text")].map((t) => t.textContent) : [];
  };
  const pathIn = (el: Element) =>
    [...el.querySelectorAll("path")].find((p) => p.getAttribute("fill") === "none")!;
  /** Points along a drawn path: the end of each command of its `d`. */
  const along = (path: Element) =>
    (path.getAttribute("d") ?? "")
      .split(/[A-Za-z]/)
      .map((c) => c.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [])
      .filter((n) => n.length >= 2)
      .map((n) => [n[n.length - 2], n[n.length - 1]] as [number, number]);
  const moveIn = (el: Element, x: number, y: number) =>
    el.querySelector("svg")!.dispatchEvent(
      new (globalThis as any).PointerEvent("pointermove", {
        clientX: x,
        clientY: y,
        bubbles: true,
        pointerType: "mouse",
      })
    );
  for (const [name, make] of [
    [
      "from a function",
      (count: () => void) =>
        chart([{ name: "wave" }], { w: 400, h: 200 })
          .flow(derive((r: any) => (count(), r)))
          .mark(line({ x: wave.domain(), y: wave }).tooltip()),
    ],
    [
      "a connector",
      (count: () => void) =>
        chart(
          [
            { t: 1, v: 2, s: "A" },
            { t: 2, v: 3, s: "A" },
            { t: 3, v: 1, s: "A" },
          ],
          { w: 400, h: 200 }
        )
          .flow(derive((r: any) => (count(), r)), scatter({ by: "t", x: "t", y: "v" }))
          .mark(circle({ r: 0 }).name("pts"))
          .layer(chart(selectAll("pts")).mark(line().tooltip())),
    ],
  ] as const) {
    const el = document.createElement("div");
    document.body.appendChild(el);
    let runs = 0;
    await make(() => runs++).render(el, {});
    await settle();
    const pts = along(pathIn(el));
    const [x0, y0] = pts[Math.floor(pts.length / 4)];
    moveIn(el, x0, y0 + 1);
    await settle();
    const opened = runs;
    const first = boxIn(el)?.getAttribute("x");
    check(`${name}: a box`, boxIn(el) !== undefined, textIn(el));
    check(
      `${name}: no marker`,
      [...el.querySelectorAll("ellipse")].every((e) => e.closest('[pointer-events="none"]') === null)
    );
    for (const t of [0.4, 0.6, 0.8]) {
      const [x, y] = pts[Math.floor(t * (pts.length - 1))];
      moveIn(el, x, y + 1);
      await settle();
    }
    check(`${name}: moving along it, no re-run`, runs === opened, runs - opened);
    check(`${name}: the box stays where it is`, boxIn(el)?.getAttribute("x") === first);
  }
}

console.log("# the widget path: an IR document rendered by renderIR");
{
  // What the Python widget does with `rect(w="share").tooltip()`: the
  // document crosses as IR and `Serialize.renderIR` renders it.
  const { Serialize } = GoFish as any;
  const doc = await Serialize.toJSON(
    chart(rows, { w: 400, h: 200 })
      .flow(spread({ by: "path", dir: "y", spacing: 4 }))
      .mark(rect({ w: "share" }).tooltip(["path", "n"]))
  );
  const el = document.createElement("div");
  document.body.appendChild(el);
  await Serialize.renderIR(doc, el, {});
  await settle();
  el.querySelector("svg")!.dispatchEvent(
    new (globalThis as any).PointerEvent("pointermove", {
      clientX: 100,
      clientY: 100,
      bubbles: true,
      pointerType: "mouse",
    })
  );
  await settle();
  const shown = [...el.querySelectorAll("text")].map((t) => t.textContent);
  check(
    "hover opens the box with the listed fields",
    // The box paints last, over the chrome: its names column, then its
    // values.
    JSON.stringify(shown.slice(-4)) ===
      JSON.stringify(["path", "n", "INF→INF", "9811"]),
    shown
  );
}

report();
