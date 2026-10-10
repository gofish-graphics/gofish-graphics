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
import { Constraint } from "../ast/constraints";
import { toDisplayList } from "../ast/displayList/toDisplayList";
import { value as v, datum } from "../ast/data";

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

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
