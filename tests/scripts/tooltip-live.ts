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
      ["LineChart", "series", 'path[stroke-width="2"]'],
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
