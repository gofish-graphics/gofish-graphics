/**
 * Regions handed down in the layout call (#1059, `geometry/region.ts`): a
 * node placed in a region fills each span it has no size along and is
 * centered in each span it has a size along; a `region` mark is its region,
 * and draws the region's outline when it has one, else its box. Partition
 * order invariance is checked in cells.test.ts. Run via `tsx`.
 */
import "../lib";
import { layer } from "../ast/graphicalOperators/layer";
import { Region } from "../ast/shapes/region";
import { Ellipse } from "../ast/shapes/ellipse";
import { Rect } from "../ast/shapes/rect";
import { Constraint, PositionRegion } from "../ast/constraints";
import { RegionCell } from "../ast/cells";
import { PolygonCell } from "../ast/polygonCells";
import { value } from "../ast/data";
import type { GoFishNode } from "../ast/_node";

declare const process: { exit(code: number): never };

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Lay `node` out alone, handed `spans` and proposed their lengths (as a
 *  layer proposes them), and return its box in its parent's frame, per axis
 *  `[min, max]`. */
function placedIn(
  node: GoFishNode,
  spans: [[number, number] | undefined, [number, number] | undefined]
): [number | undefined, number | undefined][] {
  node.resolveUnderlyingSpace();
  const size = spans.map((s) => (s === undefined ? 400 : s[1] - s[0]));
  const view = node.layout(size as [number, number], [undefined, undefined], {
    spans,
  });
  return [0, 1].map((a) => [view.dims[a].min, view.dims[a].max]);
}

async function main() {
  console.log("# a node placed in the region it is handed");
  {
    const box = placedIn(Region({}), [
      [10, 40],
      [20, 70],
    ]);
    ok(
      "a region is its region's box",
      JSON.stringify(box) === "[[10,40],[20,70]]",
      JSON.stringify(box)
    );
    const circle = placedIn(Ellipse({ w: 10, h: 10 }), [
      [10, 40],
      [20, 70],
    ]);
    ok(
      "a circle keeps its size and is centered in its region",
      JSON.stringify(circle) === "[[20,30],[40,50]]",
      JSON.stringify(circle)
    );
    const bar = placedIn(Rect({ h: 30 }), [[0, 50], undefined]);
    ok(
      "a rect fills the span it has no size along, and is left to its parent on an axis with no span",
      bar[0][0] === 0 && bar[0][1] === 50 && bar[1][0] === undefined,
      JSON.stringify(bar)
    );
  }

  console.log("# a region draws its outline, else its box");
  {
    // A diamond in [0, 2] × [0, 2], and a box cell [2, 4] × [0, 2].
    const diamond = new PolygonCell("d", [
      [1, 0],
      [2, 1],
      [1, 2],
      [0, 1],
    ]);
    class BoxCell extends RegionCell {
      readonly id = "b";
      readonly label = undefined;
      span(axis: 0 | 1): readonly [number, number] {
        return axis === 0 ? [2, 4] : [0, 2];
      }
    }
    const a = Region({ fill: "red" });
    a.name("a");
    const b = Region({ fill: "blue" });
    b.name("b");
    const node = (await layer({}, [a, b])) as GoFishNode;
    const columns = [value, value] as const;
    await node.relate((g: any) => [
      Constraint.position(
        { region: new PositionRegion(diamond, columns) },
        [g.a]
      ),
      Constraint.position(
        { region: new PositionRegion(new BoxCell(), columns) },
        [g.b]
      ),
    ]);
    const dl = await node.toDisplayList({ w: 200, h: 200 });
    const [outlined, boxed] = dl.items as any[];
    // 50px per unit on x from the left gutter (40px); y grows upward over
    // the 200px between 40 and 240.
    ok(
      "a region with an outline draws it as a path, through both scales",
      outlined?.kind === "path" &&
        outlined.d === "M90,240 L140,140 L90,40 L40,140 L90,240",
      JSON.stringify(outlined)
    );
    ok(
      "a region with no outline draws its box",
      boxed?.kind === "rect" &&
        boxed.x === 140 &&
        boxed.y === 40 &&
        boxed.w === 100 &&
        boxed.h === 200,
      JSON.stringify(boxed)
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
