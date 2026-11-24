/**
 * A mark outside a coordinate space reads a mark inside it where the space
 * draws it (`GoFishRef.intrinsicDims` in `_ref.tsx`): a `line` or a
 * `polygon` in a layer outside a polar space, over points inside it, runs
 * straight through the points' drawn centers. A reader inside the space is
 * unchanged: it still reads the space's own coordinates, and its path is
 * warped. `polygon` with no `points` is the closed ring through the marks it
 * is applied to.
 *
 * Run: `tsx src/tests/crossCoordRefs.test.ts` (wired as
 * `pnpm test:cross-coord`).
 */
import { Frontend } from "gofish-ir";
import * as GoFish from "../lib";
import { check, items, report } from "./testHelpers";

const {
  chart,
  circle,
  Constraint,
  Coord,
  createName,
  Curve,
  group,
  layer,
  line,
  polygon,
  rect,
  ref,
  scatter,
  selectAll,
  Serialize,
} = GoFish as any;

type Pt = [number, number];
const pointsOf = (d: string): Pt[] => {
  const nums = (d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
  const out: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
};
const near = (a: Pt, b: Pt, eps = 0.01) =>
  Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;
const show = (ps: Pt[]) =>
  ps.map(([x, y]) => `(${x.toFixed(2)},${y.toFixed(2)})`).join(" ");

const metrics = ["speed", "power", "range", "armor", "agility", "stealth"];
const A = [8, 6, 9, 4, 7, 5];
const B = [5, 9, 4, 8, 3, 7];
const rows = metrics.map((metric, i) => ({ metric, value: A[i] }));
const both = [
  ...metrics.map((metric, i) => ({ series: "A", metric, value: A[i] })),
  ...metrics.map((metric, i) => ({ series: "B", metric, value: B[i] })),
];
const W = 320;

/** The polar points, named `pts`. */
const points = (data = rows) =>
  chart(data)
    .flow(scatter({ by: "metric", x: "metric", y: "value" }))
    .mark(circle({ r: 4, fill: "black" }).name("pts"));

/** The drawn centers of the display list's circles, in paint order. */
const centersOf = (dl: any): Pt[] =>
  items(dl)
    .filter((it) => it.kind === "ellipse")
    .map((it) => [it.cx, it.cy] as Pt);

/** The vertices of each path the display list draws in `stroke` or `fill`. */
const pathsIn = (dl: any, color: string): Pt[][] =>
  items(dl)
    .filter(
      (it) =>
        it.kind === "path" &&
        (it.style?.stroke === color || it.style?.fill === color)
    )
    .map((it) => pointsOf(it.d));

/** Whether `run` is `expected` in order (each within 0.01 px). */
const runs = (run: Pt[], expected: Pt[]) =>
  run.length === expected.length && run.every((p, i) => near(p, expected[i]));

async function main() {
  console.log("\n# a mark outside a coordinate space reads marks inside it");

  // An outer line over selected polar points.
  {
    const dl = await layer({ w: W, h: W }, [
      layer({ coord: Coord.clock() }, [points()]),
      chart(selectAll("pts")).mark(
        line({ stroke: "red", strokeWidth: 2, curve: Curve.linear() })
      ),
    ]).toDisplayList();
    const centers = centersOf(dl);
    const [path] = pathsIn(dl, "red");
    check(
      "a line outside polar runs straight through the points' drawn centers",
      centers.length === 6 && path !== undefined && runs(path, centers),
      `centers ${show(centers)}; line ${path && show(path)}`
    );
  }

  // The same through `.relate` refs, the last back to the first.
  {
    const dl = await layer({ w: W, h: W }, [
      layer({ coord: Coord.clock() }, [
        chart(rows)
          .flow(scatter({ by: "metric", x: "metric", y: "value" }))
          .mark((d: any[]) => circle({ r: 4 }).name(d[0].metric)),
      ]),
    ])
      .relate((c: any) => [
        line({ stroke: "red", curve: Curve.linear() }, [
          ...metrics.map((m) => c[m]),
          c[metrics[0]],
        ]),
      ])
      .toDisplayList();
    const centers = centersOf(dl);
    const [path] = pathsIn(dl, "red");
    check(
      "a line over .relate refs across polar runs through the drawn centers",
      path !== undefined && runs(path, [...centers, centers[0]]),
      `centers ${show(centers)}; line ${path && show(path)}`
    );
  }

  // A reader inside the space is unchanged: it reads the space's own
  // coordinates and is warped, so its path is resampled into arcs, still
  // through the points.
  {
    const dl = await chart(rows, { coord: Coord.clock(), w: W, h: W })
      .flow(scatter({ by: "metric", x: "metric", y: "value" }))
      .mark(circle({ r: 4 }))
      .layer(line({ stroke: "red", curve: Curve.linear() }))
      .toDisplayList();
    const centers = centersOf(dl);
    const [path] = pathsIn(dl, "red");
    const through = centers.every((c) => path?.some((p) => near(p, c, 0.05)));
    check(
      "a line inside polar is still warped (many points, through each center)",
      path !== undefined && path.length > 20 && through,
      path && `${path.length} points`
    );
  }

  // `polygon` over a selection: the closed ring through the centers.
  {
    const dl = await layer({ w: W, h: W }, [
      layer({ coord: Coord.clock() }, [points()]),
      chart(selectAll("pts")).mark(polygon({ fill: "red", opacity: 0.25 })),
    ]).toDisplayList();
    const centers = centersOf(dl);
    const ring = pathsIn(dl, "red");
    const filled = items(dl).find(
      (it) => it.kind === "path" && it.style?.fill === "red"
    );
    check(
      "polygon over selected polar points is the closed ring through them",
      ring.length === 1 && runs(ring[0], [...centers, centers[0]]),
      ring.map(show)
    );
    check(
      "polygon over marks is filled, with its opacity",
      filled !== undefined && filled.style?.opacity === 0.25,
      filled?.style
    );
  }

  // `polygon` over explicit refs in `.relate`.
  {
    const dl = await layer({ w: W, h: W }, [
      layer({ coord: Coord.clock() }, [
        chart(rows)
          .flow(scatter({ by: "metric", x: "metric", y: "value" }))
          .mark((d: any[]) => circle({ r: 4 }).name(d[0].metric)),
      ]),
    ])
      .relate((c: any) => [
        polygon(
          { fill: "red" },
          metrics.map((m) => c[m])
        ),
      ])
      .toDisplayList();
    const centers = centersOf(dl);
    const ring = pathsIn(dl, "red");
    check(
      "polygon over .relate refs is the ring through their centers",
      ring.length === 1 && runs(ring[0], [...centers, centers[0]]),
      ring.map(show)
    );
  }

  // One ring per group, as `line` gives one path per group.
  {
    const dl = await layer({ w: W, h: W }, [
      layer({ coord: Coord.clock() }, [
        chart(both)
          .flow(
            group({ by: "series" }),
            scatter({ by: "metric", x: "metric", y: "value" })
          )
          .mark(circle({ r: 4, fill: "black" }).name("pts")),
      ]),
      chart(selectAll("pts"))
        .flow(group({ by: "series" }))
        .mark(polygon({ fill: "red" })),
    ]).toDisplayList();
    const centers = centersOf(dl);
    const rings = pathsIn(dl, "red");
    check(
      "polygon after group({ by }) draws one ring per group",
      rings.length === 2 &&
        runs(rings[0], [...centers.slice(0, 6), centers[0]]) &&
        runs(rings[1], [...centers.slice(6), centers[6]]),
      rings.map(show)
    );
  }

  // Inside the space a polygon over marks is warped, as a line there is.
  {
    const dl = await chart(rows, { coord: Coord.clock(), w: W, h: W })
      .flow(scatter({ by: "metric", x: "metric", y: "value" }))
      .mark(circle({ r: 4 }))
      .layer(polygon({ fill: "red" }))
      .toDisplayList();
    const [ring] = pathsIn(dl, "red");
    check(
      "polygon inside polar is resampled through the space",
      ring !== undefined && ring.length > 20,
      ring && `${ring.length} points`
    );
  }

  // A mark with an extent: a ref across the space reads the bounding box of
  // the warped mark, so its middle is the middle of what is drawn. For a
  // spoke (a radial bar) that is the midpoint of the drawn segment.
  {
    const dl = await layer({ w: W, h: W }, [
      layer({ coord: Coord.clock() }, [
        chart([
          { k: "a", v: 10 },
          { k: "b", v: 5 },
        ])
          .flow(scatter({ by: "k", x: "k" }))
          .mark(rect({ w: 0, h: "v", stroke: "black" }).name("bars")),
      ]),
      chart(selectAll("bars")).mark(
        line({ stroke: "red", curve: Curve.linear() })
      ),
    ]).toDisplayList();
    const mids = items(dl)
      .filter((it) => it.kind === "path" && it.style?.stroke === "black")
      .map((it) => {
        // The spoke is drawn as a closed band: its middle is its box's.
        const ps = pointsOf(it.d);
        const xs = ps.map(([x]) => x);
        const ys = ps.map(([, y]) => y);
        return [
          (Math.min(...xs) + Math.max(...xs)) / 2,
          (Math.min(...ys) + Math.max(...ys)) / 2,
        ] as Pt;
      });
    const [path] = pathsIn(dl, "red");
    check(
      "a line over warped bars runs through the middles of their drawn boxes",
      mids.length === 2 && path !== undefined && runs(path, mids),
      `middles ${show(mids)}; line ${path && show(path)}`
    );
  }

  // Placing across the space is not defined by translates alone: an outer
  // layer's constraint over a mark inside a coordinate space is an error,
  // never a silent misplacement.
  for (const [what, constraint] of [
    [
      "align",
      ({ speed, box }: any) =>
        Constraint.align({ x: "middle", y: "middle" }, [box, speed]),
    ],
    [
      "distribute",
      ({ speed, box }: any) =>
        Constraint.distribute({ dir: "x", spacing: 0 }, [speed, box]),
    ],
  ] as const) {
    let message = "";
    try {
      await layer({ w: W, h: W }, [
        layer({ coord: Coord.clock() }, [
          chart(rows.slice(0, 2))
            .flow(scatter({ by: "metric", x: "metric", y: "value" }))
            .mark((d: any[]) => circle({ r: 4 }).name(d[0].metric)),
        ]),
        rect({ w: 10, h: 10, fill: "red" }).name("box"),
      ])
        .relate((c: any) => [constraint(c)])
        .toDisplayList();
    } catch (e) {
      message = (e as Error).message;
    }
    check(
      `an outer ${what} against a mark inside a coordinate space is an error`,
      /places "speed", a mark inside a polar coordinate space/.test(message),
      message || "no error"
    );
  }

  // `polygon` over two marks draws there and back, as a line through two
  // points; over one it draws nothing.
  {
    const ringOf = async (n: number) =>
      pathsIn(
        await layer({ w: W, h: W }, [
          layer({ coord: Coord.clock() }, [points(rows.slice(0, n))]),
          chart(selectAll("pts")).mark(polygon({ fill: "red" })),
        ]).toDisplayList(),
        "red"
      );
    const two = await ringOf(2);
    const one = await ringOf(1);
    check(
      "polygon over two marks is the segment there and back",
      two.length === 1 && two[0].length === 3 && near(two[0][0], two[0][2]),
      two.map(show)
    );
    check("polygon over one mark draws nothing", one.length === 0, one);
  }

  // The bag form of `polygon` crosses the wire as a leaf mark with no
  // `points`: it validates and rebuilds to the same drawing. The children
  // form rebuilds from its combinator-mark entry.
  {
    const bag = () =>
      layer({ w: W, h: W }, [
        layer({ coord: Coord.clock() }, [points()]),
        chart(selectAll("pts")).mark(polygon({ fill: "red", opacity: 0.25 })),
      ]);
    // Node ids are fresh on each build.
    const drawn = async (b: any) =>
      JSON.stringify(await b.toDisplayList(), (k, v) =>
        k === "id" ? undefined : v
      );
    const doc = await Serialize.toJSON(bag());
    const valid = Frontend.validate(doc);
    const before = await drawn(bag());
    const after = await drawn(Serialize.buildIR(doc));
    check(
      "polygon over a selection round-trips through the wire",
      valid.valid && (doc.root as any).children[1].mark.type === "polygon" &&
        before === after,
      valid.valid ? after.slice(0, 200) : JSON.stringify(valid.errors)
    );

    const rebuilt = Serialize.rebuild(
      "combinator-mark",
      "polygon",
      { fill: "red" },
      {
        children: [
          rect({ x: 10, y: 10, w: 4, h: 4 }),
          rect({ x: 90, y: 20, w: 4, h: 4 }),
          rect({ x: 40, y: 80, w: 4, h: 4 }),
        ],
      }
    );
    // A connector draws its operands' ring, not the operands; the ring is
    // the one through the rects' centers, moved with the connector.
    const ring = pathsIn(
      await layer({ w: W, h: W }, [rebuilt]).toDisplayList(),
      "red"
    );
    const [x0, y0] = ring[0]?.[0] ?? [0, 0];
    const rel = (ring[0] ?? []).map(([x, y]) => [x - x0, y - y0] as Pt);
    check(
      "polygon's combinator-mark entry rebuilds the ring over its children",
      ring.length === 1 &&
        runs(rel, [
          [0, 0],
          [80, 10],
          [30, 70],
          [0, 0],
        ]),
      ring.map(show)
    );
  }

  // `points` and children both give the ring.
  {
    let message = "";
    try {
      polygon({ points: [[0, 0], [1, 0], [0, 1]] }, [rect({ w: 1, h: 1 })]);
    } catch (e) {
      message = (e as Error).message;
    }
    check(
      "polygon with both points and children is an error",
      /`points` gives the ring, and the children give it too/.test(message),
      message || "no error"
    );
  }

  // A reader inside one space cannot read a mark outside it.
  {
    let message = "";
    try {
      const a = createName("a");
      const b = createName("b");
      await layer({ w: W, h: W }, [
        rect({ w: 10, h: 10 }).name(a),
        rect({ w: 10, h: 10 }).name(b),
        layer({ coord: Coord.clock() }, [
          line({ stroke: "red" }, [ref(a), ref(b)]),
        ]),
      ]).toDisplayList();
    } catch (e) {
      message = (e as Error).message;
    }
    check(
      "a reader inside a space reading a mark outside it is an error",
      /inverse of the space's transform/.test(message),
      message || "no error"
    );
  }

  report();
}

main().catch((e) => {
  console.error(e);
  (globalThis as any).process.exit(1);
});
