/**
 * `scatter`'s `overlap` option and the `swarm()` strategy (#969). The pure
 * placement (`swarmOffsets`) is checked for no pairwise overlap within the
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
import {
  swarmOffsets,
  swarm,
  jitter,
  jitterOffsets,
  jitterOutline,
  resolveOverlap,
  type OverlapItem,
  type OverlapSide,
} from "../ast/graphicalOperators/overlap";

const { chart, scatter, spread, circle, polar } = GoFish as any;
const jitterDist = (GoFish as any).jitter;

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

/** A seeded generator, so the random cases are the same every run. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (1664525 * s + 1013904223) % 4294967296) / 4294967296;
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
    const base = side === "start" ? r : side === "end" ? -r : 0;
    const dist = Math.abs(ys[i] - base);
    const blockedAt = (y: number) =>
      items
        .slice(0, i)
        .some(
          (o, j) =>
            Math.hypot(at - o.at, y - ys[j]) < r + o.r + padding - 1e-4
        );
    for (let d = 0; d < dist - 1e-3; d += 0.05) {
      const ys2 =
        side === "middle" ? [base + d, base - d] : [side === "start" ? base + d : base - d];
      if (ys2.some((y) => !blockedAt(y)))
        return `dot ${i} at ${ys[i].toFixed(3)} but ${d.toFixed(2)} from the line is free`;
    }
  }
  return undefined;
}

console.log("# swarmOffsets: random dots");
for (const side of ["middle", "start", "end"] as const) {
  for (const padding of [0, 1.5]) {
    const rand = lcg(7);
    const items: OverlapItem[] = Array.from({ length: 150 }, () => ({
      at: rand() * 200,
      r: 1 + rand() * 4,
    }));
    const ys = swarmOffsets(items, side, padding);
    const worst = worstOverlap(items, ys, padding);
    check(
      `${side}, padding ${padding}: no two dots overlap within the padding`,
      worst <= EPS,
      `worst overlap ${worst}`
    );
    const miss = nearestFree(items, ys, side, padding);
    check(
      `${side}, padding ${padding}: each dot takes the free spot nearest the line`,
      miss === undefined,
      miss
    );
    if (side !== "middle")
      check(
        `${side}, padding ${padding}: every dot stays on its side of the line`,
        items.every((it, i) =>
          side === "start" ? ys[i] >= it.r - EPS : ys[i] <= -it.r + EPS
        )
      );
  }
}

console.log("# swarmOffsets: small cases");
{
  const ys = swarmOffsets(
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
    ys[0] === 0 && Math.abs(Math.abs(ys[1]) - 6) < EPS && Math.abs(ys[1] + ys[2]) < EPS,
    JSON.stringify(ys)
  );
  const apart = swarmOffsets(
    [
      { at: 0, r: 3 },
      { at: 10, r: 3 },
    ],
    "middle",
    1
  );
  check("dots that do not touch both stay on the line", apart.every((y) => y === 0));
  const start = swarmOffsets([{ at: 0, r: 4 }], "start", 0);
  check("a lone start dot rests its start edge on the line", start[0] === 4);
  check(
    "zero radius and zero padding: all on the line",
    swarmOffsets(
      [
        { at: 1, r: 0 },
        { at: 1, r: 0 },
      ],
      "middle",
      0
    ).every((y) => y === 0)
  );
}

console.log("# swarm(): strategy objects");
{
  check("swarm() is a plain object", JSON.stringify(swarm()) === '{"kind":"swarm"}');
  check(
    "swarm({ padding }) keeps the padding",
    JSON.stringify(swarm({ padding: 2 })) === '{"kind":"swarm","padding":2}'
  );
  check(
    "a negative padding throws",
    (await errorOf(() => swarm({ padding: -1 })))?.includes("padding") === true
  );
  check(
    "an unknown kind throws",
    (await errorOf(() =>
      resolveOverlap({ kind: "nope" } as any, [], "middle")
    ))?.includes("unknown strategy") === true
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
      scatter({ x: "v", alignment: "middle", overlap: swarm({ padding: 1 }) })
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
        cs[i].r + cs[j].r + 1 - Math.hypot(cs[i].cx - cs[j].cx, cs[i].cy - cs[j].cy)
      );
  check("no two rendered circles overlap within the padding", worst <= 1e-6, `${worst}`);
  const ys = cs.map((c) => c.cy);
  const spreadY = Math.max(...ys) - Math.min(...ys);
  check("the swarm grows off the line", spreadY > 6, `${spreadY}`);
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
      scatter({ x: "v", alignment: "middle", overlap: swarm() })
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
    "under a spread, the measured swarm rows do not overlap each other",
    maxA <= minB + 1e-6 || maxB <= minA + 1e-6,
    JSON.stringify({ minA, maxA, minB, maxB })
  );

  const both = await errorOf(() =>
    chart(rows)
      .flow(scatter({ x: "v", y: "v", overlap: swarm() }))
      .mark(circle({ r: 3 }))
      .toDisplayList({ w: 400, h: 200 })
  );
  check(
    "overlap with both axes placed by fields throws",
    both?.includes("both x and y are placed") === true,
    both
  );
  const inPolar = await errorOf(() =>
    chart(rows, { coord: polar() })
      .flow(scatter({ x: "v", overlap: swarm() }))
      .mark(circle({ r: 3 }))
      .toDisplayList({ w: 400, h: 400 })
  );
  check(
    "overlap inside a polar space throws",
    inPolar?.includes("linear coordinate space") === true,
    inPolar
  );
}

console.log("# jitter: outline and offsets");
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
  const dotArea = area(jitterOutline(spreadItems, 0));
  for (const w of [20, 60]) {
    const smoothArea = area(jitterOutline(spreadItems, 0, w));
    check(
      `smoothing ${w}px keeps the outline's total size (within 25%)`,
      Math.abs(smoothArea / dotArea - 1) < 0.25,
      `${smoothArea.toFixed(0)} vs ${dotArea.toFixed(0)}`
    );
  }
  const flat = jitterOutline(items, 0, Infinity);
  check(
    "smoothing Infinity gives a flat outline",
    Array.from(flat).every((h) => Math.abs(h - flat[0]) < 1e-9) && flat[0] > 0,
    `${flat[0]}`
  );
  const lone = jitterOutline([{ at: 0, r: 2 }, { at: 100, r: 2 }], 0);
  check("a lone dot sits on the line", lone[0] === 0 && lone[1] === 0);

  for (const randomness of ["blue", "quasi", "uniform"] as const) {
    const opts = { randomness, padding: 0, seed: 3 };
    const a = jitterOffsets(items, "middle", opts);
    const b = jitterOffsets(items, "middle", opts);
    check(
      `${randomness}: the same seed gives the same offsets`,
      a.every((y, i) => y === b[i])
    );
    const half = jitterOutline(items, 0);
    check(
      `${randomness}: every offset stays inside the outline`,
      a.every((y, i) => Math.abs(y) <= half[i] + 1e-9)
    );
    const start = jitterOffsets(items, "start", opts);
    check(
      `${randomness}: start keeps every dot on the positive side`,
      start.every((y, i) => y >= items[i].r - 1e-9)
    );
  }
  const otherSeed = (randomness: "blue" | "uniform" | "quasi") =>
    jitterOffsets(items, "middle", { randomness, padding: 0, seed: 4 });
  for (const randomness of ["blue", "uniform"] as const)
    check(
      `${randomness}: another seed gives other offsets`,
      otherSeed(randomness).some(
        (y, i) =>
          y !==
          jitterOffsets(items, "middle", { randomness, padding: 0, seed: 3 })[i]
      )
    );
  const q = resolveOverlap(jitter({ randomness: "quasi" }), items, "middle");
  check(
    "quasi needs no seed: the default and seeded runs agree",
    q.every((y, i) => y === otherSeed("quasi")[i])
  );
}

console.log("# jitter(): strategy objects");
{
  check(
    "jitter() is a plain object",
    JSON.stringify(jitter()) === '{"kind":"jitter"}'
  );
  check(
    "an unknown randomness throws",
    (await errorOf(() => jitter({ randomness: "pink" as any })))?.includes(
      "randomness"
    ) === true
  );
  check(
    "a non-positive smoothing throws",
    (await errorOf(() => jitter({ smoothing: 0 })))?.includes("smoothing") ===
      true
  );
  check(
    "smoothing Infinity is accepted in JS",
    jitter({ smoothing: Infinity }).smoothing === Infinity
  );
}

console.log("# scatter overlap jitter: rendered");
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
  const jittered = circlesOf(await render(jitterDist({ smoothing: 5 })));
  check(
    "jitter leaves every dot's data-axis position alone",
    plain.length === jittered.length &&
      plain.every((c, i) => Math.abs(c.cx - jittered[i].cx) < 1e-6)
  );
  const ys = jittered.map((c) => c.cy);
  check(
    "jitter moves the dots along the free axis",
    Math.max(...ys) - Math.min(...ys) > 6
  );
  const again = circlesOf(await render(jitterDist({ smoothing: 5 })));
  check(
    "a jittered render is the same every time",
    again.every((c, i) => c.cy === jittered[i].cy)
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
