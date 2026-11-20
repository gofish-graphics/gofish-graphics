/**
 * A stack of bands: where `stackPlaces` lays each band
 * (its offset along u, and the interval it covers), and what a stacked
 * area draws. Covers the stack's interval as the maximum of the pointwise
 * sum, every band keeping its thickness at its knots, the `middle` baseline
 * as d3's `stackOffsetSilhouette`, the `wiggle` baseline near d3's
 * `stackOffsetWiggle` and independent of where the rows are sampled, series
 * sampled at different x, and the error for a part that is not a band.
 *
 * Run: `pnpm build && tsx src/tests/stackProfile.test.ts` (wired as
 * `pnpm test:stack-profile`). The rendering checks import from `dist` for
 * the same lodash-ESM reason as `axisDims.test.ts`.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import * as F from "../ast/fun";
import {
  CONTINUOUS,
  withProfile,
  type CONTINUOUS_TYPE,
} from "../ast/underlyingSpace";
import {
  distributeSpaceFold,
  stackPlaces,
  type StackBaseline,
} from "../ast/constraints/distribute";
import { interval } from "../util/interval";
import { items } from "./testHelpers";

const {
  chart,
  stack,
  spread,
  layer,
  ribbon,
  rect,
  text,
  circle,
  v,
  Baseline,
  Curve,
} = GoFish as any;

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
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

const LINEAR = { kind: "linear" } as const;

/** The space of a band `[0, f(u)]` with its baseline free: what a
 *  `ribbon({ x, h })` resolves to on its value axis. */
const bandSpace = (knots: number[], values: number[]): CONTINUOUS_TYPE => {
  const upper = F.through(knots, values, LINEAR);
  const lower = F.constant(0, upper.domain);
  return withProfile(
    CONTINUOUS(interval(0, Math.max(...values)), "free"),
    F.record({ min: lower, max: upper })
  );
};
const boxSpace = (h: number): CONTINUOUS_TYPE =>
  CONTINUOUS(interval(0, h), "free");

const KNOTS = [0, 1, 2, 3];
const SERIES = [
  [1, 3, 2, 4],
  [2, 1, 2, 3],
  [3, 2, 1, 1],
];
const places = (baseline: StackBaseline<number>, series = SERIES) =>
  stackPlaces(
    series.map((v) => bandSpace(KNOTS, v)),
    baseline
  );

async function main() {
  console.log("\n# stackPlaces: where each band lies");
  {
    // Boxes are placed the same way as bands: each by its data offset, a
    // constant.
    const boxes = stackPlaces([boxSpace(2), boxSpace(3)], { kind: "start" });
    check(
      "boxes take constant offsets, the sum of the boxes before them",
      boxes.length === 2 &&
        boxes.every((p) => F.isConstant(p.offset)) &&
        F.maximum(boxes[0].offset) === 0 &&
        F.maximum(boxes[1].offset) === 2
    );
    const wiggled = stackPlaces([boxSpace(2), boxSpace(3)], { kind: "wiggle" });
    check(
      "boxes under wiggle take constant offsets too",
      wiggled.every((p) => F.isConstant(p.offset)) &&
        near(F.maximum(wiggled[1].offset) - F.maximum(wiggled[0].offset), 2)
    );
    const start = places({ kind: "start" });
    // Each band's offset is the sum of the bands before it.
    check(
      "start: each offset is the sum of the bands below it",
      KNOTS.every(
        (u, j) =>
          near(start[0].offset.at(u), 0) &&
          near(start[1].offset.at(u), SERIES[0][j]) &&
          near(start[2].offset.at(u), SERIES[0][j] + SERIES[1][j])
      )
    );
    // The stack's interval is the max of the pointwise sum, not the sum
    // of the maxima.
    const sums = KNOTS.map((_, j) => SERIES.reduce((s, v) => s + v[j], 0));
    const top = Math.max(...start.map((p) => p.reach.max));
    check(
      "start: the interval reaches the max of the pointwise sum",
      near(top, Math.max(...sums)) &&
        top < SERIES.reduce((s, v) => s + Math.max(...v), 0),
      JSON.stringify({ top, sums })
    );
    check(
      "start: the interval starts at 0",
      near(Math.min(...start.map((p) => p.reach.min)), 0)
    );
  }

  console.log("\n# middle is d3's stackOffsetSilhouette");
  {
    const middle = places({ kind: "middle" });
    // d3 silhouette: the bottom at sample j is −(sum of the values) / 2.
    const silhouette = (j: number) => -SERIES.reduce((s, v) => s + v[j], 0) / 2;
    check(
      "middle: the first band's offset is minus half the total",
      KNOTS.every((u, j) => near(middle[0].offset.at(u), silhouette(j)))
    );
    check(
      "middle: each later band sits on the one before",
      KNOTS.every((u, j) =>
        near(
          middle[2].offset.at(u),
          silhouette(j) + SERIES[0][j] + SERIES[1][j]
        )
      )
    );
  }

  console.log("\n# wiggle is near d3's stackOffsetWiggle");
  {
    // d3-shape's stackOffsetWiggle: the bottom of the stack at sample j.
    const d3Wiggle = (values: number[][]): number[] => {
      const n = values.length;
      const m = values[0].length;
      const bottoms = [0];
      let y = 0;
      for (let j = 1; j < m; ++j) {
        let s1 = 0;
        let s2 = 0;
        for (let i = 0; i < n; ++i) {
          const sij0 = values[i][j];
          const sij1 = values[i][j - 1];
          let s3 = (sij0 - sij1) / 2;
          for (let k = 0; k < i; ++k) s3 += values[k][j] - values[k][j - 1];
          s1 += sij0;
          s2 += s3 * sij0;
        }
        if (s1) y -= s2 / s1;
        bottoms.push(y);
      }
      return bottoms;
    };
    // Smooth series sampled finely, so the polylines are near the curves.
    const curves = [
      (u: number) => 1 + u * u,
      (u: number) => 2 + Math.sin(2 * u),
      (u: number) => 3 - u,
    ];
    const sampled = (n: number) => {
      const us = Array.from({ length: n + 1 }, (_, j) => (2 * j) / n);
      return { us, values: curves.map((c) => us.map(c)) };
    };
    const { us, values } = sampled(2000);
    const wiggle = stackPlaces(
      values.map((v) => bandSpace(us, v)),
      { kind: "wiggle" }
    );
    // d3 measures from the first sample; ours from the wiggle 0. The two
    // differ by a constant, so compare differences from u = 0.
    const bottoms = d3Wiggle(values);
    const at0 = wiggle[0].offset.at(0);
    const gap = Math.max(
      ...us.map((u, j) => Math.abs(wiggle[0].offset.at(u) - at0 - bottoms[j]))
    );
    check(
      "wiggle: the first band's offset follows d3's wiggle bottom",
      gap < 1e-2,
      JSON.stringify({ gap })
    );
    // The same polylines with more knots on them are the same functions,
    // so the offsets do not move.
    const coarse = [0, 0.5, 1.25, 2];
    const refined = [...coarse, 0.25, 0.8, 1.6, 1.9].sort((a, b) => a - b);
    const onKnots = (ks: number[]) =>
      curves.map((c) => {
        const poly = F.through(coarse, coarse.map(c), LINEAR);
        return bandSpace(
          ks,
          ks.map((u) => poly.at(u))
        );
      });
    const a = stackPlaces(onKnots(coarse), { kind: "wiggle" });
    const b = stackPlaces(onKnots(refined), { kind: "wiggle" });
    const grid = Array.from({ length: 41 }, (_, j) => j / 20);
    check(
      "wiggle: refining the samples of the same curves does not move a band",
      a.every((p, k) =>
        grid.every((u) => near(p.offset.at(u), b[k].offset.at(u), 1e-9))
      )
    );
  }

  // The rendered bands. A band's path is its upper edge left to right, a
  // segment down at its right end, its lower edge right to left, and a
  // segment back up (`band.tsx`). Read the end point of each command, and
  // cut the outline where it first turns back from its rightmost x.
  const pathsOf = (dl: any): { upper: number[][]; lower: number[][] }[] => {
    const out: { upper: number[][]; lower: number[][] }[] = [];
    const walk = (it: any) => {
      if (it.kind === "path" && it.datum !== undefined) {
        const cmds = it.d.match(/[MCL][^MCL]*/g) as string[];
        const ends = cmds.map((c) => {
          const n = c.slice(1).trim().split(/[ ,]+/).map(Number);
          return [n[n.length - 2], n[n.length - 1]];
        });
        const right = Math.max(...ends.map((p) => p[0]));
        const turn = ends.findIndex((p) => p[0] === right);
        out.push({
          upper: ends.slice(0, turn + 1),
          lower: ends.slice(turn + 1, ends.length - 1),
        });
      }
      for (const c of it.children ?? []) walk(c);
    };
    dl.items.forEach(walk);
    return out;
  };
  /** A polyline's y at `x`, between its vertices. */
  const yAt = (pts: number[][], x: number): number => {
    const sorted = [...pts].sort((a, b) => a[0] - b[0]);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const [ax, ay] = sorted[i];
      const [bx, by] = sorted[i + 1];
      if (x >= ax - 1e-9 && x <= bx + 1e-9)
        return bx === ax ? ay : ay + ((by - ay) * (x - ax)) / (bx - ax);
    }
    return NaN;
  };
  const rowsOf = (series: Record<string, [number, number][]>) =>
    Object.entries(series).flatMap(([s, pts]) =>
      pts.map(([u, v]) => ({ s, u, v }))
    );

  console.log("\n# a rendered stacked area");
  {
    const rows = rowsOf({
      a: KNOTS.map((u, j) => [u, SERIES[0][j]]),
      b: KNOTS.map((u, j) => [u, SERIES[1][j]]),
      c: KNOTS.map((u, j) => [u, SERIES[2][j]]),
    });
    for (const baseline of ["start", "middle", "wiggle"] as const) {
      const dl = await chart(rows)
        .flow(stack({ by: "s", dir: "y", baseline: Baseline[baseline]() }))
        .mark(ribbon({ x: "u", h: "v", curve: Curve.linear() }))
        .toDisplayList({ w: 300, h: 200 });
      const bands = pathsOf(dl);
      // Each edge is a polyline, which may hold more vertices than knots
      // (where a sum of edges bends), so read it by x.
      const xs = bands[0].upper.map((p) => p[0]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const knotX = (j: number) => x0 + ((x1 - x0) * j) / (KNOTS.length - 1);
      const thickness = (i: number, j: number) =>
        yAt(bands[i].lower, knotX(j)) - yAt(bands[i].upper, knotX(j));
      // Pixels per unit, from the first band at its first knot.
      const k = thickness(0, 0) / SERIES[0][0];
      check(
        `${baseline}: every band keeps its thickness at every knot`,
        bands.length === 3 &&
          bands.every((_, i) =>
            KNOTS.every((_, j) => near(thickness(i, j), k * SERIES[i][j], 1e-6))
          ),
        JSON.stringify(
          bands.map((_, i) => KNOTS.map((_, j) => thickness(i, j)))
        )
      );
      check(
        `${baseline}: each band lies on the one before it`,
        bands.every(
          (b, i) =>
            i === 0 ||
            b.lower.every((p) =>
              near(p[1], yAt(bands[i - 1].upper, p[0]), 1e-6)
            )
        )
      );
    }
  }

  console.log("\n# series sampled at different x");
  {
    // b starts and ends inside a's domain; outside its domain its
    // thickness is 0, so c lies on a there.
    const rows = rowsOf({
      a: [
        [0, 2],
        [2, 2],
        [4, 2],
      ],
      b: [
        [1, 1],
        [3, 1],
      ],
      c: [
        [0, 1],
        [4, 1],
      ],
    });
    let error: string | undefined;
    let bands: ReturnType<typeof pathsOf> = [];
    try {
      const dl = await chart(rows)
        .flow(stack({ by: "s", dir: "y" }))
        .mark(ribbon({ x: "u", h: "v", curve: Curve.linear() }))
        .toDisplayList({ w: 300, h: 200 });
      bands = pathsOf(dl);
    } catch (e) {
      error = (e as Error).message;
    }
    check("a stack of series sampled at different x renders", !error, error);
    if (!error) {
      const [a, b, c] = bands;
      // a is 2 everywhere, b is 1 on [1, 3], c is 1 everywhere: c's
      // thickness is 1 everywhere, and its bottom is a's top outside [1, 3].
      const k = a.lower[0][1] - a.upper[0][1];
      check(
        "b lies on a over its own domain",
        b.lower.every((p) => near(p[1], yAt(a.upper, p[0]), 1e-6))
      );
      check(
        "c lies on b inside b's domain and on a outside it",
        // At b's ends c steps from a's top to b's, so a vertex there is on
        // either.
        c.lower.every((p) => {
          const onB = yAt(b.upper, p[0]);
          return Number.isNaN(onB)
            ? near(p[1], yAt(a.upper, p[0]), 1e-6)
            : near(p[1], onB, 1e-6) ||
                ((near(p[0], b.upper[0][0], 1e-6) ||
                  near(p[0], b.upper[b.upper.length - 1][0], 1e-6)) &&
                  near(p[1], yAt(a.upper, p[0]), 1e-6));
        }) && c.lower.some((p) => near(p[1], a.upper[0][1] - k / 2, 1e-6)),
        JSON.stringify({ c: c.lower, b: b.upper, a: a.upper, k })
      );
    }
  }

  console.log("\n# a part that is not a band");
  {
    const rows = rowsOf({
      a: [
        [0, 1],
        [1, 3],
      ],
      b: [
        [0, 2],
        [1, 2],
      ],
    });
    const errorWith = async (other: any): Promise<string | undefined> => {
      try {
        await chart(rows)
          .flow(stack({ by: "s", dir: "y" }))
          .mark((d: any[]) =>
            d[0].s === "a" ? ribbon({ x: "u", h: "v" })(d) : other(d)
          )
          .toDisplayList({ w: 300, h: 200 });
        return undefined;
      } catch (e) {
        return (e as Error).message;
      }
    };
    const sized = await errorWith(rect({ h: "v", w: 10 }));
    check(
      "a rect of data size among bands is an error that names it",
      sized !== undefined &&
        sized.includes('"b"') &&
        sized.includes("rect") &&
        sized.includes("can't be split along a changing boundary"),
      sized
    );
    const pixels = await errorWith(rect({ h: 2, w: 10 }));
    check(
      "a rect of pixel size among bands is an error that names it",
      pixels !== undefined &&
        pixels.includes('"b"') &&
        pixels.includes("spacing: 0"),
      pixels
    );
  }

  console.log("\n# a stack's parts are data amounts");
  {
    // A stack adds data amounts, so a part with no data size on the stack
    // axis is an error at the fold, which names the part and points at a
    // spread with no spacing.
    const rows = [
      { s: "a", v: 2 },
      { s: "b", v: 3 },
    ];
    const errorWith = async (other: any): Promise<string | undefined> => {
      try {
        await chart(rows)
          .flow(stack({ by: "s", dir: "y" }))
          .mark((d: any[]) =>
            d[0].s === "a" ? rect({ h: "v", w: 10 })(d) : other(d)
          )
          .toDisplayList({ w: 300, h: 200 });
        return undefined;
      } catch (e) {
        return (e as Error).message;
      }
    };
    const parts: [string, any][] = [
      ["a rect of pixel size", rect({ h: 20, w: 10 })],
      ["a text", text({ text: "b" })],
      ["a rect that fills its slot", rect({ w: 10 })],
      ["a circle of pixel size", circle({ r: 5 })],
    ];
    for (const [name, part] of parts) {
      const message = await errorWith(part);
      check(
        `${name} in a stack is an error that names it and suggests a spread`,
        message !== undefined &&
          message.includes('the part for "b"') &&
          message.includes('spread({ by: "s", dir: "y", spacing: 0 })'),
        message
      );
    }
    check(
      "a part of data size is no error",
      (await errorWith(rect({ h: "v", w: 10 }))) === undefined
    );
    // A part with only a data width (a rect at a pixel position, origin
    // "none") is an amount: it lies from its start, as a pinned part does.
    const widths = distributeSpaceFold(
      [CONTINUOUS(interval(0, 2), "none"), CONTINUOUS(interval(0, 3), "none")],
      ["a", "b"],
      { axis: 1, glue: true, baseline: { kind: "start" } }
    );
    check(
      "parts with only a data width stack end to end",
      widths.kind === "continuous" &&
        (widths as CONTINUOUS_TYPE).dataInterval.min === 0 &&
        (widths as CONTINUOUS_TYPE).dataInterval.max === 5,
      JSON.stringify(widths)
    );
  }

  console.log("\n# every part is placed by its data offset");
  {
    // Each part's tail lies its data offset from the stack's 0, times σ.
    // `fill` names the part, so a check reads its box.
    const FILL: Record<string, string> = { a: "red", b: "green", c: "blue" };
    const boxes = async (builder: any) => {
      const dl = await builder.toDisplayList({ w: 300, h: 200 });
      const out: Record<string, { lo: number; hi: number; x: number }> = {};
      for (const it of items(dl) as any[]) {
        if (it.kind !== "rect") continue;
        const name = Object.keys(FILL).find((k) => FILL[k] === it.style?.fill);
        // y up: a box's data interval reads bottom to top.
        if (name) out[name] = { lo: -(it.y + it.h), hi: -it.y, x: it.x };
      }
      return out;
    };
    const bar = (extra: object = {}) =>
      (d: any[]) => rect({ h: "v", w: 10, fill: FILL[d[0].s], ...extra })(d);

    // Signed parts add as signed amounts: 3, then -2 down to 1, then 5 up
    // from 1, so a covers [0, 3], b [1, 3] and c [1, 6].
    const signed = await boxes(
      chart(
        [
          { s: "a", v: 3 },
          { s: "b", v: -2 },
          { s: "c", v: 5 },
        ],
        { axes: false }
      )
        .flow(stack({ by: "s", dir: "y" }))
        .mark(bar())
    );
    const sig = (signed.a.hi - signed.a.lo) / 3;
    const at = (d: number) => signed.a.lo + d * sig;
    check(
      "signed parts: a covers [0, 3], b [1, 3], c [1, 6]",
      [
        ["b", 1, 3],
        ["c", 1, 6],
      ].every(
        ([k, lo, hi]) =>
          near(signed[k as string].lo, at(lo as number), 1e-6) &&
          near(signed[k as string].hi, at(hi as number), 1e-6)
      ),
      JSON.stringify(signed)
    );

    // Stacks in a spread: each column is glued, and every column's 0 is
    // the layer's one data 0.
    const columns = await (async () => {
      const dl = await chart(
        [
          { g: "p", s: "a", v: 2 },
          { g: "p", s: "b", v: 3 },
          { g: "q", s: "a", v: 4 },
          { g: "q", s: "b", v: 1 },
        ],
        { axes: false }
      )
        .flow(spread({ by: "g", dir: "x" }), stack({ by: "s", dir: "y" }))
        .mark((d: any[]) =>
          rect({ h: "v", w: 10, fill: `${d[0].g}${d[0].s}` })(d)
        )
        .toDisplayList({ w: 300, h: 200 });
      const out: Record<string, { lo: number; hi: number }> = {};
      for (const it of items(dl) as any[])
        if (it.kind === "rect")
          out[it.style?.fill] = { lo: -(it.y + it.h), hi: -it.y };
      return out;
    })();
    check(
      "stacks in a spread: each column glued, all on one 0",
      near(columns.pa.hi, columns.pb.lo, 1e-6) &&
        near(columns.qa.hi, columns.qb.lo, 1e-6) &&
        near(columns.pa.lo, columns.qa.lo, 1e-6) &&
        near(
          (columns.pb.hi - columns.pa.lo) / 5,
          (columns.qb.hi - columns.qa.lo) / 5,
          1e-6
        ),
      JSON.stringify(columns)
    );

    // A stack of stacks on one axis is one glued column.
    const nested = await boxes(
      stack({ dir: "y" }, [
        stack({ dir: "y" }, [
          rect({ h: v(2), w: 10, fill: FILL.a }),
          rect({ h: v(3), w: 10, fill: FILL.b }),
        ]),
        rect({ h: v(4), w: 10, fill: FILL.c }),
      ])
    );
    const nsig = (nested.a.hi - nested.a.lo) / 2;
    check(
      "nested stacks on one axis: one glued column",
      near(nested.a.hi, nested.b.lo, 1e-6) &&
        near(nested.b.hi, nested.c.lo, 1e-6) &&
        near(nested.b.hi - nested.b.lo, 3 * nsig, 1e-6) &&
        near(nested.c.hi - nested.c.lo, 4 * nsig, 1e-6),
      JSON.stringify(nested)
    );

    // A part of content sized in data shares the stack's σ; one sized in
    // pixels solves its own σ, so it is a box of pixels and no amount.
    const holder = async (w: unknown) => {
      try {
        const dl = await stack({ dir: "x", alignment: "start" }, [
          layer({ w, h: 20 }, [rect({ w: v(10), h: 20, fill: "red" })]),
          rect({ w: v(50), h: 20, fill: "blue" }),
        ]).toDisplayList({ w: 200, h: 50 });
        const rects = items(dl) as any[];
        return {
          red: rects.find((r) => r.style?.fill === "red"),
          blue: rects.find((r) => r.style?.fill === "blue"),
        };
      } catch (e) {
        return (e as Error).message;
      }
    };
    const dataSized = await holder(v(7));
    check(
      "a layer of data width 7 beside 50 takes 7 of 57 parts",
      typeof dataSized !== "string" &&
        near(dataSized.blue.x, (7 * 200) / 57, 1e-6) &&
        near(dataSized.blue.w, (50 * 200) / 57, 1e-6),
      JSON.stringify(dataSized)
    );
    const pixelSized = await holder(100);
    check(
      "a layer of pixel width in a stack is an error that suggests a spread",
      typeof pixelSized === "string" &&
        pixelSized.includes("no data size on x") &&
        pixelSized.includes("spacing: 0"),
      String(pixelSized)
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
