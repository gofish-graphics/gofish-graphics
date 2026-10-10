/**
 * Measure-keyed domains (#1114) end to end: small figures rendered to a
 * display list, one per review finding on PR #1129, each checking where the
 * marks land. The unit checks of the table and the sharing plans are in
 * `keyedDomains.test.ts` and `sharing.test.ts`.
 *
 * Run: `tsx src/tests/keyedDomainsRender.test.ts` (wired as
 * `pnpm test:keyed-domains-render`).
 */
import { Rect as rect } from "../ast/shapes/rect";
import { layer } from "../ast/graphicalOperators/layer";
import { stackX } from "../ast/graphicalOperators/stackX";
import { Constraint } from "../ast/constraints";
import { toDisplayList } from "../ast/displayList/toDisplayList";
import { value as v, datum } from "../ast/data";
import { chart, scatter, rect as rectMark, Schema } from "../lib";

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}`, detail ?? "");
  }
}
const near = (a: number | undefined, b: number) =>
  a !== undefined && Math.abs(a - b) < 1e-6;

type Item = { kind: string; x?: number; y?: number; w?: number; h?: number; fill?: string; text?: string };
const items = (dl: any): Item[] => {
  const out: Item[] = [];
  const walk = (it: any) => {
    if (it.kind !== "group") out.push(it);
    for (const c of it.children ?? []) walk(c);
  };
  dl.items.forEach(walk);
  return out;
};
const byFill = (dl: any, fill: string) =>
  items(dl).filter((i) => i.kind === "rect" && (i as any).style?.fill === fill);

async function main() {
  console.log("# a glyph nested at a datum inherits its parent's σ");
  {
    // The blue rect spans data 0..100 across 200 px, so σ = 2. The red glyph
    // holds pinned data 0..10 and is placed at datum 50: it is 20 px wide,
    // centered on the pixel of 50. Before, it solved its own σ against the
    // whole canvas and filled it.
    const glyph = (layer as any)([
      (rect as any)({ x: v(0), w: v(10), h: 10, fill: "red" }),
    ]).name("g");
    const ruler = (rect as any)({ x: v(0), w: v(100), h: 5, fill: "blue" });
    const node = (layer as any)([ruler, glyph]).relate(({ g }: any) => [
      Constraint.position({ x: datum(50) }, [g]),
    ]);
    const dl = await toDisplayList(node, { w: 200, h: 50 });
    const [blue] = byFill(dl, "blue");
    const [red] = byFill(dl, "red");
    check("the glyph's data is 20 px wide (σ = 2)", near(red?.w, 20), red);
    check(
      "the glyph is centered on the pixel of its datum",
      near((red?.x ?? 0) + 10, (blue?.x ?? 0) + 100),
      { red, blue }
    );
  }

  console.log("# a child nested at a datum does not widen its parent's domain");
  {
    // Bars at x = start with width `width`, both in days. The bar's own
    // width interval [0, width] is in its own frame at the datum, so it
    // must not pull 0 into the day domain: the domain stays [10, 20], and
    // the bars at 10 and 20 sit the whole 200 px apart. Before, the domain
    // was [0, 20] and they sat 100 px apart.
    const tasks = [
      { id: "a", start: 10, width: 2 },
      { id: "b", start: 20, width: 4 },
    ];
    const dl = await chart(tasks, {
      schema: { start: Schema.unit("day"), width: Schema.unit("day") },
    })
      .flow(scatter({ by: "id", x: "start" }))
      .mark(rectMark({ w: "width", h: 10, fill: "green" }))
      .toDisplayList({ w: 200, h: 50 });
    const [a, b] = byFill(dl, "green").sort((p, q) => p.x! - q.x!);
    const center = (r: Item) => r.x! + r.w! / 2;
    check(
      "the bars' datums sit the canvas width apart (domain [10, 20])",
      near(center(b) - center(a), 200),
      { a, b }
    );
  }

  console.log("# a literal size reports a fixed pixel claim");
  {
    // A 100 px box of data beside a rect of 50 data units, in one 200 px
    // stack: the box takes its 100 px, so σ solves 100 + 50σ = 200 and the
    // rect is 100 px wide. Before, the box passed its content's σ claim up,
    // so the stack solved (10 + 50)σ = 200 and the rect was 167 px wide.
    const node = (stackX as any)({ spacing: 0, alignment: "start" }, [
      (layer as any)({ w: 100, h: 20 }, [
        (rect as any)({ w: v(10), h: 20, fill: "red" }),
      ]),
      (rect as any)({ w: v(50), h: 20, fill: "blue" }),
    ]);
    const dl = await toDisplayList(node, { w: 200, h: 50 });
    const [blue] = byFill(dl, "blue");
    check("the rect beside a fixed box gets the rest (σ = 2)", near(blue?.w, 100), blue);
  }
  {
    // Rendered with no canvas width, a fixed box needs no canvas: it is its
    // own 100 px, not data-scaled room the default canvas would fill.
    const node = (layer as any)({ w: 100, h: 20 }, [
      (rect as any)({ w: v(10), h: 20, fill: "red" }),
    ]);
    const dl: any = await toDisplayList(node, { h: 50 });
    const [red] = byFill(dl, "red");
    check(
      "a fixed box with no render width keeps its own width",
      near(dl.viewport.w - 2 * (red?.x ?? 0), 100),
      { viewport: dl.viewport, red }
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
