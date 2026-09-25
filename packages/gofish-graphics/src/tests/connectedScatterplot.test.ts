/**
 * The connected scatterplot drawn in over time, two ways, one geometry. Run:
 * `pnpm build && node --conditions browser --import tsx
 * src/tests/connectedScatterplot.test.ts` (wired as
 * `pnpm test:connected-scatterplot`).
 *
 * The two spellings are the rungs of the Gapminder tower's kind
 * (`gapminderTower.test.ts`):
 *
 *   SUGAR       a `time.sequence` with a `time.history()` after it in the
 *               flow, so every year reached stays, and a `line` threaded
 *               through its keyframes. The line is drawn over the window of
 *               the marks it connects, cut at paint, by data time, at the
 *               playhead.
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
  animation,
  blank,
  chart,
  circle,
  derive,
  group,
  interpolate,
  layer,
  line,
  orthogonal,
  ribbon,
  scatter,
  selectAll,
  field,
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
 *  parked at `at`, with a `time.history({ last })` after it in the flow when
 *  `last` is given. Every chart here starts from it. */
const keyframes = (rows: any[], at: number, last?: number) =>
  last === undefined
    ? chart(rows).flow(
        time.sequence({ by: "year", on: clockAt(at) }),
        scatter({ x: "miles", y: "gas" })
      )
    : chart(rows).flow(
        time.sequence({ by: "year", on: clockAt(at) }),
        time.history({ last }),
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

/** Whether two paths' data hold the same numbers, to the four decimal places
 *  the path data is written to. */
function sameNumbers(a: string, b: string): boolean {
  const numbers = (d: string) =>
    (d.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/g) ?? []).map(Number);
  const [x, y] = [numbers(a), numbers(b)];
  return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 1e-3);
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
        time.sequence({ by: "year", on: clock }),
        time.history(),
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

  console.log("\n# a moving head over a trail, on the line's tip");
  {
    // Uneven steps in time, from one year to nineteen, so a smooth curve
    // whose knots were anything but the years would part company with the
    // moving dot.
    const years = [1956, 1957, 1960, 1966, 1967, 1975, 1990, 1991, 2010];
    const rows = drivingShifts.filter((d: any) => years.includes(d.year));
    /** Each year's mark is a white dot kept once reached (the trail) and a
     *  red dot that glides from year to year (the head), with a line layered
     *  over the year marks. The head is the only red dot. */
    const trail = (at: number, curve: "linear" | "catmullRom" | "step") =>
      keyframes(rows, at)
        .mark(
          layer([
            time.history([circle({ r: 4, fill: "white" })]),
            circle({ r: 4, fill: "red" }).transition({
              update: animation.tween({ curve }),
            }),
          ])
        )
        .layer(
          line({ along: "year", curve: curve === "step" ? "linear" : curve })
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
      // The trail includes the year the playhead is in.
      const reached = years.filter((y) => y <= at).length;
      ok(
        `linear at ${at}: every year reached shows, the current one included`,
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
      "step: the trail is the same, whatever the head does",
      shownDots(stepped, "white").length ===
        years.filter((y) => y <= 1979.25).length &&
        shownDots(stepped, "red").length === 1
    );
  }

  console.log("\n# the line takes its window from the marks it connects");
  {
    const lineOver = async (mark: unknown, at = 1979.25) =>
      onePath(
        await keyframes(drivingShifts, at)
          .mark(mark)
          .layer(line({ along: "year", curve: "linear" }))
          .toDisplayList(OPTIONS)
      ).d as string;
    ok(
      "a bare sequence: every mark lives for its band, so no line",
      (await lineOver(circle({ r: 4 }))) === ""
    );
    const flowForm = onePath(await sugar(1979.25)).d as string;
    ok(
      "a history around the marks: the line runs up to the playhead",
      sameNumbers(await lineOver(time.history([circle({ r: 4 })])), flowForm)
    );
    ok(
      "a mark of parts: the line follows its longest-lived part",
      sameNumbers(
        await lineOver(
          layer([time.history([circle({ r: 4 })]), circle({ r: 4 })])
        ),
        flowForm
      )
    );
    const comet = onePath(
      await keyframes(drivingShifts, 1979.25, 10)
        .mark(line({ along: "year", curve: "linear" }))
        .toDisplayList(OPTIONS)
    ).d as string;
    ok(
      "a history of ten years: the line keeps ten years, cut at both ends",
      lineSegments({ items: [{ kind: "path", d: comet }] }).length === 11 &&
        sameNumbers(
          await lineOver(
            layer([time.history({ last: 10 }, [circle({ r: 4 })]), blank()])
          ),
          comet
        )
    );
  }

  console.log("\n# the flow form is the wrapper form at another depth");
  // The line is given its stroke: left to its default it takes the color of
  // the first mark it connects, and a time.history has none of its own.
  for (const last of [0, 3, Infinity]) {
    const flow = await keyframes(drivingShifts, 1979.25, last)
      .mark(circle({ r: 4 }))
      .layer(line({ along: "year", stroke: "black" }))
      .toDisplayList(OPTIONS);
    const wrapper = await keyframes(drivingShifts, 1979.25)
      .mark(time.history({ last }, [circle({ r: 4 })]))
      .layer(line({ along: "year", stroke: "black" }))
      .toDisplayList(OPTIONS);
    const drawn = (doc: any) =>
      JSON.stringify(
        items(doc).map(({ id: _id, datum: _datum, ...rest }) => rest)
      );
    ok(`last ${last}: the same picture`, drawn(flow) === drawn(wrapper));
  }

  console.log("\n# a line through the keyframes backward in time");
  {
    // The same run with its rows in the other order: the line threads the
    // years from 2010 back to 1956, which is the same path read the other
    // way, and it is drawn in forward in time all the same.
    const backward = [...drivingShifts].reverse();
    const straight = await keyframes(backward, 1979.25, Infinity)
      .mark(line({ along: "year", curve: "linear" }))
      .toDisplayList(OPTIONS);
    const diff = firstDifference(
      lineSegments(straight),
      lineSegments(docs.get(1979.25))
    );
    ok("a straight line is the line drawn forward", !diff, diff);
    const smooth = async (rows: any[]) =>
      onePath(
        await keyframes(rows, 1979.25, Infinity)
          .mark(line({ along: "year" }))
          .toDisplayList(OPTIONS)
      ).d as string;
    ok(
      "a smooth line is the same curve, cut at the same point",
      sameNumbers(await smooth(backward), await smooth(drivingShifts))
    );
  }

  console.log("\n# the curve's knots are the times the line is cut by");
  {
    // A sequence keyed by five-year bins holds one row per bin, at a year
    // that is not the bin's start. The line is cut by the keyframes' times,
    // the bin starts, so its curve has to be knotted at them too: it must
    // match a line through the same points at the bin starts themselves.
    const starts = [1960, 1965, 1970, 1975, 1980, 1985];
    const inBin = (year: number) =>
      starts.find((s) => s <= year && year < s + 5)!;
    const offStart = drivingShifts.filter((d: any) =>
      [1960, 1966, 1972, 1977, 1983, 1989].includes(d.year)
    );
    const atStart = offStart.map((d: any) => ({ ...d, year: inBin(d.year) }));
    const tip = async (rows: any[], by: unknown) =>
      lastPoint(
        await chart(rows)
          .flow(
            time.sequence({ by, on: clockAt(1972.5) }),
            time.history(),
            scatter({ x: "miles", y: "gas" })
          )
          .mark(line({ along: "year" }))
          .toDisplayList(OPTIONS)
      );
    const [binned, plain] = [
      await tip(offStart, field("year").bin({ thresholds: starts.slice(1) })),
      await tip(atStart, "year"),
    ];
    ok(
      "a binned sequence's line is cut on its own curve",
      Math.abs(binned[0] - plain[0]) < 1e-3 &&
        Math.abs(binned[1] - plain[1]) < 1e-3,
      `${JSON.stringify(binned)} vs ${JSON.stringify(plain)}`
    );
  }

  console.log("\n# laying the chart out again");
  for (const last of [undefined, Infinity]) {
    // A second layout of the same nodes sets the visibility rules again, and
    // must neither pile them up nor lose the moving label, whose drawing is
    // lent even after the keyframe's own label is silenced.
    const node = await keyframes(drivingShifts.slice(0, 6), 1958.5, last)
      .mark(circle({ r: 4 }).label("year"))
      .layer(time.transition())
      .resolve();
    const shown = (doc: any) =>
      items(doc)
        .filter(
          (item) =>
            (item.kind === "ellipse" || item.kind === "text") &&
            item.style?.opacity !== 0
        )
        .map((item) => `${item.kind}:${item.text ?? ""}`)
        .sort()
        .join(",");
    const first = shown(await node.toDisplayList(OPTIONS));
    const again = shown(await node.toDisplayList(OPTIONS));
    ok(
      `history ${last}: the second layout shows what the first did`,
      first === again && first.includes("text:"),
      `${first} vs ${again}`
    );
  }

  console.log("\n# a cyclic sequence");
  {
    // Ten days around a loop, so day 10 sits next to day 1.
    const loopDays = Array.from({ length: 10 }, (_, i) => ({
      day: i + 1,
      x: Math.cos((2 * Math.PI * i) / 10),
      y: Math.sin((2 * Math.PI * i) / 10),
    }));
    /** One keyframe a day, placed by x and y, on a clock parked at `at`,
     *  with the sequence's `cyclic` option and a history of `last`. */
    const days = (at: number, cyclic: boolean | number, last?: number) =>
      chart(loopDays).flow(
        time.sequence({
          by: "day",
          on: pausedClock([1, 11], 10000, at),
          cyclic,
        }),
        ...(last === undefined ? [] : [time.history({ last })]),
        scatter({ x: "x", y: "y" })
      );
    const shownDays = async (
      at: number,
      cyclic: boolean | number,
      last?: number
    ) =>
      items(
        await days(at, cyclic, last)
          .mark(circle({ r: 4 }))
          .toDisplayList(OPTIONS)
      )
        .map((item, i) => ({ item, i }))
        .filter(({ item }) => item.kind === "ellipse")
        .filter(({ item }) => item.style?.opacity !== 0).length;
    const dayCenters = items(
      await days(1, true, Infinity).mark(circle({ r: 4 })).toDisplayList(OPTIONS)
    )
      .filter((item) => item.kind === "ellipse")
      .map((item) => [item.cx, item.cy] as Point);
    const between = (p: Point, q: Point, u: number): Point => [
      p[0] + u * (q[0] - p[0]),
      p[1] + u * (q[1] - p[1]),
    ];
    const near = (p: Point, q: Point) =>
      Math.abs(p[0] - q[0]) < 1e-3 && Math.abs(p[1] - q[1]) < 1e-3;

    ok(
      "cyclic: true infers the period as the span plus one step",
      (await shownDays(10.5, true)) === 1 &&
        (await shownDays(10.5, true, 0.2)) === 1
    );
    ok(
      "a history across the seam: day 2 with 3 days back shows 9, 10, 1, 2",
      (await shownDays(2, true, 3)) === 4
    );
    ok(
      "without cyclic the same history stops at day 1",
      (await shownDays(2, false, 3)) === 2
    );
    // With a period of 12 the cycle is 1 to 13, so at 11.5 the last band
    // still holds; with the inferred 10 the playhead is back on day 1.
    const heldAt = async (cyclic: boolean | number) =>
      items(
        await days(11.5, cyclic)
          .mark(circle({ r: 4 }))
          .toDisplayList(OPTIONS)
      ).findIndex(
        (item) => item.kind === "ellipse" && item.style?.opacity !== 0
      );
    ok(
      "a number overrides the inferred period",
      (await heldAt(12)) !== (await heldAt(true))
    );

    // A threaded line across the seam, straight so its geometry is exact.
    const lineAt = async (at: number, last: number) =>
      lineSegments(
        await days(at, true, last)
          .mark(line({ along: "day", curve: "linear" }))
          .toDisplayList(OPTIONS)
      );
    const seam = await lineAt(1.5, 2);
    ok(
      "a line joins the last keyframe to the first under the history window",
      seam.length === 3 &&
        near(seam[0][0], between(dayCenters[8], dayCenters[9], 0.5)) &&
        near(seam[0][1], dayCenters[9]) &&
        near(seam[1][1], dayCenters[0]) &&
        near(seam[2][1], between(dayCenters[0], dayCenters[1], 0.5)),
      JSON.stringify(seam)
    );
    // A head gliding across the seam sits on the tip of a smooth line.
    const glide = async (at: number) => {
      const doc = await days(at, true)
        .mark(
          layer([
            time.history({ last: 2 }, [circle({ r: 4, fill: "white" })]),
            circle({ r: 4, fill: "red" }).transition({
              update: animation.tween(),
            }),
          ])
        )
        .layer(line({ along: "day" }))
        .toDisplayList(OPTIONS);
      const head = items(doc).filter(
        (item) =>
          item.kind === "ellipse" &&
          item.style?.fill === "red" &&
          item.style?.opacity !== 0
      );
      return { head, tip: lastPoint(doc) };
    };
    for (const at of [10.25, 10.5, 10.9, 1.2]) {
      const { head, tip } = await glide(at);
      ok(
        `a head at ${at} glides across the seam on the line's tip`,
        head.length === 1 && near([head[0].cx, head[0].cy], tip),
        JSON.stringify({ head: head.map((h: any) => [h.cx, h.cy]), tip })
      );
    }
    const { head: midSeam } = await glide(10.5);
    ok(
      "and between the last keyframe and the first, not flying back",
      Math.hypot(
        midSeam[0].cx - (dayCenters[9][0] + dayCenters[0][0]) / 2,
        midSeam[0].cy - (dayCenters[9][1] + dayCenters[0][1]) / 2
      ) < 20
    );

    const why = await (async () => {
      try {
        await days(1, 5).mark(circle({ r: 4 })).toDisplayList(OPTIONS);
        return "no error";
      } catch (e) {
        const message = String((e as Error).message);
        return /more than one period/.test(message) ? undefined : message;
      }
    })();
    ok("keyframes spanning more than one period throw", !why, why);
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
  // A run that goes back and forth in time cannot be drawn in one way.
  const zigzag = drivingShifts.map((d: any) =>
    d.year === 1960
      ? { ...d, year: 1961 }
      : d.year === 1961
        ? { ...d, year: 1960 }
        : d
  );
  why = await throws(
    () =>
      keyframes(zigzag, 1979, Infinity)
        .mark(line({ along: "year" }))
        .toDisplayList(OPTIONS),
    /back and forth in time/
  );
  ok("a threaded line that goes back and forth in time", !why, why);
  why = await throws(
    () =>
      threaded()
        .layer(time.history([line({ along: "year" })]))
        .toDisplayList(OPTIONS),
    /a time.history around the line/
  );
  ok("a time.history around a threaded line", !why, why);
  why = await throws(async () => time.history({ last: -1 }), /at least 0/);
  ok("a negative last", !why, why);
  // A sequence's field has to be a number, with or without a clock of its own.
  const labelled = drivingShifts.map((d: any) => ({
    ...d,
    label: `y${d.year}`,
  }));
  for (const clock of [{ on: clockAt(1979) }, {}]) {
    why = await throws(
      () =>
        chart(labelled)
          .flow(
            time.sequence({ by: "label", ...clock }),
            scatter({ x: "miles", y: "gas" })
          )
          .mark(circle({ r: 4 }))
          .toDisplayList(OPTIONS),
      /"label" has a value that is not a number/
    );
    ok(
      `a sequence over labels, ${"on" in clock ? "on a given clock" : "on its own clock"}`,
      !why,
      why
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

await main();
