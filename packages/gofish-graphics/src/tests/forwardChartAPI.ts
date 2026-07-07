import { mix } from "spectral.js";
import { chart } from "../lib";
import { seafood } from "../data/catch";
import { color6_old, For, groupBy, rect, spreadX, stackX, stackY, v } from "../lib";
import _ from "lodash";

// export const testIcicleForwardChartAPI = () => {
//   ForwardChart(titanic)
//     .stackX({ spacing: 0, alignment: "middle"}, [
//       rect({ w: 40, h: _(titanic).sumBy("count") / 10, fill: "gray" }),
//       stackY("class", { spacing: 0, alignment: "middle"})
//         .stackX()
//     ])
// }

rect({ h: 10, fill: "red" }).stackY("survived", {
  w: 40,
  spacing: 0,
  alignment: "middle",
});

pipe(
  stackY("sex", { spacing: 0, alignment: "middle" }),
  stackX({ spacing: 0, alignment: "middle" }, [
    rect({
      w: 40,
      h: _(items).sumBy("count") / 10,
      fill: sex === "Female" ? color6_old[2] : color6_old[3],
    }),
    pipe(
      stackY("survived", { w: 40, spacing: 0, alignment: "middle" }),
      rect({ h: 10, fill: "red" })
    ),
  ])
);

/* export const testIcicleAPIv2 = () =>
  stackX({ spacing: 0, alignment: "middle" }, [
    rect({
      w: 40,
      h: _(titanic).sumBy("count") / 10,
      fill: "gray",
    }),
    stackY(
      { spacing: 0, alignment: "middle" },
      For(groupBy(titanic, "class"), (items, cls) =>
        stackX({ h: _(items).sumBy("count") / 10, spacing: 0, alignment: "start" }, [
          rect({ w: 40, fill: classColor[cls as keyof typeof classColor] }),
          stackY(
            { spacing: 0, alignment: "middle" },
            For(groupBy(items, "sex"), (items, sex) =>
              stackX({ spacing: 0, alignment: "middle" }, [
                rect({
                  w: 40,
                  h: _(items).sumBy("count") / 10,
                  fill: sex === "Female" ? color6_old[2] : color6_old[3],
                }),
                stackY(
                  {
                    w: 40,
                    spacing: 0,
                    alignment: "middle",
                  },
                  For(groupBy(items, "survived"), (survivedItems, survived) => {
                    return rect({
                      // w: _(items).sumBy("count"),
                      // w: _(survivedItems).sumBy("count") / 10,
                      h: _(survivedItems).sumBy("count") / 10,
                      // h: value(_(items).sumBy("count"), "count"),
                      // h: _(items).sumBy("count") / 10,
                      fill:
                        sex === "Female"
                          ? survived === "No"
                            ? mix(color6_old[2], black, 0.5)
                            : mix(color6_old[2], white, 0.5)
                          : survived === "No"
                          ? mix(color6_old[3], black, 0.5)
                          : mix(color6_old[3], white, 0.5),
                    });
                  })
                ),
              ])
            )
          ),
        ])
      )
    ),
  ]); */

export const chartRectBF = () =>
  spreadX(
    { spacing: 2, sharedScale: true },
    For(groupBy(seafood, "species"), (d) =>
      rect({ w: 32, h: v(_.sumBy(d, "count")), fill: v(d[0].species) })
    )
  );

export const chartBar = () => {
  return chart(seafood)
    .rect({ w: 32, h: "count", fill: "species" })
    .spreadX("lake", { spacing: 2, sharedScale: true })
    .TEST_render();
};

/* 
Chart
  .rect({ w: 32, h: "count", fill: "species" })
  .stackX("lake", { spacing: 2, sharedScale: true })
  .data(catchData);
*/

/* 
Chart
  .data(catchData)
  .stackX("lake", { spacing: 2, sharedScale: true })
  .rect({ w: 32, h: "count", fill: "species" });
*/

/* 
chart(catchData)
  .stackX("lake", { spacing: 2, sharedScale: true })
  .rect({ w: 32, h: "count", fill: "species" });
*/

/* 
Mark.rect(catchData, { w: 32, h: "count", fill: "species" })
  .stackX("lake", { spacing: 2, sharedScale: true })
*/

export const chartStackedBar = () => {
  return chart(seafood)
    .rect({ w: 32, h: "count", fill: "species" })
    .spreadY("species", { spacing: 2 })
    .spreadX("lake", { spacing: 8, sharedScale: true })
    .TEST_render();
};

export const chartGroupedBar = () => {
  return chart(seafood)
    .rect({ w: 8, h: "count", fill: "species" })
    .spreadX("species", { spacing: 2 })
    .spreadX("lake", { spacing: 4, sharedScale: true })
    .TEST_render();
};

export const chartFacetedBar = () => {
  return chart(seafood)
    .rect({ w: 32, h: "count", fill: "species" })
    .spreadX("lake", { spacing: 2 })
    .spreadY("species", { spacing: 8, sharedScale: true })
    .TEST_render();
};

export const chartFacetedBarHorizontal = () => {
  return chart(seafood)
    .rect({ w: 8, h: "count", fill: "species" })
    .spreadX("lake", { spacing: 2 })
    .spreadX("species", { spacing: 8, sharedScale: true })
    .TEST_render();
};

// TODO: this isn't really what I want...
// I basically want a grouped bar chart where the bars are made of up of squares
export const chartSquares = () => {
  return (
    chart(seafood)
      .rect({ w: 8, h: 8, fill: "species" })
      .spreadX("uid", { spacing: 2 })
      .transform((d) =>
        _(d)
          .reverse()
          .flatMap((d) =>
            Array(d.count)
              .fill(0)
              .map((_, i) => ({ ...d, uid: `${d.lake}-${d.species}-${i}` }))
          )
          .chunk(4)
          .reverse()
      )
      .spreadY("species", { spacing: 2, alignment: "start" })
      // .stackX("uid", { spacing: 2 })
      // .stackY("uid", { spacing: 2, alignment: "start" })
      // .transform((d) =>
      //   _(d)
      //     .reverse()
      //     .flatMap((d) =>
      //       Array(d.count)
      //         .fill(0)
      //         .map((_, i) => ({ ...d, uid: `${d.lake}-${d.species}-${i}` }))
      //     )
      //     .chunk(4)
      //     .reverse()
      // )
      .spreadX("lake", { spacing: 8, sharedScale: true })
      .TEST_render()
  );
};
