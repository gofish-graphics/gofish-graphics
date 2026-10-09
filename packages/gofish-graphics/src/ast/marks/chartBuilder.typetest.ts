/**
 * Type-level tests for `chart(...)` and `ChartBuilder.mark()`. Nothing here
 * runs: the package typecheck (`tsc --noEmit`) compiles this file, and a wrong
 * type is a compile error. Stories sit outside the tsc include, so the specs
 * they rely on are checked here.
 */
import { chart } from "./chartBuilder";
import type { ChartBuilder, LayerBuilder } from "./chartBuilder";
import { line } from "./chart";
import {
  stack,
  scatter,
  layer,
  rect,
  petal,
  Constraint,
  Coord,
  selectAll,
  ref,
} from "../../lib";
import type { GoFishRef } from "../_ref";

type Equal<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
    ? true
    : false;
function expectType<T extends true>(): void {}

type Row = { lake: string; species: string; count: number; x: number };

export function chartOverloads(rows: Row[]) {
  // An options-only call is an empty scope, not data.
  const emptyWithOptions = chart({ coord: Coord.polar(), axes: false });
  expectType<Equal<typeof emptyWithOptions, ChartBuilder<any, any>>>();
  const empty = chart();
  expectType<Equal<typeof empty, ChartBuilder<any, any>>>();
  // Data, with and without options, keeps its row type.
  const data = chart(rows);
  expectType<Equal<typeof data, ChartBuilder<Row[], Row[]>>>();
  const dataWithOptions = chart(rows, { axes: false });
  expectType<Equal<typeof dataWithOptions, ChartBuilder<Row[], Row[]>>>();
  // A plural ref flows downstream as an array of refs.
  const refs = chart(selectAll("bars"));
  expectType<Equal<typeof refs, ChartBuilder<GoFishRef[], GoFishRef[]>>>();
  // A single ref is data too, though it shares the `color` key with options.
  const one = chart(ref("bars"));
  expectType<Equal<typeof one, ChartBuilder<GoFishRef, GoFishRef>>>();
}

export function markReturnTypes(rows: Row[]) {
  // A non-relational mark never fuses, so `.mark()` stays a ChartBuilder and
  // keeps `.name(...)`.
  const bars = chart(rows)
    .flow(scatter({ by: "lake", x: "x" }))
    .mark(rect({ w: 4, h: "count" }));
  expectType<Equal<typeof bars, ChartBuilder<Row[], any[]>>>();
  bars.name("bars");
  // A relational mark may fuse into a two-tier layer.
  const path = chart(rows)
    .flow(scatter({ by: "lake", x: "x" }))
    .mark(line({ along: "lake" }).name("path"));
  expectType<Equal<typeof path, ChartBuilder<Row[], any[]> | LayerBuilder>>();
}

// The Flower Chart story's spec (stories/forwardsyntax/FlowerChart.stories.tsx),
// with no casts.
export function flowerChart(stemData: Row[], container: HTMLElement) {
  const flower = chart({ coord: Coord.polar(), axes: false })
    .flow(stack({ by: "species", dir: "x", h: 40 }))
    .mark(petal({ w: "count", fill: "species" }));

  return chart(stemData, { axes: false })
    .flow(scatter({ by: "lake", x: "x" }))
    .mark(
      layer([
        rect({ w: 4, h: "count", fill: "green" }).name("stem"),
        flower.name("flower"),
      ]).relate(({ stem, flower }) => [
        Constraint.align({ x: "middle", y: ["end", "middle"] }, [stem, flower]),
      ])
    )
    .render(container, { w: 400, h: 400 });
}
