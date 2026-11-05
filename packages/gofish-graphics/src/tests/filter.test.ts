/**
 * The `filter` option (#1267): a mark's or a layer's whole drawing is drawn
 * in one group under its filter, a `Filter` strategy or a raw CSS string.
 *
 * Run: `pnpm build && tsx src/tests/filter.test.ts` (wired as `pnpm test:filter`).
 */
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { DisplayList } from "gofish-ir";
import { check, report } from "./testHelpers";

const {
  chart,
  layer,
  rect,
  circle,
  spread,
  createMark,
  intersect,
  Coord,
  Filter,
  Serialize,
} = GoFish as any;

const groups = (dl: any) =>
  dl.items.filter((i: any) => i.kind === "group" && i.filter !== undefined);

/** Every item of a display list, groups' children and composites' operands
 *  included. */
const all = (items: any[]): any[] =>
  items.flatMap((i: any) => [
    i,
    ...all(i.children ?? []),
    ...all((i.operands ?? []).flatMap((o: any) => [...(o.paint ?? []), ...(o.shape ?? [])])),
  ]);

console.log("# a mark's filter wraps its drawing");
{
  const dl = await layer([
    rect({ w: 10, h: 10, fill: "red", filter: Filter.grayscale }),
    circle({ r: 5, fill: "blue" }),
  ]).toDisplayList({ w: 100, h: 100 });
  const g = groups(dl);
  check(
    "one filtered group, grayscale(1)",
    g.length === 1 &&
      g[0].filter.kind === "css" &&
      g[0].filter.value === "grayscale(1)" &&
      g[0].children[0].kind === "rect",
    dl.items
  );
}

console.log("# a raw CSS string and an amount");
{
  const dl = await layer([
    rect({ w: 10, h: 10, fill: "red", filter: "blur(2px)" }),
    rect({ w: 10, h: 10, fill: "red", filter: Filter.grayscale({ amount: 0.5 }) }),
  ]).toDisplayList({ w: 100, h: 100 });
  const values = groups(dl).map((g: any) => g.filter.value);
  check(
    "blur(2px) and grayscale(0.5)",
    values[0] === "blur(2px)" && values[1] === "grayscale(0.5)",
    values
  );
}

console.log("# a layer's filter wraps its whole subtree");
{
  const dl = await layer([
    layer({ filter: Filter.luminanceToAlpha }, [
      rect({ w: 10, h: 10, fill: "white" }),
      rect({ x: 20, w: 10, h: 10, fill: "black" }),
    ]),
  ]).toDisplayList({ w: 100, h: 100 });
  const g = groups(dl);
  check(
    "one luminanceToAlpha group holding both rects",
    g.length === 1 &&
      g[0].filter.kind === "luminanceToAlpha" &&
      g[0].children.length === 2,
    dl.items
  );
  const svg = DisplayList.displayListToSVG(dl);
  check(
    "the string backend draws the feColorMatrix def",
    svg.includes('<feColorMatrix type="luminanceToAlpha"/>') &&
      svg.includes('color-interpolation-filters="sRGB"'),
    svg
  );
  const id = /<filter id="([^"]+)"/.exec(svg)?.[1];
  check(
    "the group's filter names the def",
    id !== undefined && svg.includes(`filter="url(#${id})"`),
    svg
  );
}

console.log("# a mark built from an operator takes a filter");
{
  // An operator that only places its children has no lowering of its own;
  // filtered, it draws its children where it put them, in one group.
  const pair = createMark(() =>
    spread({ dir: "x", spacing: 0 }, [
      rect({ w: 10, h: 10, fill: "red" }),
      rect({ w: 10, h: 10, fill: "blue" }),
    ])
  );
  const dl = await layer([pair({ filter: "blur(2px)" })]).toDisplayList({
    w: 100,
    h: 100,
  });
  const g = groups(dl);
  const xs = g[0]?.children.map((c: any) => c.x);
  check(
    "one blur group holding both rects, side by side",
    g.length === 1 &&
      g[0].filter.value === "blur(2px)" &&
      g[0].children.length === 2 &&
      xs[1] - xs[0] === 10,
    dl.items
  );
}

console.log("# a filter inside a coordinate space");
{
  // A coord bakes its children the way the root does, so it stops at a
  // filtered node, which filters its subtree as one picture.
  const dl = await chart([{ v: 1 }], { coord: Coord.polar() })
    .mark(() =>
      layer({ filter: "blur(2px)" }, [
        rect({ w: 10, h: 10, fill: "red" }),
        rect({ x: 20, w: 10, h: 10, fill: "blue" }),
      ])
    )
    .toDisplayList({ w: 100, h: 100 });
  const g = all(dl.items).filter((i: any) => i.filter !== undefined);
  check(
    "one blur group holding both shapes, under polar",
    g.length === 1 && g[0].filter.value === "blur(2px)" && g[0].children.length === 2,
    dl.items
  );
}

console.log("# a compositor inside a coordinate space");
{
  // The coord bake stops at a compositor too: it composites its operands
  // rather than drawing each one on its own.
  const dl = await chart([{ v: 1 }], { coord: Coord.polar() })
    .mark(() =>
      intersect([
        rect({ w: 10, h: 10, fill: "red" }),
        rect({ x: 5, w: 10, h: 10, fill: "blue" }),
      ])
    )
    .toDisplayList({ w: 100, h: 100 });
  const kinds = all(dl.items).map((i: any) => i.kind);
  check(
    "the operands draw as one composite, not two shapes",
    kinds.includes("composite") || kinds.filter((k: string) => k === "path" || k === "rect").length === 1,
    kinds
  );
}

console.log("# a bad strategy is an error");
{
  let threw = false;
  try {
    await layer([
      rect({ w: 10, h: 10, filter: { kind: "sepia" } }),
    ]).toDisplayList({ w: 100, h: 100 });
  } catch {
    threw = true;
  }
  check("unknown kind throws", threw);
}

console.log("# the wire");
{
  const built = layer([rect({ w: 10, h: 10, filter: Filter.grayscale })]);
  const ir = await Serialize.toJSON(built);
  const json = JSON.stringify(ir);
  check(
    "filter crosses as its strategy object",
    json.includes('"filter":{"kind":"grayscale"}'),
    json
  );
}

report();
