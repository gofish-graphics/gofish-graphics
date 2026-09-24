/**
 * The connected scatterplot drawn in over time, two ways, one geometry. Run:
 * `pnpm build && node --conditions browser --import tsx
 * src/tests/connectedScatterplot.test.ts` (wired as
 * `pnpm test:connected-scatterplot`).
 *
 * The two spellings are the rungs of the Gapminder tower's kind
 * (`gapminderTower.test.ts`):
 *
 *   SUGAR       a `time.sequence` keeping all its history (`history:
 *               Infinity`), with a `line` threaded through its keyframes. The
 *               line is cut at paint, by data time, at the playhead.
 *   DATA SPACE  what Animated Vega-Lite's compiler does for a line: keep the
 *               rows up to the playhead, append one row interpolated AT the
 *               playhead (`interpolate`, keyed by a constant column, like
 *               AVL's `':)'`), and draw an ordinary line through them. Every
 *               year is still laid out as a `blank()` so the axes get the
 *               whole run's domains.
 *
 * With straight segments the two agree exactly: the cut interpolates placed
 * geometry, the data-space rung interpolates data and places it, and a
 * fixed-domain scatter is affine in the interpolated quantities (animation
 * design note, section 4.1). They are compared as lists of non-degenerate
 * segments, so a zero-length segment the data-space rung draws when the
 * playhead sits exactly on a year (its appended row repeats that year's row)
 * does not count as a difference.
 */
import { nextTick, settle } from "./interactionDomSetup";
import { items, pausedClock } from "./animationTestHelpers";
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { drivingShifts } from "../data/drivingShifts";

const {
  blank,
  chart,
  circle,
  derive,
  group,
  interpolate,
  line,
  orthogonal,
  ribbon,
  scatter,
  selectAll,
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

const W = 500;
const H = 500;
const YEARS: [number, number] = [1956, 2010];
const EPS = 1e-6;
const OPTIONS = { w: W, h: H, axes: true };

/** The data's clock, parked at `at`. */
const clockAt = (at: number) => pausedClock(YEARS, 54 * 200, at);

/** One keyframe per year of `rows`, placed by miles and gas, on a sequence
 *  keeping `history` years and parked at `at`. Every chart here starts from
 *  it. */
const keyframes = (rows: any[], at: number, history: number) =>
  chart(rows).flow(
    time.sequence({ by: "year", on: clockAt(at), history }),
    scatter({ x: "miles", y: "gas" })
  );

type Point = [number, number];
type Segment = [Point, Point];

const samePoint = (p: Point, q: Point) =>
  Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;

/** The one path in a display list. */
function onePath(doc: any): any {
  const paths = items(doc).filter((item) => item.kind === "path");
  if (paths.length !== 1) throw new Error(`${paths.length} paths, not 1`);
  return paths[0];
}

/** The one line's straight segments, parsed out of its path data, with any
 *  zero-length ones dropped. Throws on anything but `M` and `L`: both rungs
 *  draw straight segments, so a curve would be a difference in itself. */
function lineSegments(doc: any): Segment[] {
  const d: string = onePath(doc).d;
  const commands = d.match(/[A-Za-z]/g) ?? [];
  if (commands.some((c) => c !== "M" && c !== "L")) {
    throw new Error(`not a straight path: ${d.slice(0, 80)}`);
  }
  const out: Segment[] = [];
  let at: Point | undefined;
  for (const [, cmd, x, y] of d.matchAll(/([ML])\s*([^,\s]+),([^\s]+)/g)) {
    const p: Point = [Number(x), Number(y)];
    if (cmd === "L" && at !== undefined && !samePoint(at, p)) {
      out.push([at, p]);
    }
    at = p;
  }
  return out;
}

/** The last point of the one path's data: the tip of a line drawn in up to
 *  the playhead, which is the path cut at the `u` matching the playhead. */
function lastPoint(doc: any): Point {
  const numbers = onePath(doc)
    .d.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/g)
    .map(Number);
  return [numbers[numbers.length - 2], numbers[numbers.length - 1]];
}

/** Report the first place two lines part company, or `undefined`. */
function firstDifference(a: Segment[], b: Segment[]): string | undefined {
  if (a.length !== b.length) return `${a.length} segments vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    for (const end of [0, 1] as const) {
      if (!samePoint(a[i][end], b[i][end])) {
        return (
          `segment ${i}, end ${end}: ${JSON.stringify(a[i][end])} vs ` +
          JSON.stringify(b[i][end])
        );
      }
    }
  }
  return undefined;
}

/** The AVL port, held still at `at`. */
async function sugar(at: number) {
  return keyframes(drivingShifts, at, Infinity)
    .mark(line({ along: "year", curve: "linear" }))
    .toDisplayList(OPTIONS);
}

/** The data-space rung: the rows up to `at`, plus one row interpolated at
 *  `at`, threaded by an ordinary line.
 *
 *  The whole run's keyframes come SECOND, as a tier of `blank()`s, rather
 *  than first with the line's chart layered over them as Gapminder's level 3
 *  does. Layered that way, the line's chart would be a `LayerBuilder` nested
 *  in another one, and the two name their first tiers' marks the same, so the
 *  line would thread both tiers' blanks. */
async function dataSpace(rows: any[], at: number) {
  return chart(rows)
    .flow(
      derive((d: any[]) => {
        const keyed = d.map((row) => ({ ...row, key: ":)" }));
        return [
          ...keyed.filter((row) => row.year <= at),
          ...interpolate(keyed, {
            along: "year",
            key: "key",
            at,
            method: "linear",
          }),
        ];
      }),
      group({ by: "year" }),
      scatter({ x: "miles", y: "gas" })
    )
    .mark(line({ along: "year", curve: "linear" }))
    .layer(
      chart(rows)
        .flow(group({ by: "year" }), scatter({ x: "miles", y: "gas" }))
        .mark(blank())
    )
    .toDisplayList(OPTIONS);
}

/** Everything but the line: the axes, whose ticks and labels must not move
 *  as the playhead does. */
const chrome = (doc: any): string =>
  JSON.stringify(
    items(doc)
      .filter((item) => item.kind !== "path")
      .map(({ id: _id, datum: _datum, ...rest }) => rest)
  );

async function main(): Promise<void> {
  console.log("\n# the sugar matches the data-space rung");
  const docs = new Map<number, any>();
  for (const at of [1956, 1962.5, 1979.25, 2010]) {
    const high = await sugar(at);
    docs.set(at, high);
    const diff = firstDifference(
      lineSegments(high),
      lineSegments(await dataSpace(drivingShifts, at))
    );
    ok(`at ${at}`, diff === undefined, diff);
  }

  const drawn = (at: number) => lineSegments(docs.get(at)).length;
  ok("on the first year, nothing is drawn yet", drawn(1956) === 0);
  ok(
    "at 1979.25 the line is 23 whole years and a quarter of the next",
    drawn(1979.25) === 24
  );
  ok("on the last year, the whole run is drawn", drawn(2010) === 54);
  ok(
    "the axes do not move as the line is drawn in",
    chrome(docs.get(1956)) === chrome(docs.get(2010))
  );

  console.log("\n# moving the playhead patches the path, and re-lays nothing");
  {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const clock = clockAt(1960);
    let resolves = 0;
    await chart(drivingShifts)
      .flow(
        // Counts pipeline runs; it reads no clock.
        derive((rows: any[]) => {
          resolves++;
          return rows;
        }),
        time.sequence({ by: "year", on: clock, history: Infinity }),
        scatter({ x: "miles", y: "gas" })
      )
      .mark(line({ along: "year", curve: "linear" }))
      .render(container, OPTIONS);
    await settle();
    const d = () => container.querySelector("path")?.getAttribute("d") ?? "";
    const before = d();
    clock.set(1979.25);
    await nextTick();
    const after = d();
    ok(
      "the path data follows the playhead",
      after !== before && after.length > before.length
    );
    ok(
      "to the same path the chart lowers at that playhead",
      firstDifference(
        lineSegments({ items: [{ kind: "path", d: after }] }),
        lineSegments(docs.get(1979.25))
      ) === undefined
    );
    ok("with no pipeline re-run", resolves === 1, `resolves=${resolves}`);
    container.remove();
  }

  console.log("\n# the dots show with the line");
  const dots = items(
    await keyframes(drivingShifts, 1979.25, Infinity)
      .mark(circle({ r: 4 }))
      .layer(line({ along: "year" }))
      .toDisplayList(OPTIONS)
  ).filter((item) => item.kind === "ellipse" && item.style?.opacity !== 0);
  ok(
    "every year up to the playhead is shown, 1956 through 1979",
    dots.length === 24,
    `${dots.length} dots`
  );

  console.log("\n# a moving dot leaves a trail, on the line's tip");
  {
    // Uneven steps in time, from one year to nineteen, so a smooth curve
    // whose knots were anything but the years would part company with the
    // moving dot.
    const years = [1956, 1957, 1960, 1966, 1967, 1975, 1990, 1991, 2010];
    const rows = drivingShifts.filter((d: any) => years.includes(d.year));
    /** The dots, a line threaded through them, and a transition moving one
     *  red dot over the same keyframes. The keyframe dots are white, so the
     *  moving dot is the only red one. */
    const trail = (
      at: number,
      curve: "linear" | "catmullRom" | "step",
      history = Infinity
    ) =>
      keyframes(rows, at, history)
        .mark(circle({ r: 4, fill: "white" }).name("dots"))
        .layer(
          line({ along: "year", curve: curve === "step" ? "linear" : curve })
        )
        .layer(
          chart(selectAll("dots")).mark(time.transition({ curve, fill: "red" }))
        )
        .toDisplayList(OPTIONS);
    const shownDots = (doc: any, fill: string) =>
      items(doc).filter(
        (item) =>
          item.kind === "ellipse" &&
          item.style?.fill === fill &&
          item.style?.opacity !== 0
      );
    /** Whether the one moving dot sits on the line's tip. The path data is
     *  written to four decimal places. */
    const onTip = (doc: any): boolean => {
      const moving = shownDots(doc, "red");
      const tip = lastPoint(doc);
      return (
        moving.length === 1 &&
        Math.abs(moving[0].cx - tip[0]) < 1e-3 &&
        Math.abs(moving[0].cy - tip[1]) < 1e-3
      );
    };
    for (const at of [1956.5, 1963, 1966, 1979.25, 2004.6]) {
      const doc = await trail(at, "linear");
      const white = shownDots(doc, "white").length;
      const reached = years.filter((y) => y < at).length;
      ok(
        `linear at ${at}: every year passed shows, and no other`,
        white === reached,
        `${white} vs ${reached}`
      );
      ok(`linear at ${at}: one moving dot, on the line's tip`, onTip(doc));
      const diff = firstDifference(
        lineSegments(doc),
        lineSegments(await dataSpace(rows, at))
      );
      ok(`linear at ${at}: the line is the data-space rung`, !diff, diff);
    }
    for (const at of [1956.5, 1958.7, 1963, 1966, 1970.25, 1983, 2000.9]) {
      ok(
        `catmullRom at ${at}: one moving dot, on the line's tip`,
        onTip(await trail(at, "catmullRom"))
      );
    }
    const stepped = await trail(1979.25, "step");
    ok(
      "step: the moving dot holds 1975, and every band already over shows",
      shownDots(stepped, "white").length ===
        years.filter((y, i) => i + 1 < years.length && years[i + 1] <= 1979.25)
          .length
    );
    for (const curve of ["linear", "catmullRom", "step"] as const) {
      const doc = await trail(1979.25, curve, 0);
      ok(
        `${curve} with no history: the moving dot alone`,
        shownDots(doc, "white").length === 0 &&
          shownDots(doc, "red").length === 1
      );
    }
  }

  console.log("\n# what is not built throws");
  const throws = async (build: () => Promise<unknown>, pattern: RegExp) => {
    try {
      await build();
      return "no error";
    } catch (e) {
      const message = String((e as Error).message);
      return pattern.test(message) ? undefined : message;
    }
  };
  const threaded = () =>
    keyframes(drivingShifts, 1979, Infinity).mark(circle({ r: 4 }));
  let why = await throws(
    () =>
      threaded()
        .layer(line({ along: "year", curve: orthogonal() }))
        .toDisplayList(OPTIONS),
    /"orthogonal" does not/
  );
  ok("a threaded line whose curve is a router", !why, why);
  why = await throws(
    () =>
      threaded()
        .layer(ribbon({ along: "year" }))
        .toDisplayList(OPTIONS),
    /a ribbon's band/
  );
  ok("a threaded ribbon", !why, why);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

await main();
