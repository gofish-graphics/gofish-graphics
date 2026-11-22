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

console.log("# over the box, a mark under it is reached");
{
  // The first bar is full width, so its box hangs under its end, over the
  // second bar's row (x 366.8-472, y 72-132; the second bar ends at 401).
  // The box is no pointer target: the second bar's row decides there.
  const runs = resolves;
  send("pointermove", 450, 100);
  await settle();
  check("the second bar's box", texts().includes("9811"), texts());
  check("one re-run", resolves === runs + 1, resolves - runs);
  // At rest there for a second: the focus holds, nothing re-runs.
  const still = resolves;
  const t0 = performance.now();
  while (performance.now() - t0 < 1000) {
    send("pointermove", 450, 100);
    await settle(1);
  }
  check("at rest over a box for 1 s: no re-run", resolves === still, resolves - still);
  check("at rest over a box for 1 s: the same box", texts().includes("9811"), texts());
  // Down through the first bar's box (x 366.8-472, y 72-132) at x 395,
  // over the second bar's end (401): bar 1, then bar 2, and a box on every
  // frame. The third bar ends at 250, past the hull limit from here.
  send("pointermove", 395, 30);
  await settle();
  const seen: string[] = [];
  let closed = 0;
  for (let y = 30; y <= 128; y += 2) {
    send("pointermove", 395, y);
    await settle();
    if (boxOf() === undefined) closed++;
    const n = ["11,902", "9811", "5310"].find((v) => texts().includes(v));
    if (n !== undefined && seen[seen.length - 1] !== n) seen.push(n);
  }
  check(
    "down through bar 1's box: bar 1, then bar 2",
    JSON.stringify(seen) === JSON.stringify(["11,902", "9811"]),
    seen
  );
  check("down through bar 1's box: never closed", closed === 0, closed);
  // Back on the first bar for what follows.
  send("pointermove", 100, 30);
  await settle();
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
  console.log("# under the Revenue box: the Cost row nearest the pointer");
  {
    // Revenue 2020's box sits right of its point and below it, over the
    // Cost line between 2020 and 2021.
    const [rx, ry] = rowsOf("Revenue")[2];
    move(rx, ry - 1);
    await settle();
    const b = boxAt()!;
    const cost = rowsOf("Cost");
    const under = cost.find(
      ([x, y]) => x >= b[0] && x <= b[0] + b[2] && y >= b[1] && y <= b[1] + b[3]
    );
    check("a Cost row under the Revenue box", under !== undefined, [b, cost]);
    if (under) {
      move(under[0] - 3, under[1] + 1);
      await settle();
      const text = shown();
      const i = cost.indexOf(under);
      check(
        "the Cost row's box",
        text.includes("Cost") && text.includes(years[i]),
        text
      );
    }
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

console.log("# over the box, no mark near: the box holds");
{
  const { scatter, circle } = GoFish as any;
  // Three dots in a corner: a box beside one reaches past their hull.
  const dots = [
    { name: "a", x: 0, y: 0 },
    { name: "b", x: 10, y: 0 },
    { name: "c", x: 0, y: 10 },
  ];
  const el = document.createElement("div");
  document.body.appendChild(el);
  let runs = 0;
  await chart(dots, { w: 300, h: 300 })
    .flow(
      derive((r: any) => (runs++, r)),
      scatter({ by: "name", x: "x", y: "y" })
    )
    .mark(circle({ r: 5 }).tooltip(["name"]))
    .render(el, {});
  await settle();
  const svgEl = el.querySelector("svg")!;
  const moveTo = (x: number, y: number) =>
    svgEl.ownerDocument === document &&
    el.querySelector("svg")!.dispatchEvent(
      new (globalThis as any).PointerEvent("pointermove", {
        clientX: x,
        clientY: y,
        bubbles: true,
        pointerType: "mouse",
      })
    );
  const centers = [...el.querySelectorAll("ellipse")]
    .filter((e) => e.closest('[pointer-events="none"]') === null)
    .map((e) => [Number(e.getAttribute("cx")), Number(e.getAttribute("cy"))]);
  const boxRect = () =>
    [...el.querySelectorAll("rect")].find((r) => r.getAttribute("stroke") === "#c9ced6");
  const name = () =>
    [...el.querySelectorAll("text")]
      .filter((t) => t.closest('[pointer-events="none"]') !== null)
      .map((t) => t.textContent)
      .join(" ");
  // Open each dot's box until one reaches 20 px past every dot.
  let spot: [number, number] | undefined;
  let opened = "";
  for (const [cx, cy] of centers) {
    moveTo(cx, cy);
    await settle();
    const r = boxRect()!;
    const [x, y, w, h] = ["x", "y", "width", "height"].map((a) => Number(r.getAttribute(a)));
    for (let i = 1; i < 10 && !spot; i++)
      for (let j = 1; j < 10 && !spot; j++) {
        const p: [number, number] = [x + (w * i) / 10, y + (h * j) / 10];
        if (centers.every(([qx, qy]) => Math.hypot(qx - p[0], qy - p[1]) > 5 + 40))
          spot = p;
      }
    if (spot) {
      opened = name();
      break;
    }
  }
  check("a spot over a box with no mark near", spot !== undefined);
  if (spot) {
    const before = runs;
    for (let k = 0; k < 5; k++) {
      moveTo(spot[0] + k, spot[1]);
      await settle();
    }
    check("the box holds", boxRect() !== undefined && name() === opened, [name(), opened]);
    check("no re-run", runs === before, runs - before);
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

/* Helpers for the blocks below: a chart rendered into an element of its
 * own, the box in it, and a pointer move over it. */
const freshEl = () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
};
const boxOfEl = (el: Element) =>
  [...el.querySelectorAll("rect")].find((r) => r.getAttribute("stroke") === "#c9ced6");
const boxTexts = (el: Element) => {
  const r = boxOfEl(el);
  return r ? [...r.parentElement!.querySelectorAll("text")].map((t) => t.textContent) : [];
};
const moveOver = (el: Element, x: number, y: number) =>
  el.querySelector("svg")!.dispatchEvent(
    new (globalThis as any).PointerEvent("pointermove", {
      clientX: x,
      clientY: y,
      bubbles: true,
      pointerType: "mouse",
    })
  );
/** The interaction runtime's registered inputs, read off the container. */
const inputCount = (el: Element) => (el as any).__gofishState?.runtime?.inputs?.length;

console.log("# a .tooltip() rebuilt on every resolve keeps one focus");
{
  const { gofish, Serialize } = GoFish as any;
  // Bars sit at y 0-64, 68-132, 136-200 in a 400 x 200 chart.
  const bars = (count: () => void) =>
    chart(rows, { w: 400, h: 200 }).flow(
      derive((r: any) => (count(), r)),
      spread({ by: "path", dir: "y", spacing: 4 })
    );
  const shapes: [string, (el: HTMLElement, count: () => void) => Promise<unknown>][] = [
    [
      "a function mark",
      (el, count) => bars(count).mark((d: any) => rect({ w: "share" }).tooltip()(d)).render(el, {}),
    ],
    [
      "a component thunk",
      (el, count) =>
        gofish(el, {}, () => bars(count).mark(rect({ w: "share" }).tooltip())),
    ],
    [
      "a Python lambda mark (an IR mark-fn)",
      async (el, count) => {
        const doc = await Serialize.toJSON(
          chart(rows, { w: 400, h: 200 })
            .flow(spread({ by: "path", dir: "y", spacing: 4 }))
            .mark(rect({ w: "share" }).tooltip())
        );
        const markIR = doc.root.mark;
        doc.root.mark = { type: "mark-fn", lambdaId: "m" };
        // The mark function is called once per bar: a resolve is the call
        // for the first one.
        const bridge = {
          call: async (_id: string, rows: any[]) => {
            if (rows[0]?.path === "VO→VO") count();
            // Python applies the mark to the rows it was called with, which
            // cross as JSON: new row objects on every call.
            return { root: { ...markIR, __datum: JSON.parse(JSON.stringify(rows)) }, tables: {} };
          },
        };
        return Serialize.renderIR(doc, el, {}, bridge);
      },
    ],
  ];
  for (const [name, render] of shapes) {
    const el = freshEl();
    let runs = 0;
    await render(el, () => runs++);
    await settle();
    const first = runs;
    moveOver(el, 100, 30);
    await settle();
    check(`${name}: hover opens a box`, boxTexts(el).includes("VO→VO"), [boxTexts(el), el.querySelectorAll("title").length, inputCount(el)]);
    const opened = runs;
    check(`${name}: one re-run to open it`, opened - first === 1, opened - first);
    const inputs = inputCount(el);
    for (let i = 0; i < 20; i++) {
      moveOver(el, 100 + (i % 3), i % 2 === 0 ? 100 : 30);
      await settle();
    }
    check(`${name}: one re-run per change of focus`, runs - opened === 20, runs - opened);
    check(
      `${name}: the inputs do not grow with re-runs`,
      inputCount(el) === inputs && inputs !== undefined,
      [inputs, inputCount(el)]
    );
  }
}

console.log("# a line whose flow makes new rows on every run: the box is at the row");
{
  const { group, line } = GoFish as any;
  const series = [2018, 2019, 2020, 2021, 2022].map((year, i) => ({
    s: "A",
    year,
    value: [1, 3, 2, 5, 4][i],
  }));
  const el = freshEl();
  await chart(series, { w: 400, h: 260 })
    .flow(
      // A copy of every row, as any Python derive makes.
      derive((rs: any[]) => rs.map((r) => ({ ...r }))),
      group({ by: "s" })
    )
    .mark(line({ x: "year", y: "value" }).tooltip())
    .render(el, {});
  await settle();
  const path = [...el.querySelectorAll("path")].find((p) => p.getAttribute("fill") === "none")!;
  const pts = (path.getAttribute("d") ?? "")
    .split(/[A-Za-z]/)
    .map((c) => c.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [])
    .filter((n) => n.length >= 2)
    .map((n) => [n[n.length - 2], n[n.length - 1]] as [number, number]);
  const marker = () =>
    [...el.querySelectorAll("ellipse")].find((e) => e.closest('[pointer-events="none"]') !== null);
  for (const i of [1, 2]) {
    const [x, y] = pts[i];
    moveOver(el, x + 3, y);
    await settle();
    const m = marker();
    check(
      `row ${2018 + i}: the box shows the row`,
      boxTexts(el).includes(String(2018 + i)),
      boxTexts(el)
    );
    check(
      `row ${2018 + i}: the marker is on the row's point, not the line's end`,
      m !== undefined &&
        Math.abs(Number(m.getAttribute("cx")) - x) < 0.5 &&
        Math.abs(Number(m.getAttribute("cy")) - y) < 0.5,
      [m?.getAttribute("cx"), m?.getAttribute("cy"), x, y]
    );
  }
}

console.log("# a time column in a zone: a line's row reads as a bar does");
{
  const { line, group, Unit } = GoFish as any;
  const ny = "America/New_York";
  // Midnight in New York, as epoch milliseconds: Jan 15 and Jan 16, 2024.
  const days = [Date.UTC(2024, 0, 15, 5), Date.UTC(2024, 0, 16, 5)];
  const data = days.map((day, i) => ({ s: "A", day, n: i + 1 }));
  const opts = { w: 400, h: 200, schema: { day: Unit.time({ zone: ny }) } };
  const bars = freshEl();
  await chart(data, opts)
    .flow(spread({ by: "day", dir: "x" }))
    .mark(rect({ h: "n" }).tooltip(["day", "n"]))
    .render(bars, {});
  await settle();
  const first = [...bars.querySelectorAll("rect")][0];
  moveOver(
    bars,
    Number(first.getAttribute("x")) + 2,
    Number(first.getAttribute("y")) + Number(first.getAttribute("height")) - 2
  );
  await settle();
  check("a bar: New York's day", boxTexts(bars).includes("Jan 15, 2024"), boxTexts(bars));
  for (const fields of [undefined, ["day", "n"]]) {
    const el = freshEl();
    await chart(data, opts)
      .flow(group({ by: "s" }))
      .mark(line({ x: "day", y: "n" }).tooltip(fields))
      .render(el, {});
    await settle();
    const path = [...el.querySelectorAll("path")].find((p) => p.getAttribute("fill") === "none")!;
    const [x, y] = (path.getAttribute("d") ?? "").match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    moveOver(el, x + 2, y);
    await settle();
    check(
      `a line's row${fields ? ", listed fields" : ""}: New York's day`,
      boxTexts(el).includes("Jan 15, 2024"),
      boxTexts(el)
    );
  }
}

console.log("# a listed field one row of a line lacks: left out of that row's box");
{
  const { line, group } = GoFish as any;
  const data = [
    { s: "A", year: 2018, value: 1, note: "x" },
    { s: "A", year: 2019, value: 2 },
  ];
  const el = freshEl();
  const errors: unknown[] = [];
  const onError = (e: any) => errors.push(e?.reason ?? e?.error ?? e);
  process.on("unhandledRejection", onError);
  await chart(data, { w: 400, h: 200 })
    .flow(group({ by: "s" }))
    .mark(line({ x: "year", y: "value" }).tooltip(["year", "note"]))
    .render(el, {});
  await settle();
  const path = [...el.querySelectorAll("path")].find((p) => p.getAttribute("fill") === "none")!;
  const nums = (path.getAttribute("d") ?? "").match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const [x1, y1] = nums.slice(-2);
  moveOver(el, x1 - 2, y1);
  await settle();
  check("hovering the row without it throws nothing", errors.length === 0, String(errors[0]));
  const shown = boxTexts(el).slice(-2);
  check(
    "its box shows the year alone",
    JSON.stringify(shown) === JSON.stringify(["year", "2019"]),
    boxTexts(el)
  );
  moveOver(el, nums[0] + 2, nums[1]);
  await settle();
  check(
    "the row with it shows both",
    JSON.stringify(boxTexts(el).slice(-4)) === JSON.stringify(["year", "note", "2018", "x"]),
    boxTexts(el)
  );
  process.off("unhandledRejection", onError);
  // A name in no row is still an error, at render.
  let threw: unknown;
  try {
    await chart(data, { w: 400, h: 200 })
      .flow(group({ by: "s" }))
      .mark(line({ x: "year", y: "value" }).tooltip(["year", "nope"]))
      .render(freshEl(), {});
  } catch (e) {
    threw = e;
  }
  check(
    "a listed field in no row fails the render",
    String(threw).includes('"nope" is not a field'),
    String(threw)
  );
}

console.log('# label.angle: "auto" paints an earlier run than the last: the box opens');
{
  // A crowded y axis of long numbers: no angle fits it, and upright
  // overlaps least, so the choice paints the first run (0) after laying the
  // chart out at 45 and 90 too. The x row fits upright, so 0 is chosen for
  // every row and the first run is reused as it was laid out.
  const { scatter, circle } = GoFish as any;
  const data = Array.from({ length: 5 }, (_, i) => ({ x: i, y: i * 1e6 + 0.5 }));
  const el = freshEl();
  await chart(data, {
    w: 300,
    h: 30,
    axes: { x: { label: { angle: "auto" } }, y: { label: { angle: "auto" } } },
  })
    .flow(scatter({ by: "x", x: "x", y: "y" }))
    .mark(circle({ r: 4, fill: "#4c78a8" }).tooltip())
    .render(el, {});
  await settle();
  const c = el.querySelectorAll('ellipse[fill="#4c78a8"]')[2];
  moveOver(el, Number(c.getAttribute("cx")), Number(c.getAttribute("cy")));
  await settle();
  check(
    "hover opens the point's box",
    boxTexts(el).includes("2,000,000.5"),
    boxTexts(el).slice(-4)
  );
}

console.log("# .translate() and .tooltip() in either order, and through the IR");
{
  const { line, group, Serialize } = GoFish as any;
  // Two rows per bar: the box shows the summed count, which only the
  // mark's wire (its `h: "n"` channel) says.
  const counts = [
    { k: "a", n: 2 },
    { k: "a", n: 3 },
    { k: "b", n: 1 },
    { k: "b", n: 1 },
  ];
  const yearly = [2018, 2019, 2020].map((year, i) => ({ s: "A", year, v: [1, 3, 2][i] }));
  const ways = {
    "translate, then tooltip": (m: any, f?: string[]) => m.translate({ y: 5 }).tooltip(f),
    "tooltip, then translate": (m: any, f?: string[]) => m.tooltip(f).translate({ y: 5 }),
  };
  const renders = {
    JS: (c: any, el: Element) => c.render(el, {}),
    IR: async (c: any, el: Element) => Serialize.renderIR(await Serialize.toJSON(c), el, {}),
  };
  for (const [way, chain] of Object.entries(ways))
    for (const [via, draw] of Object.entries(renders)) {
      const bars = freshEl();
      await draw(
        chart(counts, { w: 300, h: 200 })
          .flow(spread({ by: "k", dir: "x" }))
          .mark(chain(rect({ h: "n", fill: "#4c78a8" }))),
        bars
      );
      await settle();
      const a = bars.querySelector('rect[fill="#4c78a8"]')!;
      moveOver(
        bars,
        Number(a.getAttribute("x")) + 2,
        Number(a.getAttribute("y")) + Number(a.getAttribute("height")) - 2
      );
      await settle();
      check(
        `${way} (${via}): a bar's box shows the count it draws`,
        JSON.stringify(boxTexts(bars).slice(-4)) === JSON.stringify(["k", "n", "a", "5"]),
        boxTexts(bars).slice(-4)
      );
      const el = freshEl();
      await draw(
        chart(yearly, { w: 300, h: 200 })
          .flow(group({ by: "s" }))
          .mark(chain(line({ x: "year", y: "v" }), ["year", "v"])),
        el
      );
      await settle();
      const path = [...el.querySelectorAll("path")].find((p) => p.getAttribute("fill") === "none")!;
      // Each segment ends at a row's point: 2019 ends the first curve.
      const [x, y] = (path.getAttribute("d") ?? "")
        .split("C")[1]
        .match(/-?\d+(?:\.\d+)?/g)!
        .map(Number)
        .slice(-2);
      moveOver(el, x + 2, y + 5);
      await settle();
      check(
        `${way} (${via}): a line's box shows the hovered row`,
        JSON.stringify(boxTexts(el).slice(-4)) === JSON.stringify(["year", "v", "2019", "3"]),
        boxTexts(el).slice(-4)
      );
    }
}

console.log("# a composite's title, in both painters");
{
  // A region composite (`intersect`) is one item: its title is its group's
  // first child, as a primitive's is the first child of its element.
  const { intersect, circle } = GoFish as any;
  const lens = () =>
    chart([{ k: "lens", n: 3 }], { w: 200, h: 200 })
      .flow(spread({ by: "k", dir: "x" }))
      .mark(
        intersect([
          circle({ r: 50, fill: "#4c78a8" }),
          circle({ r: 50, fill: "#4c78a8" }).translate({ x: 40 }),
        ]).tooltip(["k", "n"])
      );
  const at = (svg: string) => svg.match(/<g style="isolation:isolate".{0,120}/s)?.[0];
  const titled = (svg: string) =>
    /<g style="isolation:isolate"[^>]*><title>k: lens\nn: 3<\/title><defs>/.test(svg);
  const js = await lens().toSVG({});
  // Both a primitive's title and a composite's are SVG elements, which a
  // browser shows on hover; an HTML <title> inside an svg it does not.
  const rectSvg = await chart([{ k: "a", n: 1 }])
    .flow(spread({ by: "k", dir: "x" }))
    .mark(rect({ h: "n" }).tooltip())
    .toSVG({});
  check("a primitive's title is an SVG <title>", /<rect[^>]*><title>/.test(rectSvg), rectSvg.match(/<title[^>]*>/)?.[0]);
  check("the JS painter writes it first in the group", titled(js), at(js));
  const { displayListToSVG } = (await import("gofish-ir")).DisplayList;
  const ir = displayListToSVG(await lens().toDisplayList({}));
  check("the IR painter writes it first in the group", titled(ir), at(ir));
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
