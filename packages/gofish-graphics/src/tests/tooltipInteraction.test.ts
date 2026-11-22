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
  check("now on the third bar", texts().includes("5,310"), texts());
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
check("the tapped bar's box", texts().includes("9,811"), texts());
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

console.log("# a line: the box follows the pointer along it, with no re-run");
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
  await chart(budget, { w: 400, h: 260 })
    .flow(
      derive((r: any) => {
        runs++;
        return r;
      }),
      group({ by: "series" })
    )
    .mark(line({ x: "year", y: "value", stroke: "series" }).tooltip())
    .render(el, {});
  await settle();
  const at = (path: Element, t: number) => {
    // Points on the line: the end of each command of its `d` (a curve's
    // control points are off it).
    const pts = (path.getAttribute("d") ?? "")
      .split(/[A-Za-z]/)
      .map((c) => c.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [])
      .filter((n) => n.length >= 2)
      .map((n) => [n[n.length - 2], n[n.length - 1]] as [number, number]);
    return pts[Math.round(t * (pts.length - 1))];
  };
  const paths = () =>
    [...el.querySelectorAll("path")].filter((p) => p.getAttribute("stroke-width") !== null || p.getAttribute("fill") === "none");
  const lineOf = (series: string) =>
    paths().find((p) => p.getAttribute("stroke") === (series === "Revenue" ? "#4190c5" : "#f2cf57"))!;
  const boxRect = () =>
    [...el.querySelectorAll("rect")].find((r) => r.getAttribute("stroke") === "#c9ced6");
  /** The box's drawn top-left: its rect under its group's translate. */
  const boxAt = () => {
    const r = boxRect();
    if (!r) return undefined;
    const g = r.closest("g[transform]");
    const m = /translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(g?.getAttribute("transform") ?? "");
    const [dx, dy] = m ? [Number(m[1]), Number(m[2])] : [0, 0];
    return [Number(r.getAttribute("x")) + dx, Number(r.getAttribute("y")) + dy];
  };
  const shown = () => [...el.querySelectorAll("text")].map((t) => t.textContent);
  const move = (x: number, y: number) =>
    el.querySelector("svg")!.dispatchEvent(
      new (globalThis as any).PointerEvent("pointermove", {
        clientX: x,
        clientY: y,
        bubbles: true,
        pointerType: "mouse",
      })
    );
  const revenue = lineOf("Revenue");
  const [x0, y0] = at(revenue, 0);
  move(x0 + 20, y0 + 20);
  await settle();
  check("on Revenue: its box", shown().includes("Revenue") && boxRect() !== undefined, shown());
  const opened = runs;
  const svgBefore = el.querySelector("svg");
  const seen: number[][] = [];
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const [x, y] = at(revenue, t);
    move(x, y + 1);
    await settle(2);
    const b = boxAt()!;
    seen.push(b);
    check(
      `t=${t}: the box is beside the pointer`,
      // Right of it by the gap, or, at the right edge, left of it.
      b !== undefined && (Math.abs(b[0] - (x + 8)) < 2.5 || b[0] + 60 < x),
      [b, x, y]
    );
  }
  await settle();
  check("moving along the line: no re-run", runs === opened, runs - opened);
  check("the same svg (paint patches only)", el.querySelector("svg") === svgBefore);
  check(
    "the box moved with the pointer",
    new Set(seen.map((b) => b.join())).size === seen.length,
    seen
  );
  const cost = lineOf("Cost");
  const [cx, cy] = at(cost, 0.5);
  move(cx, cy - 1);
  await settle();
  check("on Cost: its box", shown().includes("Cost"), shown());
  check("one re-run for the change of line", runs === opened + 1, runs - opened);
  const costBox = boxAt()!;
  const [rx, ry] = at(revenue, 0.5);
  move(rx, ry + 1);
  await settle();
  const revBox = boxAt()!;
  check("at the same x, the Cost box is below the Revenue box", costBox[1] > revBox[1], [costBox, revBox]);
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
      JSON.stringify(["path", "n", "INF→INF", "9,811"]),
    shown
  );
}

report();
