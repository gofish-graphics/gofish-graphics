/**
 * Drive the `Interaction/Tooltip` stories with a real mouse in Chromium
 * (#1395). For each story: hover marks, a gap and a point off the chart,
 * and check the box's content, that nothing else moved, that the box does
 * not flicker while the pointer is over it, and that the page logged no
 * error. Screenshots go to tests/tmp/tooltip-live/.
 *
 * Usage: `pnpm --filter @gofish/tests tooltip-live` (needs
 * `pnpm --filter gofish-graphics build` once, like capture-one).
 */
import { mkdirSync } from "fs";
import { join } from "path";
import type { Page } from "playwright";
import { HARNESS_DIR, withHarness, type StoryInfo } from "./capture-core.js";

const PORT = Number(process.env.TOOLTIP_LIVE_PORT) || 3005;
const OUT = join(import.meta.dirname, "../tmp/tooltip-live");
const BOX_STROKE = "#c9ced6";

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
      // The gap between bars 1 and 2.
      const gap = await hover(
        page,
        bars[0].x + 10,
        (bars[0].y + bars[0].h + bars[1].y) / 2
      );
      check(
        "in the gap: a neighbor's box",
        gap.box !== null &&
          (gap.box.includes(expect[0]) || gap.box.includes(expect[1])),
        gap.box
      );
      // Over the box itself: it stays, in place, on every sample.
      const open1 = await hover(
        page,
        bars[0].x + 10,
        bars[0].y + bars[0].h / 2
      );
      const [bx, by, bw, bh] = open1.boxClient!;
      let steady = true;
      for (let k = 0; k < 8; k++) {
        await page.mouse.move(bx + 6 + (k * (bw - 12)) / 8, by + bh / 2);
        await page.waitForTimeout(60);
        const s = await snap(page);
        if (
          s.box === null ||
          JSON.stringify(s.boxClient) !== JSON.stringify(open1.boxClient)
        )
          steady = false;
      }
      check("over the box: no flicker", steady);
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
      const out = await hover(page, 2, 2);
      check("away: closed", out.box === null);
    }

    console.log("# LineChart");
    {
      const LINE = 'path[stroke-width="2"]';
      const closed = await render(page, story("LineChart"), LINE);
      const lineStroke = { Revenue: "#4190c5", Cost: "#f2cf57" } as const;
      /** In the page: points along a line, its point nearest (x, y), the
       *  distance from that point to the box, and whether the drawn marks
       *  are the elements of the last call (a re-run paints new ones). */
      const LINE_AT = (stroke: string, t: number) => `(() => {
        const e = document.querySelector('#stories-root svg ${LINE}[stroke="${stroke}"]');
        const p = e.getPointAtLength(e.getTotalLength() * ${t});
        const q = new DOMPoint(p.x, p.y).matrixTransform(e.getScreenCTM());
        return [q.x, q.y];
      })()`;
      const NEAREST = (stroke: string, x: number, y: number) => `(() => {
        const e = document.querySelector('#stories-root svg ${LINE}[stroke="${stroke}"]');
        const m = e.getScreenCTM();
        const n = e.getTotalLength();
        let best = null, d = Infinity;
        for (let k = 0; k <= 2000; k++) {
          const p = e.getPointAtLength((n * k) / 2000);
          const q = new DOMPoint(p.x, p.y).matrixTransform(m);
          const dq = Math.hypot(q.x - ${x}, q.y - ${y});
          if (dq < d) [best, d] = [[q.x, q.y], dq];
        }
        return best;
      })()`;
      const at = (stroke: string, t: number) =>
        page.evaluate(LINE_AT(stroke, t)) as Promise<[number, number]>;
      const nearest = (stroke: string, x: number, y: number) =>
        page.evaluate(NEAREST(stroke, x, y)) as Promise<[number, number]>;
      const MARK_TAG = `(() => {
        for (const e of document.querySelectorAll('#stories-root svg ${LINE}')) e.__seen = true;
      })()`;
      const STILL_TAGGED = `[...document.querySelectorAll('#stories-root svg ${LINE}')].every((e) => e.__seen === true)`;
      const gapTo = (b: [number, number, number, number], [x, y]: number[]) =>
        Math.hypot(
          Math.max(b[0] - x, 0, x - (b[0] + b[2])),
          Math.max(b[1] - y, 0, y - (b[1] + b[3]))
        );
      for (const name of ["Revenue", "Cost"] as const) {
        const stroke = lineStroke[name];
        const boxes: string[] = [];
        let opened = false;
        for (const t of [0.05, 0.25, 0.5, 0.75, 0.95]) {
          const [x, y] = await at(stroke, t);
          const s = await hover(page, x, y);
          const q = await nearest(stroke, x, y);
          const gap = s.boxClient ? gapTo(s.boxClient, q) : Infinity;
          // The gap is 8 px; the focus reads a curve as its chords, a few px
          // off the drawn curve.
          check(
            `${name} at ${t}: its box, beside its nearest point (${gap.toFixed(1)} px)`,
            s.box?.includes(name) === true && gap <= 14,
            [s.box, s.boxClient, q]
          );
          check(
            `${name} at ${t}: nothing else moved`,
            same(s.marks, closed.marks)
          );
          boxes.push(JSON.stringify(s.boxClient));
          if (!opened) {
            // The box is open on this line: from here on a re-run would
            // paint new marks.
            await page.evaluate(MARK_TAG);
            opened = true;
          }
          if (t === 0.05 || t === 0.5 || t === 0.95)
            await shot(`line-${name.toLowerCase()}-${Math.round(t * 100)}`);
        }
        check(
          `${name}: along the line, no re-run`,
          (await page.evaluate(STILL_TAGGED)) === true
        );
        check(
          `${name}: the box moved with the pointer`,
          new Set(boxes).size === boxes.length,
          boxes
        );
      }
      // Between the two lines, at several x: the nearer line's box.
      for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const r = await at(lineStroke.Revenue, t);
        for (const f of [0.25, 0.75]) {
          const x = r[0];
          const c = await nearest(lineStroke.Cost, x, r[1] + 1000);
          // The Cost line's point straight below (its nearest to a point far
          // below is near x; read its y at x).
          const cy = (await page.evaluate(`(() => {
            const e = document.querySelector('#stories-root svg ${LINE}[stroke="${lineStroke.Cost}"]');
            const m = e.getScreenCTM(); const n = e.getTotalLength();
            let best = ${c[1]}, d = Infinity;
            for (let k = 0; k <= 2000; k++) {
              const p = e.getPointAtLength((n * k) / 2000);
              const q = new DOMPoint(p.x, p.y).matrixTransform(m);
              if (Math.abs(q.x - ${x}) < d) [best, d] = [q.y, Math.abs(q.x - ${x})];
            }
            return best;
          })()`)) as number;
          const y = r[1] + f * (cy - r[1]);
          const [nr, nc] = [
            await nearest(lineStroke.Revenue, x, y),
            await nearest(lineStroke.Cost, x, y),
          ];
          const dr = Math.hypot(nr[0] - x, nr[1] - y);
          const dc = Math.hypot(nc[0] - x, nc[1] - y);
          // Skip a point about as near both: the head start decides there.
          if (Math.abs(dr - dc) < 5) continue;
          await page.mouse.move(1, 1);
          await page.waitForTimeout(150);
          const s = await hover(page, x, y);
          const want = dr < dc ? "Revenue" : "Cost";
          check(
            `between, x ${Math.round(x)} y ${Math.round(y)}: ${want} (${dr.toFixed(0)} vs ${dc.toFixed(0)} px)`,
            s.box?.includes(want) === true,
            s.box
          );
        }
      }
      // At the same x, the Cost box sits below the Revenue box.
      for (const t of [0.25, 0.5]) {
        const r = await at(lineStroke.Revenue, t);
        const rs = await hover(page, r[0], r[1]);
        const c = await nearest(lineStroke.Cost, r[0], r[1] + 1000);
        const cs = await hover(page, c[0], c[1]);
        check(
          `at x ${Math.round(r[0])}: the Cost box is below the Revenue box`,
          rs.boxClient !== null &&
            cs.boxClient !== null &&
            cs.boxClient[1] > rs.boxClient[1],
          [rs.boxClient, cs.boxClient]
        );
      }
      const out = await hover(page, 2, 2);
      check("away: closed", out.box === null);
      check("closed again: as before", same(out.marks, closed.marks));
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
