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

const { chart, layer, rect, spread, Serialize } = GoFish as any;

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
