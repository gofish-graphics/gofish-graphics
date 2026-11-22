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

console.log("# touch: a tap focuses and holds");
send("pointerdown", 100, 100, "touch");
send("pointerup", 100, 100, "touch");
send("pointerleave", 100, 100, "touch");
await settle();
check("the tapped bar's box", texts().includes("9,811"), texts());
send("pointermove", 1000, 1000, "mouse");
await settle();
check("a mouse move off the chart closes it", boxOf() === undefined);

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
    // The box's texts come first: its names column, then its values.
    JSON.stringify(shown.slice(0, 4)) ===
      JSON.stringify(["path", "n", "INF→INF", "9,811"]),
    shown
  );
}

report();
