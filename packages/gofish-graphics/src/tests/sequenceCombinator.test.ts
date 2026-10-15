/**
 * PROTOTYPE (animation grammar proposal): the combinator form of
 * `time.sequence` is the flow form with the keyframe groups written out.
 *
 *   flow:        chart(rows).flow(time.sequence({ by: "year" }), scatter(...))
 *                  .mark(circle(...).transition({ update: Animation.tween() }))
 *   combinator:  time.sequence({}, [chart(year1).flow(scatter(...)).mark(circle(...)),
 *                                   chart(year2)....])
 *                  .transition({ update: Animation.tween() })
 *
 * Two gapminder years, held halfway between them (1957.5 in the flow form's
 * year units, 0.5 in the combinator's child-index units), must draw the same
 * circles. Run: `pnpm build && node --conditions browser --import tsx
 * src/tests/sequenceCombinator.test.ts`.
 */
import { items } from "./animationTestHelpers";
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import data from "vega-datasets";

const { chart, circle, scatter, time, Animation, Curve } = GoFish as any;

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

const SCATTER = { by: "country", x: "fertility", y: "life_expect" };
const OPTS = { w: 500, h: 400, axes: false };
const tween = () => Animation.tween({ curve: Curve.linear() });

function circles(doc: any) {
  return items(doc)
    .filter((n: any) => n.kind === "ellipse" && n.style?.opacity !== 0)
    .map((n: any) => ({
      cx: n.cx,
      cy: n.cy,
      r: n.rx,
      fill: String(n.style?.fill ?? ""),
      opacity: n.style?.opacity ?? 1,
    }))
    .sort((a: any, b: any) => a.fill.localeCompare(b.fill) || a.cx - b.cx);
}

const gapminder = (await (data as any)["gapminder.json"]()) as any[];
const rows = gapminder.filter((d) => d.year === 1955 || d.year === 1960);
const year = (y: number) => rows.filter((d) => d.year === y);

for (const [flowAt, childAt] of [
  [1955, 0],
  [1957.5, 0.5],
  [1960, 1],
]) {
  const flow = await chart(rows, { legend: false })
    .flow(
      time.sequence({ by: "year", duration: 5000, playing: false, at: flowAt }),
      scatter(SCATTER)
    )
    .mark(circle({ r: 4, fill: "country" }).transition({ update: tween() }))
    .toDisplayList(OPTS);
  const keyframe = (y: number) =>
    chart(year(y), { legend: false })
      .flow(scatter(SCATTER))
      .mark(circle({ r: 4, fill: "country" }));
  const combinator = await time
    .sequence({ duration: 5000, playing: false, at: childAt, key: "country" }, [
      keyframe(1955),
      keyframe(1960),
    ])
    .transition({ update: tween() })
    .toDisplayList(OPTS);
  const [a, b] = [circles(flow), circles(combinator)];
  let diff: string | undefined;
  if (a.length !== b.length) diff = `${a.length} vs ${b.length} circles`;
  else {
    for (let i = 0; i < a.length && diff === undefined; i++) {
      for (const k of ["cx", "cy", "r", "opacity"] as const) {
        if (Math.abs(a[i][k] - b[i][k]) > 1e-6) {
          diff = `circle ${i} (${a[i].fill}): ${k} ${a[i][k]} vs ${b[i][k]}`;
          break;
        }
      }
      if (a[i].fill !== b[i].fill) diff = `circle ${i}: fill differs`;
    }
  }
  ok(
    `flow at ${flowAt} draws what the combinator draws at ${childAt} (${a.length} circles)`,
    diff === undefined,
    diff
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
