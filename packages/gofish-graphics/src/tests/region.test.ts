/**
 * Regions (#1059, #1234): a `region` mark reads the cell it is in from the
 * partition around it, in data, and is placed by its data there; a partition
 * inside another partition's cell divides that cell, so its children are
 * placed in the outer cell as the outer partition's own children are; and
 * that cell is the outer partition's, so it makes no cells of the inner one.
 * A region draws its cell's outline when it has one, else its box. Partition
 * order invariance is checked in cells.test.ts. Run via `tsx`.
 */
import "../lib";
import { layer } from "../ast/graphicalOperators/layer";
import { Region } from "../ast/shapes/region";
import {
  collectPositionDomains,
  Constraint,
  PositionRegion,
} from "../ast/constraints";
import { Cell, RegionCell } from "../ast/cells";
import { PolygonCell } from "../ast/polygonCells";
import { value } from "../ast/data";
import type { GoFishNode } from "../ast/_node";
import { check, items, report } from "./testHelpers";

declare const process: { exit(code: number): never };

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

async function main() {
  const {
    chart,
    partition,
    field,
    Bin,
    region,
    text,
    layer: layerOf,
  } = await import("../lib");

  console.log("# a region reads its cell from the partition around it");
  {
    // Cells [0, 1) and [1, 2) of a 200px-wide chart over [0, 2].
    const rects = items(
      await chart([{ v: 0.5 }, { v: 1.5 }], { axes: false })
        .flow(partition({ by: field("v").bin(Bin.step(1)), dir: "x" }))
        .mark(region())
        .toDisplayList({ w: 200, h: 100 })
    )
      .filter((it) => it.kind === "rect")
      .sort((a, b) => a.x - b.x);
    check(
      "a region is its cell on the axis the partition divides, through the partition's scale",
      rects.length === 2 &&
        near(rects[0].x, 0) &&
        near(rects[0].w, 100) &&
        near(rects[1].x, 100) &&
        near(rects[1].w, 100),
      JSON.stringify(rects)
    );
    check(
      "a region fills the size it is proposed on an axis with no cell",
      rects.every((r) => near(r.h, 100)),
      JSON.stringify(rects)
    );
  }

  console.log("# a partition inside another partition's cell divides it");
  {
    // Two columns of x, two rows of y: the cells are 100px squares. The
    // names differ in width, so a text aligned by its edge, rather than
    // centered in its cell, would show it.
    const rows = [
      { a: 0.5, b: 0.5, name: "a" },
      { a: 0.6, b: 1.5, name: "bbbbbbbb" },
      { a: 1.5, b: 0.5, name: "cc" },
      { a: 1.5, b: 1.5, name: "dddd" },
    ];
    const nested = (mark: any, first: "x" | "y") => {
      const px = partition({ by: field("a").bin(Bin.step(1)), dir: "x" });
      const py = partition({ by: field("b").bin(Bin.step(1)), dir: "y" });
      return chart(rows, { axes: false })
        .flow(...(first === "x" ? [px, py] : [py, px]))
        .mark(mark)
        .toDisplayList({ w: 200, h: 200 });
    };
    for (const first of ["x", "y"] as const) {
      const cells = items(await nested(region(), first)).filter(
        (it) => it.kind === "rect"
      );
      check(
        `a region in nested partitions (${first} first) is the cell where they meet`,
        cells.length === 4 &&
          cells.every(
            (r) =>
              near(r.w, 100) &&
              near(r.h, 100) &&
              near(r.x % 100, 0) &&
              near(r.y % 100, 0)
          ),
        JSON.stringify(cells)
      );
    }
    // On the outer partition's axis, each text sits in the middle of its
    // cell, as a child of the outer partition does, whatever its width: not
    // aligned with the other texts of its column by their start. A text
    // starts at `x` and is a fixed width per character.
    const texts = items(await nested(text({ text: field("name") }), "x"))
      .filter((it) => it.kind === "text")
      .map((t) => ({ text: t.text as string, x: t.x as number }));
    const a = texts.find((t) => t.text === "a");
    const perChar = a === undefined ? NaN : 2 * (50 - a.x);
    const middle = (t: { text: string; x: number }) =>
      t.x + (perChar * t.text.length) / 2;
    check(
      "a text in nested partitions sits in the middle of the outer partition's cell, whatever its width",
      texts.length === 4 &&
        perChar > 0 &&
        texts.every((t) => near(middle(t), t.text <= "bbbbbbbb" ? 50 : 150)),
      JSON.stringify(texts)
    );
  }

  console.log("# the cell a partition is in is not one of its cells");
  {
    // An inner y partition's child in the outer x cell [2, 3): the region
    // spans that cell on x, which places it there, but only its own key's
    // cell makes the layer's cells.
    const outer = new Cell(2, 3, "2–3");
    const inner = new Cell(0, 1, "0–1");
    const enclosing = new PositionRegion(outer, [value, undefined]);
    const region = new PositionRegion(inner, [undefined, value], enclosing);
    check(
      "the region spans its own cell and the cell it is in",
      JSON.stringify(region.spans.map((s) => s?.map((v: any) => v.datum))) ===
        "[[2,3],[0,1]]" && JSON.stringify(region.placed) === "[false,true]",
      JSON.stringify(region.spans)
    );
    const domains = collectPositionDomains([
      Constraint.position({ region }, [{ name: "child" } as any]),
    ]);
    check(
      "the cell it is in places the child on x, as an interval does, and makes no cells there",
      domains.x !== undefined &&
        domains.x.min === 2 &&
        domains.x.max === 3 &&
        domains.xCells === undefined &&
        domains.yCells !== undefined,
      JSON.stringify(domains)
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
      Constraint.position({ region: new PositionRegion(diamond, columns) }, [
        g.a,
      ]),
      Constraint.position(
        { region: new PositionRegion(new BoxCell(), columns) },
        [g.b]
      ),
    ]);
    const dl = await node.toDisplayList({ w: 200, h: 200 });
    const [outlined, boxed] = dl.items as any[];
    // 50px per unit on x from the left edge; y grows upward over the 200px
    // canvas.
    check(
      "a region with an outline draws it as a path, through both scales",
      outlined?.kind === "path" &&
        outlined.d === "M50,200 L100,100 L50,0 L0,100 L50,200",
      JSON.stringify(outlined)
    );
    check(
      "a region with no outline draws its box",
      boxed?.kind === "rect" &&
        boxed.x === 100 &&
        boxed.y === 0 &&
        boxed.w === 100 &&
        boxed.h === 200,
      JSON.stringify(boxed)
    );
  }

  console.log("# a region mark called with no options");
  {
    const rows = [{ v: 0.5 }, { v: 1.5 }, { v: 1.7 }];
    const dl = await chart(rows, { axes: false })
      .flow(partition({ by: field("v").bin(Bin.step(1)), dir: "x" }))
      .mark(region())
      .toDisplayList({ w: 200, h: 100 });
    check(
      "region() takes no options and draws one rect per cell",
      dl.items.filter((it: any) => it.kind === "rect").length === 2,
      JSON.stringify(dl.items.map((it: any) => it.kind))
    );
  }

  console.log("# a cell is not read across a frame of its own");
  {
    // Rows of a y partition, each 80px tall with a size of its own, so its
    // y is a frame of its own: its bars' `pdf`. An x partition in a row
    // gives its regions no cell on y in that frame, so each is as tall as
    // its row. EXPECTED FAILURE: the inner partition hands its regions the
    // outer month cell on y (`enclosingCell`), read through the row's `pdf`
    // scale, so they come out 26.7 and 20 pixels tall. Whether a node has a
    // frame of its own is decided at layout, after `enclosingCell` runs.
    const { layer: row, scatter, rect } = await import("../lib");
    const rows = [
      { m: 0.5, x: 0.5, pdf: 1 },
      { m: 0.5, x: 1.5, pdf: 3 },
      { m: 1.5, x: 0.5, pdf: 2 },
      { m: 1.5, x: 1.5, pdf: 4 },
    ];
    const dl = await chart(rows, { axes: false })
      .flow(partition({ by: field("m").bin(Bin.step(1)), dir: "y" }))
      .mark(
        row({ h: 80 }, [
          chart()
            .flow(scatter({ x: "x" }))
            .mark(rect({ w: 4, h: "pdf" })),
          chart()
            .flow(partition({ by: field("x").bin(Bin.step(1)), dir: "x" }))
            .mark(region()),
        ])
      )
      .toDisplayList({ w: 200, h: 200 });
    const cells = items(dl).filter((it) => it.kind === "rect" && it.w === 100);
    const passes = cells.length === 4 && cells.every((r) => near(r.h!, 80));
    if (passes)
      check(
        "a region across a frame of its own now fills its row: drop the expected failure",
        false
      );
    else
      console.log(
        `  xfail a region across a frame of its own fills its row — ${JSON.stringify(cells.map((r) => r.h))}`
      );
  }

  console.log("# a partition reads a cell a .relate() gives a node it is in");
  {
    // A y partition named "a", given the x cell [2, 3) by its layer's
    // `.relate()`: the partition reads that cell while its own pass runs,
    // before the round resolves the references, so the operand is read as
    // the handle it is.
    const inner = chart([{ b: 0.5 }, { b: 1.5 }], { axes: false })
      .flow(partition({ by: field("b").bin(Bin.step(1)), dir: "y" }))
      .mark(region());
    let error = "";
    let rects: any[] = [];
    try {
      rects = items(
        await layerOf([inner.name("a")])
          .relate(({ a }: any) => [
            Constraint.position(
              {
                region: new PositionRegion(new Cell(2, 3, "2–3"), [
                  value,
                  undefined,
                ]),
              },
              [a]
            ),
          ])
          .toDisplayList({ w: 200, h: 200 })
      ).filter((it) => it.kind === "rect");
    } catch (e) {
      error = (e as Error).message;
    }
    check(
      "the partition's regions read the cell the .relate() gives",
      error === "" &&
        rects.length === 2 &&
        rects.every((r) => near(r.w, rects[0].w)) &&
        rects.every((r) => near(r.h, 100)),
      error || JSON.stringify(rects)
    );
  }

  console.log("# a region its parent cannot place by its data is an error");
  {
    // A spread on x inside an x partition's cell places its children on x
    // in slots of its own, so it hands a region no map for its cell's data
    // there. The region claimed the cell on x, so its parent leaves it where
    // its data puts it: with no map that is nowhere, and it says so rather
    // than drawing at the size it is offered.
    const { spread } = await import("../lib");
    const rows = [
      { v: 0.5, g: "a" },
      { v: 1.5, g: "b" },
      { v: 1.5, g: "c" },
    ];
    const spreadOn = (dir: "x" | "y") =>
      chart(rows, { axes: false })
        .flow(
          partition({ by: field("v").bin(Bin.step(1)), dir: "x" }),
          spread({ by: "g", dir })
        )
        .mark(region())
        .toDisplayList({ w: 200, h: 100 });
    let error = "";
    try {
      await spreadOn("x");
    } catch (e) {
      error = (e as Error).message;
    }
    check(
      "a region with a cell on x and no map on x throws, naming the axis",
      error.startsWith("region: its cell's first edge on x does not map") &&
        error.includes("no map for its cell's data on x"),
      error
    );
    // On the axis with no cell it takes the size it is offered, as before.
    const rects = items(await spreadOn("y")).filter((it) => it.kind === "rect");
    check(
      "a spread on the axis the cell does not span still lays regions out",
      rects.length === 3 && rects.every((r) => near(r.w, 100)),
      JSON.stringify(rects)
    );
  }

  console.log("# a region's outline corner that does not map is an error");
  {
    // A cell whose box maps but one of whose corners is not a number: the
    // region throws rather than put NaN in the path it draws.
    class BadCell extends RegionCell {
      readonly id = "bad";
      readonly label = undefined;
      readonly outline = [
        [0, 0],
        [NaN, 1],
        [1, 1],
      ] as const;
      span(): readonly [number, number] {
        return [0, 1];
      }
    }
    const r = Region({});
    r.name("r");
    const node = (await layer({}, [r])) as GoFishNode;
    await node.relate((g: any) => [
      Constraint.position(
        { region: new PositionRegion(new BadCell(), [value, value]) },
        [g.r]
      ),
    ]);
    let error = "";
    try {
      await node.toDisplayList({ w: 100, h: 100 });
    } catch (e) {
      error = (e as Error).message;
    }
    check(
      "a corner that maps to NaN throws",
      error.startsWith("region: its cell's outline on x does not map") &&
        error.includes("NaN"),
      error
    );
  }

  console.log("# an align on a cell's axis defers to the cell");
  {
    // Two rects in the cells [0, 1) and [1, 2) on x, and an align of their
    // starts on x. The cells pin their middles, and the ownership plan
    // records them pinned, so the align moves neither (constraint
    // confluence covers the solve). EXPECTED FAILURE end to end: the
    // layer's type fold (`axisFragments` in compose.ts) lets the align fold
    // replace the layer's position frame on x, so the cells have no map
    // and both rects land at 0. An interval position under an align on its
    // own axis loses its frame the same way.
    const { Rect } = await import("../ast/shapes/rect");
    const a = Rect({ w: 20, h: 20 });
    a.name("a");
    const b = Rect({ w: 40, h: 20 });
    b.name("b");
    const node = (await layer({}, [a, b])) as GoFishNode;
    const cols = [value, undefined] as const;
    await node.relate((g: any) => [
      Constraint.position(
        { region: new PositionRegion(new Cell(0, 1, "0"), cols) },
        [g.a]
      ),
      Constraint.position(
        { region: new PositionRegion(new Cell(1, 2, "1"), cols) },
        [g.b]
      ),
      Constraint.align({ x: "start" }, [g.a, g.b]),
    ]);
    const rects = items(await node.toDisplayList({ w: 200, h: 100 }))
      .filter((it) => it.kind === "rect")
      .map((it) => it.x);
    if (near(rects[0], 40) && near(rects[1], 130))
      check(
        "an align on a cell's axis now leaves the cells in place: drop the expected failure",
        false
      );
    else
      console.log(
        `  xfail an align on a cell's axis leaves the cells in place — ${JSON.stringify(rects)}`
      );
  }

  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
