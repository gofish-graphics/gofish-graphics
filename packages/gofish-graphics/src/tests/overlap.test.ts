/**
 * `scatter`'s `overlap` option and the `separate()` strategy (#969). The pure
 * placement (`separateOffsets`) is checked for no pairwise overlap within the
 * padding, for each dot taking the free spot nearest the line, and for the
 * one-sided anchors. The rendered checks run a real chart and read the
 * ellipses back from its display list, and check the two errors (no free
 * axis; a non-linear space).
 *
 * Run: `pnpm build && tsx src/tests/overlap.test.ts` (wired as
 * `pnpm test:overlap`). The rendering checks import from `dist` for the same
 * lodash-ESM reason as `axisDims.test.ts`.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { separateOffsets, noiseOffsets, noiseOutline, silvermanBandwidth, resolveOverlap, sideSign, type OverlapItem, type OverlapSide } from "../ast/graphicalOperators/overlap";
import { separate, noise, sina, jitter } from "../families/overlap";
import { lcg } from "../util/lcg";

const { chart, scatter, spread, circle, Coord } = GoFish as any;
const noiseDist = (GoFish as any).Overlap.noise;

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function errorOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
}

const EPS = 1e-6;

/** The worst overlap among placed dots (positive = overlap, in pixels). */
function worstOverlap(
  items: OverlapItem[],
  ys: number[],
  padding: number
): number {
  let worst = -Infinity;
  for (let i = 0; i < items.length; i++)
    for (let j = 0; j < i; j++) {
      const d = Math.hypot(items[i].at - items[j].at, ys[i] - ys[j]);
      worst = Math.max(worst, items[i].r + items[j].r + padding - d);
    }
  return worst;
}

/**
 * Does every point strictly nearer the line than `ys[i]` (on the allowed
 * side) overlap some dot placed before `i`? Sampled every 0.05 px.
 */
function nearestFree(
  items: OverlapItem[],
  ys: number[],
  side: OverlapSide,
  padding: number
): string | undefined {
  for (let i = 0; i < items.length; i++) {
    const { at, r } = items[i];
    const sign = sideSign(side);
    const base = sign * r;
    const dist = Math.abs(ys[i] - base);
    const blockedAt = (y: number) =>
      items
        .slice(0, i)
        .some(
          (o, j) => Math.hypot(at - o.at, y - ys[j]) < r + o.r + padding - 1e-4
        );
    for (let d = 0; d < dist - 1e-3; d += 0.05) {
      const ys2 = sign === 0 ? [base + d, base - d] : [base + sign * d];
      if (ys2.some((y) => !blockedAt(y)))
        return `dot ${i} at ${ys[i].toFixed(3)} but ${d.toFixed(2)} from the line is free`;
    }
  }
  return undefined;
}

console.log("# separateOffsets: random dots and tied columns");
for (const [label, make] of [
  ["random", (rand: () => number) => ({ at: rand() * 200, r: 1 + rand() * 4 })],
  [
    "tied columns",
    (rand: () => number) => ({
      at: Math.floor(rand() * 8) * 5,
      r: 1 + Math.floor(rand() * 3),
    }),
  ],
] as const)
  for (const side of ["middle", "start", "end"] as const) {
    for (const padding of [0, 1.5]) {
      const rand = lcg(7);
      const items: OverlapItem[] = Array.from({ length: 150 }, () =>
        make(rand)
      );
      const ys = separateOffsets(items, side, padding);
      const worst = worstOverlap(items, ys, padding);
      const name = `${label}, ${side}, padding ${padding}`;
      check(
        `${name}: no two dots overlap within the padding`,
        worst <= EPS,
        `worst overlap ${worst}`
      );
      const miss = nearestFree(items, ys, side, padding);
      check(
        `${name}: each dot takes the free spot nearest the line`,
        miss === undefined,
        miss
      );
      if (side !== "middle")
        check(
          `${name}: every dot stays on its side of the line`,
          items.every((it, i) =>
            side === "start" ? ys[i] >= it.r - EPS : ys[i] <= -it.r + EPS
          )
        );
    }
  }

console.log("# separateOffsets: small cases");
{
  const ys = separateOffsets(
    [
      { at: 0, r: 3 },
      { at: 0, r: 3 },
      { at: 0, r: 3 },
    ],
    "middle",
    0
  );
  check(
    "three dots at one value: line, then one below, then one above",
    ys[0] === 0 &&
      Math.abs(Math.abs(ys[1]) - 6) < EPS &&
      Math.abs(ys[1] + ys[2]) < EPS,
    JSON.stringify(ys)
  );
  const apart = separateOffsets(
    [
      { at: 0, r: 3 },
      { at: 10, r: 3 },
    ],
    "middle",
    1
  );
  check(
    "dots that do not touch both stay on the line",
    apart.every((y) => y === 0)
  );
  const start = separateOffsets([{ at: 0, r: 4 }], "start", 0);
  check("a lone start dot rests its start edge on the line", start[0] === 4);
  check(
    "zero radius and zero padding: all on the line",
    separateOffsets(
      [
        { at: 1, r: 0 },
        { at: 1, r: 0 },
      ],
      "middle",
      0
    ).every((y) => y === 0)
  );
}

console.log("# separate(): strategy objects");
{
  check(
    "separate() is a plain object",
    JSON.stringify(separate()) === '{"kind":"separate"}'
  );
  check(
    "separate({ padding }) keeps the padding",
    JSON.stringify(separate({ padding: 2 })) ===
      '{"kind":"separate","padding":2}'
  );
  check(
    "a negative padding throws",
    (await errorOf(() => separate({ padding: -1 })))?.includes("padding") ===
      true
  );
  check(
    "an unknown kind throws",
    (
      await errorOf(() => resolveOverlap({ kind: "nope" } as any, [], "middle"))
    )?.includes("unknown strategy") === true
  );
}

/** Every ellipse in a display list, as a circle in pixels. */
const circlesOf = (dl: any): { cx: number; cy: number; r: number }[] => {
  const out: { cx: number; cy: number; r: number }[] = [];
  const walk = (it: any) => {
    if (it.kind === "ellipse") out.push({ cx: it.cx, cy: it.cy, r: it.rx });
    for (const c of it.children ?? []) walk(c);
  };
  dl.items.forEach(walk);
  return out;
};

console.log("# scatter overlap: rendered");
{
  const rand = lcg(3);
  const rows = Array.from({ length: 200 }, (_, i) => ({
    v: Math.round(rand() * 40),
    g: i % 2 === 0 ? "a" : "b",
  }));
  const dl = await chart(rows)
    .flow(
      scatter({
        x: "v",
        alignment: "middle",
        overlap: separate({ padding: 1 }),
      })
    )
    .mark(circle({ r: 3 }))
    .toDisplayList({ w: 400, h: 200 });
  const cs = circlesOf(dl);
  check("one circle per row", cs.length === rows.length, `${cs.length}`);
  let worst = -Infinity;
  for (let i = 0; i < cs.length; i++)
    for (let j = 0; j < i; j++)
      worst = Math.max(
        worst,
        cs[i].r +
          cs[j].r +
          1 -
          Math.hypot(cs[i].cx - cs[j].cx, cs[i].cy - cs[j].cy)
      );
  check(
    "no two rendered circles overlap within the padding",
    worst <= 1e-6,
    `${worst}`
  );
  const ys = cs.map((c) => c.cy);
  const spreadY = Math.max(...ys) - Math.min(...ys);
  check("the separated dots grow off the line", spreadY > 6, `${spreadY}`);
  // Same value ⇒ same x: the data axis is untouched.
  const byV = new Map<number, Set<number>>();
  rows.forEach((r, i) => {
    const s = byV.get(r.v) ?? new Set<number>();
    s.add(Math.round(cs[i].cx * 1000));
    byV.set(r.v, s);
  });
  check(
    "dots with the same value share their x",
    [...byV.values()].every((s) => s.size === 1)
  );

  const spreadDl = await chart(rows)
    .flow(
      spread({ by: "g", dir: "y", spacing: 10 }),
      scatter({ x: "v", alignment: "middle", overlap: separate() })
    )
    .mark(circle({ r: 3 }))
    .toDisplayList({ w: 400, h: 300 });
  const groups = circlesOf(spreadDl);
  const half = groups.length / 2;
  const maxA = Math.max(...groups.slice(0, half).map((c) => c.cy + c.r));
  const minB = Math.min(...groups.slice(half).map((c) => c.cy - c.r));
  const maxB = Math.max(...groups.slice(half).map((c) => c.cy + c.r));
  const minA = Math.min(...groups.slice(0, half).map((c) => c.cy - c.r));
  check(
    "under a spread, the measured separated rows do not overlap each other",
    maxA <= minB + 1e-6 || maxB <= minA + 1e-6,
    JSON.stringify({ minA, maxA, minB, maxB })
  );

  const both = await errorOf(() =>
    chart(rows)
      .flow(scatter({ x: "v", y: "v", overlap: separate() }))
      .mark(circle({ r: 3 }))
      .toDisplayList({ w: 400, h: 200 })
  );
  check(
    "overlap with both axes placed by fields throws",
    both?.includes("both x and y are placed") === true,
    both
  );

  const neither = await errorOf(() =>
    chart(rows)
      .flow(scatter({ alignment: "middle", overlap: separate() }))
      .mark(circle({ r: 3 }))
      .toDisplayList({ w: 400, h: 200 })
  );
  check(
    "overlap with neither axis placed by a field throws scatter's own clear error",
    neither?.includes("requires at least one of x or y") === true,
    neither
  );
  const inPolar = await errorOf(() =>
    chart(rows, { coord: Coord.polar() })
      .flow(scatter({ x: "v", overlap: separate() }))
      .mark(circle({ r: 3 }))
      .toDisplayList({ w: 400, h: 400 })
  );
  check(
    "overlap inside a polar space throws",
    inPolar?.includes("linear coordinate space") === true,
    inPolar
  );
}

console.log("# noise: outline and offsets");
{
  const rand = lcg(11);
  const normal = () =>
    Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  // 400 dots of radius 2 on a 2-px grid, normally spread over ~200 px.
  const items: OverlapItem[] = Array.from({ length: 400 }, () => ({
    at: Math.round((200 + 40 * normal()) / 2) * 2,
    r: 2,
  }));
  // The outline's area: its full width integrated over the data axis, by the
  // trapezoid rule over the dots in data order (positions without ties).
  const spreadItems: OverlapItem[] = Array.from({ length: 400 }, () => ({
    at: 200 + 40 * normal(),
    r: 2,
  }));
  const area = (half: ArrayLike<number>) => {
    const order = spreadItems
      .map((it, i) => i)
      .sort((a, b) => spreadItems[a].at - spreadItems[b].at);
    let s = 0;
    for (let k = 1; k < order.length; k++) {
      const [a, b] = [order[k - 1], order[k]];
      s += (spreadItems[b].at - spreadItems[a].at) * (half[a] + half[b]);
    }
    return s;
  };
  const dotArea = area(noiseOutline(spreadItems, 0));
  for (const w of [5, 20, 80]) {
    const smoothArea = area(noiseOutline(spreadItems, 0, w));
    check(
      `bandwidth ${w}px keeps the outline's total size (within 25%)`,
      Math.abs(smoothArea / dotArea - 1) < 0.25,
      `${smoothArea.toFixed(0)} vs ${dotArea.toFixed(0)}`
    );
  }
  const flat = noiseOutline(items, 0, Infinity);
  check(
    "smoothing Infinity gives a flat outline",
    Array.from(flat).every((h) => Math.abs(h - flat[0]) < 1e-9) && flat[0] > 0,
    `${flat[0]}`
  );
  const lone = noiseOutline(
    [
      { at: 0, r: 2 },
      { at: 50.3, r: 2 },
      { at: 100, r: 2 },
    ],
    0
  );
  check("a lone dot sits on the line", lone[1] === 0, `${lone[1]}`);
  // The edge correction is for the smoothing only, not the dot's own size,
  // so with no smoothing a lone dot at an end also sits on the line.
  check(
    "a lone dot at an end of the range sits on the line",
    lone[0] < 1e-9 && lone[2] < 1e-9,
    `${lone[0]}, ${lone[2]}`
  );
  const smoothedLone = noiseOutline(
    [
      { at: 0, r: 2 },
      { at: 50.3, r: 2 },
      { at: 100, r: 2 },
    ],
    0,
    3
  );
  check(
    "with smoothing, lone dots (ends included) still sit on the line",
    Array.from(smoothedLone).every((h) => h < 1e-9),
    `${Array.from(smoothedLone)}`
  );
  const tied = noiseOutline(
    [
      { at: 0, r: 2 },
      { at: 50, r: 2 },
      { at: 50, r: 2 },
      { at: 100, r: 2 },
    ],
    0
  );
  check(
    "two tied dots get the band of two dots (one pitch each way)",
    Math.abs(tied[1] - 4) < 0.02 && tied[1] === tied[2],
    `${tied[1]}`
  );
  // Two piles far apart: a bandwidth below their distance keeps two peaks,
  // with an empty gap between them.
  const bimodal: OverlapItem[] = [
    ...Array.from({ length: 50 }, (_, i) => ({ at: 100 + (i % 10), r: 2 })),
    { at: 150, r: 2 },
    ...Array.from({ length: 50 }, (_, i) => ({ at: 200 + (i % 10), r: 2 })),
  ];
  const twoPeaks = noiseOutline(bimodal, 0, 8);
  check(
    "the outline follows the data: two piles give two peaks",
    twoPeaks[50] < 0.01 && twoPeaks[0] > 10 && twoPeaks[51] > 10,
    `${twoPeaks[0]}, ${twoPeaks[50]}, ${twoPeaks[51]}`
  );
  // The grid sum matches the exact sum over every pair of dots: bells of
  // σ = √(σ_dot² + s²), divided by the smoothing bell's weight (bandwidth s)
  // inside the extent.
  {
    const s = 6;
    const pitch = 4;
    const sigma = Math.sqrt(pitch ** 2 / (2 * Math.PI) + s * s);
    const lo = Math.min(...spreadItems.map((it) => it.at)) - pitch / 2;
    const hi = Math.max(...spreadItems.map((it) => it.at)) + pitch / 2;
    const Phi = (z: number) => {
      // Numeric integral of the standard normal from -8 to z.
      let s = 0;
      const steps = 4000;
      const a = -8;
      const h = (z - a) / steps;
      for (let k = 0; k <= steps; k++) {
        const t = a + k * h;
        s += (k === 0 || k === steps ? 0.5 : 1) * Math.exp((-t * t) / 2);
      }
      return (s * h) / Math.sqrt(2 * Math.PI);
    };
    const got = noiseOutline(spreadItems, 0, s);
    let worst = 0;
    for (const i of [0, 7, 99, 250, 399]) {
      const x = spreadItems[i].at;
      let sum = 0;
      for (const it of spreadItems)
        sum += Math.exp(-((x - it.at) ** 2) / (2 * sigma * sigma));
      const density = sum / (sigma * Math.sqrt(2 * Math.PI));
      const inside = Phi((hi - x) / s) - Phi((lo - x) / s);
      const want = Math.max(0, (pitch * density) / inside - 1) * pitch;
      worst = Math.max(worst, Math.abs(got[i] - want) / Math.max(want, 1));
    }
    check(
      "the grid sum agrees with the exact Gaussian sum (within 0.5%)",
      worst < 0.005,
      `${worst}`
    );
  }
  check(
    "Silverman's rule matches R's bw.nrd0",
    Math.abs(
      silvermanBandwidth([1, 2, 3, 4, 10].map((at) => ({ at, r: 1 }))) -
        0.973585
    ) < 1e-5
  );
  check(
    "Silverman's rule uses the standard deviation when the IQR is 0",
    Math.abs(
      silvermanBandwidth([1, 1, 1, 1, 5].map((at) => ({ at, r: 1 }))) -
        1.166865
    ) < 1e-5
  );
  check(
    "Silverman's rule gives 0 for one value",
    silvermanBandwidth([3, 3, 3].map((at) => ({ at, r: 1 }))) === 0
  );
  check(
    "Silverman's rule gives 0 for fewer than two dots",
    silvermanBandwidth([{ at: 3, r: 1 }]) === 0
  );

  for (const randomness of ["blue", "quasi", "uniform"] as const) {
    const opts = { randomness, padding: 0, seed: 3 };
    const a = noiseOffsets(items, "middle", opts);
    const b = noiseOffsets(items, "middle", opts);
    check(
      `${randomness}: the same seed gives the same offsets`,
      a.every((y, i) => y === b[i])
    );
    const half = noiseOutline(items, 0);
    check(
      `${randomness}: every offset stays inside the outline`,
      a.every((y, i) => Math.abs(y) <= half[i] + 1e-9)
    );
    const start = noiseOffsets(items, "start", opts);
    check(
      `${randomness}: start keeps every dot on the positive side`,
      start.every((y, i) => y >= items[i].r - 1e-9)
    );
  }
  const otherSeed = (randomness: "blue" | "uniform" | "quasi") =>
    noiseOffsets(items, "middle", { randomness, padding: 0, seed: 4 });
  for (const randomness of ["blue", "uniform"] as const)
    check(
      `${randomness}: another seed gives other offsets`,
      otherSeed(randomness).some(
        (y, i) =>
          y !==
          noiseOffsets(items, "middle", { randomness, padding: 0, seed: 3 })[i]
      )
    );
  const q = resolveOverlap(noise({ randomness: "quasi" }), items, "middle");
  check(
    "quasi needs no seed: the default and seeded runs agree",
    q.every((y, i) => y === otherSeed("quasi")[i])
  );
}

console.log("# noise(), sina(), jitter(): strategy objects");
{
  check(
    "noise() is a plain object",
    JSON.stringify(noise()) === '{"kind":"noise"}'
  );
  check(
    "sina() is noise with a Silverman bandwidth",
    JSON.stringify(sina()) === '{"kind":"noise","smoothing":"silverman"}'
  );
  check(
    "jitter() is noise with uniform offsets in a flat band",
    JSON.stringify(jitter()) ===
      JSON.stringify({ kind: "noise", randomness: "uniform", smoothing: Infinity })
  );
  check(
    "options override the wrapper defaults",
    JSON.stringify(sina({ smoothing: 3, randomness: "quasi" })) ===
      '{"kind":"noise","randomness":"quasi","smoothing":3}' &&
      jitter({ randomness: "blue" }).randomness === "blue"
  );
  check(
    "an unknown randomness throws, naming the factory called",
    (await errorOf(() => sina({ randomness: "pink" as any })))?.includes(
      "sina: randomness"
    ) === true
  );
  check(
    "smoothing 0 is accepted",
    noise({ smoothing: 0 }).smoothing === 0
  );
  check(
    "a negative smoothing throws",
    (await errorOf(() => noise({ smoothing: -1 })))?.includes("smoothing") ===
      true
  );
  check(
    "a NaN smoothing throws",
    (await errorOf(() => noise({ smoothing: NaN })))?.includes("smoothing") ===
      true
  );
  check(
    "an unknown smoothing name throws",
    (await errorOf(() => noise({ smoothing: "scott" as any })))?.includes(
      "silverman"
    ) === true
  );
  check(
    "smoothing Infinity is accepted in JS",
    noise({ smoothing: Infinity }).smoothing === Infinity
  );
  const items = [0, 1, 1, 2, 2, 2, 3, 3, 4].map((at) => ({ at: at * 3, r: 2 }));
  const byDefault = resolveOverlap(noise(), items, "middle");
  const zero = resolveOverlap(noise({ smoothing: 0 }), items, "middle");
  check(
    "smoothing 0 needs no data scale and equals the default",
    zero.every((y, i) => y === byDefault[i])
  );
  check(
    "a tiny smoothing is nearly the default (bells add in quadrature)",
    resolveOverlap(noise({ smoothing: 1e-6 }), items, "middle", 1).every(
      (y, i) => Math.abs(y - byDefault[i]) < 1e-6
    )
  );
  check(
    "sina and jitter need no data scale (no unit to convert)",
    resolveOverlap(sina(), items, "middle").length === items.length &&
      resolveOverlap(jitter(), items, "middle").length === items.length
  );
  check(
    "a finite smoothing with no data scale throws",
    (
      await errorOf(() => resolveOverlap(noise({ smoothing: 2 }), items, "middle"))
    )?.includes("data units") === true
  );
}

console.log("# scatter overlap noise: rendered");
{
  const rand = lcg(5);
  const rows = Array.from({ length: 200 }, () => ({
    v: Math.round(rand() * 40),
  }));
  const render = (overlap?: unknown) =>
    chart(rows)
      .flow(scatter({ x: "v", alignment: "middle", overlap }))
      .mark(circle({ r: 3 }))
      .toDisplayList({ w: 400, h: 200 });
  const plain = circlesOf(await render());
  const jittered = circlesOf(await render(noiseDist({ smoothing: 5 })));
  check(
    "noise leaves every dot's data-axis position alone",
    plain.length === jittered.length &&
      plain.every((c, i) => Math.abs(c.cx - jittered[i].cx) < 1e-6)
  );
  const ys = jittered.map((c) => c.cy);
  check(
    "noise moves the dots along the free axis",
    Math.max(...ys) - Math.min(...ys) > 6
  );
  const again = circlesOf(await render(noiseDist({ smoothing: 5 })));
  check(
    "a jittered render is the same every time",
    again.every((c, i) => c.cy === jittered[i].cy)
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
