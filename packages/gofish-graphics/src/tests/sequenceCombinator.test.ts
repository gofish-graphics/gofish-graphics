/**
 * PROTOTYPE (animation grammar proposal): the combinator form of
 * `time.sequence`, which lowers to a timeline chain.
 *
 *   - It draws what the flow form draws: two gapminder years, held halfway
 *     between them (1957.5 in the flow form's year units, 2500 ms into the
 *     combinator's one 5000 ms gap), draw the same circles. The flow form
 *     loops by default, and a looping clock parked at its end reads the
 *     start again, so the flow form here plays once, as a non-cyclic
 *     combinator does.
 *   - It draws what the hand-written timeline chain draws, frame for frame,
 *     with and without `cyclic`.
 *   - `gap` takes one number or exactly one per gap (n − 1, or n when
 *     cyclic); any other length is a loud error naming the expected length.
 *   - `cyclic` wraps the last scene into the first: one turn is every scene
 *     and every gap, the wrap gap included.
 *   - `duration`, the total, as for a spread's `w`: inferred from the scenes
 *     and gaps when omitted; given, it scales the data-valued scene
 *     durations (`.duration(datum(v))`), and fixed durations and gaps do
 *     not flex. Nothing to flex, or a total smaller than the fixed part, is
 *     a loud error.
 *
 * Run: `pnpm build && node --conditions browser --import tsx
 * src/tests/sequenceCombinator.test.ts`.
 */
import { items } from "./animationTestHelpers";
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import data from "vega-datasets";

const {
  chart,
  circle,
  datum,
  rect,
  scatter,
  spread,
  stack,
  time,
  timeline,
  Animation,
  Curve,
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

async function throws(f: () => Promise<unknown>, ...parts: string[]) {
  try {
    await f();
  } catch (e) {
    const m = String((e as Error).message);
    return parts.every((p) => m.includes(p)) ? "" : m;
  }
  return "no error";
}

console.log("# the combinator draws what the flow form draws");
{
  const SCATTER = { by: "country", x: "fertility", y: "life_expect" };
  const OPTS = { w: 500, h: 400, axes: false };
  const tween = () => Animation.tween({ curve: Curve.linear() });

  const circles = (doc: any) =>
    items(doc)
      .filter((n: any) => n.kind === "ellipse" && n.style?.opacity !== 0)
      .map((n: any) => ({
        cx: n.cx,
        cy: n.cy,
        r: n.rx,
        fill: String(n.style?.fill ?? ""),
        opacity: n.style?.opacity ?? 1,
      }))
      .sort((a: any, b: any) => a.fill.localeCompare(b.fill) || a.cx - b.cx);

  const gapminder = (await (data as any)["gapminder.json"]()) as any[];
  const rows = gapminder.filter((d) => d.year === 1955 || d.year === 1960);
  const year = (y: number) => rows.filter((d) => d.year === y);

  for (const [flowAt, ms] of [
    [1955, 0],
    [1957.5, 2500],
    [1960, 5000],
  ]) {
    const flow = await chart(rows, { legend: false })
      .flow(
        time.sequence({ by: "year", duration: 5000, loop: false, playing: false, at: flowAt }),
        scatter(SCATTER)
      )
      .mark(circle({ r: 4, fill: "country" }).transition({ update: tween() }))
      .toDisplayList(OPTS);
    const keyframe = (y: number) =>
      chart(year(y), { legend: false })
        .flow(scatter(SCATTER))
        .mark(circle({ r: 4, fill: "country" }));
    const combinator = await time
      .sequence({ gap: 5000, playing: false, at: ms, key: "country" }, [
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
      `flow at ${flowAt} draws what the combinator draws at ${ms} ms (${a.length} circles)`,
      diff === undefined,
      diff
    );
  }
}

// Small scenes for the rest.
const rows = [
  { id: "a", g: "x", v: 1 },
  { id: "b", g: "x", v: 2 },
  { id: "c", g: "y", v: 3 },
];
const stacked = () =>
  chart(rows)
    .flow(spread({ by: "g", dir: "x" }), stack({ by: "id", dir: "y" }))
    .mark(rect({ h: "v", fill: "id" }));
const grouped = () =>
  chart(rows)
    .flow(spread({ by: "id", dir: "x" }))
    .mark(rect({ h: "v", fill: "id" }));
const OPTS = { w: 300, h: 200, axes: false, legend: false };

/** Every visible rect drawn at `at` ms, as a sorted string. */
const frame = async (mark: any, at: number) =>
  JSON.stringify(
    items(await mark.toDisplayList({ ...OPTS, playing: false, at }))
      .filter((n: any) => n.kind === "rect" && (n.style?.opacity ?? 1) > 0)
      .map((n: any) => [
        n.style?.fill,
        +n.x.toFixed(6),
        +n.y.toFixed(6),
        +n.w.toFixed(6),
        +n.h.toFixed(6),
        +(n.style?.opacity ?? 1).toFixed(6),
      ])
      .sort()
  );

console.log("# the combinator is the hand-written timeline chain");
{
  const ease = "cubicInOut";
  const sequence = (at: number, cyclic: boolean) =>
    time
      .sequence({ gap: cyclic ? [400, 600] : 400, cyclic, playing: false, at }, [
        stacked().duration(500),
        grouped().duration(700),
      ])
      .transition({ update: Animation.tween({ ease, curve: Curve.linear() }) });
  const chain = (at: number, cyclic: boolean) =>
    timeline({ cyclic, playing: false, at }, [
      stacked().name("s").duration(500),
      grouped().name("g").duration(700),
    ]).relate(({ s, g }: any) => [
      time.after(s, g, { gap: 400 }),
      time.transition(s, g, { ease, curve: Curve.linear() }),
      ...(cyclic
        ? [
            time.after(g, s, { gap: 600 }),
            time.transition(g, s, { ease, curve: Curve.linear() }),
          ]
        : []),
    ]);
  for (const cyclic of [false, true]) {
    const times = cyclic
      ? [0, 499, 500, 650, 900, 1300, 1600, 1700, 1900, 2199, 2200]
      : [0, 499, 500, 650, 900, 1300, 1600, 1700];
    const diffs: string[] = [];
    for (const t of times) {
      const [a, b] = [await frame(sequence(t, cyclic), t), await frame(chain(t, cyclic), t)];
      if (a !== b) diffs.push(`t=${t}: ${a} vs ${b}`);
    }
    ok(
      `${cyclic ? "cyclic: " : ""}the same frames at ${times.length} playheads`,
      diffs.length === 0,
      diffs[0]
    );
  }
}

console.log("# gap: one number, or exactly one per gap");
{
  const three = (gap: unknown, cyclic = false) => () =>
    time
      .sequence({ gap, cyclic }, [stacked(), grouped(), stacked()])
      .toDisplayList(OPTS);
  ok(
    "3 scenes, 3 gaps, not cyclic: error naming 2",
    "" === (await throws(three([1, 2, 3]), "exactly 2 gaps", "not 3"))
  );
  ok(
    "3 scenes, 2 gaps, cyclic: error naming 3",
    "" === (await throws(three([1, 2], true), "exactly 3 gaps", "not 2"))
  );
  ok(
    "3 scenes, 1 gap in a list: error",
    "" === (await throws(three([1]), "exactly 2 gaps"))
  );
  ok(
    "the old options are errors: hold",
    "" ===
      (await throws(
        () => time.sequence({ hold: 100 }, [stacked(), grouped()]).toDisplayList(OPTS),
        ".duration(ms)"
      ))
  );
}

console.log("# cyclic wraps the last scene into the first");
{
  // Two scenes of 500 ms, gaps 400 then 600 (the wrap): one turn is 2000 ms.
  const at = (t: number) =>
    time
      .sequence({ gap: [400, 600], cyclic: true, playing: false, at: t }, [
        stacked().duration(500),
        grouped().duration(500),
      ])
      .transition({ update: Animation.tween({ curve: Curve.linear() }) });
  const [s0, g, wrapMid, end] = [
    await frame(at(0), 0),
    await frame(at(1000), 1000),
    await frame(at(1700), 1700),
    await frame(at(2000), 2000),
  ];
  ok("at the end of the turn the first scene again", end === s0, `${end} vs ${s0}`);
  ok(
    "halfway through the wrap gap, neither scene: the morph",
    wrapMid !== s0 && wrapMid !== g && JSON.parse(wrapMid).length === 3,
    wrapMid
  );
}

console.log("# duration: inferred, or a fixed total the data-valued scenes fit");
{
  /** The scene showing at `t` among three scenes told apart by width. */
  const scenes = () => [
    chart([{ k: 1 }]).mark(rect({ w: 10, h: 10, fill: "a" })),
    chart([{ k: 1 }]).mark(rect({ w: 20, h: 10, fill: "a" })),
    chart([{ k: 1 }]).mark(rect({ w: 30, h: 10, fill: "a" })),
  ];
  const widthAt = async (seq: (t: number) => any, t: number) => {
    const shown = items(await seq(t).toDisplayList({ ...OPTS, playing: false, at: t }))
      .filter((n: any) => n.kind === "rect" && (n.style?.opacity ?? 1) > 0);
    return shown.length === 1 ? shown[0].w : `${shown.length} rects`;
  };
  // Inferred: 300 + 200 + 400 + 200 + 500 = 1600 ms, so the last scene
  // starts at 1100 and the clock ends at 1600.
  const inferred = (t: number) => {
    const [a, b, c] = scenes();
    return time.sequence({ gap: 200, playing: false, at: t }, [
      a.duration(300),
      b.duration(400),
      c.duration(500),
    ]);
  };
  ok(
    "inferred: the third scene starts at 300 + 200 + 400 + 200 = 1100 ms",
    (await widthAt(inferred, 1099)) !== 30 && (await widthAt(inferred, 1100)) === 30
  );
  // Fixed total 3000 ms: the data-valued scenes (datum(1), datum(2)) flex,
  // the fixed one (300 ms) and the gaps (2 × 200) do not.
  // σ = (3000 - 300 - 400) / (1 + 2) = 766.67 ms per unit, so the second
  // scene runs 300 + 200 = 500 to 500 + 766.67, and the third starts at
  // 500 + 766.67 + 200 = 1466.67 and ends at 3000.
  const fixed = (t: number) => {
    const [a, b, c] = scenes();
    return time.sequence({ gap: 200, duration: 3000, playing: false, at: t }, [
      a.duration(300),
      b.duration(datum(1)),
      c.duration(datum(2)),
    ]);
  };
  ok(
    "fixed total: the data-valued scenes flex, σ = 2300 / 3 ms per unit",
    (await widthAt(fixed, 500)) === 20 &&
      (await widthAt(fixed, 1266)) === 20 &&
      (await widthAt(fixed, 1467)) === 30 &&
      (await widthAt(fixed, 3000)) === 30,
    JSON.stringify([500, 1266, 1467, 3000])
  );
  ok(
    "a total with nothing to flex is an error naming the natural total",
    "" ===
      (await throws(
        () => {
          const [a, b] = scenes();
          return time
            .sequence({ gap: 200, duration: 5000 }, [a.duration(300), b.duration(400)])
            .toDisplayList(OPTS);
        },
        "nothing in it flexes",
        "900"
      ))
  );
  ok(
    "a total smaller than the fixed part is over-constrained",
    "" ===
      (await throws(
        () => {
          const [a, b] = scenes();
          return time
            .sequence({ gap: 200, duration: 400 }, [a.duration(300), b.duration(datum(1))])
            .toDisplayList(OPTS);
        },
        "over-constrained"
      ))
  );
  ok(
    "a data-valued duration with no total is an error",
    "" ===
      (await throws(
        () => {
          const [a, b] = scenes();
          return time
            .sequence({ gap: 200 }, [a.duration(300), b.duration(datum(1))])
            .toDisplayList(OPTS);
        },
        "has none"
      ))
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
