/**
 * The build-in tower: the CHAINED form of a build-in (`.transition()` on
 * operators and marks) against the SELECTION form (`.layer(chart(selectAll(
 * ...)).flow(time.stagger(...)).mark(time.transition({ enter })))`) of the same
 * timing. The chained form is sugar for a selection over the operator's
 * children, so the two must draw the same display items at every playhead.
 * Run: `pnpm build && node --conditions browser --import tsx
 * src/tests/buildInTower.test.ts` (wired as `pnpm test:build-in-tower`).
 *
 * It also checks the build's fill rules on the display list (a mark shows its
 * enter state before its turn and its rest state after its end; labels wait
 * for their mark), and that the race written with a chained
 * `.transition({ update: animation.tween(...) })` draws what
 * `.layer(time.transition(...))` draws.
 *
 * The library is imported from `dist` after a headless DOM is set up, as the
 * gapminder tower test does: the clock is a live signal and lowering goes
 * through the solid-compiled backend.
 */
import "./interactionDomSetup";
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { categoryBrands, everyYearBrands } from "../data/categoryBrands";

const {
  animation,
  chart,
  derive,
  field,
  rect,
  selectAll,
  signal,
  spread,
  stack,
  time,
} = GoFish as any;

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Every drawn item, in paint order, without the node ids (which count up
 *  across charts) and the datum (provenance, not paint). */
function paint(doc: any): unknown[] {
  const out: unknown[] = [];
  const walk = (n: any): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n === null || typeof n !== "object") return;
    if (typeof n.kind === "string") {
      const { id: _id, datum: _datum, children, items, ...rest } = n;
      out.push(rest);
      if (children) walk(children);
      if (items) walk(items);
      return;
    }
    if (n.items) walk(n.items);
  };
  walk(doc.items ?? doc);
  return out;
}

function firstDifference(a: unknown[], b: unknown[]): string | undefined {
  if (a.length !== b.length) return `${a.length} items vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    const [x, y] = [JSON.stringify(a[i]), JSON.stringify(b[i])];
    if (x !== y) return `item ${i}: ${x} vs ${y}`;
  }
  return undefined;
}

const held = (builder: any, at: number, axes = true) =>
  builder.toDisplayList({ w: 480, h: 220, axes, playing: false, at });

async function agree(
  name: string,
  a: () => any,
  b: () => any,
  playheads: number[]
): Promise<void> {
  for (const at of playheads) {
    const diff = firstDifference(
      paint(await held(a(), at)),
      paint(await held(b(), at))
    );
    ok(`${name}, t = ${at} ms`, diff === undefined, diff);
  }
}

const alphabet = Object.entries({
  A: 0.08167,
  B: 0.01492,
  C: 0.02782,
  D: 0.04253,
  E: 0.12702,
  F: 0.02288,
  G: 0.02015,
  H: 0.06094,
  I: 0.06966,
  J: 0.00153,
  K: 0.00772,
  L: 0.04025,
}).map(([letter, frequency]) => ({ letter, frequency }));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const weather = MONTHS.flatMap((month, m) =>
  [
    ["Seattle", [5.8, 3.8, 4.2, 3.2, 2.0, 1.5]],
    ["New York", [3.6, 3.2, 4.3, 4.1, 4.0, 4.5]],
    ["Chicago", [2.1, 1.9, 2.5, 3.8, 4.9, 4.5]],
  ].map(([city, values]) => ({
    month,
    city,
    precipitation: (values as number[])[m],
  }))
);

const sales = ["Q1", "Q2", "Q3", "Q4"].flatMap((quarter, q) =>
  ["Alpha", "Beta", "Gamma"].map((product, p) => ({
    quarter,
    product,
    revenue: 5 + ((q * 7 + p * 3) % 11),
  }))
);

console.log("# 1: every bar together, chained vs selection");
await agree(
  "1",
  () =>
    chart(alphabet)
      .flow(spread({ by: "letter", dir: "x" }))
      .mark(
        rect({ h: "frequency" }).transition({
          enter: animation.grow({ duration: 600 }),
        })
      ),
  () =>
    chart(alphabet)
      .flow(spread({ by: "letter", dir: "x" }))
      .mark(rect({ h: "frequency" }).name("bars"))
      .layer(
        chart(selectAll("bars")).mark(
          time.transition({ enter: animation.grow({ duration: 600 }) })
        )
      ),
  [0, 200, 450, 600]
);

console.log("# 2: the staggered grow, chained vs selection");
await agree(
  "2",
  () =>
    chart(alphabet)
      .flow(
        spread({ by: "letter", dir: "x" }).transition({
          enter: time.stagger({ lag: 60 }),
        })
      )
      .mark(
        rect({ h: "frequency" }).transition({
          enter: animation.grow({ duration: 600 }),
        })
      ),
  () =>
    chart(alphabet)
      .flow(spread({ by: "letter", dir: "x" }))
      .mark(rect({ h: "frequency" }).name("bars"))
      .layer(
        chart(selectAll("bars"))
          .flow(time.stagger({ by: "letter", lag: 60 }))
          .mark(time.transition({ enter: animation.grow({ duration: 600 }) }))
      ),
  [0, 100, 400, 700, 1260]
);

console.log("# 3a: tallest first, chained vs selection");
await agree(
  "3a",
  () =>
    chart(alphabet)
      .flow(
        spread({ by: "letter", dir: "x" }).transition({
          enter: time.stagger({
            by: field("letter").sort("frequency", "desc"),
            lag: 60,
          }),
        })
      )
      .mark(
        rect({ h: "frequency" }).transition({
          enter: animation.grow({ duration: 600 }),
        })
      ),
  () =>
    chart(alphabet)
      .flow(spread({ by: "letter", dir: "x" }))
      .mark(rect({ h: "frequency" }).name("bars"))
      .layer(
        chart(selectAll("bars"))
          .flow(
            time.stagger({
              by: field("letter").sort("frequency", "desc"),
              lag: 60,
            })
          )
          .mark(time.transition({ enter: animation.grow({ duration: 600 }) }))
      ),
  [0, 150, 500, 900]
);

const grouped = (monthStagger: boolean, cityLag?: number) =>
  chart(weather).flow(
    monthStagger
      ? spread({ by: "month", dir: "x" }).transition({
          enter: time.stagger({ lag: 300 }),
        })
      : spread({ by: "month", dir: "x" }),
    cityLag !== undefined
      ? spread({ by: "city", dir: "x", spacing: 0 }).transition({
          enter: time.stagger({ lag: cityLag }),
        })
      : spread({ by: "city", dir: "x", spacing: 0 })
  );

console.log("# 4a: one month at a time, chained vs selection");
await agree(
  "4a",
  () =>
    grouped(true).mark(
      rect({ h: "precipitation", fill: "city" }).transition({
        enter: animation.grow({ duration: 400 }),
      })
    ),
  () =>
    grouped(false)
      .mark(rect({ h: "precipitation", fill: "city" }).name("bars"))
      .layer(
        chart(selectAll("bars"))
          .flow(time.stagger({ by: "month", lag: 300 }))
          .mark(time.transition({ enter: animation.grow({ duration: 400 }) }))
      ),
  [0, 250, 700, 1300, 1900]
);

console.log("# 4b: nested staggers, chained vs selection");
await agree(
  "4b",
  () =>
    grouped(true, 50).mark(
      rect({ h: "precipitation", fill: "city" }).transition({
        enter: animation.grow({ duration: 400 }),
      })
    ),
  () =>
    grouped(false)
      .mark(rect({ h: "precipitation", fill: "city" }).name("bars"))
      .layer(
        chart(selectAll("bars"))
          .flow(
            time.stagger({ by: "month", lag: 300 }),
            time.stagger({ by: "city", lag: 50 })
          )
          .mark(time.transition({ enter: animation.grow({ duration: 400 }) }))
      ),
  [0, 75, 330, 520, 1000, 2000]
);

console.log("# Canis 1b, chained vs its selection form over the same nesting");
const stacked = (arranged: boolean) =>
  chart(sales).flow(
    arranged
      ? spread({ by: "quarter", dir: "x" }).transition({
          enter: time.stagger({ lag: 100 }),
        })
      : spread({ by: "quarter", dir: "x" }),
    arranged
      ? stack({ by: "product", dir: "y" }).transition({
          enter: time.stagger({ spacing: 0 }),
        })
      : stack({ by: "product", dir: "y" })
  );
await agree(
  "Canis 1b",
  () =>
    stacked(true).mark(
      rect({ h: "revenue", fill: "product" }).transition({
        enter: animation.wipe({ from: "bottom" }),
      })
    ),
  () =>
    stacked(false)
      .mark(rect({ h: "revenue", fill: "product" }).name("bars"))
      .layer(
        chart(selectAll("bars"))
          .flow(
            time.stagger({ by: "quarter", lag: 100 }),
            time.stagger({ by: "product", spacing: 0 })
          )
          .mark(time.transition({ enter: animation.wipe({ from: "bottom" }) }))
      ),
  [0, 300, 650, 1100, 1800]
);

console.log("# fill: the enter state before a turn, the rest state after");
{
  const bars = () =>
    chart(alphabet)
      .flow(
        spread({ by: "letter", dir: "x" }).transition({
          enter: time.stagger({ lag: 60 }),
        })
      )
      .mark(
        rect({ h: "frequency" }).transition({
          enter: animation.grow({ duration: 600 }),
        })
      );
  // The bars: the rects that carry data (axis ticks are overlay rects).
  const rects = (doc: any) =>
    (paint(doc) as any[]).filter(
      (i) => i.kind === "rect" && i.role !== "overlay"
    );
  const start = rects(await held(bars(), 0));
  ok(
    "at t = 0 every bar is at its enter state (zero height, never full size)",
    start.length === alphabet.length && start.every((r) => r.h === 0)
  );
  const mid = rects(await held(bars(), 300));
  ok(
    "at t = 300 the first bars are growing and the last have not started",
    mid[0].h > 0 && mid[alphabet.length - 1].h === 0
  );
  const rest = rects(
    await chart(alphabet)
      .flow(spread({ by: "letter", dir: "x" }))
      .mark(rect({ h: "frequency" }))
      .toDisplayList({ w: 480, h: 220, axes: true })
  );
  const end = rects(await held(bars(), 5000));
  ok(
    "after the end every bar holds the static chart's geometry exactly",
    firstDifference(end, rest) === undefined,
    firstDifference(end, rest)
  );
  const unplayed = rects(
    await bars().toDisplayList({ w: 480, h: 220, axes: true, playing: false })
  );
  ok(
    "`playing: false` alone holds the build at its start",
    unplayed.every((r) => r.h === 0)
  );
}

console.log("# labels wait for their mark");
{
  const labeled = (at: number) =>
    held(
      chart(alphabet.slice(0, 3))
        .flow(
          spread({ by: "letter", dir: "x" }).transition({
            enter: time.stagger({ spacing: 0 }),
          })
        )
        .mark(
          rect({ h: "frequency" })
            .label("letter")
            .transition({ enter: animation.grow({ duration: 400 }) })
        ),
      at,
      false
    );
  const labelOpacities = async (at: number) =>
    (paint(await labeled(at)) as any[])
      .filter((i) => i.kind === "text" && ["A", "B", "C"].includes(i.text))
      .map((i) => i.style?.opacity ?? 1);
  const mid = await labelOpacities(600);
  ok(
    "at t = 600: A's label shows (A arrived at 400), B's and C's wait",
    JSON.stringify(mid) === JSON.stringify([1, 0, 0]),
    JSON.stringify(mid)
  );
  const end = await labelOpacities(1200);
  ok(
    "at the end every label shows",
    JSON.stringify(end) === JSON.stringify([1, 1, 1]),
    JSON.stringify(end)
  );
}

console.log("# a field-valued duration (CAST+ Gantt)");
{
  // Wipes last days / 12 × 1000 ms (the longest task, 12 days, takes
  // 1000 ms), one after another: Research ends at 417, Design at 1000.
  const tasks = [
    { task: "Research", start: 0, days: 5 },
    { task: "Design", start: 4, days: 7 },
    { task: "Build", start: 13, days: 12 },
  ];
  const widths = async (at: number) =>
    (paint(
      await held(
        chart(tasks)
          .flow(
            spread({ by: field("task").sort("start"), dir: "y" }).transition({
              enter: time.stagger({ spacing: 0 }),
            })
          )
          .mark(
            rect({ x: "start", w: "days" }).transition({
              enter: animation.wipe({ from: "left", duration: "days" }),
            })
          ),
        at,
        false
      )
    ) as any[])
      .filter((i) => i.kind === "rect")
      .map((i) => i.w);
  const [rest, at1000] = [await widths(5000), await widths(1000)];
  ok(
    "at 1000 ms Research and Design are in, and Build has not started",
    at1000[0] === rest[0] && at1000[1] === rest[1] && at1000[2] === 0,
    JSON.stringify(at1000)
  );
  const mid = await widths(1500);
  ok(
    "at 1500 ms Build is halfway through its 1000 ms wipe",
    mid[2] > 0 && mid[2] < rest[2],
    JSON.stringify(mid)
  );
}

console.log("# the race: chained .transition() vs .layer(time.transition())");
{
  const brands = everyYearBrands(categoryBrands);
  const ranking = () =>
    spread({
      by: field("name").sort("value", "desc"),
      dir: "y",
      sharedScale: true,
      spacing: 2,
    });
  const flow = (at: number, spreadByValue = ranking()) =>
    chart(brands, { legend: false }).flow(
      time.sequence({ by: "year", duration: 20000, playing: false, at }),
      spreadByValue
    );
  const bar = () =>
    rect({ w: "value", fill: "category" }).label("name", {
      position: "outset-right",
    });
  const view = { w: 600, h: 600, axes: { x: true, y: false } };
  /** The race as the Bar Chart Race story writes it. */
  const plain = (at: number) =>
    flow(at)
      .mark(bar())
      .layer(time.transition({ curve: "linear" }))
      .toDisplayList(view);
  for (const at of [2000, 2007.5, 2019]) {
    const chained = await flow(at)
      .mark(
        bar().transition({
          enter: animation.fadeIn(),
          update: animation.tween({ curve: "linear" }),
          exit: animation.fadeOut(),
        })
      )
      .toDisplayList(view);
    const diff = firstDifference(paint(await plain(at)), paint(chained));
    ok(`the race at ${at}`, diff === undefined, diff);
  }

  console.log("# the race with a staggered re-sort (6a, FIT)");
  const staggered = (at: number) =>
    flow(at, ranking().transition({ update: time.stagger({ lag: 20 }) }))
      .mark(
        bar().transition({ update: animation.tween({ curve: "linear" }) })
      )
      .toDisplayList(view);
  for (const at of [2007, 2008]) {
    const diff = firstDifference(
      paint(await plain(at)),
      paint(await staggered(at))
    );
    ok(`every keyframe draws exactly (${at})`, diff === undefined, diff);
  }
  /** Each brand's bar box at a playhead, by name. */
  const bars = async (doc: Promise<any>) => {
    const out = new Map<string, number[]>();
    for (const item of (await doc).items as any[]) {
      if (item.kind === "rect" && item.role !== "overlay" && item.datum)
        out.set(String(item.datum.name), [item.x, item.y, item.w, item.h]);
    }
    return out;
  };
  // 37 bars, a 20 ms lag, and 20000 / 19 ms per year: fitted, a year's
  // stagger lasts 36·20 + 1052.6 ms, so each move takes 1052.6 / 1772.6 of
  // the year and wave w starts at 20·w / 1772.6 of it.
  const move = 20000 / 19;
  const total = 36 * 20 + move;
  const localAt = (w: number, u: number) =>
    Math.min(1, Math.max(0, (u - (20 * w) / total) / (move / total)));
  const ranked2008 = brands
    .filter((d: any) => d.year === 2008)
    .sort((a: any, b: any) => b.value - a.value)
    .map((d: any) => d.name);
  const [first, last] = [ranked2008[0], ranked2008.at(-1)];
  const at = await bars(staggered(2007.25));
  const firstTarget = await bars(plain(2007 + localAt(0, 0.25)));
  const lastTarget = await bars(plain(2007 + localAt(36, 0.25)));
  ok(
    `a quarter into 2007-2008, ${first} (first in 2008) is ${(
      localAt(0, 0.25) * 100
    ).toFixed(0)}% through its move`,
    JSON.stringify(at.get(first)) === JSON.stringify(firstTarget.get(first)),
    `${at.get(first)} vs ${firstTarget.get(first)}`
  );
  ok(
    `and ${last} (last in 2008) has not started`,
    JSON.stringify(at.get(last)) === JSON.stringify(lastTarget.get(last)) &&
      localAt(36, 0.25) === 0,
    `${at.get(last)} vs ${lastTarget.get(last)}`
  );
}

console.log("# a re-render lands on the build's final frame (#914)");
{
  // A signal read in derive() makes the chart re-render when it is set. The
  // build plays on the first render only, so the re-render, held at t = 0
  // like the first, draws every bar at rest.
  const container = document.createElement("div");
  document.body.appendChild(container);
  const s = signal(1);
  await chart(alphabet.slice(0, 4))
    .flow(
      derive((rows: any) => (s(), rows)),
      spread({ by: "letter", dir: "x" })
    )
    .mark(
      rect({ h: "frequency" }).transition({
        enter: animation.grow({ duration: 600 }),
      })
    )
    .render(container, { w: 200, h: 120, axes: false, playing: false });
  const heights = () =>
    [...container.querySelectorAll("rect")].map((r) =>
      Number(r.getAttribute("height"))
    );
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  };
  await settle();
  const first = heights();
  ok(
    "the first render is held at the build's start",
    first.length === 4 && first.every((h) => h === 0),
    JSON.stringify(first)
  );
  s.set(2);
  await settle();
  const again = heights();
  ok(
    "the re-render draws every bar at rest",
    again.length === 4 && again.every((h) => h > 0),
    JSON.stringify(again)
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
