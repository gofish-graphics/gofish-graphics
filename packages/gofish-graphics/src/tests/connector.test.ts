/**
 * The connector form of `line` and `ribbon` (`graphicalOperators/connect.tsx`):
 * an anchored line is routed by its curve between its anchor points, and is
 * straight when it has none; consecutive pairs are one path only where their
 * routes meet; a sequence curve passes through where its edge enters each
 * mark and then where it leaves it, and warns when the marks overlap so
 * those points go back along its axis; a ribbon takes only a curve that draws a band
 * edge (`drawsBandEdge` in `routers.ts`).
 * Run: `tsx src/tests/connector.test.ts` (wired into `pnpm test` as
 * `test:connector`).
 */
// The library first, so its modules initialize in their usual order.
import {
  chart,
  spread,
  stack,
  scatter,
  rect,
  circle,
  layer,
  line,
  ribbon,
  Curve,
} from "../lib";
import { check, items, report } from "./testHelpers";

type Point = [number, number];

/** The commands of an SVG path's data, each with its numbers. */
const commands = (d: string): { op: string; args: number[] }[] =>
  [...d.matchAll(/([MLCQZ])([^MLCQZ]*)/gi)].map((m) => ({
    op: m[1].toUpperCase(),
    args: (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number),
  }));

const close = (p: Point, q: Point, eps = 1e-6) =>
  Math.abs(p[0] - q[0]) <= eps && Math.abs(p[1] - q[1]) <= eps;

const errorOf = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  return "";
};

/** Two boxes, a at the origin and b below and to its right, joined from the
 *  middle of a's right side to the middle of b's left side. */
const anchored = (curve?: Curve.Curve) =>
  layer([
    rect({ x: 0, y: 0, w: 80, h: 40, fill: "#ccc" }).name("a"),
    rect({ x: 200, y: 120, w: 80, h: 40, fill: "#ccc" }).name("b"),
  ]).relate(({ a, b }: any) => [
    line(
      {
        source: ["end", "middle"],
        target: ["start", "middle"],
        stroke: "black",
        ...(curve === undefined ? {} : { curve }),
      },
      [a, b]
    ),
  ]);

/** The drawn rects and the one path of `node`, in pixels. */
async function drawn(node: any) {
  const all = items(await node.toDisplayList({ w: 400, h: 300 }));
  const rects = all.filter((i) => i.kind === "rect");
  const paths = all.filter((i) => i.kind === "path");
  return { rects, paths };
}

/** The anchor points in pixels: the middle of a's right side and of b's
 *  left side. */
const anchorsOf = (rects: any[]): [Point, Point] => {
  const [a, b] = [...rects].sort((r, s) => r.x - s.x);
  return [
    [a.x + a.w, a.y + a.h / 2],
    [b.x, b.y + b.h / 2],
  ];
};

async function main() {
  console.log("\n# an anchored line with no curve is one straight segment");
  {
    const { rects, paths } = await drawn(anchored());
    const [from, to] = anchorsOf(rects);
    const cmds = paths.length === 1 ? commands(paths[0].d) : [];
    check(
      "M then one L, from anchor to anchor",
      cmds.length === 2 &&
        cmds[0].op === "M" &&
        cmds[1].op === "L" &&
        close(cmds[0].args as Point, from) &&
        close(cmds[1].args as Point, to),
      paths.map((p) => p.d)
    );
  }

  console.log("\n# an anchored line on a continuous axis is still straight");
  {
    // Three points on a continuous x: a line through their centers smooths
    // (monotone); an anchored one is straight.
    const rows = [
      { k: "p", x: 0, y: 0 },
      { k: "q", x: 50, y: 80 },
      { k: "r", x: 100, y: 20 },
    ];
    const opsOf = async (connector: any) => {
      const paths = items(
        await chart(rows, { axes: false })
          .flow(scatter({ by: "k", x: "x", y: "y" }))
          .mark(circle({ r: 6 }))
          .layer(connector)
          .toDisplayList({ w: 300, h: 200 })
      ).filter((i) => i.kind === "path");
      return paths.flatMap((p) => commands(p.d).map((c) => c.op));
    };
    const centers = await opsOf(line());
    check(
      "through the centers, the line smooths (cubic segments)",
      centers.includes("C"),
      centers
    );
    const pinned = await opsOf(
      line({ source: ["end", "middle"], target: ["start", "middle"] })
    );
    check(
      "anchored, only straight segments",
      pinned.length > 0 && pinned.every((op) => op === "M" || op === "L"),
      pinned
    );
  }

  console.log("\n# an anchored line honors its curve");
  {
    const { rects, paths } = await drawn(anchored(Curve.bezier()));
    const [from, to] = anchorsOf(rects);
    const cmds = paths.length === 1 ? commands(paths[0].d) : [];
    // The bezier route's control points sit at the midpoint of the
    // connection axis (x), level with each end.
    const midX = (from[0] + to[0]) / 2;
    const c = cmds[1]?.args ?? [];
    check(
      "M then one C, from anchor to anchor, bending at the midline",
      cmds.length === 2 &&
        cmds[0].op === "M" &&
        cmds[1].op === "C" &&
        close(cmds[0].args as Point, from) &&
        close([c[4], c[5]], to) &&
        close([c[0], c[1]], [midX, from[1]]) &&
        close([c[2], c[3]], [midX, to[1]]),
      paths.map((p) => p.d)
    );
  }

  console.log("\n# an anchored perfect-arrows line runs between its anchors");
  {
    const pathEnds = (d: string): [Point, Point] | undefined => {
      const cmds = commands(d);
      const last = cmds[cmds.length - 1]?.args ?? [];
      return cmds.length > 1 && cmds[0].op === "M"
        ? [
            cmds[0].args as Point,
            [last[last.length - 2], last[last.length - 1]],
          ]
        : undefined;
    };
    try {
      const { rects, paths } = await drawn(anchored(Curve.perfectArrows()));
      const [from, to] = anchorsOf(rects);
      const ends = paths.length === 1 ? pathEnds(paths[0].d) : undefined;
      check(
        "with both anchors, it starts and ends on them",
        ends !== undefined && close(ends[0], from) && close(ends[1], to),
        paths.map((p) => p.d)
      );
    } catch (e) {
      check("with both anchors, it lays out", false, (e as Error).message);
    }
    try {
      const { rects, paths } = await drawn(
        layer([
          rect({ x: 0, y: 0, w: 80, h: 40, fill: "#ccc" }).name("a"),
          rect({ x: 200, y: 120, w: 80, h: 40, fill: "#ccc" }).name("b"),
        ]).relate(({ a, b }: any) => [
          line(
            {
              source: ["end", "middle"],
              stroke: "black",
              curve: Curve.perfectArrows(),
            },
            [a, b]
          ),
        ])
      );
      const [from] = anchorsOf(rects);
      const b = [...rects].sort((r, s) => r.x - s.x)[1];
      // The omitted end is the point of b nearest the source point.
      const nearest: Point = [
        Math.min(Math.max(from[0], b.x), b.x + b.w),
        Math.min(Math.max(from[1], b.y), b.y + b.h),
      ];
      const ends = paths.length === 1 ? pathEnds(paths[0].d) : undefined;
      check(
        "with only source, it starts on it and ends at b's nearest point",
        ends !== undefined && close(ends[0], from) && close(ends[1], nearest),
        paths.map((p) => p.d)
      );
    } catch (e) {
      check("with only source, it lays out", false, (e as Error).message);
    }
  }

  console.log(
    "\n# a perfect-arrows line over three marks draws one arc per pair"
  );
  {
    const { rects, paths } = await drawn(
      layer([
        rect({ x: 0, y: 0, w: 40, h: 40, fill: "#ccc" }).name("a"),
        rect({ x: 120, y: 100, w: 40, h: 40, fill: "#ccc" }).name("b"),
        rect({ x: 260, y: 0, w: 40, h: 40, fill: "#ccc" }).name("c"),
      ]).relate(({ a, b, c }: any) => [
        line({ stroke: "black", curve: Curve.perfectArrows() }, [a, b, c]),
      ])
    );
    const sorted = [...rects].sort((r, s) => r.x - s.x);
    const on = (p: Point, r: any) =>
      p[0] >= r.x - 1e-6 &&
      p[0] <= r.x + r.w + 1e-6 &&
      p[1] >= r.y - 1e-6 &&
      p[1] <= r.y + r.h + 1e-6;
    const starts = paths.map((p) => commands(p.d)[0].args as Point);
    check(
      "two paths, each starting on its own mark",
      paths.length === 2 &&
        paths.every(
          (p) => commands(p.d).filter((c) => c.op === "M").length === 1
        ) &&
        on(starts[0], sorted[0]) &&
        on(starts[1], sorted[1]),
      paths.map((p) => p.d)
    );
  }

  console.log("\n# a sequence curve with one end given threads that end");
  {
    // An omitted `target` is the `source` point itself on each mark, so the
    // curve's knots are the marks' source points.
    const node = layer([
      rect({ x: 0, y: 0, w: 40, h: 40, fill: "#ccc" }).name("a"),
      rect({ x: 100, y: 80, w: 40, h: 40, fill: "#ccc" }).name("b"),
      rect({ x: 200, y: 20, w: 40, h: 40, fill: "#ccc" }).name("c"),
    ]).relate(({ a, b, c }: any) => [
      line(
        {
          source: ["end", "middle"],
          stroke: "black",
          curve: Curve.monotone(),
        },
        [a, b, c]
      ),
    ]);
    const { rects, paths } = await drawn(node);
    const sorted = [...rects].sort((r, s) => r.x - s.x);
    const sourceOf = (r: any): Point => [r.x + r.w, r.y + r.h / 2];
    const cmds = paths.length === 1 ? commands(paths[0].d) : [];
    const last = cmds[cmds.length - 1]?.args ?? [];
    check(
      "the path starts at the first mark's source and ends at the last's",
      cmds.length > 1 &&
        cmds[0].op === "M" &&
        close(cmds[0].args as Point, sourceOf(sorted[0])) &&
        close(
          [last[last.length - 2], last[last.length - 1]],
          sourceOf(sorted[2])
        ),
      paths.map((p) => p.d)
    );
  }

  console.log(
    "\n# a sequence curve passes through where it enters and leaves each mark"
  );
  {
    const through = (anchors: object) =>
      layer([
        rect({ x: 0, y: 0, w: 40, h: 40, fill: "#ccc" }).name("a"),
        rect({ x: 100, y: 80, w: 40, h: 40, fill: "#ccc" }).name("b"),
        rect({ x: 200, y: 20, w: 40, h: 40, fill: "#ccc" }).name("c"),
      ]).relate(({ a, b, c }: any) => [
        line({ ...anchors, stroke: "black", curve: Curve.monotone() }, [
          a,
          b,
          c,
        ]),
      ]);
    /** The path's start and the end of each of its cubics, when it is one
     *  M followed by cubics only. */
    const knotsOf = (d: string): Point[] => {
      const cmds = commands(d);
      const end = (args: number[]): Point => [
        args[args.length - 2],
        args[args.length - 1],
      ];
      return cmds[0]?.op === "M" && cmds.slice(1).every((c) => c.op === "C")
        ? [cmds[0].args as Point, ...cmds.slice(1).map((c) => end(c.args))]
        : [];
    };
    const sorted = (rects: any[]) => [...rects].sort((r, s) => r.x - s.x);
    {
      // It leaves each mark at the middle of its right side and enters each
      // at the middle of its left side: the first mark only leaves, the
      // last only enters.
      const { rects, paths } = await drawn(
        through({ source: ["end", "middle"], target: ["start", "middle"] })
      );
      const [a, b, c] = sorted(rects);
      const left = (r: any): Point => [r.x, r.y + r.h / 2];
      const right = (r: any): Point => [r.x + r.w, r.y + r.h / 2];
      const want = [right(a), left(b), right(b), left(c)];
      const knots = paths.length === 1 ? knotsOf(paths[0].d) : [];
      check(
        "anchored at facing sides, it runs from a's source through b's target and source to c's target",
        knots.length === 4 && knots.every((k, i) => close(k, want[i])),
        paths.map((p) => p.d)
      );
    }
    {
      // Only `source`: the omitted target on each mark is the source point
      // itself, so it threads that point once on every mark.
      const { rects, paths } = await drawn(
        through({ source: ["end", "middle"] })
      );
      const want = sorted(rects).map((r): Point => [r.x + r.w, r.y + r.h / 2]);
      const knots = paths.length === 1 ? knotsOf(paths[0].d) : [];
      check(
        "with one end given, it threads that point on every mark",
        knots.length === 3 && knots.every((k, i) => close(k, want[i])),
        paths.map((p) => p.d)
      );
    }
    {
      const { rects, paths } = await drawn(through({}));
      const centers = sorted(rects).map(
        (r): Point => [r.x + r.w / 2, r.y + r.h / 2]
      );
      const knots = paths.length === 1 ? knotsOf(paths[0].d) : [];
      check(
        "unanchored, it threads the marks' centers",
        knots.length === 3 && knots.every((k, i) => close(k, centers[i])),
        paths.map((p) => p.d)
      );
    }
  }

  console.log("\n# a smooth ribbon over bars runs across each bar's top");
  {
    const rows = [
      { x: 0, v: 40 },
      { x: 1, v: 150 },
      { x: 2, v: 90 },
      { x: 3, v: 180 },
      { x: 4, v: 60 },
    ];
    const all = items(
      await chart(rows, { axes: false })
        .flow(scatter({ by: "x", x: "x" }))
        .mark(rect({ w: 30, h: "v", fill: "#ccc" }))
        .layer(ribbon({ fill: "steelblue" }))
        .toDisplayList({ w: 360, h: 220 })
    );
    const bars = all
      .filter((i) => i.kind === "rect")
      .sort((r: any, s: any) => r.x - s.x) as any[];
    const paths = all.filter((i) => i.kind === "path");
    const cmds = paths.length === 1 ? commands(paths[0].d) : [];
    // Every point the band's outline passes through.
    const ends: Point[] = cmds.map(({ args }) => [
      args[args.length - 2],
      args[args.length - 1],
    ]);
    const passes = (p: Point) => ends.some((q) => close(p, q, 1e-3));
    const topLeft = (r: any): Point => [r.x, r.y];
    const topRight = (r: any): Point => [r.x + r.w, r.y];
    const interior = bars.slice(1, -1);
    check(
      "smooth (cubic segments), through both top corners of each interior bar",
      bars.length === 5 &&
        cmds.some((c) => c.op === "C") &&
        interior.every((r) => passes(topLeft(r)) && passes(topRight(r))),
      paths.map((p) => p.d)
    );
    check(
      "from the first bar's far side to the last bar's near side",
      bars.length === 5 &&
        passes(topRight(bars[0])) &&
        !passes(topLeft(bars[0])) &&
        passes(topLeft(bars[4])) &&
        !passes(topRight(bars[4])),
      paths.map((p) => p.d)
    );
  }

  console.log("\n# a smooth ribbon over overlapping marks warns");
  {
    // The marks overlap along x, so each one's far side is past the next
    // one's near side.
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => warned.push(args.join(" "));
    try {
      await drawn(
        layer([
          rect({ x: 0, y: 0, w: 60, h: 40, fill: "#ccc" }).name("a"),
          rect({ x: 30, y: 60, w: 60, h: 40, fill: "#ccc" }).name("b"),
          rect({ x: 60, y: 20, w: 60, h: 40, fill: "#ccc" }).name("c"),
        ]).relate(({ a, b, c }: any) => [
          ribbon({ curve: Curve.monotone(), fill: "steelblue" }, [a, b, c]),
        ])
      );
    } finally {
      console.warn = warn;
    }
    check(
      "a [gofish:layout] warning names the overlap and what to do",
      warned.some(
        (w) =>
          w.startsWith("[gofish:layout] ribbon({ curve: Curve.monotone() })") &&
          w.includes("overlap along x") &&
          w.includes("Curve.linear()")
      ),
      warned
    );
  }

  console.log("\n# a ribbon takes only a curve that draws a band edge");
  {
    for (const [call, curve] of [
      ["Curve.arc()", Curve.arc()],
      ["Curve.perfectArrows()", Curve.perfectArrows()],
      // Each edge would pick its own bend axis, so the two can disagree.
      [
        'Curve.orthogonal({ bend: "auto" })',
        Curve.orthogonal({ bend: "auto" }),
      ],
      // A bare kind is its value.
      ["Curve.arc()", Curve.arc],
    ] as const) {
      const message = errorOf(() => ribbon({ curve }));
      check(
        `ribbon({ curve: ${call} }) throws, naming the curves that work`,
        message.startsWith(`[gofish] ribbon({ curve: ${call} }): `) &&
          message.includes("Curve.orthogonal()") &&
          message.includes("Curve.monotone()") &&
          !message.includes("Curve.arc(),"),
        message
      );
    }
    const seafood = [
      { lake: "A", species: "x", count: 10 },
      { lake: "A", species: "y", count: 20 },
      { lake: "B", species: "x", count: 30 },
      { lake: "B", species: "y", count: 5 },
    ];
    const bands = items(
      await chart(seafood, { axes: false })
        .flow(
          spread({ by: "lake", dir: "x", spacing: 40 }),
          stack({ by: "species", dir: "y" })
        )
        .mark(rect({ h: "count", fill: "species" }))
        .layer(ribbon({ curve: Curve.orthogonal() }))
        .toDisplayList({ w: 300, h: 200 })
    ).filter((i) => i.kind === "path");
    check(
      "ribbon({ curve: Curve.orthogonal() }) draws a band of straight segments",
      bands.length === 2 &&
        bands.every((b) => commands(b.d).every((c) => "MLZ".includes(c.op))),
      bands.map((b) => b.d)
    );
    check(
      "a bare band-edge kind works: ribbon({ curve: Curve.monotone })",
      errorOf(() => ribbon({ curve: Curve.monotone })) === "" &&
        errorOf(() => ribbon({ curve: Curve.orthogonal })) === ""
    );
    const bare = items(
      await chart(seafood, { axes: false })
        .flow(
          spread({ by: "lake", dir: "x", spacing: 40 }),
          stack({ by: "species", dir: "y" })
        )
        .mark(rect({ h: "count", fill: "species" }))
        .layer(ribbon({ curve: Curve.orthogonal }))
        .toDisplayList({ w: 300, h: 200 })
    ).filter((i) => i.kind === "path");
    check(
      "ribbon({ curve: Curve.orthogonal }) draws what Curve.orthogonal() draws",
      bare.length === 2 && bare.every((b, i) => b.d === bands[i].d),
      bare.map((b) => b.d)
    );

    console.log("\n# a ribbon's dir may be a numeric direction");
    const vertical = async (dir: any) =>
      items(
        await chart(seafood, { axes: false })
          .flow(
            spread({ by: "lake", dir: "y", spacing: 40 }),
            stack({ by: "species", dir: "x" })
          )
          .mark(rect({ w: "count", fill: "species" }))
          .layer(ribbon({ dir }))
          .toDisplayList({ w: 300, h: 200 })
      )
        .filter((i) => i.kind === "path")
        .map((b) => b.d);
    const [byName, byNumber] = [await vertical("y"), await vertical(1)];
    check(
      'ribbon({ dir: 1 }) draws what ribbon({ dir: "y" }) draws',
      byName.length === 2 &&
        byNumber.length === 2 &&
        byName.every((d, i) => d === byNumber[i]),
      { byName, byNumber }
    );
  }

  report();
}

main();
