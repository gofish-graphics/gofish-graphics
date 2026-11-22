/**
 * Drive every interaction story's main gesture with a real mouse in
 * Chromium: drag, slider, button click, wheel and hover. Synthetic events
 * in unit tests do not show what a browser does with pointer capture,
 * retargeting and passive listeners, so this is the check for those.
 *
 * Besides the stories, a probe chart reads `pointer()` and `drag()` and
 * hands them to the page, so the script can read `pos()`, `dataPos()` and
 * the drag's state directly. Each run writes what it observed to
 * tests/tmp/interaction-live/<label>.json, so two runs (this tree and a
 * base ref) can be compared.
 *
 * Usage: `pnpm --filter @gofish/tests interaction-live` for this tree, or
 * `... interaction-live <ref>` to run this script against the library and
 * stories of `<ref>` (in a throwaway worktree, see `withBaseRefHarness`).
 */
import { execSync } from "child_process";
import { mkdirSync, realpathSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import type { Page } from "playwright";
import {
  HARNESS_DIR,
  withBaseRefHarness,
  withHarness,
  type StoryInfo,
} from "./capture-core.js";

const PORT = Number(process.env.INTERACTION_LIVE_PORT) || 3006;
const OUT = join(import.meta.dirname, "../tmp/interaction-live");
const BASE = process.argv[2];

const failures: string[] = [];
const observed: Record<string, unknown> = {};
/** `known`: the issue a check is known to fail for. It still runs and
 *  prints, and a pass says the issue may be fixed, but it fails no run. */
const check = (
  label: string,
  ok: boolean,
  detail?: unknown,
  known?: string
) => {
  const tag = ok ? "ok  " : known ? `KNOWN ${known}` : "FAIL";
  console.log(`  ${tag} ${label}`);
  observed[label] = detail ?? ok;
  if (!ok && !known) failures.push(label);
  if (!ok && detail !== undefined)
    console.log("       ", JSON.stringify(detail));
};

type Box = { x: number; y: number; w: number; h: number };

/** Page-side helpers, as a string: tsx would wrap a function's inner arrows
 *  in a `__name` helper the page does not have. */
const HELPERS = `
  window.__svg = () => document.querySelector("#stories-root svg");
  window.__box = (e) => {
    const b = e.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  window.__els = (sel) => [...window.__svg().querySelectorAll(sel)];
  window.__texts = () => window.__els("text").map((e) => e.textContent);
  if (!window.__wheelSeen) {
    window.__wheelSeen = [];
    window.addEventListener("wheel", (e) => window.__wheelSeen.push(e.defaultPrevented));
  }
`;

const svgBox = (page: Page): Promise<Box> =>
  page.evaluate(`window.__box(window.__svg())`) as Promise<Box>;
const boxesOf = (page: Page, sel: string): Promise<Box[]> =>
  page.evaluate(
    `window.__els(${JSON.stringify(sel)}).map(window.__box)`
  ) as Promise<Box[]>;
const fillsOf = (page: Page, sel: string): Promise<string[]> =>
  page.evaluate(
    `window.__els(${JSON.stringify(sel)}).map((e) => e.getAttribute("fill"))`
  ) as Promise<string[]>;
const texts = (page: Page): Promise<string[]> =>
  page.evaluate(`window.__texts()`) as Promise<string[]>;
const settle = (page: Page, ms = 200) => page.waitForTimeout(ms);

async function render(page: Page, story: StoryInfo): Promise<void> {
  await page.mouse.move(1, 1);
  await page.evaluate(
    `window.__renderStory__(${JSON.stringify({ moduleKey: story.moduleKey, name: story.name })})`
  );
  await page.waitForFunction("window.__STORY_RENDER_DONE__ === true");
  await page.evaluate(HELPERS);
  await settle(page, 300);
}

/** Press at `from`, move to each point of `path` in steps, return what
 *  `read` saw after each move, then release at the last point. */
async function dragPath<T>(
  page: Page,
  from: [number, number],
  path: [number, number][],
  read: () => Promise<T>
): Promise<{ during: T[]; after: T }> {
  await page.mouse.move(...from);
  await page.mouse.down();
  await settle(page, 100);
  const during: T[] = [];
  for (const p of path) {
    await page.mouse.move(...p, { steps: 6 });
    await settle(page);
    during.push(await read());
  }
  await page.mouse.up();
  await settle(page);
  return { during, after: await read() };
}

async function run(harnessDir: string, label: string): Promise<void> {
  const repoRoot = realpathSync(resolve(harnessDir, "../.."));
  await withHarness(harnessDir, PORT, async (open) => {
    const { page, warnings } = await open(({ text }) => console.log(text));
    const all = (await page.evaluate(
      "window.__listStories__()"
    )) as StoryInfo[];
    const story = (title: string, name: string) => {
      const s = all.find((s) => s.title === title && s.name === name);
      if (!s) throw new Error(`no story ${title} ${name}`);
      return s;
    };

    console.log("# Probe: pointer().pos(), dataPos(), drag() state");
    {
      await page.mouse.move(1, 1);
      await page.evaluate(`(async () => {
        const L = await import(${JSON.stringify(`/@fs${repoRoot}/packages/gofish-graphics/src/lib.ts`)});
        const root = document.querySelector("#stories-root");
        root.innerHTML = "";
        const c = document.createElement("div");
        root.appendChild(c);
        const p = L.pointer();
        const dr = L.drag();
        window.__probe = { p, dr };
        const data = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 4, y: 7 }];
        await L.chart(data, { w: 300, h: 200 })
          .flow(L.scatter({ by: "x", x: "x", y: "y" }))
          .mark(L.circle({ r: 5, fill: L.live(() => (p.pos() ? "#d62728" : "#6b9bd1")) }))
          // A spec read of the drag: every drag frame re-runs the chart.
          .layer(L.rect({ x: () => dr.currentData()?.x ?? 0, w: 2, fill: "#333" }))
          .render(c);
      })()`);
      await page.evaluate(HELPERS);
      await settle(page, 300);
      const s = await svgBox(page);
      const state = () =>
        page.evaluate(`(() => {
          const { p, dr } = window.__probe;
          const r = (v) => v === undefined ? null : Math.round(v * 100) / 100;
          const pt = (q) => q ? { x: r(q.x), y: r(q.y) } : null;
          return {
            pos: pt(p.pos()), dataPos: pt(p.dataPos?.()),
            active: dr.isActive(), current: pt(dr.current()), currentData: pt(dr.currentData()),
          };
        })()`) as Promise<{
          pos: { x: number; y: number } | null;
          dataPos: unknown;
          active: boolean;
          current: { x: number; y: number } | null;
          currentData: unknown;
        }>;
      // Points on the plot, in svg px.
      const at = (x: number, y: number): [number, number] => [s.x + x, s.y + y];
      await page.mouse.move(...at(150, 100), { steps: 4 });
      await settle(page);
      const hov = await state();
      check(
        "probe: pos() is the pointer in svg px",
        hov.pos !== null &&
          Math.abs(hov.pos.x - 150) < 1 &&
          Math.abs(hov.pos.y - 100) < 1,
        hov
      );
      observed["probe: dataPos at (150,100)"] = hov.dataPos;
      const inside = await dragPath(
        page,
        at(150, 100),
        [at(200, 100), at(220, 120)],
        state
      );
      check(
        "probe: drag inside: current follows the pointer",
        inside.during.every((d) => d.active) &&
          inside.during[1].current !== null &&
          Math.abs(inside.during[1].current.x - 220) < 1,
        inside.during
      );
      check(
        "probe: drag inside: release ends it",
        !inside.after.active,
        inside.after
      );
      const out = await dragPath(
        page,
        at(100, 100),
        [at(120, 100), at(120, s.h + 40)],
        state
      );
      check(
        "probe: drag out of the chart: current follows past the edge",
        out.during[1].current !== null &&
          Math.abs(out.during[1].current.y - (s.h + 40)) < 1,
        out.during
      );
      check(
        "probe: drag out of the chart: release outside ends it",
        !out.after.active,
        out.after
      );
    }

    console.log(
      "# Static titles: SVG <title> elements, on a primitive and a composite"
    );
    {
      const ns = (await page.evaluate(`(async () => {
        const L = await import(${JSON.stringify(`/@fs${repoRoot}/packages/gofish-graphics/src/lib.ts`)});
        const bar = await L.chart([{ k: "a", n: 1 }])
          .flow(L.spread({ by: "k", dir: "x" }))
          .mark(L.rect({ h: "n" }).tooltip())
          .toSVGElement({});
        const lens = await L.chart([{ k: "lens", n: 3 }], { w: 200, h: 200 })
          .flow(L.spread({ by: "k", dir: "x" }))
          .mark(L.intersect([L.circle({ r: 50 }), L.circle({ r: 50 }).translate({ x: 40 })]).tooltip())
          .toSVGElement({});
        const first = (svg, sel) => svg.querySelector(sel)?.firstElementChild;
        return [first(bar, "rect"), first(lens, 'g[style*="isolation"]')].map(
          (t) => t ? [t.tagName, t.namespaceURI] : null
        );
      })()`)) as ([string, string] | null)[];
      const svgNs = "http://www.w3.org/2000/svg";
      check(
        "a bar's first child is an SVG <title>",
        ns[0]?.[0] === "title" && ns[0]?.[1] === svgNs,
        ns[0]
      );
      check(
        "a composite's first child is an SVG <title>",
        ns[1]?.[0] === "title" && ns[1]?.[1] === svgNs,
        ns[1]
      );
    }

    // The rule reads `drag().currentData()`, which is undefined on every
    // chart (#1403, on main too), so it does not move yet.
    console.log("# Draggable Threshold: drag the rule");
    {
      await render(page, story("Interaction/Draggable Threshold", "Default"));
      const s = await svgBox(page);
      const rule = async () => {
        const [b] = await boxesOf(page, 'rect[fill="#333"]');
        return b ? Math.round(b.y) : null;
      };
      const y0 = await rule();
      const cx = s.x + s.w / 2;
      const d = await dragPath(
        page,
        [cx, s.y + s.h / 2],
        [
          [cx, s.y + s.h / 2 - 60],
          [cx, s.y + s.h / 2 + 40],
        ],
        rule
      );
      check(
        "threshold: the rule follows the drag",
        y0 !== null &&
          d.during[0] !== null &&
          d.during[0] < y0 &&
          d.during[1] !== null &&
          d.during[1] > d.during[0],
        { y0, ...d },
        "#1403"
      );
      await page.mouse.move(cx, s.y + 20, { steps: 6 });
      await settle(page);
      check(
        "threshold: after release a move does not drag",
        (await rule()) === d.after,
        { after: d.after, moved: await rule() }
      );
      const before = await rule();
      const o = await dragPath(
        page,
        [cx, s.y + s.h / 2],
        [[cx, s.y + s.h + 60]],
        rule
      );
      await page.mouse.move(cx, s.y + 20, { steps: 6 });
      await settle(page);
      check(
        "threshold: drag below the chart reaches the bottom, release outside ends it",
        o.during[0] !== null &&
          before !== null &&
          o.during[0] > before &&
          (await rule()) === o.after,
        { before, ...o, moved: await rule() },
        "#1403"
      );
    }

    for (const [name, readout] of [
      ["Default", /^\d+$/],
      ["Wrapping", /°$/],
    ] as const) {
      console.log(`# Widgets ${name}: slider and button`);
      await render(page, story("Interaction/Widgets", name));
      const value = async () =>
        // The last match: the button's caption comes before the slider.
        (await texts(page)).filter((t) => readout.test(t ?? "")).at(-1) ?? null;
      const [handle] = await boxesOf(page, "ellipse");
      const v0 = await value();
      const hx = handle.x + handle.w / 2;
      const hy = handle.y + handle.h / 2;
      const d = await dragPath(
        page,
        [hx, hy],
        [
          [hx + 40, hy],
          [hx + 80, hy + 60],
        ],
        value
      );
      check(
        `widgets ${name}: dragging the handle changes the value`,
        d.during[0] !== v0 && d.during[1] !== d.during[0],
        { v0, ...d }
      );
      await page.mouse.move(hx - 60, hy, { steps: 6 });
      await settle(page);
      check(
        `widgets ${name}: after release a move does not drag`,
        (await value()) === d.after,
        { after: d.after, moved: await value() }
      );
      // The button is the leftmost rect.
      const rects = await boxesOf(page, "rect");
      const button = rects.sort((a, b) => a.x - b.x)[0];
      await page.mouse.click(button.x + button.w / 2, button.y + button.h / 2);
      await settle(page, 300);
      const reset = await value();
      check(
        `widgets ${name}: the button resets the value`,
        reset === (name === "Default" ? "0" : "0°"),
        reset
      );
    }

    console.log("# Bird Migration E: slider scrub and play button");
    {
      await render(
        page,
        story("Animated Vega-Lite/Bird Migration", "E_Controls")
      );
      const value = async () =>
        (await texts(page)).find((t) => /^day \d+$/.test(t ?? "")) ?? null;
      const label = async () =>
        (await texts(page)).find((t) => t === "▶" || t === "❚❚") ?? null;
      // The handle is the lowest ellipse: the controls are under the map.
      const handle = (await boxesOf(page, "ellipse")).sort(
        (a, b) => b.y - a.y
      )[0];
      const hx = handle.x + handle.w / 2;
      const hy = handle.y + handle.h / 2;
      const d = await dragPath(page, [hx, hy], [[hx + 100, hy]], value);
      await settle(page, 400);
      const later = await value();
      check(
        "bird E: scrubbing pauses the clock at the pointed day",
        d.during[0] !== null && d.after === later,
        { ...d, later, label: await label() }
      );
      const before = await label();
      const rects = await boxesOf(page, "rect");
      const button = rects
        .filter((r) => r.y > handle.y - 20)
        .sort((a, b) => a.x - b.x)[0];
      await page.mouse.click(button.x + button.w / 2, button.y + button.h / 2);
      await settle(page, 300);
      // The scrub paused the clock, so the button plays it again.
      check(
        "bird E: the button toggles play",
        before === "▶" && (await label()) === "❚❚",
        { before, after: await label() }
      );
    }

    for (const [title, sel] of [
      ["Interaction/Semantic Zoom Histogram", "rect"],
      ["Interaction/Component Layout Reactive", "rect"],
    ] as const) {
      console.log(`# ${title}: wheel`);
      await render(page, story(title, "Default"));
      const s = await svgBox(page);
      const n0 = (await boxesOf(page, sel)).length;
      await page.evaluate("window.__wheelSeen.length = 0");
      await page.mouse.move(s.x + s.w / 2, s.y + s.h / 2, { steps: 4 });
      await page.mouse.wheel(0, -400);
      await settle(page, 400);
      const n1 = (await boxesOf(page, sel)).length;
      const prevented = (await page.evaluate(
        "window.__wheelSeen"
      )) as boolean[];
      check(
        `${title}: wheel changes the chart and keeps the page from scrolling`,
        n1 !== n0 && prevented.length > 0 && prevented.every(Boolean),
        { n0, n1, prevented }
      );
    }

    for (const [title, sel] of [
      ["Interaction/Hover Highlight", "rect"],
      ["Interaction/Component Pointer", "rect"],
    ] as const) {
      console.log(`# ${title}: hover`);
      await render(page, story(title, "Default"));
      const boxes = await boxesOf(page, sel);
      const fills0 = await fillsOf(page, sel);
      const i = fills0.findIndex((f) => f === "#6b9bd1");
      const b = boxes[i];
      await page.mouse.move(b.x + b.w / 2, b.y + b.h - 4, { steps: 4 });
      await settle(page);
      const fills1 = await fillsOf(page, sel);
      await page.mouse.move(1, 1, { steps: 4 });
      await settle(page);
      const fills2 = await fillsOf(page, sel);
      check(
        `${title}: hovering a mark recolors it, leaving restores it`,
        fills1[i] === "#d62728" &&
          fills1.filter((f) => f === "#d62728").length === 1 &&
          JSON.stringify(fills2) === JSON.stringify(fills0),
        { hovered: fills1[i], after: fills2[i] }
      );
    }

    const errors = warnings.filter((w) => /error/i.test(w));
    check("no console errors", errors.length === 0, errors);
  });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, `${label}.json`),
    JSON.stringify(observed, null, 2) + "\n"
  );
}

async function main() {
  if (BASE) {
    const sha = execSync(`git rev-parse ${BASE}`).toString().trim();
    await withBaseRefHarness(sha, (dir) => run(dir, BASE.replace(/\W+/g, "-")));
  } else {
    await run(HARNESS_DIR, "head");
  }
  console.log(
    failures.length === 0
      ? `\nall checks passed; observations in ${OUT}`
      : `\n${failures.length} failed`
  );
  if (failures.length > 0) process.exitCode = 1;
}

await main();
