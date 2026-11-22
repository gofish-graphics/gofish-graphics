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
      // The box is no pointer target: moving down through the first bar's
      // box, over the bars under it, reaches them in turn, with a box open
      // on every sample.
      const open1 = await hover(
        page,
        bars[0].x + bars[0].w - 10,
        bars[0].y + bars[0].h / 2
      );
      const [bx, by, bw, bh] = open1.boxClient!;
      // A column of the box over the second bar, if the box reaches it.
      const colX = Math.min(bx + bw - 4, bars[1].x + bars[1].w - 3);
      if (colX > bx + 2) {
        const seen: string[] = [];
        let closedFrames = 0;
        const closedAt: number[] = [];
        let prev: Snap | undefined = open1;
        for (let y = bars[0].y + bars[0].h / 2; y < by + bh - 2; y += 4) {
          await page.mouse.move(colX, y);
          await page.waitForTimeout(60);
          const s = await snap(page);
          // Closed under the box that was open: the hold rule broke. (Below
          // the last box, past the bars' hull, closing is right.)
          const p = prev?.boxClient;
          if (
            s.box === null &&
            p &&
            colX >= p[0] &&
            colX <= p[0] + p[2] &&
            y >= p[1] &&
            y <= p[1] + p[3]
          ) {
            closedFrames++;
            closedAt.push(Math.round(y));
          }
          prev = s;
          const n = expect.find((e) => s.box?.includes(e));
          if (n !== undefined && seen[seen.length - 1] !== n) seen.push(n);
        }
        check(
          `down through bar 1's box at x ${Math.round(colX)}: bars in order (${seen.join(", ")})`,
          seen.length >= 2 && seen.every((n, i) => expect.indexOf(n) === i),
          seen
        );
        check(
          "down through bar 1's box: never closed under an open box",
          closedFrames === 0,
          [
            closedAt,
            bars.map((b) => [
              Math.round(b.x),
              Math.round(b.y),
              Math.round(b.w),
              Math.round(b.h),
            ]),
            open1.boxClient,
          ]
        );
      } else
        console.log("  (the first bar's box does not reach the second bar)");
      // At rest over a box for a second: the same box, in place.
      const rest = await hover(page, bx + bw / 2, by + bh / 2);
      let steady = rest.box !== null;
      for (let k = 0; k < 5; k++) {
        await page.waitForTimeout(200);
        const s = await snap(page);
        if (
          JSON.stringify(s.box) !== JSON.stringify(rest.box) ||
          JSON.stringify(s.boxClient) !== JSON.stringify(rest.boxClient)
        )
          steady = false;
      }
      check("at rest over a box for 1 s: no change", steady);
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
      // Over the open box where no mark is near: the box holds.
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
          const t = await hover(page, spot[0], spot[1]);
          held =
            JSON.stringify(t.box) === JSON.stringify(s.box) &&
            JSON.stringify(t.boxClient) === JSON.stringify(s.boxClient);
          break;
        }
        if (held === undefined)
          console.log("  (no spot over a box 60 px from every dot)");
        else check("over the box, no dot near: the box holds", held);
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
