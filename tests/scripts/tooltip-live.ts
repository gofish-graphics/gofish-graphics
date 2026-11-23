/**
 * Drive the `Interaction/Tooltip` stories with a real mouse in Chromium
 * (#1395). For each story: hover marks, a gap and a point off the chart,
 * and check the box's content, that nothing else moved, that the box does
 * not flicker while the pointer is over it, how near a mark the pointer
 * must be for a box (a donut's hole, a gap between bars far apart), and
 * that the page logged no error. Screenshots go to tests/tmp/tooltip-live/.
 *
 * Usage: `pnpm --filter @gofish/tests tooltip-live` (needs
 * `pnpm --filter gofish-graphics build` once, like capture-one).
 */
import { mkdirSync, realpathSync } from "fs";
import { join, resolve } from "path";
import type { Page } from "playwright";
import { HARNESS_DIR, withHarness, type StoryInfo } from "./capture-core.js";

const PORT = Number(process.env.TOOLTIP_LIVE_PORT) || 3005;
const OUT = join(import.meta.dirname, "../tmp/tooltip-live");
const BOX_STROKE = "#c9ced6";
const REPO_ROOT = realpathSync(resolve(HARNESS_DIR, "../.."));

const failures: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) {
    failures.push(label);
    if (detail !== undefined) console.log("       ", JSON.stringify(detail));
  }
};

type Snap = {
  /** Every drawn element that is not part of the box, by tag and box. */
  marks: string[];
  /** The box's texts, in document order. */
  box: string[] | null;
  boxClient: [number, number, number, number] | null;
  /** The marks with a tooltip, in client px. */
  targets: { x: number; y: number; w: number; h: number }[];
  svg: [number, number, number, number];
};

/** Read the chart. It runs in the page, so it is a string: tsx would wrap a
 *  function's inner arrows in a `__name` helper the page does not have. */
const SNAP = (marks: string) => `(() => {
  const svg = document.querySelector("#stories-root svg");
  const inBox = (e) => e.closest('[pointer-events="none"]') !== null;
  const els = [...svg.querySelectorAll("rect,ellipse,path,text,line")];
  const r = (e) => {
    const b = e.getBBox();
    return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10);
  };
  const box = svg.querySelector('[stroke="${BOX_STROKE}"]');
  const c = box && box.getBoundingClientRect();
  const s = svg.getBoundingClientRect();
  return {
    marks: els
      .filter((e) => !inBox(e))
      .map((e) => e.tagName + "|" + r(e).join(",") + "|" + (e.textContent || "")),
    box: box
      ? els.filter(inBox).filter((e) => e.tagName === "text").map((e) => e.textContent)
      : null,
    boxClient: c ? [c.x, c.y, c.width, c.height] : null,
    // A path's target is its midpoint, a point on the line.
    targets: [...svg.querySelectorAll(${JSON.stringify(marks)})]
      .filter((e) => !inBox(e))
      .map((e) => {
        if (e.tagName === "path") {
          const p = e.getPointAtLength(e.getTotalLength() / 2);
          const q = new DOMPoint(p.x, p.y).matrixTransform(e.getScreenCTM());
          return { x: q.x, y: q.y, w: 0, h: 0 };
        }
        const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      }),
    svg: [s.x, s.y, s.width, s.height],
  };
})()`;
/** The marks of the story being driven, as a selector. */
let marksSelector = "";
const snap = (page: Page): Promise<Snap> => page.evaluate(SNAP(marksSelector));

async function hover(page: Page, x: number, y: number): Promise<Snap> {
  await page.mouse.move(x, y, { steps: 4 });
  await page.waitForTimeout(250);
  return snap(page);
}

/** The pointer at rest at (x, y) for 1 s, after passing through `via`
 *  (one move each): the box when it got there, whether the box changed
 *  while it rested, and whether the chart re-ran (a re-run paints new mark
 *  elements, so a tag on one is gone). */
async function rest(
  page: Page,
  x: number,
  y: number,
  via: [number, number][] = []
): Promise<{ box: string[] | null; changed: boolean; reran: boolean }> {
  for (const [vx, vy] of via) {
    await page.mouse.move(vx, vy);
    await page.waitForTimeout(60);
  }
  await page.mouse.move(x, y);
  await page.waitForTimeout(250);
  const first = await snap(page);
  const key = (s: Snap) => JSON.stringify([s.box, s.boxClient]);
  await page.evaluate(`(() => {
    const e = [...document.querySelectorAll('#stories-root svg ${marksSelector}')]
      .find((m) => m.closest('[pointer-events="none"]') === null);
    if (e) e.__rest = true;
  })()`);
  let changed = false;
  for (let k = 0; k < 10; k++) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(100);
    if (key(await snap(page)) !== key(first)) changed = true;
  }
  const tagged =
    (await page.evaluate(`[...document.querySelectorAll('#stories-root svg ${marksSelector}')]
    .some((m) => m.__rest === true)`)) as boolean;
  return { box: first.box, changed, reran: !tagged };
}

async function render(
  page: Page,
  story: StoryInfo,
  marks: string
): Promise<Snap> {
  marksSelector = marks;
  await page.mouse.move(1, 1);
  await page.evaluate(
    `window.__renderStory__(${JSON.stringify({ moduleKey: story.moduleKey, name: story.name })})`
  );
  await page.waitForFunction("window.__STORY_RENDER_DONE__ === true");
  await page.waitForTimeout(200);
  return snap(page);
}

/** The distance from (x, y) to a mark's client box, 0 inside it. */
const gapOf = (b: Snap["targets"][number], x: number, y: number) =>
  Math.hypot(
    Math.max(b.x - x, 0, x - (b.x + b.w)),
    Math.max(b.y - y, 0, y - (b.y + b.h))
  );

const same = (a: string[], b: string[]) =>
  JSON.stringify(a) === JSON.stringify(b);

async function main() {
  mkdirSync(OUT, { recursive: true });
  await withHarness(HARNESS_DIR, PORT, async (open) => {
    const { page, warnings } = await open(({ text }) => console.log(text));
    const stories = (
      (await page.evaluate("window.__listStories__()")) as StoryInfo[]
    ).filter((s) => s.title === "Interaction/Tooltip");
    const story = (name: string) => stories.find((s) => s.name === name)!;
    const shot = (name: string) =>
      page
        .locator("#stories-root")
        .screenshot({ path: join(OUT, `${name}.png`) });

    console.log("# Bar Chart");
    {
      const closed = await render(
        page,
        story("BarChart"),
        'rect[fill="#4c78a8"]'
      );
      check("closed: no box", closed.box === null);
      const bars = [...closed.targets].sort((a, b) => a.y - b.y).slice(0, 3);
      const expect = ["VO→VO", "INF→INF", "other→other"];
      for (const [i, b] of bars.entries()) {
        const at = await hover(page, b.x + 10, b.y + b.h / 2);
        check(
          `bar ${i + 1}: its row in the box`,
          at.box !== null && at.box.includes(expect[i]),
          at.box
        );
        check(`bar ${i + 1}: nothing else moved`, same(at.marks, closed.marks));
        if (i === 0) await shot("bar-chart-first");
      }
      // A short bar, pointer right of its end, in its row.
      const short = [...closed.targets].sort((a, b) => b.y - a.y)[0];
      const right = await hover(
        page,
        short.x + short.w + 4,
        short.y + short.h / 2
      );
      check(
        "right of the shortest bar: its row",
        right.box?.includes("VO→INF→VO") === true,
        right.box
      );
      await shot("bar-chart-short");
      // Level with the shortest bar, a px at a time to the right of its end
      // and back: reach first, then position. The shortest bar's box while
      // it is within reach (20 px with the focus's head start), then the
      // box of a bar still within reach (the one above, nearest by row of
      // those left), then closed, and never closed while a bar is within
      // 16 px. Coming back, the box opens at 16 px from a bar.
      {
        const y = short.y + short.h / 2;
        const end = short.x + short.w;
        const near = (x: number) =>
          Math.min(...closed.targets.map((b) => gapOf(b, x, y)));
        const sweep = async (ds: number[]) => {
          const runs: { from: number; to: number; box: string | null }[] = [];
          let broken: number[] = [];
          for (const d of ds) {
            await page.mouse.move(end + d, y);
            await page.waitForTimeout(40);
            const s = await snap(page);
            const box =
              s.box === null
                ? null
                : (s.box.find((t) => t.includes("→")) ?? s.box.join(" "));
            const last = runs[runs.length - 1];
            if (last && last.box === box) last.to = d;
            else runs.push({ from: d, to: d, box });
            if (box === null && near(end + d) <= 16) broken.push(d);
          }
          return { runs, broken };
        };
        const show = (rs: { from: number; to: number; box: string | null }[]) =>
          rs.map((r) => `${r.box ?? "none"} ${r.from}..${r.to}`).join(", ");
        await hover(page, end - 2, y);
        const out = await sweep(Array.from({ length: 81 }, (_, d) => d));
        const back = await sweep(Array.from({ length: 81 }, (_, d) => 80 - d));
        const above = [...closed.targets]
          .filter((b) => b.y < short.y)
          .sort((a, b) => b.y - a.y)[0];
        console.log(
          `    level with the shortest bar (${Math.round(short.w)} px long; the bar above ends ${Math.round(above.x + above.w - end)} px past it, ${Math.round(short.y - above.y - above.h)} px above): out ${show(out.runs)}; back ${show(back.runs)}`
        );
        const own = out.runs[0];
        check(
          `level with the shortest bar: its box out to ${own.to} px past its end`,
          own.box === "VO→INF→VO" && own.to >= 19 && own.to <= 21,
          show(out.runs)
        );
        check(
          "level with the shortest bar: never closed while a bar is within 16 px, out or back",
          out.broken.length === 0 && back.broken.length === 0,
          [out.broken, back.broken]
        );
        const lastBack = back.runs[back.runs.length - 1];
        check(
          `level with the shortest bar, coming back: its box from ${lastBack.from} px`,
          lastBack.box === "VO→INF→VO" &&
            lastBack.from >= 15 &&
            lastBack.from <= 16,
          show(back.runs)
        );
        // At rest for 1 s at the reach's two edges, from inside and from
        // outside: the box the approach left, and no change, no re-run.
        for (const [d, from, want] of [
          [16, "inside", "VO→INF→VO"],
          [16, "outside", "VO→INF→VO"],
          [20, "inside", "VO→INF→VO"],
          [20, "outside", near(end + 20) <= 16 ? "other" : null],
          [24, "inside", near(end + 24) <= 16 ? "other" : null],
        ] as const) {
          await hover(page, 2, 2);
          const via: [number, number][] =
            from === "inside"
              ? [
                  [end - 4, y],
                  ...Array.from({ length: d }, (_, k): [number, number] => [
                    end + k,
                    y,
                  ]),
                ]
              : [
                  [end + 80, y],
                  ...Array.from(
                    { length: 80 - d },
                    (_, k): [number, number] => [end + 80 - k, y]
                  ),
                ];
          const r = await rest(page, end + d, y, via);
          const got =
            r.box === null
              ? null
              : r.box.includes("VO→INF→VO")
                ? "VO→INF→VO"
                : "other";
          check(
            `at rest ${d} px past the shortest bar, from ${from}: ${got ?? "closed"}, no change, no re-run`,
            got === want && !r.changed && !r.reran,
            r
          );
        }
      }
      // Down across all fifteen bars, near their start: a box on every
      // frame, each bar's in turn (the 4 px gaps are within reach).
      {
        const all = [...closed.targets].sort((a, b) => a.y - b.y);
        const last = all[all.length - 1];
        const x = all[0].x + 5;
        const closedAt: number[] = [];
        let shown = 0;
        let prev = "";
        for (let y = all[0].y + 1; y < last.y + last.h - 1; y += 2) {
          await page.mouse.move(x, y);
          await page.waitForTimeout(40);
          const s = await snap(page);
          if (s.box === null) closedAt.push(Math.round(y));
          const k = JSON.stringify(s.box);
          if (s.box !== null && k !== prev) shown++;
          prev = k;
        }
        check(
          `down across all ${all.length} bars: ${shown} boxes in turn, never closed`,
          all.length === 15 && shown === 15 && closedAt.length === 0,
          [shown, closedAt]
        );
      }
      // The 4 px gap between bars 1 and 2, half a px at a time, down from
      // bar 1 and back up from bar 2: both bars are within reach, so the
      // nearer by row wins, and the head start (4 px, the gap's width)
      // keeps the bar the pointer came from across the gap.
      {
        const x = bars[0].x + 10;
        const top = bars[0].y + bars[0].h;
        const ys = Array.from(
          { length: 2 * Math.round(bars[1].y - top + 4) + 1 },
          (_, k) => top - 2 + k / 2
        );
        const walk = async (order: number[]) => {
          const runs: string[] = [];
          for (const y of order) {
            await page.mouse.move(x, y);
            await page.waitForTimeout(40);
            const s = await snap(page);
            const n =
              expect.find((e) => s.box?.includes(e)) ??
              (s.box === null ? "none" : "other");
            const inGap = y > top + 0.5 && y < bars[1].y - 0.5;
            const tag = `${n}${inGap ? " (gap)" : ""}`;
            if (runs[runs.length - 1]?.split("@")[0] !== tag)
              runs.push(`${tag}@${(y - top).toFixed(1)}`);
          }
          return runs;
        };
        // The bars shown in turn, gap or not.
        const names = (runs: string[]) =>
          runs
            .map((r) => r.split(/ \(gap\)|@/)[0])
            .filter((n, i, a) => i === 0 || a[i - 1] !== n)
            .join("|");
        await hover(page, x, bars[0].y + bars[0].h / 2);
        const down = await walk(ys);
        const up = await walk([...ys].reverse());
        console.log(
          `    the 4 px gap (y from bar 1's bottom): down ${down.join(" ")}; up ${up.join(" ")}`
        );
        check(
          "the 4 px gap, down: bar 1's box across the gap, bar 2's from its edge",
          names(down) === `${expect[0]}|${expect[1]}` &&
            down.some((r) => r.startsWith(`${expect[0]} (gap)`)) &&
            !down.some((r) => r.startsWith(`${expect[1]} (gap)`)),
          down
        );
        check(
          "the 4 px gap, up: bar 2's box across the gap, bar 1's from its edge",
          names(up) === `${expect[1]}|${expect[0]}` &&
            up.some((r) => r.startsWith(`${expect[1]} (gap)`)) &&
            !up.some((r) => r.startsWith(`${expect[0]} (gap)`)),
          up
        );
      }
      // The box is no pointer target: moving down through the first bar's
      // box, over the bars under it, reaches them in turn, with a box open
      // on every sample.
      const open1 = await hover(
        page,
        bars[0].x + bars[0].w - 10,
        bars[0].y + bars[0].h / 2
      );
      const [bx, , bw] = open1.boxClient!;
      // A column of the box over the second bar, if the box reaches it.
      const colX = Math.min(bx + bw - 4, bars[1].x + bars[1].w - 3);
      if (colX > bx + 2) {
        // Reach first, then position: near bar 2's end, down into bar 3's
        // row past bar 3's end, bar 3 is the nearest by row but far; bar 2,
        // within reach above, is shown.
        // Never closed while a bar is within 16 px.
        const runs: { from: number; to: number; box: string | null }[] = [];
        const broken: number[] = [];
        const y0 = Math.round(bars[0].y + bars[0].h / 2);
        const y1 = Math.round(bars[2].y + bars[2].h + 24);
        for (let y = y0; y <= y1; y++) {
          await page.mouse.move(colX, y);
          await page.waitForTimeout(40);
          const s = await snap(page);
          const box =
            expect.find((e) => s.box?.includes(e)) ??
            (s.box === null ? null : "other");
          const last = runs[runs.length - 1];
          if (last && last.box === box) last.to = y;
          else runs.push({ from: y, to: y, box });
          const nearest = Math.min(
            ...closed.targets.map((b) => gapOf(b, colX, y))
          );
          if (s.box === null && nearest <= 16) broken.push(y);
        }
        const show = runs
          .map((r) => `${r.box ?? "none"} y ${r.from}..${r.to}`)
          .join(", ");
        console.log(
          `    down at x ${Math.round(colX)} (bar 2 ends at ${Math.round(bars[1].x + bars[1].w)}, bar 3 at ${Math.round(bars[2].x + bars[2].w)}; bar 3's row y ${Math.round(bars[2].y)}..${Math.round(bars[2].y + bars[2].h)}): ${show}`
        );
        const seen = runs.flatMap((r) =>
          r.box && r.box !== "other" ? [r.box] : []
        );
        check(
          `down at x ${Math.round(colX)}: bars in order (${seen.join(", ")})`,
          seen.length >= 2 && seen.every((n, i) => expect.indexOf(n) === i),
          show
        );
        const inRow3 = runs.filter(
          (r) => r.to >= bars[2].y + 2 && r.from <= bars[2].y + 10
        );
        check(
          "in bar 3's row, past bar 3's end, bar 2 within reach: bar 2's box",
          inRow3.length > 0 && inRow3.every((r) => r.box === expect[1]),
          inRow3
        );
        check(
          `down at x ${Math.round(colX)}: never closed while a bar is within 16 px`,
          broken.length === 0,
          broken
        );
      } else
        console.log("  (the first bar's box does not reach the second bar)");
      // At rest for 1 s: on a mark, in a 4 px gap, over the open box where
      // a mark is under it, and over the open box where no mark is within
      // reach (there the box closes, and stays closed).
      {
        const onMark = await rest(
          page,
          bars[0].x + 10,
          bars[0].y + bars[0].h / 2
        );
        check(
          "at rest on a bar: its box, no change, no re-run",
          onMark.box?.includes(expect[0]) === true &&
            !onMark.changed &&
            !onMark.reran,
          onMark
        );
        const inGap = await rest(
          page,
          bars[0].x + 10,
          (bars[0].y + bars[0].h + bars[1].y) / 2
        );
        check(
          "at rest in a 4 px gap: a box, no change, no re-run",
          inGap.box !== null && !inGap.changed && !inGap.reran,
          inGap
        );
        // Bar 1's box hangs over bar 2's row near its end.
        await hover(
          page,
          bars[0].x + bars[0].w - 10,
          bars[0].y + bars[0].h / 2
        );
        const under = await rest(
          page,
          Math.min(bx + bw - 4, bars[1].x + bars[1].w - 3),
          bars[1].y + bars[1].h / 2
        );
        check(
          "at rest over bar 1's box, bar 2 under it: bar 2's box, no change, no re-run",
          under.box?.includes(expect[1]) === true &&
            !under.changed &&
            !under.reran,
          under
        );
        // The shortest bar's box sits right of it; its right part is far
        // from every bar.
        const sy = short.y + short.h / 2;
        const sOpen = await hover(page, short.x + short.w - 2, sy);
        const [ox, oy, ow, oh] = sOpen.boxClient!;
        const fx = ox + ow - 6;
        const farFromBars = closed.targets.every(
          (b) =>
            Math.hypot(
              Math.max(b.x - fx, 0, fx - (b.x + b.w)),
              Math.max(b.y - sy, 0, sy - (b.y + b.h))
            ) > 20
        );
        const overBox = await rest(
          page,
          fx,
          Math.min(oy + oh - 4, Math.max(oy + 4, sy))
        );
        check(
          `at rest over the shortest bar's box, ${Math.round(fx - short.x - short.w)} px past the bar, no bar within reach: closed, no change`,
          farFromBars && overBox.box === null && !overBox.changed,
          [overBox, farFromBars]
        );
      }
      // A real touch tap on bar 2 (Chromium's touch emulation): the tap
      // ends with a pointerleave, and the box stays open for 1 s; a mouse
      // move then goes back to hover.
      {
        await hover(page, 2, 2);
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setTouchEmulationEnabled", {
          enabled: true,
          maxTouchPoints: 1,
        });
        const [tx, ty] = [bars[1].x + 10, bars[1].y + bars[1].h / 2];
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: tx, y: ty }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await page.waitForTimeout(250);
        const tapped = await snap(page);
        let held = tapped.box?.includes(expect[1]) === true;
        for (let k = 0; k < 5; k++) {
          await page.waitForTimeout(200);
          const s = await snap(page);
          if (JSON.stringify(s.box) !== JSON.stringify(tapped.box))
            held = false;
        }
        await cdp.send("Emulation.setTouchEmulationEnabled", {
          enabled: false,
        });
        await cdp.detach();
        check("a tap on bar 2: its box, held for 1 s", held, tapped.box);
        // A mouse move over the chart goes back to hover.
        await hover(page, bars[0].x + 10, bars[0].y + bars[0].h / 2);
      }
      const out = await hover(page, 5, closed.svg[1] + closed.svg[3] + 60);
      check("off the chart: closed", out.box === null, [out.box, closed.svg]);
      check("closed again: as before", same(out.marks, closed.marks));
    }

    for (const [name, want, marks] of [
      ["StackedBars", "species", "rect[data-gf-id][fill]:not([fill=none])"],
      ["Scatter", "lake", "ellipse"],
    ] as const) {
      console.log(`# ${name}`);
      const closed = await render(page, story(name), marks);
      const t = closed.targets[0];
      const at = await hover(page, t.x + Math.min(t.w / 2, 10), t.y + t.h / 2);
      check(
        `hover: a box with "${want}"`,
        at.box?.includes(want) === true,
        at.box
      );
      check("nothing else moved", same(at.marks, closed.marks));
      await shot(name);
      // Over the open box where no mark is near: the box closes, and stays
      // closed.
      if (name === "Scatter") {
        let held: boolean | undefined;
        for (const d of closed.targets) {
          const s = await hover(page, d.x + d.w / 2, d.y + d.h / 2);
          if (!s.boxClient) continue;
          const [x, y, w, h] = s.boxClient;
          const spot = [0.2, 0.5, 0.8]
            .flatMap((i) => [0.2, 0.5, 0.8].map((j) => [x + w * i, y + h * j]))
            .find(([px, py]) =>
              closed.targets.every(
                (q) => Math.hypot(q.x + q.w / 2 - px, q.y + q.h / 2 - py) > 60
              )
            );
          if (!spot) continue;
          const t = await rest(page, spot[0], spot[1]);
          held = t.box === null && !t.changed;
          break;
        }
        if (held === undefined)
          console.log("  (no spot over a box 60 px from every dot)");
        else
          check("over the box, no dot near: closed, and it stays closed", held);
        // Within 16 px of a dot's edge, its box; 18 px off, none (no other
        // dot is that near). Then how much of the plot opens a box.
        for (const d of closed.targets.slice(0, 3)) {
          const [cx, cy, r] = [d.x + d.w / 2, d.y + d.h / 2, d.w / 2];
          await hover(page, 2, 2);
          const on = await hover(page, cx, cy);
          const near = await hover(page, cx, cy + r + 15);
          await hover(page, 2, 2);
          const far = await hover(page, cx, cy + r + 18);
          check(
            `dot at ${Math.round(cx)},${Math.round(cy)}: 15 px off, its box; 18 px off, none`,
            on.box !== null &&
              JSON.stringify(near.box) === JSON.stringify(on.box) &&
              far.box === null,
            [on.box, near.box, far.box]
          );
        }
        const [sx, sy, sw, sh] = closed.svg;
        let open = 0;
        let all = 0;
        for (let i = 1; i < 20; i++)
          for (let j = 1; j < 20; j++) {
            await page.mouse.move(2, 2);
            await page.mouse.move(sx + (sw * i) / 20, sy + (sh * j) / 20);
            await page.waitForTimeout(30);
            all++;
            if ((await snap(page)).box !== null) open++;
          }
        console.log(
          `  a 19 by 19 grid over the scatter: ${open} of ${all} points open a box`
        );
      }
      if (name === "StackedBars") {
        // Across every lake near the bottom, where every bar is: a box on
        // every frame (the 8 px gaps are within reach).
        // The bars stand on one baseline; the legend's swatches do not.
        const base = Math.max(...closed.targets.map((t) => t.y + t.h));
        const ts = closed.targets.filter((t) => Math.abs(t.y + t.h - base) < 1);
        const x0 = Math.min(...ts.map((t) => t.x));
        const x1 = Math.max(...ts.map((t) => t.x + t.w));
        const y = Math.max(...ts.map((t) => t.y + t.h)) - 3;
        const closedAt: number[] = [];
        for (let x = x0 + 1; x < x1 - 1; x += 2) {
          await page.mouse.move(x, y);
          await page.waitForTimeout(40);
          if ((await snap(page)).box === null) closedAt.push(Math.round(x));
        }
        check(
          "across every lake: never closed",
          closedAt.length === 0,
          closedAt
        );
      }
      const out = await hover(page, 2, 2);
      check("away: closed", out.box === null);
    }

    console.log("# Donut");
    {
      // Each wedge is a filled path in a polar coordinate space: a pointer
      // anywhere inside it is on it.
      const WEDGE = "path[data-gf-id][fill]:not([fill=none])";
      const closed = await render(page, story("Donut"), WEDGE);
      /** In the page: per wedge, its fill and a point inside it, in client
       *  px, the in-fill sample nearest the mean of its in-fill samples. */
      const INSIDE = `(() => {
        const out = [];
        for (const e of document.querySelectorAll('#stories-root svg ${WEDGE}')) {
          if (e.closest('[pointer-events="none"]')) continue;
          const b = e.getBBox(), m = e.getScreenCTM(), pts = [];
          for (let i = 1; i < 30; i++)
            for (let j = 1; j < 30; j++) {
              const p = new DOMPoint(b.x + (b.width * i) / 30, b.y + (b.height * j) / 30);
              if (e.isPointInFill(p)) pts.push(p);
            }
          const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
          const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
          let best = pts[0], d = Infinity;
          for (const p of pts) {
            const dp = Math.hypot(p.x - cx, p.y - cy);
            if (dp < d) [best, d] = [p, dp];
          }
          const q = best.matrixTransform(m);
          out.push([e.getAttribute("fill"), q.x, q.y]);
        }
        return out;
      })()`;
      const wedges = (await page.evaluate(INSIDE)) as [
        string,
        number,
        number,
      ][];
      check("five wedges", wedges.length === 5, wedges);
      // The legend names each wedge's species by its fill.
      const species = ["Bass", "Trout", "Catfish", "Perch", "Salmon"];
      const named = new Set<string>();
      for (const [fill, x, y] of wedges) {
        const s = await hover(page, x, y);
        const name = species.find((n) => s.box?.includes(n));
        if (name) named.add(name);
        check(
          `inside the ${fill} wedge: a box naming one species`,
          name !== undefined,
          s.box
        );
        check(
          `inside the ${fill} wedge: nothing else moved`,
          same(s.marks, closed.marks)
        );
      }
      check("each wedge its own species", named.size === 5, [...named]);
      await shot("donut");
      // Along a ray from the center of the hole through the first wedge, a
      // px at a time: no box in the hole until 16 px before the inner edge,
      // the wedge's box across it, and closed 20 px past the outer edge;
      // coming back in, it opens 16 px past the outer edge.
      {
        const RING = `(() => {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const e of document.querySelectorAll('#stories-root svg ${WEDGE}')) {
            if (e.closest('[pointer-events="none"]')) continue;
            const b = e.getBoundingClientRect();
            x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
            x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
          }
          return [(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2];
        })()`;
        const [cx, cy, R] = (await page.evaluate(RING)) as number[];
        await hover(page, 2, 2);
        const hole = await hover(page, cx, cy);
        check("the center of the hole: no box", hole.box === null, hole.box);
        await shot("donut-hole");
        const nameOf = (s: Snap) =>
          s.box === null
            ? "none"
            : (species.find((n) => s.box!.includes(n)) ?? "?");
        let pt = (r: number): [number, number] => [cx + r, cy];
        let rIn = 0;
        for (const [fill, wx, wy] of wedges) {
          const len = Math.hypot(wx - cx, wy - cy);
          const [ux, uy] = [(wx - cx) / len, (wy - cy) / len];
          const along = (r: number): [number, number] => [
            cx + ux * r,
            cy + uy * r,
          ];
          const rs = Array.from({ length: Math.ceil(R) + 40 }, (_, r) => r);
          // Which radii are inside this wedge, by what the page hit-tests.
          const inside = (await page.evaluate(
            `${JSON.stringify(rs.map(along))}.map(([x, y]) => {
              const e = document.elementFromPoint(x, y);
              return e !== null && e.matches('${WEDGE}') && e.getAttribute("fill") === ${JSON.stringify(fill)};
            })`
          )) as boolean[];
          const wIn = inside.indexOf(true);
          const wOut = inside.lastIndexOf(true);
          await hover(page, 2, 2);
          const states: string[] = [];
          for (const r of rs) {
            await page.mouse.move(...along(r));
            await page.waitForTimeout(30);
            states.push(nameOf(await snap(page)));
          }
          const own = states[Math.round((wIn + wOut) / 2)];
          const rOpen = states.indexOf(own);
          const rClose = states.findIndex((n, r) => r > wOut && n !== own);
          let rBack = -1;
          await hover(page, 2, 2);
          for (let r = rs.length - 1; r >= wOut; r--) {
            await page.mouse.move(...along(r));
            await page.waitForTimeout(30);
            if ((await snap(page)).box !== null) {
              rBack = r;
              break;
            }
          }
          const seq: string[] = [];
          states.forEach((n, r) => {
            if (seq.length === 0 || !seq[seq.length - 1].startsWith(n + "@"))
              seq.push(`${n}@${r}`);
          });
          console.log(
            `  ray through ${own}: ring ${wIn}-${wOut} px; outward ${seq.join(" ")}; inward from ${rBack}`
          );
          check(
            `${own}: no box in the hole, its box from ${wIn - rOpen} px before the inner edge`,
            states[0] === "none" && Math.abs(wIn - rOpen - 16) <= 1.5,
            seq
          );
          check(
            `${own}: its box across the wedge`,
            states.slice(wIn, wOut + 1).every((n) => n === own),
            seq
          );
          // Where the ray leaves the svg, the pointer is off the chart.
          const [sx, sy, sw, sh] = closed.svg;
          const rLeave = rs.find((r) => {
            const [x, y] = along(r);
            return (
              r > wOut && (x < sx || x >= sx + sw || y < sy || y >= sy + sh)
            );
          });
          console.log(
            `    past the outer edge: ${own}'s box until ${rClose - wOut} px, then ${states[rClose]}; inward, a box from ${rBack - wOut} px; the ray leaves the svg ${rLeave === undefined ? "beyond the sweep" : `${rLeave - wOut} px past the edge`}`
          );
          // Off the svg the pointer is off the chart and the box closes
          // there; that is before 20 px on the rays that leave it sooner.
          const offChart = rLeave !== undefined && rLeave - wOut < 20;
          check(
            offChart
              ? `${own}: past the outer edge, closed at ${rClose - wOut} px where the ray leaves the svg (${rLeave! - wOut} px), reopened at ${rBack - wOut} px`
              : `${own}: past the outer edge, closed at ${rClose - wOut} px, reopened at ${rBack - wOut} px`,
            states[rClose] === "none" &&
              (offChart
                ? Math.abs(rClose - rLeave!) <= 1 &&
                  Math.abs(rBack - rLeave!) <= 1
                : rClose - wOut >= 20 &&
                  rClose - wOut <= 21 &&
                  rBack - wOut >= 15 &&
                  rBack - wOut <= 16),
            seq
          );
          if (fill === wedges[0][0]) {
            pt = along;
            rIn = wIn;
          }
        }
        await hover(page, 2, 2);
        await hover(page, ...pt(rIn - 6));
        await shot("donut-inner-edge");
      }
      const out = await hover(page, 2, 2);
      check("away: closed", out.box === null);
    }

    console.log("# LineChart");
    {
      const LINE = 'path[stroke-width="2"]';
      const closed = await render(page, story("LineChart"), LINE);
      const lineStroke = { Revenue: "#4190c5", Cost: "#f2cf57" } as const;
      // The story's rows, as the box formats them.
      const years = ["2018", "2019", "2020", "2021", "2022"];
      const values = {
        Revenue: ["1.6", "1.9", "1.7", "2.3", "2.6"],
        Cost: ["1.2", "1.3", "1.5", "1.6", "2"],
      };
      /** In the page: the client point of each row of a line, the end of
       *  each command of its path (a curve's control points are off it). */
      const ROWS = (stroke: string) => `(() => {
        const e = document.querySelector('#stories-root svg ${LINE}[stroke="${stroke}"]');
        const m = e.getScreenCTM();
        return e.getAttribute("d").split(/[A-Za-z]/)
          .map((c) => (c.match(/-?[\\d.]+(?:e-?\\d+)?/g) || []).map(Number))
          .filter((n) => n.length >= 2)
          .map((n) => {
            const q = new DOMPoint(n[n.length - 2], n[n.length - 1]).matrixTransform(m);
            return [q.x, q.y];
          });
      })()`;
      /** In the page: the marker's center, in client px. */
      const MARKER = `(() => {
        const e = [...document.querySelectorAll('#stories-root svg ellipse')]
          .filter((m) => m.closest('[pointer-events="none"]') !== null);
        return e.map((m) => {
          const b = m.getBoundingClientRect();
          return [b.x + b.width / 2, b.y + b.height / 2, m.getAttribute("stroke")];
        });
      })()`;
      const rowsOf = (stroke: string) =>
        page.evaluate(ROWS(stroke)) as Promise<[number, number][]>;
      const marker = () =>
        page.evaluate(MARKER) as Promise<[number, number, string][]>;
      // A re-run paints new marks: tag the drawn line, and count a re-run
      // each time it is gone.
      const TAG = `(() => {
        const e = document.querySelector('#stories-root svg ${LINE}');
        const was = e.__seen === true;
        e.__seen = true;
        return !was;
      })()`;
      const reran = () => page.evaluate(TAG) as Promise<boolean>;
      const gapTo = (b: [number, number, number, number], [x, y]: number[]) =>
        Math.hypot(
          Math.max(b[0] - x, 0, x - (b[0] + b[2])),
          Math.max(b[1] - y, 0, y - (b[1] + b[3]))
        );
      const rows = {
        Revenue: await rowsOf(lineStroke.Revenue),
        Cost: await rowsOf(lineStroke.Cost),
      };
      for (const name of ["Revenue", "Cost"] as const) {
        const pts = rows[name];
        check(`${name}: five rows`, pts.length === 5, pts);
        for (const [i, [x, y]] of pts.entries()) {
          const seats = new Set<string>();
          // On the point, and off it toward a neighbor, nearer this row.
          const dx = i === 4 ? -12 : 12;
          for (const [px, py] of [
            [x, y],
            [x + dx, y + (name === "Revenue" ? -3 : 3)],
          ]) {
            const s = await hover(page, px, py);
            check(
              `${name} ${years[i]} (${Math.round(px - x)} px off): the box names its series, year and value`,
              s.box !== null &&
                s.box.includes(name) &&
                s.box.includes(years[i]) &&
                s.box.includes(values[name][i]),
              s.box
            );
            const gap = s.boxClient ? gapTo(s.boxClient, [x, y]) : Infinity;
            check(
              `${name} ${years[i]}: the box beside the point (${gap.toFixed(1)} px)`,
              gap <= 8 + 4 + 1,
              [s.boxClient, x, y]
            );
            const m = await marker();
            check(
              `${name} ${years[i]}: a marker on the point, in the line's color, no pointer target`,
              m.length === 1 &&
                Math.hypot(m[0][0] - x, m[0][1] - y) < 1 &&
                m[0][2] === lineStroke[name],
              [m, x, y]
            );
            check(
              `${name} ${years[i]}: nothing else moved`,
              same(s.marks, closed.marks)
            );
            seats.add(JSON.stringify(s.boxClient));
          }
          check(
            `${name} ${years[i]}: the box sits by the point, not the pointer`,
            seats.size === 1,
            [...seats]
          );
        }
      }
      // Screenshots: by a point on each line, midway between two points,
      // and at both ends.
      {
        const [r, c] = [rows.Revenue, rows.Cost];
        const views: [string, number, number][] = [
          ["line-revenue-point", r[1][0] + 6, r[1][1] - 2],
          ["line-cost-point", c[3][0] + 6, c[3][1] + 2],
          [
            "line-revenue-mid",
            (r[2][0] + r[3][0]) / 2,
            (r[2][1] + r[3][1]) / 2,
          ],
          ["line-revenue-start", r[0][0], r[0][1]],
          ["line-revenue-end", r[4][0], r[4][1]],
          ["line-cost-start", c[0][0], c[0][1]],
          ["line-cost-end", c[4][0], c[4][1]],
        ];
        for (const [file, x, y] of views) {
          const s = await hover(page, x, y);
          const want = file.includes("revenue") ? "Revenue" : "Cost";
          check(
            `${file}: the ${want} box`,
            s.box?.includes(want) === true,
            s.box
          );
          await shot(file);
        }
      }
      // A sweep along Revenue from its first row to its last: a re-run
      // only when the nearest row changes, one per row crossed.
      {
        const pts = rows.Revenue;
        await hover(page, pts[0][0], pts[0][1] - 1);
        await reran();
        let runs = 0;
        let changes = 0;
        let last = "";
        const steps = 40;
        for (let k = 0; k <= steps; k++) {
          const t = (k / steps) * 4;
          const seg = Math.min(3, Math.floor(t));
          const f = t - seg;
          const [ax, ay] = pts[seg];
          const [bx, by] = pts[seg + 1];
          await page.mouse.move(ax + f * (bx - ax), ay + f * (by - ay) - 1);
          await page.waitForTimeout(60);
          const s = await snap(page);
          const year = years.find((y) => s.box?.includes(y)) ?? "";
          if (year !== last) changes++;
          last = year;
          if (await reran()) runs++;
        }
        check(
          `sweep along Revenue: ${runs} re-runs, ${changes - 1} changes of row (4 rows crossed)`,
          runs === 4 && changes - 1 === 4,
          [runs, changes - 1]
        );
        const [lx, ly] = pts[4];
        for (let k = 0; k < 8; k++) {
          await page.mouse.move(lx - 4 + k, ly - 1);
          await page.waitForTimeout(40);
        }
        await page.waitForTimeout(200);
        check("moving about one row: no re-run", !(await reran()));
      }
      // 10 px below Revenue (above it leaves the chart at 2022), from its
      // first row to its last: a box on every
      // frame, though the rows are far apart (the reach is to the path).
      {
        const pts = rows.Revenue;
        const closedAt: number[] = [];
        for (let k = 0; k <= 80; k++) {
          const t = (k / 80) * 4;
          const seg = Math.min(3, Math.floor(t));
          const f = t - seg;
          const [ax, ay] = pts[seg];
          const [bx, by] = pts[seg + 1];
          await page.mouse.move(ax + f * (bx - ax), ay + f * (by - ay) + 10);
          await page.waitForTimeout(40);
          if ((await snap(page)).box === null) closedAt.push(k);
        }
        check(
          "10 px below Revenue, along it: never closed",
          closedAt.length === 0,
          closedAt
        );
      }
      // Straight down from each Revenue row to the Cost row under it: where
      // the lines are more than 40 px apart there is a dead band between
      // them; where they are less than 32 px apart there is none.
      for (const i of [0, 1, 2, 3, 4]) {
        const [x, ry] = rows.Revenue[i];
        const cy = rows.Cost[i][1];
        const gap = cy - ry;
        await hover(page, x, ry);
        const seq: string[] = [];
        let dead = 0;
        for (let y = ry; y <= cy; y++) {
          await page.mouse.move(x, y);
          await page.waitForTimeout(30);
          const s = await snap(page);
          const k =
            s.box === null
              ? "none"
              : s.box.includes("Revenue")
                ? "Revenue"
                : "Cost";
          if (k === "none") dead++;
          if (seq[seq.length - 1] !== k) seq.push(k);
        }
        check(
          `${years[i]}: lines ${Math.round(gap)} px apart, down from Revenue to Cost: ${seq.join(", ")} (${dead} px dead)`,
          gap > 40
            ? seq.join() === "Revenue,none,Cost"
            : gap < 32
              ? seq.join() === "Revenue,Cost"
              : seq[0] === "Revenue" && seq[seq.length - 1] === "Cost",
          seq
        );
      }
      // With the Revenue 2020 box open, a Cost row under it is reached.
      {
        const rs = await hover(page, rows.Revenue[2][0], rows.Revenue[2][1]);
        const [x, y, w, h] = rs.boxClient!;
        const i = rows.Cost.findIndex(
          ([cx, cy]) => cx >= x && cx <= x + w && cy >= y && cy <= y + h
        );
        if (i < 0) console.log("  (no Cost row under the Revenue 2020 box)");
        else {
          const cs = await hover(
            page,
            rows.Cost[i][0] - 3,
            rows.Cost[i][1] + 1
          );
          check(
            `under the Revenue box: the Cost ${years[i]} box`,
            cs.box?.includes("Cost") === true && cs.box.includes(years[i]),
            cs.box
          );
        }
      }
      // At the same year, the Cost box sits below the Revenue box.
      for (const i of [1, 2, 3]) {
        const rs = await hover(page, rows.Revenue[i][0], rows.Revenue[i][1]);
        const cs = await hover(page, rows.Cost[i][0], rows.Cost[i][1]);
        check(
          `${years[i]}: the Cost box is below the Revenue box`,
          rs.boxClient !== null &&
            cs.boxClient !== null &&
            cs.boxClient[1] > rs.boxClient[1],
          [rs.boxClient, cs.boxClient]
        );
      }
      const out = await hover(page, 2, 2);
      check("away: closed", out.box === null);
      check("away: no marker", (await marker()).length === 0);
      check("closed again: as before", same(out.marks, closed.marks));
    }

    console.log("# Bars far apart (built here, not a story)");
    {
      // Three bars 20 px wide with 60 px between them.
      marksSelector = 'rect[fill="#4c78a8"]';
      await page.mouse.move(1, 1);
      await page.evaluate(`(async () => {
        const L = await import(${JSON.stringify(`/@fs${REPO_ROOT}/packages/gofish-graphics/src/lib.ts`)});
        const root = document.querySelector("#stories-root");
        root.innerHTML = "";
        const el = document.createElement("div");
        root.appendChild(el);
        await L.chart([{ k: "a", n: 3 }, { k: "b", n: 5 }, { k: "c", n: 4 }], { w: 220, h: 200 })
          .flow(L.spread({ by: "k", dir: "x", spacing: 60 }))
          .mark(L.rect({ h: "n", w: 20, fill: "#4c78a8" }).tooltip())
          .render(el);
      })()`);
      await page.waitForTimeout(300);
      const closed = await snap(page);
      const [a, b] = [...closed.targets].sort((p, q) => p.x - q.x);
      const y = b.y + b.h - 10;
      const aEnd = a.x + a.w;
      check(
        `a gap of ${Math.round(b.x - aEnd)} px`,
        Math.abs(b.x - aEnd - 60) < 1
      );
      const mid = await hover(page, (aEnd + b.x) / 2, y);
      check("midway in the gap: no box", mid.box === null, mid.box);
      await shot("far-bars-gap");
      const near = await hover(page, aEnd + 12, y);
      check(
        "12 px right of bar a: its box",
        near.box?.includes("a") === true,
        near.box
      );
      await shot("far-bars-near");
      // From a's middle to b's, a px at a time.
      await hover(page, a.x + 10, y);
      const seq: string[] = [];
      const at: number[] = [];
      for (let x = Math.round(a.x + 10); x <= b.x + 10; x++) {
        await page.mouse.move(x, y);
        await page.waitForTimeout(30);
        const s = await snap(page);
        const k =
          s.box === null
            ? "none"
            : s.box.includes("a")
              ? "a"
              : s.box.includes("b")
                ? "b"
                : "?";
        if (seq[seq.length - 1] !== k) {
          seq.push(k);
          at.push(x);
        }
      }
      check(
        `across the gap: ${seq.join(", ")}; closed ${Math.round(at[1] - aEnd)} px past a, opened ${Math.round(b.x - at[2])} px before b`,
        seq.join() === "a,none,b" &&
          Math.abs(at[1] - aEnd - 21) <= 1.5 &&
          Math.abs(b.x - at[2] - 16) <= 1.5,
        [seq, at, aEnd, b.x]
      );
      // The same crossing at the height of a's open box: the box sits in
      // the gap, but it is no pointer target, so the gap is dead there too.
      {
        const opened = await hover(page, a.x + 10, a.y + a.h / 2);
        const [bx, by, bw, bh] = opened.boxClient!;
        const y2 = by + bh / 2;
        await hover(page, a.x + 10, y2);
        const seq2: string[] = [];
        for (let x = Math.round(a.x + 10); x <= b.x + 10; x++) {
          await page.mouse.move(x, y2);
          await page.waitForTimeout(30);
          const s = await snap(page);
          const k = s.box === null ? "none" : s.box.includes("a") ? "a" : "b";
          if (!seq2.length || !seq2[seq2.length - 1].startsWith(k + "@"))
            seq2.push(`${k}@${Math.round(x - aEnd)}`);
        }
        console.log(
          `  across the gap at the height of a's box (its right edge ${Math.round(bx + bw - aEnd)} px past a; b at ${Math.round(b.x - aEnd)}): ${seq2.join(" ")} (px past a)`
        );
        check(
          "across the gap at the box's height: a, none, b",
          seq2.map((t) => t.split("@")[0]).join() === "a,none,b",
          seq2
        );
      }
      const out = await hover(page, 2, 2);
      check("away: closed", out.box === null);
    }

    // No two-state loop anywhere: at each point of a grid over each story,
    // the box after a rest is the box a moment later.
    for (const [name, marks] of [
      ["BarChart", 'rect[fill="#4c78a8"]'],
      ["StackedBars", "rect[data-gf-id][fill]:not([fill=none])"],
      ["Scatter", "ellipse"],
      ["Donut", "path[data-gf-id][fill]:not([fill=none])"],
      ["LineChart", 'path[stroke-width="2"]'],
    ] as const) {
      const closed = await render(page, story(name), marks);
      const [sx, sy, sw, sh] = closed.svg;
      const unstable: string[] = [];
      for (let i = 1; i < 10; i++)
        for (let j = 1; j < 8; j++) {
          const [x, y] = [sx + (sw * i) / 10, sy + (sh * j) / 8];
          const a = await hover(page, x, y);
          await page.waitForTimeout(200);
          const b = await snap(page);
          if (
            JSON.stringify([a.box, a.boxClient]) !==
            JSON.stringify([b.box, b.boxClient])
          )
            unstable.push(`${Math.round(x)},${Math.round(y)}`);
        }
      check(
        `${name}: at rest, every grid point stable`,
        unstable.length === 0,
        unstable
      );
    }

    const errors = warnings.filter((w) => /error/i.test(w));
    check("no console errors", errors.length === 0, errors);
  });
  console.log(
    failures.length === 0
      ? `\nall checks passed; screenshots in ${OUT}`
      : `\n${failures.length} failed`
  );
  if (failures.length > 0) process.exitCode = 1;
}

await main();
