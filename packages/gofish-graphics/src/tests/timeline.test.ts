/**
 * PROTOTYPE (animation grammar proposal): `timeline([...]).relate(...)`.
 *
 *   - the interval rules (holds, `time.after` gaps, `time.align`, a scene no
 *     clause places starts at 0, a scene is drawn only over its interval);
 *   - a transition spans exactly the gap between two scenes;
 *   - the loud errors: a time clause on a layer, a spatial clause on a
 *     timeline, a hold shorter than the scene's build-in, a transition whose
 *     scenes overlap, over-constrained clauses, a cycle of afters,
 *     `duration` on a transition;
 *   - identity is the key join: rows by identity (default), by an explicit
 *     key, duplicates of a key are an error, data-less marks by name.
 *
 * Run: `pnpm build && node --conditions browser --import tsx
 * src/tests/timeline.test.ts`.
 */
import { items } from "./animationTestHelpers";
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";

const {
  chart,
  rect,
  circle,
  layer,
  scatter,
  spread,
  stack,
  time,
  timeline,
  Constraint,
  Animation,
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

/** The rects drawn at `at` ms (opacity > 0), sorted by fill then x. */
const drawn = async (mark: any, at: number) =>
  items(await mark.toDisplayList({ ...OPTS, playing: false, at }))
    .filter((n: any) => n.kind === "rect" && (n.style?.opacity ?? 1) > 0)
    .map((n: any) => ({ x: n.x, y: n.y, w: n.w, h: n.h, fill: n.style?.fill }))
    .sort((p: any, q: any) => String(p.fill).localeCompare(q.fill) || p.x - q.x);

const two = (gap: number, opts: Record<string, unknown> = {}) =>
  timeline([stacked().name("s").hold(1000), grouped().name("g").hold(1000)]).relate(
    ({ s, g }: any) => [
      time.after(s, g, { gap }),
      time.transition(s, g, { ease: "linear", ...opts }),
    ]
  );

console.log("# intervals: s is [0, 1000), the transition [1000, 1500), g [1500, 2500]");
{
  const tl = () => two(500);
  const [s0, s9, mid, g0, end] = await Promise.all(
    [0, 999, 1250, 1500, 2500].map((t) => drawn(tl(), t))
  );
  const alone = await drawn(stacked(), 0);
  const groupedAlone = await drawn(grouped(), 0);
  ok("at 0 the first scene is drawn, and only it", JSON.stringify(s0) === JSON.stringify(alone));
  ok("at 999 still the first scene", JSON.stringify(s9) === JSON.stringify(alone));
  ok(
    "at 1500 the second scene is drawn, and only it",
    JSON.stringify(g0) === JSON.stringify(groupedAlone),
    `${g0.length} vs ${groupedAlone.length}`
  );
  ok("the end instant holds the last scene", JSON.stringify(end) === JSON.stringify(groupedAlone));
  // Halfway through the gap every rect is halfway between its two places.
  const half = alone.map((a: any, i: number) => ({
    x: (a.x + groupedAlone[i].x) / 2,
    w: (a.w + groupedAlone[i].w) / 2,
  }));
  ok(
    "halfway through the gap the transition draws, halfway (matched by row)",
    mid.length === 3 &&
      mid.every(
        (m: any, i: number) =>
          Math.abs(m.x - half[i].x) < 1e-6 && Math.abs(m.w - half[i].w) < 1e-6
      ),
    JSON.stringify({ mid, half })
  );
}

console.log("# a zero gap is a cut");
{
  const cut = (t: number) =>
    drawn(
      timeline([stacked().name("s").hold(1000), grouped().name("g").hold(1000)]).relate(
        ({ s, g }: any) => [time.after(s, g), time.transition(s, g)]
      ),
      t
    );
  ok(
    "at 1000 the second scene, with nothing in between",
    JSON.stringify(await cut(1000)) === JSON.stringify(await drawn(grouped(), 0))
  );
}

console.log("# a scene no clause places starts at 0; align");
{
  const tl = (t: number) =>
    drawn(
      timeline([
        stacked().name("s").hold(1000),
        grouped().name("g").hold(400),
      ]).relate(({ s, g }: any) => [time.align({ t: "end" }, [s, g])]),
      t
    );
  ok("align end: g starts at 600, not before", (await tl(500)).length === 3);
  ok("both drawn at 700", (await tl(700)).length === 6);
  const free = timeline([stacked().name("s").hold(1000), grouped().name("g").hold(1000)]);
  ok("no clauses: both at 0", (await drawn(free, 10)).length === 6);
}

console.log("# a scene's build-in plays on the timeline's clock from its start");
{
  const black = async (t: number) =>
    items(
      await timeline([
        stacked().name("s").hold(1000),
        layer([
          grouped(),
          rect({ w: 10, h: 10, fill: "black" }).transition({
            enter: Animation.fadeIn({ delay: 200, duration: 200, ease: "linear" }),
          }),
        ])
          .name("g")
          .hold(1000),
      ])
        .relate(({ s, g }: any) => [time.after(s, g, { gap: 500 }), time.transition(s, g)])
        .toDisplayList({ ...OPTS, playing: false, at: t })
    )
      .filter((n: any) => n.style?.fill === "black")
      .map((n: any) => n.style?.opacity ?? 1);
  ok("during the transition the entering mark is left out", (await black(1250)).every((o) => o === 0));
  ok("at the scene's start + 100 it waits (delay)", (await black(1600)).every((o) => o === 0));
  ok(
    "at the scene's start + 300 it is half in",
    (await black(1800)).some((o) => Math.abs(o - 0.5) < 1e-6),
    JSON.stringify(await black(1800))
  );
}

console.log("# loud errors");
{
  ok(
    "a time clause on a layer names timeline",
    "" ===
      (await throws(
        () =>
          layer([stacked().name("s"), grouped().name("g")])
            .relate(({ s, g }: any) => [time.after(s, g)])
            .toDisplayList(OPTS),
        "timeline"
      ))
  );
  ok(
    "a spatial clause on a timeline names layer",
    "" ===
      (await throws(
        () =>
          timeline([stacked().name("s"), grouped().name("g")])
            .relate(({ s, g }: any) => [Constraint.align({ x: "middle" }, [s, g])])
            .toDisplayList(OPTS),
        "layer"
      ))
  );
  ok(
    "a hold shorter than the build-in",
    "" ===
      (await throws(
        () =>
          timeline([
            layer([rect({ w: 5, h: 5 }).transition({ enter: Animation.fadeIn({ duration: 800 }) })])
              .name("s")
              .hold(300),
          ]).toDisplayList(OPTS),
        ".hold(300)",
        "800"
      ))
  );
  ok(
    "a transition whose scenes overlap",
    "" ===
      (await throws(
        () =>
          timeline([stacked().name("s").hold(1000), grouped().name("g").hold(1000)])
            .relate(({ s, g }: any) => [time.transition(s, g)])
            .toDisplayList(OPTS),
        "before",
        "time.after"
      ))
  );
  ok(
    "over-constrained clauses",
    "" ===
      (await throws(
        () =>
          timeline([stacked().name("s").hold(1000), grouped().name("g").hold(1000)])
            .relate(({ s, g }: any) => [time.after(s, g), time.align({ t: "start" }, [s, g])])
            .toDisplayList(OPTS),
        "over-constrained"
      ))
  );
  ok(
    "a cycle of afters",
    "" ===
      (await throws(
        () =>
          timeline([stacked().name("s"), grouped().name("g")])
            .relate(({ s, g }: any) => [time.after(s, g), time.after(g, s)])
            .toDisplayList(OPTS),
        "cycle"
      ))
  );
  ok(
    "duration on a transition",
    "" ===
      (await throws(
        () =>
          timeline([stacked().name("s"), grouped().name("g")])
            .relate(({ s, g }: any) => [time.transition(s, g, { duration: 500 })])
            .toDisplayList(OPTS),
        "no duration"
      ))
  );
}

console.log("# identity: the key join");
{
  // Two different row objects per id: row identity does not match them, so
  // every rect fades; key: "id" matches them, so every rect moves.
  const copy = rows.map((r) => ({ ...r }));
  const other = () =>
    chart(copy)
      .flow(spread({ by: "id", dir: "x" }))
      .mark(rect({ h: "v", fill: "id" }));
  const mid = async (opts: Record<string, unknown>) =>
    items(
      await timeline([stacked().name("s").hold(100), other().name("g").hold(100)])
        .relate(({ s, g }: any) => [
          time.after(s, g, { gap: 100 }),
          time.transition(s, g, { ease: "linear", ...opts }),
        ])
        .toDisplayList({ ...OPTS, playing: false, at: 150 })
    ).filter((n: any) => n.kind === "rect" && (n.style?.opacity ?? 1) > 0);
  const byRows = await mid({});
  const byKey = await mid({ key: "id" });
  ok(
    "default (row identity): different rows do not match, so 6 marks fade",
    byRows.length === 6 && byRows.every((n: any) => n.style?.opacity === 0.5),
    JSON.stringify(byRows.map((n: any) => n.style?.opacity))
  );
  ok(
    "key: \"id\": the same ids match, so 3 marks move at full opacity",
    byKey.length === 3 && byKey.every((n: any) => (n.style?.opacity ?? 1) === 1),
    JSON.stringify(byKey.map((n: any) => n.style?.opacity))
  );
  ok(
    "a key two marks share is an error",
    "" ===
      (await throws(
        () =>
          two(500, { key: "g" }).toDisplayList({ ...OPTS, playing: false, at: 1250 }),
        "same key"
      ))
  );
  // Data-less marks match by name path.
  const diagram = (x: number) =>
    layer([
      circle({ r: 10, fill: "red" }).name("dot"),
      rect({ w: 10, h: 10, fill: "blue" }).name("box"),
    ]).relate(({ dot, box }: any) => [
      Constraint.distribute({ dir: "x", spacing: x }, [dot, box]),
    ]);
  const boxAt = async (t: number) =>
    items(
      await timeline([diagram(10).name("a").hold(100), diagram(110).name("b").hold(100)])
        .relate(({ a, b }: any) => [
          time.after(a, b, { gap: 100 }),
          time.transition(a, b, { ease: "linear" }),
        ])
        .toDisplayList({ ...OPTS, playing: false, at: t })
    ).filter((n: any) => n.kind === "rect" && (n.style?.opacity ?? 1) > 0);
  const [b0, b1, bm] = [await boxAt(0), await boxAt(200), await boxAt(150)];
  ok(
    "a data-less mark matches by name and moves halfway",
    bm.length === 1 && Math.abs(bm[0].x - (b0[0].x + b1[0].x) / 2) < 1e-6,
    JSON.stringify({ b0, b1, bm })
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
