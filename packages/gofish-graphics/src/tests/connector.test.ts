/**
 * The connector form of `line` and `ribbon` (`graphicalOperators/connect.tsx`):
 * an anchored line is routed by its curve between its anchor points, and is
 * straight when it has none; a sequence curve given one end threads that
 * end's point on each mark; a ribbon takes only a curve that draws a band
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

  console.log("\n# a ribbon takes only a curve that draws a band edge");
  {
    for (const [name, curve] of [
      ["arc", Curve.arc()],
      ["perfectArrows", Curve.perfectArrows()],
      // Each edge would pick its own bend axis, so the two can disagree.
      ["orthogonal", Curve.orthogonal({ bend: "auto" })],
    ] as const) {
      const message = errorOf(() => ribbon({ curve }));
      check(
        `ribbon({ curve: Curve.${name}() }) throws, naming the curves that work`,
        message.startsWith(`[gofish] ribbon({ curve: Curve.${name}() }): `) &&
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
        bands.every((b) =>
          commands(b.d).every((c) => "MLZ".includes(c.op))
        ),
      bands.map((b) => b.d)
    );
  }

  report();
}

main();
