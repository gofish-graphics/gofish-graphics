/**
 * The `effect` option (#1267): a mark's or a layer's whole drawing is drawn
 * in one group under its filter, an `Effect` strategy or a raw CSS string.
 *
 * Both backends are checked: the string backend (`displayListToSVG`) and the
 * DOM backend (`.render`, under happy-dom) draw the filter as an SVG `filter`
 * attribute.
 *
 * Run: `pnpm build && node --conditions browser --import tsx
 * src/tests/effect.test.ts` (wired as `pnpm test:effect`).
 */
// The headless DOM goes first, so its globals exist before the built library
// and solid-js/web evaluate.
import { settle } from "./interactionDomSetup";
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
  Effect,
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
    rect({ w: 10, h: 10, fill: "red", effect: Effect.grayscale }),
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
    rect({ w: 10, h: 10, fill: "red", effect: "blur(2px)" }),
    rect({ w: 10, h: 10, fill: "red", effect: Effect.grayscale({ amount: 0.5 }) }),
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
    layer({ effect: Effect.luminanceToAlpha }, [
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
  check(
    "the string backend writes no effect attribute",
    !svg.includes("effect="),
    svg
  );
}

console.log("# the DOM backend draws the same filter attribute");
{
  const container = document.createElement("div");
  document.body.appendChild(container);
  await layer([
    layer({ effect: Effect.luminanceToAlpha }, [
      rect({ w: 10, h: 10, fill: "white" }),
    ]),
    rect({ x: 20, w: 10, h: 10, fill: "red", effect: "blur(2px)" }),
  ]).render(container, { w: 100, h: 100 });
  await settle();
  const id = container.querySelector("filter")?.getAttribute("id");
  const filters = [...container.querySelectorAll("g[filter]")].map((g) =>
    g.getAttribute("filter")
  );
  check(
    "the luminanceToAlpha group's filter names the def",
    id !== undefined && id !== null && filters.includes(`url(#${id})`),
    container.innerHTML
  );
  check(
    "the CSS string is the blur group's filter",
    filters.includes("blur(2px)"),
    filters
  );
  check(
    "the DOM backend writes no effect attribute",
    container.querySelectorAll("[effect]").length === 0,
    container.innerHTML
  );
  container.remove();
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
  const dl = await layer([pair({ effect: "blur(2px)" })]).toDisplayList({
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
      layer({ effect: "blur(2px)" }, [
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
      rect({ w: 10, h: 10, effect: { kind: "sepia" } }),
    ]).toDisplayList({ w: 100, h: 100 });
  } catch {
    threw = true;
  }
  check("unknown kind throws", threw);
}

console.log("# the wire");
{
  const built = layer([rect({ w: 10, h: 10, effect: Effect.grayscale })]);
  const ir = await Serialize.toJSON(built);
  const json = JSON.stringify(ir);
  check(
    "effect crosses as its strategy object",
    json.includes('"effect":{"kind":"grayscale"}'),
    json
  );
}

report();
