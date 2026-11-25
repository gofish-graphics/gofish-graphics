/**
 * A rigid drawing inside a coordinate space (`rigid.ts`): a
 * `layer({ box: true })`, a text, an image, or a mark on an axis that does
 * not embed is drawn flat, with the point its relations pin on the image of
 * that point. Nothing pinned, it is placed by its middle, as a point mark
 * is. Pinned at the start of its box by a zero-gap chain, its start lands on
 * the end of the part before it. Pinned at two points of its box on one
 * axis, it cannot keep both in a space that is not linear, which is an
 * error. A ref from outside the space reads it where it is drawn.
 *
 * Run: `tsx src/tests/rigid.test.ts` (wired as `pnpm test:rigid`).
 */
import * as GoFish from "../lib";
import { check, items, report } from "./testHelpers";

const { Coord, Curve, layer, line, rect, spread, text } =
  GoFish as any;

type Pt = [number, number];
const near = (a: Pt | undefined, b: Pt | undefined, eps = 0.01) =>
  a !== undefined &&
  b !== undefined &&
  Math.abs(a[0] - b[0]) <= eps &&
  Math.abs(a[1] - b[1]) <= eps;
const show = (p: Pt | undefined) =>
  p ? `(${p[0].toFixed(2)},${p[1].toFixed(2)})` : "none";

const num = /-?\d+(?:\.\d+)?(?:e-?\d+)?/g;

/** The ends of the straight caps of a band path (`bandRegion`): each `L`
 *  joins the point before it to its target. */
const capsOf = (d: string): [Pt, Pt][] => {
  const out: [Pt, Pt][] = [];
  for (const m of d.matchAll(/L\s*(-?[\d.e-]+)[ ,](-?[\d.e-]+)/g)) {
    const before = (d.slice(0, m.index).match(num) ?? []).map(Number);
    const a: Pt = [before[before.length - 2], before[before.length - 1]];
    out.push([a, [Number(m[1]), Number(m[2])]]);
  }
  return out;
};

/** The caps of the band drawn in `fill`. */
const capsIn = (dl: any, fill: string): [Pt, Pt][] => {
  const path = items(dl).find(
    (it) => it.kind === "path" && it.style?.fill === fill
  );
  return path ? capsOf(path.d) : [];
};
const mid = ([a, b]: [Pt, Pt]): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** A rect item drawn in `fill`, as its box in screen pixels. */
const rectIn = (dl: any, fill: string) =>
  items(dl).find((it) => it.kind === "rect" && it.style?.fill === fill) as
    | { x: number; y: number; w: number; h: number }
    | undefined;
const bottomCenter = (r?: { x: number; y: number; w: number; h: number }) =>
  r ? ([r.x + r.w / 2, r.y + r.h] as Pt) : undefined;
const bottomLeft = (r?: { x: number; y: number; w: number; h: number }) =>
  r ? ([r.x, r.y + r.h] as Pt) : undefined;
const centerOf = (r?: { x: number; y: number; w: number; h: number }) =>
  r ? ([r.x + r.w / 2, r.y + r.h / 2] as Pt) : undefined;

/** A box of one 20 by 20 rect in `fill`, its whole box. */
const box = (fill: string) =>
  layer({ box: true }, [rect({ x: 0, y: 0, w: 20, h: 20, fill })]);

/** A string of height `h` with a box on top: a zero-gap chain along y. */
const balloon = (x: number, h: number, alignment = "middle", fill = "blue") =>
  spread({ x, y: 10, dir: "y", spacing: 0, alignment }, [
    rect({ w: 1, h, fill: "black" }),
    box(fill),
  ]);

const spaces = [
  ["wavy", () => Coord.wavy()],
  ["polar", () => Coord.clock()],
] as const;

async function main() {
  console.log("\n# a rigid box inside a coordinate space");

  for (const [name, coord] of spaces) {
    // Nothing pins it: placed by its middle, as a point rect is.
    {
      const at = name === "polar" ? { x: 0.6, y: 50 } : { x: 40, y: 40 };
      const dl = await layer({ coord: coord(), x: 0, y: 0 }, [
        rect({ ...at, w: 10, h: 10, fill: "red" }),
        layer({ box: true, ...at }, [
          rect({ x: 0, y: 0, w: 10, h: 10, fill: "blue" }),
        ]),
      ]).toDisplayList({ w: 200, h: 200 });
      const point = centerOf(rectIn(dl, "red"));
      const drawn = centerOf(rectIn(dl, "blue"));
      check(
        `${name}: a box nothing pins lands with its middle on the image of its middle`,
        near(point, drawn),
        `point rect ${show(point)}, box ${show(drawn)}`
      );
    }

    // A zero-gap chain along y pins the box's start on y to the string's
    // end, and the alignment its middle on x: its bottom center lands on
    // the string's warped top end.
    {
      const dl = await layer({ coord: coord(), x: 0, y: 0 }, [
        balloon(name === "polar" ? 0.6 : 30, 60),
      ]).toDisplayList({ w: 200, h: 200 });
      const caps = capsIn(dl, "black");
      const knot = bottomCenter(rectIn(dl, "blue"));
      check(
        `${name}: a box chained on a string has its bottom center on the string's end`,
        caps.some((cap) => near(mid(cap), knot)),
        `string ends ${caps.map((c) => show(mid(c))).join(" ")}, box bottom ${show(knot)}`
      );
    }

    // Aligned at start on x: its bottom-left corner lands on the string's
    // top end at its start edge, where the string's band runs along its
    // pinned edge.
    {
      const dl = await layer({ coord: coord(), x: 0, y: 0 }, [
        balloon(name === "polar" ? 0.6 : 30, 60, "start"),
      ]).toDisplayList({ w: 200, h: 200 });
      const caps = capsIn(dl, "black");
      const corner = bottomLeft(rectIn(dl, "blue"));
      check(
        `${name}: a box aligned at start on x has its bottom-left corner on the string's start edge`,
        caps.some((cap) => near(cap[0], corner) || near(cap[1], corner)),
        `string caps ${caps.map((c) => c.map(show).join("-")).join(" ")}, box corner ${show(corner)}`
      );
    }

    // Both edges pinned on y (the middle part of a chain): a rigid box
    // keeps one point only, so this is an error.
    {
      let message = "";
      try {
        await layer({ coord: coord(), x: 0, y: 0 }, [
          spread({ x: 30, y: 10, dir: "y", spacing: 0 }, [
            rect({ w: 1, h: 30, fill: "black" }),
            box("blue"),
            rect({ w: 1, h: 30, fill: "black" }),
          ]),
        ]).toDisplayList({ w: 200, h: 200 });
      } catch (e) {
        message = (e as Error).message;
      }
      check(
        `${name}: a box pinned at both edges on one axis is an error`,
        /a box inside a "\w+" coordinate space is pinned at start and end on y/.test(
          message
        ),
        message || "no error"
      );
    }
  }

  // The same three-part chain in a linear space is fine: a rigid box keeps
  // both of its edges there.
  {
    let message = "";
    try {
      await layer({ x: 0, y: 0 }, [
        spread({ x: 30, y: 10, dir: "y", spacing: 0 }, [
          rect({ w: 1, h: 30, fill: "black" }),
          box("blue"),
          rect({ w: 1, h: 30, fill: "black" }),
        ]),
      ]).toDisplayList({ w: 200, h: 200 });
    } catch (e) {
      message = (e as Error).message;
    }
    check(
      "linear: a box pinned at both edges draws",
      message === "",
      message
    );
  }

  // A text is rigid too: nothing pins it, so its middle lands on the image
  // of its middle, where a point rect of the same box is drawn.
  {
    const dl = await layer({ coord: Coord.clock(), x: 0, y: 0 }, [
      text({ x: 0.6, y: 50, text: "label", fontSize: 12 }).name("t"),
    ]).toDisplayList({ w: 200, h: 200 });
    const t = items(dl).find((it) => it.kind === "text");
    const plain = await layer({ x: 0, y: 0 }, [
      text({ x: 0.6, y: 50, text: "label", fontSize: 12 }),
    ]).toDisplayList({ w: 200, h: 200 });
    const p = items(plain).find((it) => it.kind === "text");
    check(
      "polar: a text is moved off its unwarped position",
      t !== undefined && p !== undefined && !near([t.x, t.y], [p.x, p.y], 1),
      `in polar ${t && show([t.x, t.y])}, unwarped ${p && show([p.x, p.y])}`
    );
  }

  // A ref from outside the space reads a box where it is drawn: a line
  // over two boxes runs through the middles of their drawn boxes.
  {
    const dl = await layer({ w: 200, h: 200 }, [
      layer({ coord: Coord.wavy(), x: 0, y: 0 }, [
        spread({ x: 20, y: 10, dir: "y", spacing: 0, alignment: "middle" }, [
          rect({ w: 1, h: 40, fill: "black" }),
          box("blue").name("b1"),
        ]),
        spread({ x: 70, y: 10, dir: "y", spacing: 0, alignment: "middle" }, [
          rect({ w: 1, h: 70, fill: "black" }),
          box("green").name("b2"),
        ]),
      ]),
    ])
      .relate((c: any) => [
        line({ stroke: "red", strokeWidth: 1, curve: Curve.linear() }, [
          c.b1,
          c.b2,
        ]),
      ])
      .toDisplayList();
    const path = items(dl).find(
      (it) => it.kind === "path" && it.style?.stroke === "red"
    );
    const pts = ((path?.d ?? "").match(num) ?? []).map(Number);
    const ends: Pt[] = [
      [pts[0], pts[1]],
      [pts[pts.length - 2], pts[pts.length - 1]],
    ];
    const middles = [centerOf(rectIn(dl, "blue")), centerOf(rectIn(dl, "green"))];
    check(
      "a line outside the space runs through the middles of the drawn boxes",
      near(ends[0], middles[0]) && near(ends[1], middles[1]),
      `line ${ends.map(show).join(" ")}, boxes ${middles.map(show).join(" ")}`
    );
  }

  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
