/**
 * The gapminder desugaring tower: four spellings of one animated scatter, one
 * geometry. Run: `pnpm build && node --conditions browser --import tsx
 * src/tests/gapminderTower.test.ts` (wired as `pnpm test:gapminder-tower`).
 *
 * The four levels are the ones the stories draw
 * (`stories/animated-vega-lite/GapminderTower.stories.tsx`):
 *
 *   L0  the sugar: `time.sequence` in the flow, a bare `time.transition()`
 *       layered over it
 *   L1  key and path tier written out: `.name`/`selectAll`/`group`/`along`
 *   L2  clock written out too: `group({by:"year"})` and a raw `timer` as `at`
 *   L3  no relational mark: `interpolate` in data space, keyframes kept as
 *       `blank()` only so the axes get their domains
 *
 * L0 through L2 are rewrites of one another, so they must agree exactly. L3 is
 * the upstream reading — it interpolates the DATA and re-runs the pipeline,
 * where the others interpolate the placed geometry — and agrees only because a
 * fixed-domain scatter is affine in the interpolated quantities (animation
 * design note, §4.1). The test asserts the agreement at a midpoint playhead
 * (1957.5, where interpolation is doing work) and at an exact keyframe (1975,
 * where every level should simply reproduce the stored row).
 *
 * The DOM is set up first, and the library is imported from `dist`, for the
 * same reason `interaction.test.ts` does both: the clock is a live signal and
 * rendering goes through the solid-compiled backend.
 */
import "./interactionDomSetup";
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import data from "vega-datasets";

const {
  blank,
  chart,
  circle,
  derive,
  group,
  interpolate,
  scatter,
  selectAll,
  time,
  timer,
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

const W = 500;
const H = 400;
const YEARS: [number, number] = [1955, 2005];
const EPS = 1e-6;

/** A paused clock parked at `at` — the deterministic playhead levels 2 and 3
 *  use in place of the one a sequence owns. */
function pausedClock(at: number) {
  const clock = timer({ domain: YEARS, duration: 5000, playing: false });
  clock.set(at);
  return clock;
}

type Circle = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
};

/** Every visible ellipse in a display list, in a canonical order so two
 *  spellings that emit the same picture in a different order still compare
 *  equal.
 *
 *  "Visible" has to be read off the item, because a `time.sequence` hides the
 *  keyframes it is not holding at PAINT time: every keyframe is lowered, and
 *  the ones whose band the playhead is outside carry opacity 0 (the static
 *  value of the live slot that patches them per frame — see
 *  `GoFishNode.INTERNAL_visibleWhile`). So a sequence alone lowers every year
 *  and draws one, and this is where "draws one" is decided. */
function circles(doc: any): Circle[] {
  const out: Circle[] = [];
  const walk = (n: any): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n === null || typeof n !== "object") return;
    if (n.kind === "ellipse" && n.style?.opacity !== 0) {
      out.push({
        cx: n.cx,
        cy: n.cy,
        rx: n.rx,
        ry: n.ry,
        fill: String(n.style?.fill ?? ""),
      });
    }
    if (n.items) walk(n.items);
    if (n.children) walk(n.children);
  };
  walk(doc.items ?? doc);
  return out.sort((a, b) => a.fill.localeCompare(b.fill) || a.cx - b.cx);
}

/** Report the first place two geometries part company, or `undefined`. */
function firstDifference(a: Circle[], b: Circle[]): string | undefined {
  if (a.length !== b.length) return `${a.length} items vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    if (a[i].fill !== b[i].fill) {
      return `item ${i}: fill ${a[i].fill} vs ${b[i].fill}`;
    }
    for (const k of ["cx", "cy", "rx", "ry"] as const) {
      if (Math.abs(a[i][k] - b[i][k]) >= EPS) {
        return `item ${i} (${a[i].fill}): ${k} ${a[i][k]} vs ${b[i][k]}`;
      }
    }
  }
  return undefined;
}

const SCATTER = { by: "country", x: "fertility", y: "life_expect" };

async function level0(rows: any[], at: number) {
  return chart(rows, { legend: false })
    .flow(
      time.sequence({ by: "year", duration: 5000, playing: false, at }),
      scatter(SCATTER)
    )
    .mark(circle({ r: 4, fill: "country" }))
    .layer(time.transition())
    .toDisplayList({ w: W, h: H, axes: true });
}

async function level1(rows: any[], at: number) {
  return chart(rows, { legend: false })
    .flow(
      time.sequence({ by: "year", duration: 5000, playing: false, at }),
      scatter(SCATTER)
    )
    .mark(circle({ r: 4, fill: "country" }).name("kf"))
    .layer(
      chart(selectAll("kf"))
        .flow(group({ by: "country" }))
        .mark(time.transition({ along: "year" }))
    )
    .toDisplayList({ w: W, h: H, axes: true });
}

async function level2(rows: any[], at: number) {
  const year = pausedClock(at);
  return chart(rows, { legend: false })
    .flow(group({ by: "year" }), scatter(SCATTER))
    .mark(circle({ r: 4, fill: "country" }).name("kf"))
    .layer(
      chart(selectAll("kf"))
        .flow(group({ by: "country" }))
        .mark(time.transition({ along: "year", at: year }))
    )
    .toDisplayList({ w: W, h: H, axes: true });
}

async function level3(rows: any[], at: number) {
  const year = pausedClock(at);
  return chart(rows, { legend: false })
    .flow(group({ by: "year" }), scatter(SCATTER))
    .mark(blank())
    .layer(
      chart(rows)
        .flow(
          derive((d: any[]) =>
            interpolate(d, { along: "year", key: "country", at: year() })
          ),
          scatter(SCATTER)
        )
        .mark(circle({ r: 4, fill: "country" }))
    )
    .toDisplayList({ w: W, h: H, axes: true });
}

/** The sequence with nothing layered over it. A sequence is a band scale on
 *  time, so it holds one keyframe until the next one's year arrives — which is
 *  an animation already, and the same one a `curve: "step"` transition plays. */
async function sequenceAlone(rows: any[], at: number) {
  return chart(rows, { legend: false })
    .flow(
      time.sequence({ by: "year", duration: 5000, playing: false, at }),
      scatter(SCATTER)
    )
    .mark(circle({ r: 4, fill: "country" }))
    .toDisplayList({ w: W, h: H, axes: true });
}

/** The sugar with the step curve: the moving mark holds the previous
 *  keyframe's geometry instead of interpolating toward the next. */
async function stepTransition(rows: any[], at: number) {
  return chart(rows, { legend: false })
    .flow(
      time.sequence({ by: "year", duration: 5000, playing: false, at }),
      scatter(SCATTER)
    )
    .mark(circle({ r: 4, fill: "country" }))
    .layer(time.transition({ curve: "step" }))
    .toDisplayList({ w: W, h: H, axes: true });
}

/** The step reading of an animated sequence, checked where it has something to
 *  say: strictly between two keyframes. */
async function checkStep(gapminder: any[]): Promise<void> {
  const at = 1957.5;
  console.log(`\n## playhead ${at} — the sequence's own band`);
  const alone = circles(await sequenceAlone(gapminder, at));
  const stepped = circles(await stepTransition(gapminder, at));
  const smooth = circles(await level0(gapminder, at));

  ok(
    "a sequence alone draws one circle per country",
    alone.length === new Set(gapminder.map((d) => d.country)).size,
    `${alone.length} circles`
  );
  const diff = firstDifference(alone, stepped);
  ok("a sequence alone matches a step transition", diff === undefined, diff);
  ok(
    "and both differ from the default curve",
    firstDifference(alone, smooth) !== undefined
  );

  // The band's own claim: nothing moves inside `[1955, 1960)`, and the frame
  // changes the instant 1960 arrives. Compared against the sequence itself at
  // other playheads, so both sides share one set of inferred domains.
  const onKeyframe = circles(await sequenceAlone(gapminder, 1955));
  const lateInBand = circles(await sequenceAlone(gapminder, 1959.9));
  const nextBand = circles(await sequenceAlone(gapminder, 1960));
  ok(
    "the held frame is the band's own keyframe",
    firstDifference(alone, onKeyframe) === undefined,
    firstDifference(alone, onKeyframe)
  );
  ok(
    "nothing moves inside the band",
    firstDifference(alone, lateInBand) === undefined,
    firstDifference(alone, lateInBand)
  );
  ok(
    "and it jumps when the next keyframe arrives",
    firstDifference(alone, nextBand) !== undefined
  );
}

async function main(): Promise<void> {
  const gapminder = (await (data as any)["gapminder.json"]()) as any[];
  console.log("\n# Gapminder desugaring tower — one geometry, four spellings");

  for (const at of [1957.5, 1975]) {
    const kind = at === 1975 ? "exact keyframe" : "midpoint";
    console.log(`\n## playhead ${at} (${kind})`);
    const levels = [
      ["L0 sugar", await level0(gapminder, at)],
      ["L1 explicit key", await level1(gapminder, at)],
      ["L2 explicit clock", await level2(gapminder, at)],
      ["L3 data space", await level3(gapminder, at)],
    ] as const;
    const geometries = levels.map(([, doc]) => circles(doc));

    ok(
      "the sugar draws one circle per country",
      geometries[0].length === new Set(gapminder.map((d) => d.country)).size,
      `${geometries[0].length} circles`
    );
    for (let i = 1; i < levels.length; i++) {
      const diff = firstDifference(geometries[0], geometries[i]);
      ok(
        `${levels[i][0]} matches ${levels[0][0]}`,
        diff === undefined,
        diff
      );
    }
  }

  await checkStep(gapminder);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

await main();
