/**
 * `polygon`'s outline (#1331): `d` is SVG path data (absolute M, L, Q, C,
 * Z), `w`/`h` stretch a unit-box outline to a box that lays out like a
 * rect's, and under a polar coord every point of the outline goes through
 * the coord, curves included, so a box outline in a polar slot is a true pie
 * slice.
 *
 * Run: `pnpm build && tsx src/tests/polygonOutline.test.ts` (wired as
 * `pnpm test:polygon-outline`). The renders import from `dist` for the same
 * lodash-ESM reason as `stackOrigin.test.ts`; the parser is read from source.
 */

// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { cubicAt, parseClosedPath, type Path, type Point } from "../path";
import { check, items, report } from "./testHelpers";

const { chart, stack, spread, polygon, rect, Coord } = GoFish as any;

const PETAL = "M0 0 L0 .468 Q.451 .809 .5 1 Q.549 .809 1 .468 L1 0 Z";
const BOX = "M0 0 L0 1 L1 1 L1 0 Z";

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const samePt = (p: Point, q: Point) => close(p[0], q[0]) && close(p[1], q[1]);

const throws = (f: () => unknown, match: RegExp): boolean => {
  try {
    f();
    return false;
  } catch (e) {
    return match.test(String((e as Error).message));
  }
};

const rejects = async (f: () => Promise<unknown>, match: RegExp) => {
  try {
    await f();
    return false;
  } catch (e) {
    return match.test(String((e as Error).message));
  }
};

/** Points along every drawn path segment, its ends and its middle. */
const samples = (path: Path): Point[] =>
  path.flatMap((s): Point[] =>
    s.type === "line"
      ? [s.points[0], s.points[1]]
      : [0, 0.25, 0.5, 0.75, 1].map((t) => [
          cubicAt(s.start[0], s.control1[0], s.control2[0], s.end[0], t),
          cubicAt(s.start[1], s.control1[1], s.control2[1], s.end[1], t),
        ])
  );

/** The drawn outline of every path item of a render. */
async function outlines(builder: any, size = { w: 220, h: 220 }) {
  const dl = await builder.toDisplayList(size);
  return items(dl)
    .filter((it) => it.kind === "path")
    .map((it) => parseClosedPath(it.d as string));
}

const rows = [
  { s: "a", count: 1 },
  { s: "b", count: 2 },
  { s: "c", count: 1 },
];

const head = (d: string, coord: any) =>
  chart(rows, { coord, axes: false })
    .flow(stack({ by: "s", dir: "x", h: 90 }))
    .mark(polygon({ w: "count", d, fill: "s" }));

/** The center and the inner and outer radii of a full ring of pie slices:
 *  the middle of their box, and the least and greatest distance from it. */
function ringOf(slices: Path[]) {
  const pts = slices.flatMap(samples);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const c: Point = [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
  const ds = pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]));
  return { c, inner: Math.min(...ds), outer: Math.max(...ds) };
}

async function main() {
  console.log("\n# d: parsing");
  {
    const p = parseClosedPath("M0 0 L1 0 Q2 0 2 1 C2 2 1 2 0 2 Z");
    check("M L Q C Z: four segments", p.length === 4, p);
    check(
      "L is a line",
      p[0].type === "line" && samePt(p[0].points[1], [1, 0])
    );
    const q = p[1];
    check(
      "Q is the cubic that draws the same curve (controls 2/3 of the way)",
      q.type === "bezier" &&
        samePt(q.control1, [1 + 2 / 3, 0]) &&
        samePt(q.control2, [2, 1 / 3]) &&
        samePt(q.end, [2, 1]),
      q
    );
    const c = p[2];
    check(
      "C keeps its controls",
      c.type === "bezier" &&
        samePt(c.control1, [2, 2]) &&
        samePt(c.control2, [1, 2]) &&
        samePt(c.end, [0, 2])
    );
    check(
      "Z closes back to the start",
      p[3].type === "line" && samePt(p[3].points[1], [0, 0])
    );
    const open = parseClosedPath("M0 0 L1 0 L1 1");
    check(
      "without Z it still closes",
      open.length === 3 &&
        open[2].type === "line" &&
        samePt(open[2].points[1], [0, 0])
    );
    const repeated = parseClosedPath("M0,0 L1,0 1,1 Z");
    check("a command repeats its arguments", repeated.length === 3);
    check(
      "numbers like .5, -1e-1 and 1.",
      parseClosedPath("M.5 -1e-1 L1. 0 L0 1Z").length === 3
    );
    check("Josh's petal parses", parseClosedPath(PETAL).length === 5);
  }

  console.log("\n# d: errors");
  check(
    "a relative command is an error",
    throws(() => parseClosedPath("M0 0 l1 0 l0 1 Z"), /relative/)
  );
  check(
    "H is not one of M, L, Q, C, Z",
    throws(() => parseClosedPath("M0 0 H1 V1 Z"), /not one of/)
  );
  check(
    "it must start with M",
    throws(() => parseClosedPath("L0 0 L1 0 L1 1"), /start with M/)
  );
  check(
    "a second M is an error",
    throws(() => parseClosedPath("M0 0 L1 0 L1 1 Z M2 2 L3 2 L3 3"), /one M/)
  );
  check(
    "an odd count of numbers is an error",
    throws(() => parseClosedPath("M0 0 L1 0 1 Z"), /2 numbers at a time/)
  );
  check(
    "Q with three numbers is an error",
    throws(() => parseClosedPath("M0 0 Q1 0 1 Z"), /4 numbers at a time/)
  );
  check(
    "nothing follows Z",
    throws(() => parseClosedPath("M0 0 L1 0 L1 1 Z L0 1"), /follow Z/)
  );
  check(
    "empty is an error",
    throws(() => parseClosedPath(""), /empty/)
  );
  check(
    "a lone M is an error",
    throws(() => parseClosedPath("M0 0"), /no edge/)
  );
  check(
    "a stray character is an error",
    throws(() => parseClosedPath("M0 0 L1 0 L1 # 1 Z"), /command|number/)
  );

  console.log("\n# polygon options: errors");
  check(
    "points and d together are an error",
    await rejects(
      () =>
        chart([{}], { axes: false })
          .mark(
            polygon({
              points: [
                [0, 0],
                [1, 0],
                [1, 1],
              ],
              d: BOX,
            })
          )
          .toDisplayList({ w: 100, h: 100 }),
      /exactly one of `points` and `d`/
    )
  );
  check(
    "neither points nor d is an error",
    await rejects(
      () =>
        chart([{}], { axes: false })
          .mark(polygon({ fill: "red" }))
          .toDisplayList({ w: 100, h: 100 }),
      /exactly one of `points` and `d`/
    )
  );
  check(
    "a field-bound ring takes no w",
    await rejects(
      () =>
        chart(
          [
            {
              ring: [
                [0, 0],
                [1, 0],
                [1, 1],
              ],
            },
          ],
          { axes: false }
        )
          .mark(polygon({ points: "ring", w: 10 }))
          .toDisplayList({ w: 100, h: 100 }),
      /takes no `w` or `h`/
    )
  );

  console.log("\n# w/h stretch the unit box");
  {
    const [box] = await outlines(
      chart([{}], { axes: false }).mark(polygon({ w: 50, h: 20, d: BOX })),
      { w: 200, h: 200 }
    );
    const pts = samples(box);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    check(
      "a unit box with w 50, h 20 draws 50 by 20",
      close(Math.max(...xs) - Math.min(...xs), 50) &&
        close(Math.max(...ys) - Math.min(...ys), 20),
      pts
    );
    const bars = await outlines(
      chart(rows, { axes: false })
        .flow(stack({ by: "s", dir: "x", h: 30 }))
        .mark(polygon({ w: "count", d: PETAL, fill: "s" })),
      { w: 200, h: 100 }
    );
    const widths = bars.map((b) => {
      const xs = samples(b).map((p) => p[0]);
      return Math.max(...xs) - Math.min(...xs);
    });
    const heights = bars.map((b) => {
      const ys = samples(b).map((p) => p[1]);
      return Math.max(...ys) - Math.min(...ys);
    });
    check(
      "w: 'count' sizes each petal like a rect (1 : 2 : 1)",
      close(widths[1], 2 * widths[0], 1e-3) &&
        close(widths[0], widths[2], 1e-3),
      widths
    );
    check(
      "h left out fills the stack's h",
      heights.every((h) => close(h, 30, 1e-3)),
      heights
    );
    const literal = await outlines(
      chart([{}], { axes: false }).mark(
        polygon({
          points: [
            [0, 0],
            [40, 0],
            [40, 10],
          ],
        })
      ),
      { w: 100, h: 100 }
    );
    const lx = samples(literal[0]).map((p) => p[0]);
    check(
      "points with no w/h keep their pixel extent",
      close(Math.max(...lx) - Math.min(...lx), 40)
    );
  }

  console.log("\n# w/h are sized as a rect's");
  {
    // Signed values: the baseline sits inside the plot, so the y map has a
    // pixel offset (`originPx` is not 0).
    const signed = [
      { s: "a", v: 3 },
      { s: "b", v: -2 },
      { s: "c", v: 1 },
    ];
    const boxes = async (mark: any, data: any[], flow: any, size: any) => {
      const c = chart(data, { axes: false });
      const dl = await (flow ? c.flow(flow) : c).mark(mark).toDisplayList(size);
      return items(dl).map((it) => {
        if (it.kind === "rect") return [it.x!, it.y!, it.w!, it.h!];
        const pts = samples(parseClosedPath(it.d as string));
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const [x, y] = [Math.min(...xs), Math.min(...ys)];
        return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
      });
    };
    const sameBoxes = (a: number[][], b: number[][]) =>
      a.length === b.length &&
      a.every((r, i) => r.every((v, k) => close(v, b[i][k], 1e-6)));
    const size = { w: 200, h: 200 };
    const bars = spread({ by: "s", dir: "x" });
    const rects = await boxes(rect({ h: "v" }), signed, bars, size);
    const polys = await boxes(polygon({ h: "v", d: BOX }), signed, bars, size);
    check(
      "on an offset map, each polygon's box is its rect's",
      sameBoxes(polys, rects),
      { polys, rects }
    );
    check(
      "a negative h grows down from the baseline, as a rect's does",
      close(polys[1][1], polys[0][1] + polys[0][3]) && polys[1][3] > 0,
      polys
    );
    const lone = await boxes(polygon({ w: 50, d: BOX }), [{}], undefined, {});
    const loneRect = await boxes(rect({ w: 50 }), [{}], undefined, {});
    check(
      "a side left out with no room from the parent is a rect's default",
      sameBoxes(lone, loneRect) && lone[0].every(Number.isFinite),
      { lone, loneRect }
    );
  }

  console.log("\n# polar: the whole outline is bent");
  {
    const slices = await outlines(head(BOX, Coord.polar()));
    const { c, outer } = ringOf(slices);
    // b's slot is half the circle. Its top edge, u from 0 to 1 at v = 1, is
    // the arc at the full radius. Drawn as a chord it would pass through the
    // center; drawn through the coord, every sample of it is on the arc.
    const b = slices[1];
    const radius = (p: Point) => Math.hypot(p[0] - c[0], p[1] - c[1]);
    // The top edge is the drawn outline's second segment group: the samples
    // that are neither the center nor on a side edge. Read them by angle:
    // the side edges sit at the slot's two end angles.
    const pts = samples(b);
    const angle = (p: Point) => Math.atan2(p[1] - c[1], p[0] - c[0]);
    const far = pts.filter((p) => radius(p) > 1);
    const ends = [angle(far[0]), angle(far[far.length - 1])];
    const top = far.filter((p) =>
      ends.every((a) => Math.abs(Math.sin(angle(p) - a)) > 0.05)
    );
    check(
      "the top edge is sampled along the slot, not only at its corners",
      top.length >= 6,
      top.length
    );
    check(
      "every sample of the top edge sits at the full radius (within 0.5 px)",
      top.every((p) => Math.abs(radius(p) - outer) < 0.5),
      top.map(radius)
    );
    check(
      "the slice's outer radius is the stack's h",
      close(outer, 90, 0.5),
      outer
    );
  }

  console.log("\n# a donut: petals start at the hole");
  {
    const coord = () => Coord.clock({ innerRadius: 0.4 });
    const ring = ringOf(await outlines(head(BOX, coord())));
    check(
      "the box slices leave a hole at the center",
      ring.inner > 10 && ring.outer - ring.inner > 50,
      ring
    );
    const petals = await outlines(head(PETAL, coord()));
    const ds = petals
      .flatMap(samples)
      .map((p) => Math.hypot(p[0] - ring.c[0], p[1] - ring.c[1]));
    check(
      "no petal reaches into the hole",
      Math.min(...ds) > ring.inner - 0.5,
      { min: Math.min(...ds), inner: ring.inner }
    );
    check(
      "the petals start at the hole and reach the rim",
      close(Math.min(...ds), ring.inner, 0.5) &&
        close(Math.max(...ds), ring.outer, 0.5),
      { min: Math.min(...ds), max: Math.max(...ds), ring }
    );
  }

  report();
}

main();
