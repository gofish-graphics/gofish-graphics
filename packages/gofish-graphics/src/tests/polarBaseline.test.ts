/**
 * Polar's angular baseline: the number 0 on θ sits at `baselineAngle`, for
 * every polar coord, full circle or partial arc. A stack centered on 0 (a
 * diverging schema) is centered on the baseline angle; a range that starts at
 * 0 starts there, as before. σ still fits the whole θ range to the sweep.
 *
 * Run: `pnpm build && tsx src/tests/polarBaseline.test.ts` (wired as
 * `pnpm test:polar-baseline`). Imports from `dist` for the same lodash-ESM
 * reason as `stackOrigin.test.ts`.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { check, items, report } from "./testHelpers";

const { chart, stack, rect, Schema, Coord } = GoFish as any;

type Pt = [number, number];
const pointsOf = (d: string): Pt[] => {
  const nums = (d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
  const out: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
};
const key = ([x, y]: Pt) => `${x.toFixed(3)},${y.toFixed(3)}`;

/** Each wedge's angular span [from, to] in radians, counter-clockwise from
 *  3 o'clock (the plane is y-up, the display list y-down), in stack order.
 *  The center is the one point every wedge shares (its r = 0 corners). */
async function wedgeSpans(builder: any): Promise<[number, number][]> {
  const dl = await builder.toDisplayList({ w: 200, h: 200 });
  const paths = items(dl)
    .filter((it) => it.kind === "path")
    .map((it: any) => pointsOf(it.d));
  const shared = paths
    .map((ps: Pt[]) => new Set(ps.map(key)))
    .reduce((a: Set<string>, b: Set<string>) => new Set([...a].filter((k) => b.has(k))));
  const [cx, cy] = [...shared][0].split(",").map(Number);
  return paths.map((ps: Pt[]) => {
    const rim = ps.filter(([x, y]) => Math.hypot(x - cx, y - cy) > 1);
    // Unwrap the angles along the path so a wedge across ±π stays contiguous.
    let prev: number | undefined;
    const angles = rim.map(([x, y]) => {
      let a = Math.atan2(-(y - cy), x - cx);
      if (prev !== undefined) {
        while (a - prev > Math.PI) a -= 2 * Math.PI;
        while (prev - a > Math.PI) a += 2 * Math.PI;
      }
      prev = a;
      return a;
    });
    return [Math.min(...angles), Math.max(...angles)];
  });
}

const mid = ([a, b]: [number, number]) => (a + b) / 2;
/** Equal as angles (mod 2π). */
const sameAngle = (a: number, b: number) => {
  const d = (((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  return Math.abs(d) < 1e-3;
};

const LEVELS = ["a", "b", "c"];
const rows = [
  { r: "a", n: 1 },
  { r: "b", n: 2 },
  { r: "c", n: 1 },
];
const centered = (coord: any) =>
  chart(rows, {
    coord,
    axes: false,
    // b is the middle level: midpoint 1.5 is the middle of its cell.
    schema: { r: Schema.ordered(LEVELS).diverging({ midpoint: 1.5 }) },
  })
    .flow(stack({ by: "r", dir: "x", h: 50 }))
    .mark(rect({ w: "n" }));

async function main() {
  console.log("\n# a centered stack is centered on the baseline angle");
  for (const [label, coord, baseline] of [
    ["polar()", Coord.polar(), 0],
    [
      "polar({ baselineAngle: -π/2 })",
      Coord.polar({ baselineAngle: -Math.PI / 2 }),
      -Math.PI / 2,
    ],
    ["clock()", Coord.clock(), Math.PI / 2],
    [
      "polar({ centralAngle: π }) (a partial arc)",
      Coord.polar({ centralAngle: Math.PI }),
      0,
    ],
  ] as const) {
    const spans = await wedgeSpans(centered(coord));
    const b = spans[1];
    check(
      `${label}: the middle level is centered on the baseline angle`,
      sameAngle(mid(b), baseline),
      JSON.stringify(spans)
    );
  }

  console.log("\n# σ fits the whole range to the sweep");
  {
    // n = 1, 2, 1 over a full circle: b is half the circle, a and c a
    // quarter each.
    const spans = await wedgeSpans(centered(Coord.polar()));
    const widths = spans.map(([a, b]) => b - a);
    check(
      "full circle: the wedges are π/2, π, π/2",
      Math.abs(widths[0] - Math.PI / 2) < 1e-3 &&
        Math.abs(widths[1] - Math.PI) < 1e-3 &&
        Math.abs(widths[2] - Math.PI / 2) < 1e-3,
      JSON.stringify(widths)
    );
  }

  console.log("\n# a range that starts at 0 starts at the baseline angle");
  for (const [label, coord, baseline] of [
    ["polar()", Coord.polar(), 0],
    ["clock()", Coord.clock(), Math.PI / 2],
  ] as const) {
    const spans = await wedgeSpans(
      chart(rows, { coord, axes: false })
        .flow(stack({ by: "r", dir: "x", h: 50 }))
        .mark(rect({ w: "n" }))
    );
    // polar turns counter-clockwise, so the first wedge starts at its low
    // angle; clock turns clockwise, so it starts at its high angle.
    const start = label === "polar()" ? spans[0][0] : spans[0][1];
    check(
      `${label}: the first wedge starts at the baseline angle`,
      sameAngle(start, baseline),
      JSON.stringify(spans)
    );
  }

  report();
}

main();
