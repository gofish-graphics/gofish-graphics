/**
 * Polygon clipping (`geometry/clip.ts`) and the painted `intersect` it backs:
 * the exact path, the mask fill, and the loud error for a stroke with no
 * exact outline.
 *
 * Run: `pnpm build && tsx src/tests/clip.test.ts` (wired as `pnpm test:clip`).
 */
import {
  clipToConvex,
  insetConvex,
  intersectRings,
  isConvex,
} from "../ast/geometry/clip";
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { check, items, report } from "./testHelpers";

const { circle, image, intersect, rect, text } = GoFish as any;

type Pt = [number, number];

const area = (ring: readonly Pt[]): number => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
};

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

console.log("# clipToConvex and intersectRings");
{
  const r = clipToConvex(box(0, 0, 10, 10), box(5, 5, 15, 15));
  check(
    "two overlapping squares meet in a 5 by 5 square",
    near(area(r), 25),
    r
  );
}
{
  // An L shape (not convex) clipped by a square over its corner.
  const l: Pt[] = [
    [0, 0],
    [10, 0],
    [10, 4],
    [4, 4],
    [4, 10],
    [0, 10],
  ];
  check("the L shape is not convex", !isConvex(l));
  const r = intersectRings(l, box(2, 2, 8, 8));
  // The square's 36 less the 4 by 4 corner the L does not cover.
  check(
    "a non-convex ring meets a convex one exactly",
    r !== undefined && near(area(r), 36 - 16),
    r
  );
  check(
    "the argument order does not matter",
    near(area(intersectRings(box(2, 2, 8, 8), l)!), 20)
  );
}
{
  const r = clipToConvex(box(0, 0, 1, 1), box(5, 5, 6, 6));
  check("disjoint rings meet in nothing", r.length === 0, r);
}
{
  const r = clipToConvex(box(2, 2, 3, 3), box(0, 0, 10, 10));
  check("a ring inside the other is kept whole", near(area(r), 1), r);
  const s = clipToConvex(box(0, 0, 10, 10), box(2, 2, 3, 3));
  check("a ring around the other is cut to it", near(area(s), 1), s);
}
{
  // Clockwise winding works as well as counterclockwise.
  const cw = [...box(5, 5, 15, 15)].reverse() as Pt[];
  check(
    "a clockwise clip ring clips the same",
    near(area(clipToConvex(box(0, 0, 10, 10), cw)), 25)
  );
}
{
  const l: Pt[] = [
    [0, 0],
    [10, 0],
    [10, 4],
    [4, 4],
    [4, 10],
    [0, 10],
  ];
  check(
    "two non-convex rings have no exact intersection (#1201)",
    intersectRings(l, l) === undefined
  );
}

console.log("# insetConvex");
{
  const r = insetConvex(box(0, 0, 10, 6), 1);
  check("a 10 by 6 box drawn in by 1 is 8 by 4", near(area(r), 32), r);
  check(
    "a box thinner than twice the inset draws nothing",
    insetConvex(box(0, 0, 10, 1), 1).length === 0
  );
}

console.log("# intersect with paint");
{
  const dl = await intersect(
    { fill: "#D1E4F6", stroke: "#467DA8", strokeWidth: 2 },
    [
      rect({ x: 0, y: 0, w: 100, h: 100 }),
      rect({ x: 50, y: 50, w: 100, h: 100 }),
    ]
  ).toDisplayList({ w: 200, h: 200 });
  const drawn = items(dl);
  const paths = drawn.filter((it) => it.kind === "path");
  check(
    "two rects intersect to one stroked path, with no mask",
    paths.length === 1 &&
      paths[0].style?.stroke === "#467DA8" &&
      paths[0].style?.fill === "#D1E4F6" &&
      !drawn.some((it) => it.kind === "mask"),
    drawn.map((it) => it.kind)
  );
}
{
  const dl = await intersect({ fill: "#467DA8" }, [
    image({ href: "x.png", x: 0, y: 0, w: 100, h: 100 }),
    rect({ x: 50, y: 0, w: 100, h: 100 }),
  ]).toDisplayList({ w: 200, h: 200 });
  const masks = items(dl).filter((it) => it.kind === "mask");
  check(
    "an image operand fills through an alpha mask",
    masks.length > 0 && masks.every((m) => m.mode === "alpha"),
    masks
  );
}
{
  let message = "";
  try {
    await intersect({ fill: "#eee", stroke: "black" }, [
      text({ text: "GoFish", x: 0, y: 0, fontSize: 40 }),
      circle({ cx: 40, cy: 20, r: 30 }),
    ]).toDisplayList({ w: 200, h: 100 });
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  check(
    "a stroke over an operand with no exact outline is a loud error",
    /intersect/.test(message) && /stroke/.test(message),
    message
  );
}
{
  // A rect's outline is what it draws: its box drawn in by its inset, with
  // its corners rounded, so a stroke over either one has an exact path.
  for (const [what, drawnRect] of [
    ["an inset rect", rect({ x: 50, w: 100, inset: 10 })],
    ["a rounded rect", rect({ x: 50, y: 50, w: 100, h: 100, rx: 20 })],
  ] as const) {
    let message = "";
    let paths: unknown[] = [];
    try {
      const dl = await intersect({ fill: "#eee", stroke: "black" }, [
        rect({ x: 0, y: 0, w: 100, h: 100 }),
        drawnRect,
      ]).toDisplayList({ w: 200, h: 200 });
      paths = items(dl).filter((it) => it.kind === "path");
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    check(
      `a stroke over ${what} is one exact path`,
      message === "" && paths.length === 1,
      message || paths
    );
  }
}
{
  // Unpainted, a composite draws as before: its operands under a mask.
  const dl = await intersect([
    rect({ x: 0, y: 0, w: 100, h: 100, fill: "red" }),
    rect({ x: 50, y: 50, w: 100, h: 100, fill: "blue" }),
  ]).toDisplayList({ w: 200, h: 200 });
  check(
    "an unpainted intersect draws no path of its own",
    !items(dl).some((it) => it.kind === "path"),
    items(dl).map((it) => it.kind)
  );
}

report();
