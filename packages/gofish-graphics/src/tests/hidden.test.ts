/**
 * `.hidden()` (#1267): a hidden mark is laid out, feeds its scales and
 * refs, and paints nothing; an ancestor's hidden wins over a descendant's
 * `.hidden(false)`; and the flag crosses the wire.
 *
 * Run: `pnpm build && tsx src/tests/hidden.test.ts` (wired as `pnpm test:hidden`).
 */
// @ts-ignore -- dist may not exist at typecheck time; the test script builds first.
import * as GoFish from "../../dist/index.js";
import { check, items, report } from "./testHelpers";

const { blank, chart, circle, intersect, layer, rect, spread, Serialize } =
  GoFish as any;

const kinds = (dl: any) => items(dl).map((i) => i.kind);

console.log("# a hidden mark paints nothing and keeps its place");
{
  const shown = await spread({ dir: "x", spacing: 0 }, [
    rect({ w: 10, h: 10, fill: "red" }),
    rect({ w: 10, h: 10, fill: "blue" }),
  ]).toDisplayList({ w: 100, h: 100 });
  const hidden = await spread({ dir: "x", spacing: 0 }, [
    rect({ w: 10, h: 10, fill: "red" }).hidden(),
    rect({ w: 10, h: 10, fill: "blue" }),
  ]).toDisplayList({ w: 100, h: 100 });
  const blueShown = items(shown).find((i: any) => i.style?.fill === "blue");
  const blueHidden = items(hidden).find((i: any) => i.style?.fill === "blue");
  check("one rect left", items(hidden).length === 1, kinds(hidden));
  check("no red rect", !items(hidden).some((i: any) => i.style?.fill === "red"));
  check(
    "the blue rect does not move",
    blueShown?.x === blueHidden?.x && blueShown?.y === blueHidden?.y,
    [blueShown, blueHidden]
  );
}

console.log("# .hidden(false) and the last call");
{
  const dl = await layer([
    rect({ w: 10, h: 10, fill: "red" }).hidden().hidden(false),
  ]).toDisplayList({ w: 100, h: 100 });
  check("last call wins", items(dl).length === 1, kinds(dl));
}

console.log("# an ancestor's hidden wins");
{
  const dl = await layer([
    layer([rect({ w: 10, h: 10, fill: "red" }).hidden(false)]).hidden(),
    rect({ w: 10, h: 10, fill: "blue" }),
  ]).toDisplayList({ w: 100, h: 100 });
  check(
    "only the blue rect paints",
    items(dl).length === 1 && (items(dl)[0] as any).style?.fill === "blue",
    items(dl)
  );
}

console.log("# per datum");
{
  const rows = [
    { k: "a", v: 1 },
    { k: "b", v: 2 },
    { k: "c", v: 3 },
  ];
  const dl = await chart(rows)
    .flow(spread({ by: "k", dir: "x" }))
    .mark(rect({ h: "v" }).hidden((d: any) => d[0].k === "b"))
    .toDisplayList({ w: 300, h: 100, axes: false });
  check("two of three bars paint", items(dl).length === 2, kinds(dl));
}

console.log("# a hidden mark's label hides with it");
{
  // A label lives out of its mark's subtree, attached to it.
  const rows = [
    { name: "a", year: 1990 },
    { name: "b", year: 2000 },
    { name: "c", year: 2010 },
  ];
  const dl = await chart(rows)
    .flow(spread({ by: "name", dir: "x" }))
    .mark(
      circle({ r: 5 })
        .label("name")
        .hidden((d: any) => d[0].year !== 2000)
    )
    .toDisplayList({ w: 300, h: 100, axes: false });
  const texts = items(dl).filter((i: any) => i.kind === "text");
  check(
    "one circle and its one label paint",
    items(dl).filter((i: any) => i.kind === "ellipse").length === 1 &&
      texts.length === 1 &&
      (texts[0] as any).text === "b",
    items(dl)
  );
}

console.log("# a hidden chart still sets its scale");
{
  const rows = [{ k: "a", v: 10 }];
  const shown = await chart(rows)
    .flow(spread({ by: "k", dir: "x" }))
    .mark(rect({ h: "v" }))
    .toDisplayList({ w: 300, h: 100, axes: true });
  const hidden = await chart(rows)
    .flow(spread({ by: "k", dir: "x" }))
    .mark(rect({ h: "v" }))
    .hidden()
    .toDisplayList({ w: 300, h: 100, axes: true });
  check(
    "a hidden chart paints nothing, axes included",
    items(hidden).length === 0 && items(shown).length > 1,
    [items(hidden).length, items(shown).length]
  );
}

console.log("# a hidden operand gives its shape and no paint");
{
  const dl = await intersect([
    rect({ x: 0, y: 0, w: 40, h: 40 }).hidden(),
    rect({ x: 20, y: 0, w: 40, h: 40, fill: "red" }),
  ]).toDisplayList({ w: 100, h: 100 });
  const c = dl.items.find((i: any) => i.kind === "composite");
  check(
    "the hidden operand: no paint, one rect of shape",
    c?.operands[0].paint.length === 0 && c?.operands[0].shape?.length === 1,
    c?.operands[0]
  );
  check(
    "the shown operand: its paint, and no separate shape",
    c?.operands[1].paint.length === 1 && c?.operands[1].shape === undefined,
    c?.operands[1]
  );
}
{
  // A blank is a hidden rect: alone it draws nothing, and as an operand it
  // gives its box.
  const alone = await layer([
    blank({ w: 40, h: 40 }),
    rect({ w: 10, h: 10, fill: "red" }),
  ]).toDisplayList({ w: 100, h: 100 });
  check("a blank draws nothing", items(alone).length === 1, kinds(alone));
  const dl = await intersect([
    blank({ x: 0, y: 0, w: 40, h: 40 }),
    rect({ x: 20, y: 0, w: 40, h: 40, fill: "red" }),
  ]).toDisplayList({ w: 100, h: 100 });
  const c = dl.items.find((i: any) => i.kind === "composite");
  check(
    "a blank operand: no paint, its box as shape",
    c?.operands[0].paint.length === 0 && c?.operands[0].shape?.length === 1,
    c?.operands[0]
  );
}
{
  // `.hidden()` has no effect on a blank: it is always hidden.
  const red = (dl: any) =>
    items(dl).filter((i: any) => i.style?.fill === "red").length;
  const unhidden = await layer([
    blank({ w: 40, h: 40, fill: "red" }).hidden(false),
  ]).toDisplayList({ w: 100, h: 100 });
  check("blank().hidden(false) paints nothing", items(unhidden).length === 0, kinds(unhidden));
  const perDatum = await chart([{ v: 1 }, { v: 2 }])
    .flow(spread({ by: "v", dir: "x" }))
    .mark(blank({ w: 10, h: 10, fill: "red" }).hidden(() => false))
    .toDisplayList({ w: 100, h: 100 });
  check("blank().hidden(fn) paints nothing", red(perDatum) === 0, kinds(perDatum));
  const dl = await intersect([
    blank({ x: 0, y: 0, w: 40, h: 40 }).hidden(false),
    rect({ x: 20, y: 0, w: 40, h: 40, fill: "red" }),
  ]).toDisplayList({ w: 100, h: 100 });
  const c = dl.items.find((i: any) => i.kind === "composite");
  check(
    "a blank operand with .hidden(false): no paint, its box as shape",
    c?.operands[0].paint.length === 0 && c?.operands[0].shape?.length === 1,
    c?.operands[0]
  );
  const ir = await chart([{ v: 1 }])
    .mark(blank({ w: 10, h: 10, fill: "red" }).hidden(false))
    .toJSON();
  const rebuilt = await Serialize.buildIR(ir).toDisplayList({ w: 100, h: 100 });
  check(
    "blank().hidden(false) round-trips as written and still paints nothing",
    (ir.root as any)?.mark?.hidden === false && red(rebuilt) === 0,
    [(ir.root as any)?.mark, kinds(rebuilt)]
  );
}
{
  // An intersect hidden inside another's operand gives that one its shape;
  // its own hidden operand is still its own shape.
  const dl = await intersect([
    layer([
      intersect([
        rect({ x: 0, y: 0, w: 40, h: 40 }).hidden(),
        rect({ x: 20, y: 0, w: 40, h: 40 }),
      ]),
    ]).hidden(),
    rect({ x: 0, y: 0, w: 100, h: 20, fill: "red" }),
  ]).toDisplayList({ w: 100, h: 100 });
  const outer = dl.items.find((i: any) => i.kind === "composite");
  const inner = outer?.operands[0].shape?.[0];
  check(
    "the outer operand is shape only; the inner composite keeps its split",
    outer?.operands[0].paint.length === 0 &&
      inner?.kind === "composite" &&
      inner.operands[0].paint.length === 0 &&
      inner.operands[0].shape?.length === 1,
    outer?.operands[0]
  );
}

console.log("# a datum that does not serialize");
{
  // Lowering never serializes a datum: a circular one is fine.
  const row: any = { k: "a", v: 10 };
  row.self = row;
  let message = "";
  try {
    await intersect([
      chart([row])
        .flow(spread({ by: "k", dir: "x" }))
        .mark(rect({ h: "v" }).hidden()),
      rect({ x: 0, y: 0, w: 100, h: 5 }),
    ]).toDisplayList({ w: 100, h: 100, axes: false });
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  check("a circular datum under a composite lowers", message === "", message);
}

console.log("# the wire");
{
  const built = chart([{ v: 1 }])
    .mark(rect({ h: "v" }).hidden())
    .hidden();
  const ir = await Serialize.toJSON(built);
  check("chart hidden on the wire", ir.root?.hidden === true, ir.root);
  check("mark hidden on the wire", ir.root?.mark?.hidden === true, ir.root);
}

report();
