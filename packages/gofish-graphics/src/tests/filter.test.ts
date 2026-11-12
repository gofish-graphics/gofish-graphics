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
    ...all(
      (i.operands ?? []).flatMap((o: any) => [
        ...(o.paint ?? []),
        ...(o.shape ?? []),
      ])
    ),
  ]);

console.log("# a mark's filter wraps its drawing");
{
  const dl = await layer([
    rect({ w: 10, h: 10, fill: "red", filter: Filter.grayscale }),
    circle({ r: 5, fill: "blue" }),
  ]).toDisplayList({ w: 100, h: 100 });
  const g = groups(dl);
  check(
    "one filtered group, grayscale as a color matrix",
    g.length === 1 &&
      g[0].filter.kind === "colorMatrix" &&
      g[0].filter.type === "matrix" &&
      g[0].children[0].kind === "rect",
    dl.items
  );
  const svg = DisplayList.displayListToSVG(dl);
  const id = /<filter id="([^"]+)"/.exec(svg)?.[1];
  check(
    "the string backend draws grayscale as an feColorMatrix def",
    svg.includes(
      '<feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"/>'
    ) &&
      id !== undefined &&
      svg.includes(`filter="url(#${id})"`) &&
      !svg.includes("grayscale("),
    svg
  );
}

console.log("# a raw CSS string and an amount");
{
  const dl = await layer([
    rect({ w: 10, h: 10, fill: "red", filter: "url(#shadow)" }),
    rect({
      w: 10,
      h: 10,
      fill: "red",
      filter: Filter.grayscale({ amount: 0.5 }),
    }),
  ]).toDisplayList({ w: 100, h: 100 });
  const filters = groups(dl).map((g: any) => g.filter);
  check(
    "url(#shadow) and grayscale(0.5)",
    filters[0].kind === "css" &&
      filters[0].value === "url(#shadow)" &&
      filters[1].kind === "colorMatrix" &&
      filters[1].values.startsWith("0.6063 0.3576 0.0361 0 0 "),
    filters
  );
  const svg = DisplayList.displayListToSVG(dl);
  check(
    "the raw string stays CSS; the amount sets the matrix",
    svg.includes('filter="url(#shadow)"') &&
      svg.includes('values="0.6063 0.3576 0.0361 0 0 '),
    svg
  );
}

console.log("# two amounts draw two defs, one amount one");
{
  const dl = await layer([
    rect({ w: 10, h: 10, filter: Filter.grayscale }),
    rect({ w: 10, h: 10, filter: Filter.grayscale }),
    rect({ w: 10, h: 10, filter: Filter.grayscale({ amount: 0.5 }) }),
  ]).toDisplayList({ w: 100, h: 100 });
  const svg = DisplayList.displayListToSVG(dl);
  check("two <filter> defs", (svg.match(/<filter /g) ?? []).length === 2, svg);
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
      g[0].filter.kind === "colorMatrix" &&
      g[0].filter.type === "luminanceToAlpha" &&
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
  const dl = await layer([pair({ filter: "url(#shadow)" })]).toDisplayList({
    w: 100,
    h: 100,
  });
  const g = groups(dl);
  const xs = g[0]?.children.map((c: any) => c.x);
  check(
    "one filtered group holding both rects, side by side",
    g.length === 1 &&
      g[0].filter.value === "url(#shadow)" &&
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
      layer({ filter: "url(#shadow)" }, [
        rect({ w: 10, h: 10, fill: "red" }),
        rect({ x: 20, w: 10, h: 10, fill: "blue" }),
      ])
    )
    .toDisplayList({ w: 100, h: 100 });
  const g = all(dl.items).filter((i: any) => i.filter !== undefined);
  check(
    "one filtered group holding both shapes, under polar",
    g.length === 1 &&
      g[0].filter.value === "url(#shadow)" &&
      g[0].children.length === 2,
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
    kinds.includes("composite") ||
      kinds.filter((k: string) => k === "path" || k === "rect").length === 1,
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

console.log("# an amount out of [0, 1] is an error");
for (const amount of [1.5, -0.5]) {
  // CSS clamps `grayscale(amount)` to [0, 1]; the Filter family rejects an
  // amount past it, so the matrix is only ever made from one in range.
  let message = "";
  try {
    await layer([
      rect({ w: 10, h: 10, filter: Filter.grayscale({ amount }) }),
    ]).toDisplayList({ w: 100, h: 100 });
  } catch (e) {
    message = (e as Error).message;
  }
  check(
    `amount ${amount} throws`,
    message.includes(".amount: expected"),
    message
  );
}

console.log("# every filter reference names a def");
{
  // A filter inside a composite's operand is drawn in the composite's defs;
  // its <filter> def is still written.
  const dl = await layer([
    intersect([
      rect({ w: 10, h: 10, fill: "red", filter: Filter.grayscale }),
      rect({
        x: 5,
        w: 10,
        h: 10,
        fill: "blue",
        filter: Filter.luminanceToAlpha,
      }),
    ]),
    rect({ w: 10, h: 10, filter: Filter.grayscale }),
  ]).toDisplayList({ w: 100, h: 100 });
  const svg = DisplayList.displayListToSVG(dl);
  const defIds = new Set(
    [...svg.matchAll(/<filter id="([^"]+)"/g)].map((m) => m[1])
  );
  const refs = [...svg.matchAll(/filter="url\(#([^)]+)\)"/g)].map((m) => m[1]);
  check(
    "two defs, and each reference names one",
    defIds.size === 2 && refs.length >= 3 && refs.every((r) => defIds.has(r)),
    svg
  );
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
