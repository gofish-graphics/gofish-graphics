// GoFish half of the ggdibbler catalog (#980), keyed by the slug in
// render-ggdibbler.R. build-ggdibbler.mjs merges it with ggdibbler-r.json
// into ggdibbler.json and formats each spec with prettier.
//
// Version 2 of the grammar (../needs-fragment.html and ../theory-fragment.html),
// with draws made in the flow. Conventions (see ggdibbler-summary.md):
// - uncertainMpg, uncertainMtcars, ... are ggdibbler's uncertain_* data sets:
//   every random cell holds a Dist. mpg, mtcars are the plain data sets.
// - derive(repeat(n, "draw")) makes n copies of each row, numbered in draw.
//   ggdibbler's default times = 10 is n = 10. A channel or a by reads draw k
//   with field("wt").sample("draw"); a Dist built in the spec reads it with
//   value.sample("draw"). Draw k is fixed by the seed, the row and k, so
//   layers that read draw k of the same rows agree, as layers that share a
//   seed do in R.
// - ggdibbler's alpha overlays are the plain overlay, group({ by: "draw" }),
//   with the mark's opacity set to ggdibbler's alpha: ggplot paints the draws
//   over each other, which is what the plain overlay does.
// - A comment "gap:" names the piece today's GoFish lacks; that piece is
//   written as the call it would most likely be and is NOT existing syntax.

const D = (gofish, uses_up, fit, verdict, note) => ({ gofish, uses_up, fit, verdict, note });

export const specs = {
  "readme-contour": D(
    `chart(uncertainFaithfuld)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
  .mark(contour({ x: "waiting", y: "eruptions", z: field("density0").sample("draw"), opacity: 0.2 })); // gap: contour stat and mark`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Contour lines per draw, painted over each other at alpha 0.2. GoFish has no contour stat (marching squares over a grid), which has nothing to do with draws. Each contour is a stat over many cells of one draw, so rule 4.2, which is about marks that join rows, does not fire (see the summary on stats per draw)."
  ),
  "raster-faithfuld": D(
    `chart(uncertainFaithfuld)
  .flow(derive(repeat(10, "draw")), 
    table({ by: { x: "waiting", y: "eruptions" } }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
  )
  .mark(rect({ fill: field("density").sample("draw") }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "identity_dodge: the grid cells are placed by the table, and each cell is cut into 10 strips, one per draw."
  ),
  "raster-faithfuld-more": D(
    `chart(uncertainFaithfuld)
  .flow(derive(repeat(10, "draw")), 
    table({ by: { x: "waiting", y: "eruptions" } }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
  )
  .mark(rect({ fill: field("density2").sample("draw") }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "Same flow as the previous entry on the noisier column."
  ),
  "readme-stack-deterministic": D(
    `chart(mpg)
  .flow(spread({ by: "class", dir: "x" }), stack({ by: "drv", dir: "y" }))
  .mark(rect({ h: field("drv").count(), fill: "drv" }));`,
    "nothing: no Dist column, so no repeat step",
    "fits",
    "ok",
    "ggdibbler on plain data draws nothing and gives the plain stacked bar. In GoFish that is the chart with no repeat and no .sample. With no Dist column there is nothing to draw, so the question of what sample does to plain data is gone."
  ),
  "stack-identity": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "x" }),
    group({ by: "draw" }),
    stack({ by: field("drv").sample("draw"), dir: "y" }),
  )
  .mark(rect({ h: field("drv").count(), fill: field("drv").sample("draw"), opacity: 0.15 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "stack_identity: each draw is a full stacked bar, and the draws are painted over each other at alpha 0.15. repeat comes first, and the spread reads the drawn class, because class itself is random."
  ),
  "stack-dodge": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "x" }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
    stack({ by: field("drv").sample("draw"), dir: "y" }),
  )
  .mark(rect({ h: field("drv").count(), fill: field("drv").sample("draw") }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "stack_dodge: the draw spread is outside the group stack, so each thin bar is one draw's whole stack."
  ),
  "readme-sf-map": D(
    `const temp = dist.normal({ mean: "tempMean", sd: "tempSe" });
layer([
  chart(counties, { coord: Coord.geo() })
    .flow(derive(repeat(50, "draw")), 
      // gap: cut a polygon into n cells
      subdivide({ by: "draw", region: "geometry" }),
    )
    .mark(region({ fill: temp.sample("draw") })),
  chart(counties, { coord: Coord.geo() }).mark(
    polygon({
      points: "geometry",
      fill: "none",
      stroke: "#333",
      strokeWidth: 0.7,
    }),
  ),
]);`,
    "subdivide by \"draw\" (missing operator), n = 50",
    "gofish-gap",
    "ok",
    "position_subdivide is a spread by draw inside a polygon. The draw part fits; GoFish has no operator that cuts an arbitrary polygon into n cells (table and spread cut boxes only)."
  ),
  "abline-intercept": D(
    `const intercept = dist.normal({ mean: "m", sd: "s" });
layer([
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ x: field("wt").sample("draw"), y: field("mpg").sample("draw") }))
    .mark(circle({ r: 3, opacity: 0.3 })),
  chart([{ m: 20, s: 1 }])
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
    .mark(abline({ intercept: intercept.sample("draw"), slope: 0, opacity: 0.3 })), // gap: a line across the whole plot
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Two layers, each with its own draws, as in ggdibbler. GoFish has no reference-line mark (rule or abline)."
  ),
  "vline": D(
    `const xintercept = dist.normal({ mean: "m", sd: "s" });
layer([
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ x: field("wt").sample("draw"), y: field("mpg").sample("draw") }))
    .mark(circle({ r: 3, opacity: 0.3 })),
  chart([{ m: 5, s: 0.1 }])
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
    .mark(rule({ x: xintercept.sample("draw"), opacity: 0.3 })), // gap: rule mark
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Same as the abline entry with a vertical rule. The missing piece is the rule mark the proposal already lists as new."
  ),
  "hline": D(
    `const yintercept = dist.normal({ mean: "m", sd: "s" });
layer([
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ x: field("wt").sample("draw"), y: field("mpg").sample("draw") }))
    .mark(circle({ r: 3, opacity: 0.3 })),
  chart([{ m: 20, s: 1 }])
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
    .mark(rule({ y: yintercept.sample("draw"), opacity: 0.3 })), // gap: rule mark
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Horizontal version of the vline entry."
  ),
  "abline-coef": D(
    `const intercept = dist.normal({ mean: "a", sd: "aSe" });
const slope = dist.normal({ mean: "b", sd: "bSe" });
layer([
  chart(mtcars)
    .flow(scatter({ x: "wt", y: "mpg" }))
    .mark(circle({ r: 3 })),
  chart([{ a: 37, aSe: 1.8, b: -5, bSe: 0.56 }])
    .flow(derive(repeat(30, "draw")), group({ by: "draw" }))
    .mark(abline({ intercept: intercept.sample("draw"), slope: slope.sample("draw"), opacity: 0.3 })), // gap: abline mark
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 30",
    "gofish-gap",
    "ok",
    "Slope and intercept are drawn independently, as ggdibbler does; dist.mvnormal would give the joint. Missing piece: an abline mark."
  ),
  "bar-count": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "x" }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
  )
  .mark(rect({ h: field("class").count() }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "Counts of a random category, one thin bar per draw."
  ),
  "bar-count-identity": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), spread({ by: field("class").sample("draw"), dir: "x" }), group({ by: "draw" }))
  .mark(rect({ h: field("class").count(), opacity: 0.1 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "The same counts painted over each other at alpha 0.1. With blend: \"mean\" in place of the opacity, the limit would be the fade by P(count > y) from the table in section 3, which a bare Dist in h writes (section 1, addition 5)."
  ),
  "col": D(
    `const outcome = dist.normal({ mean: "outcome", sd: "sd" });
chart(trials)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: "trt", dir: "x" }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
  )
  .mark(rect({ h: outcome.sample("draw") }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "The plain uncertain bar chart: three normals, 10 draws dodged in each slot."
  ),
  "bar-horizontal-reverse": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "y" }),
    spread({ by: "draw", dir: "y", spacing: 0 }),
    stack({ by: field("drv").sample("draw"), dir: "x", reverse: true }),
  )
  .mark(rect({ w: field("drv").count(), fill: field("drv").sample("draw") }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "stack_dodge on the y axis; reverse is today's stack option."
  ),
  "bin2d": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(100, "draw")), 
    partition({
      by: {
        x: field("x").sample("draw").bin(Bin.thresholds(30)),
        y: field("y").sample("draw").bin(Bin.thresholds(30)),
      },
    }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
  )
  .mark(rect({ fill: field("x").count() }));`,
    "spread({ by: \"draw\" }), n = 100",
    "fits",
    "ok",
    "identity_dodge for 2D bins: the bins are computed per draw and each cell holds 100 strips. Bin.thresholds(30) gives about 30 round bins, not exactly 30."
  ),
  "bin2d-identity": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    partition({
      by: {
        x: field("x").sample("draw").bin(Bin.thresholds(30)),
        y: field("y").sample("draw").bin(Bin.thresholds(30)),
      },
    }),
  )
  .mark(rect({ fill: field("x").count(), opacity: 0.1 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Draws of the 2D histogram painted over each other."
  ),
  "bin2d-10": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(10, "draw")), 
    partition({
      by: {
        x: field("x").sample("draw").bin(Bin.thresholds(10)),
        y: field("y").sample("draw").bin(Bin.thresholds(10)),
      },
    }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
  )
  .mark(rect({ fill: field("x").count() }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "Ten bins per axis, draws dodged in each cell."
  ),
  "boxplot": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), spread({ by: field("class").sample("draw"), dir: "x" }), group({ by: "draw" }))
  .mark(boxplot({ y: field("hwy").sample("draw"), opacity: 0.1 })); // gap: boxplot (quartiles of the draws, whiskers, outliers)`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "One boxplot per class per draw, painted over each other. GoFish has the median but no quartiles of the draws and no boxplot glyph."
  ),
  "boxplot-varwidth": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), spread({ by: field("class").sample("draw"), dir: "x" }), group({ by: "draw" }))
  .mark(boxplot({ y: field("hwy").sample("draw"), w: field("hwy").count(), opacity: 0.1 })); // gap: boxplot`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "varwidth is the box width from the group count. Same gap as the boxplot entry."
  ),
  "boxplot-dodge-identity": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "x" }),
    spread({ by: field("drv").sample("draw"), dir: "x" }),
    group({ by: "draw" }),
  )
  .mark(boxplot({ y: field("hwy").sample("draw"), stroke: field("drv").sample("draw"), opacity: 0.05 })); // gap: boxplot`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "dodge_identity: groups dodged by drv, draws overlaid inside each. Same boxplot gap."
  ),
  "contour": D(
    `chart(
  uncertainFaithfuld.filter((d) => d.waiting > 80 && d.eruptions > 3),
)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
  .mark(contour({ x: "waiting", y: "eruptions", z: field("density").sample("draw") })); // gap: contour`,
    "group({ by: \"draw\" }), the plain overlay at full opacity, n = 10",
    "gofish-gap",
    "ok",
    "Contours per draw drawn over each other. Missing: a contour stat."
  ),
  "contour-filled": D(
    `chart(
  uncertainFaithfuld.filter((d) => d.waiting > 80 && d.eruptions > 3),
)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
  .mark(contour({ x: "waiting", y: "eruptions", z: field("density").sample("draw"), filled: true })); // gap: contour`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Filled bands per draw painted over each other, so the last draw mostly wins. Missing: a contour stat."
  ),
  "point-cty-hwy": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), scatter({ x: field("cty").sample("draw"), y: field("hwy").sample("draw") }))
  .mark(circle({ r: 2 }));`,
    "no step reads the draw key: every drawn row is painted, which is the plain overlay, n = 10 (no bare-Dist form: it needs a finite repeat, rule 4.1)",
    "fits",
    "ok",
    "Opaque points painted over each other. Version 2 says what this is at finite n (the plain overlay). It has no bare-Dist form, because painting over is not averaging, so it needs a finite repeat (rule 4.1)."
  ),
  "count": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    group({ by: field("cty").sample("draw") }),
    scatter({ by: field("hwy").sample("draw"), x: field("cty").sample("draw"), y: field("hwy").sample("draw") }),
  )
  .mark(circle({ r: field("hwy").count(), opacity: 0.15 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "geom_count per draw, painted over each other. The flow fits; ggplot sizes by area and GoFish's r is linear in the count (area circles, #972, is not merged)."
  ),
  "count-size-area": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    group({ by: field("cty").sample("draw") }),
    scatter({ by: field("hwy").sample("draw"), x: field("cty").sample("draw"), y: field("hwy").sample("draw") }),
  )
  .mark(circle({ area: field("hwy").count(), opacity: 0.15 })); // gap: area-proportional size (#972)`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "scale_size_area makes area proportional to count with 0 at 0. Same flow as the previous entry; the missing piece is area sizing."
  ),
  "density2d": D(
    `layer([
  chart(uncertainFaithful)
    .flow(derive(repeat(10, "draw")), scatter({ x: field("eruptions").sample("draw"), y: field("waiting").sample("draw") }))
    .mark(circle({ r: 0.5 })),
  chart(uncertainFaithful)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
    .mark(density2d({ x: field("eruptions").sample("draw"), y: field("waiting").sample("draw"), opacity: 0.5 })), // gap: 2D KDE contours
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "In the Rd code the points and the density contours draw separately (no seed). Here both read draw k of the same rows, so they share draws; a seed per layer would separate them (open question b in section 6). Missing: a 2D kernel density stat."
  ),
  "density2d-filled": D(
    `layer([
  chart(uncertainFaithful)
    .flow(derive(repeat(10, "draw")), scatter({ x: field("eruptions").sample("draw"), y: field("waiting").sample("draw") }))
    .mark(circle({ r: 0.5 })),
  chart(uncertainFaithful)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
    .mark(
      density2d({ x: field("eruptions").sample("draw"), y: field("waiting").sample("draw"), filled: true, opacity: 0.1 }),
    ), // gap: 2D KDE
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Filled density bands per draw, painted over each other. Same gap."
  ),
  "density": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
  .mark(density({ x: field("carat").sample("draw"), opacity: 0.5 })); // gap: kernel density stat`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "One density curve per draw over all 1000 cells, painted over each other. Missing: a KDE stat (quantileRows reads a density grid but does not compute one)."
  ),
  "density-by-cut": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }), group({ by: field("cut").sample("draw") }))
  .mark(density({ x: field("depth").sample("draw"), fill: field("cut").sample("draw"), stroke: field("cut").sample("draw"), opacity: 0.1 })); // gap: KDE`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "cut is random, so a diamond can change group between draws. Same KDE gap."
  ),
  "dotplot": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    partition({ by: field("mpg").sample("draw").bin(Bin.dotdensity()), dir: "x" }), // gap: dot-density binning
    stack({ dir: "y" }),
  )
  .mark(circle({ opacity: 0.2 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "geom_dotplot's default method places bins at data-driven centres (dot density); GoFish bins only on fixed grids. Each draw's dotplot is painted over the others at alpha 0.2. The stack is over the cars of one draw, which are parts of a whole, so rule 4.4 does not fire."
  ),
  "dotplot-binwidth": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    partition({ by: field("mpg").sample("draw").bin(Bin.dotdensity(1.5)), dir: "x" }), // gap
    stack({ dir: "y" }),
  )
  .mark(circle({ opacity: 0.2 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Same as the previous entry with binwidth 1.5."
  ),
  "dotplot-histodot": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    partition({ by: field("mpg").sample("draw").bin(Bin.step(1.5)), dir: "x" }),
    stack({ dir: "y" }),
  )
  .mark(circle({ opacity: 0.2 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Fixed bins: the dotplot row of the table in section 3, per draw, with the draws painted over each other. The stack is over the cars of one draw, which may stack."
  ),
  "hex": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    partition({
      by: struct({ x: field("carat").sample("draw"), y: field("price").sample("draw") }).bin(
        Bin.hex({ radius: { x: 0.05, y: 300 } }),
      ),
    }),
  )
  .mark(region({ fill: field("carat").count(), opacity: 0.15 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Hex bins per draw, painted over each other. Bin.hex takes a radius, not ggplot's bin count."
  ),
  "hex-10": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    partition({
      by: struct({ x: field("carat").sample("draw"), y: field("price").sample("draw") }).bin(
        Bin.hex({ radius: { x: 0.15, y: 950 } }),
      ),
    }),
  )
  .mark(region({ fill: field("carat").count(), opacity: 0.15 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Coarser hexes; same flow."
  ),
  "histogram": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(10, "draw")), 
    partition({ by: field("carat").sample("draw").bin(Bin.thresholds(30)), dir: "x" }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
  )
  .mark(rect({ h: field("carat").count() }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "stack_dodge with one group: each bin's slot holds 10 thin bars, one per draw. The bins are fitted to all drawn values."
  ),
  "histogram-identity": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    partition({ by: field("carat").sample("draw").bin(Bin.thresholds(30)), dir: "x" }),
  )
  .mark(rect({ h: field("carat").count(), opacity: 0.15 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Draws of the histogram painted over each other at alpha 0.15."
  ),
  "freqpoly": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    group({ by: field("cut").sample("draw") }),
    partition({ by: field("price").sample("draw").bin(Bin.step(500)), dir: "x" }),
  )
  .mark(line({ h: field("price").count(), stroke: field("cut").sample("draw"), along: field("price").sample("draw") }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "warning: 4.2, each frequency polygon joins draw k of different cells whose Dists are independent marginals, so it shows one possible world only if the cells are independent",
    "One frequency polygon per cut per draw, painted over each other. Each vertex is the count of one bin in one draw, and the line joins the bins of one draw. The cells are drawn one by one, so the line is one possible world only if the diamonds are independent, which is the warning of rule 4.2."
  ),
  "histogram-fill": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(10, "draw")), 
    partition({ by: field("price").sample("draw").bin(Bin.step(500)), dir: "x" }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
    stack({ by: field("cut").sample("draw"), dir: "y" }),
  )
  .mark(rect({ h: field("price").count(), fill: field("cut").sample("draw") }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "stack_dodge in each bin: draws side by side, each a stack of cuts."
  ),
  "point-cyl-hwy": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), scatter({ x: field("cyl").sample("draw"), y: field("hwy").sample("draw") }))
  .mark(circle({ r: 2 }));`,
    "no step reads the draw key: every drawn row is painted, which is the plain overlay, n = 10 (no bare-Dist form: it needs a finite repeat, rule 4.1)",
    "fits",
    "ok",
    "Opaque overplotted draws, the plain overlay."
  ),
  "jitter": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    // gap: jitter on both placed axes
    scatter({ x: field("cyl").sample("draw"), y: field("hwy").sample("draw"), overlap: Overlap.jitter() }),
  )
  .mark(circle({ r: 2 }));`,
    "no step reads the draw key: every drawn row is painted, which is the plain overlay, n = 10 (no bare-Dist form: it needs a finite repeat, rule 4.1)",
    "gofish-gap",
    "ok",
    "Overlap.jitter moves only the axis no field places; geom_jitter shakes both x and y. Not a draw question."
  ),
  "jitter-deterministic": D(
    `chart(mpg)
  .flow(scatter({ x: "cyl", y: "hwy", overlap: Overlap.jitter() })) // gap: 2D jitter
  .mark(circle({ r: 2, fill: "class" }));`,
    "nothing: no Dist column",
    "gofish-gap",
    "ok",
    "geom_jitter_sample on plain data is plain jitter. Same 2D jitter gap."
  ),
  "linerange": D(
    `const lower = dist.normal({ mean: "lower", sd: "lowerSd" });
const upper = dist.normal({ mean: "upper", sd: "upperSd" });
chart(trials)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ x: "trt", yMin: lower.sample("draw"), yMax: upper.sample("draw") }))
  .mark(rect({ w: 4, fill: "group" }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Each range's ends are drawn and the ranges are painted over each other, as ggdibbler does at full alpha."
  ),
  "pointrange": D(
    `const resp = dist.normal({ mean: "resp", sd: "respSd" });
const lower = dist.normal({ mean: "lower", sd: "lowerSd" });
const upper = dist.normal({ mean: "upper", sd: "upperSd" });
chart(trials)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
  .mark(
    pointrange({ x: "trt", y: resp.sample("draw"), yMin: lower.sample("draw"), yMax: upper.sample("draw"), fill: "group" }),
  ); // gap`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "One drawn row becomes a point at resp and a range from lower to upper, two marks at different data positions. GoFish has no glyph made of parts placed by different fields of one row."
  ),
  "crossbar": D(
    `chart(trials)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
  .mark(
    crossbar({
      x: "trt",
      y: resp.sample("draw"),
      yMin: lower.sample("draw"),
      yMax: upper.sample("draw"),
      w: 0.2,
      stroke: "group",
    }),
  ); // gap`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Box from lower to upper with a bar at resp. Same composite-glyph gap as pointrange (resp, lower, upper as in that entry)."
  ),
  "errorbar": D(
    `chart(trials)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ x: "trt", yMin: lower.sample("draw"), yMax: upper.sample("draw") }))
  .mark(errorbar({ w: 0.2, stroke: "group" })); // gap: error bar with caps`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "The span fits; the capped error-bar glyph does not exist in GoFish."
  ),
  "line-economics": D(
    `chart(uncertainEconomics)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    scatter({ by: "date", x: "date", y: field("unemploy").sample("draw") }),
  )
  .mark(line({ opacity: 0.1 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "warning: 4.2, each line joins draw k of different cells whose Dists are independent marginals, so it shows one possible world only if the cells are independent",
    "One line per draw across months, at alpha 0.1. Each month is drawn on its own, so a line through draw 3 of every month is a path of the series only if the months are independent. Version 1 found no rule for this; rule 4.2 now warns."
  ),
  "step": D(
    `chart(
  uncertainEconomics.filter((d) => d.date > new Date("2013-01-01")),
)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    scatter({ by: "date", x: "date", y: field("unemploy").sample("draw") }),
  )
  .mark(line({ curve: Curve.step(), opacity: 0.5 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "warning: 4.2, each step line joins draw k of different cells whose Dists are independent marginals, so it shows one possible world only if the cells are independent",
    "Step lines per draw, painted over each other at alpha 0.5. Rule 4.2 warns, as for the line entry."
  ),
  "path": D(
    `chart(uncertainEconomics)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    scatter({ by: "date", x: field("unemploy").sample("draw"), y: field("psavert").sample("draw") }),
  )
  .mark(line({ stroke: "date", opacity: 0.15 })); // gap: color that varies along one line`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "warning: 4.2, each path joins draw k of different cells whose Dists are independent marginals, so it shows one possible world only if the cells are independent",
    "A connected scatter per draw in date order. GoFish's line color must be constant within a line; ggplot colors each segment by date. Rule 4.2 warns, as for the line entry."
  ),
  "line-na": D(
    `const y = dist.normal({ mean: "y", sd: 0.3 });
layer([
  chart(series)
    .flow(derive(repeat(10, "draw")), scatter({ x: "x", y: y.sample("draw") }))
    .mark(circle({ r: 3 })),
  chart(series)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ by: "x", x: "x", y: y.sample("draw") }))
    .mark(line()), // gap: break the line at the missing value
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10; both layers read draw k of the same rows",
    "gofish-gap",
    "warning: 4.2, each line joins draw k of different cells whose Dists are independent marginals, so it shows one possible world only if the cells are independent",
    "In R, seed = 33 makes the points and the lines read the same draws. Here both charts read draw k of the same rows, so they agree with no seed. GoFish's line does not break at a missing y."
  ),
  "point-mtcars": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(50, "draw")), group({ by: "draw" }), scatter({ x: field("wt").sample("draw"), y: field("mpg").sample("draw") }))
  .mark(circle({ r: 2, opacity: 0.5 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 50",
    "fits",
    "ok",
    "Fifty draws of each car painted over each other at alpha 0.5. With blend: \"mean\" the picture would converge, as n grows, to each car's joint density of (wt, mpg)."
  ),
  "point-colour": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(10, "draw")), scatter({ x: field("wt").sample("draw"), y: field("mpg").sample("draw") }))
  .mark(circle({ r: 2, fill: field("cyl").sample("draw") }));`,
    "no step reads the draw key: every drawn row is painted, which is the plain overlay, n = 10 (no bare-Dist form: it needs a finite repeat, rule 4.1)",
    "fits",
    "ok",
    "A random category on color. ggdibbler needs dist_transformed(cyl, factor) to make it discrete; GoFish would declare cyl's unit as ordered levels."
  ),
  "point-shape": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(10, "draw")), scatter({ x: field("wt").sample("draw"), y: field("mpg").sample("draw") }))
  .mark(symbol({ shape: field("cyl").sample("draw") })); // gap: shape channel`,
    "no step reads the draw key: every drawn row is painted, which is the plain overlay, n = 10 (no bare-Dist form: it needs a finite repeat, rule 4.1)",
    "gofish-gap",
    "ok",
    "GoFish has no point mark with a shape channel."
  ),
  "bubble": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ x: field("wt").sample("draw"), y: field("mpg").sample("draw") }))
  .mark(circle({ r: field("qsec").sample("draw"), opacity: 0.15 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Random size on r, painted over each other; uncertainty in size reads as a soft edge. ggplot sizes by area; r is linear (#972)."
  ),
  "polygon": D(
    `chart(uncertainDatapoly)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }), group({ by: "id" }))
  .mark(polygon({ x: field("x").sample("draw"), y: field("y").sample("draw"), fill: field("value").sample("draw"), opacity: 0.15 })); // gap: polygon whose vertices are rows`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "warning: 4.2, each polygon joins draw k of different cells whose Dists are independent marginals, so it shows one possible world only if the cells are independent",
    "Each vertex is its own row with independent uniforms, and each polygon joins its four vertices within one draw. GoFish's polygon takes a ring of pixel points from one row, not data-space vertices from a group of rows. Rule 4.2 warns because the vertices are drawn one by one."
  ),
  "qq-t": D(
    `chart(tSample)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
  .mark(qq({ sample: field("y").sample("draw") })); // gap: QQ stat and QQ line`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "A QQ plot of all 200 cells per draw. GoFish has no QQ stat (sorted values against theoretical quantiles) or fitted QQ line."
  ),
  "qq-mtcars": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
  .mark(qq({ sample: field("mpg").sample("draw") })); // gap: QQ stat`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Same as the previous entry on mpg."
  ),
  "quantile-reg": D(
    `layer([
  chart(uncertainMpg)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ x: field("displ").sample("draw"), y: field("hwy").sample("draw") }))
    .mark(circle({ r: 2, opacity: 0.3 })),
  chart(uncertainMpg)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
    .mark(
      quantileRegression({
        x: field("displ").sample("draw"),
        y: field("hwy").sample("draw"),
        quantiles: [0.25, 0.5, 0.75],
        opacity: 0.3,
      }),
    ), // gap
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Quantile regression per draw. Missing: a regression stat. The quantiles here are of hwy given displ inside one draw, not of the draws."
  ),
  "quantile-reg-median": D(
    `layer([
  chart(uncertainMpg)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ x: field("displ").sample("draw"), y: field("hwy").sample("draw") }))
    .mark(circle({ r: 2, opacity: 0.3 })),
  chart(uncertainMpg)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
    .mark(
      quantileRegression({
        x: field("displ").sample("draw"),
        y: field("hwy").sample("draw"),
        quantiles: [0.5],
        opacity: 0.3,
      }),
    ), // gap
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Median regression only; same gap."
  ),
  "ribbon-area": D(
    `chart(huron)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    scatter({ by: "year", x: "year", yMin: 0, yMax: field("level").sample("draw") }),
  )
  .mark(rect({ w: 0 }))
  .layer(ribbon({ opacity: 0.15 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "warning: 4.2, each area joins draw k of different cells whose Dists are independent marginals, so it shows one possible world only if the cells are independent",
    "An area per draw, painted over each other at alpha 0.15: the fan-chart idiom from the Signal stories (rect spans joined by a ribbon). The data's level column is the lake level, a Dist as in R. Rule 4.2 warns, as for the line entry."
  ),
  "ribbon-band-line": D(
    `layer([
  chart(huron)
    .flow(derive(repeat(10, "draw")), 
      derive((rows) =>
        rows.map((r) => ({ ...r, lo: r.level.sample(r.draw) - 1, hi: r.level.sample(r.draw) + 1 })),
      ),
      group({ by: "draw" }),
      scatter({ by: "year", x: "year", yMin: "lo", yMax: "hi" }),
    )
    .mark(rect({ w: 0 }))
    .layer(ribbon({ fill: "#b3b3b3", opacity: 0.15 })),
  chart(huron)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ by: "year", x: "year", y: field("level").sample("draw") }))
    .mark(line({ opacity: 0.15 })),
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10; both layers read draw k of the same rows",
    "fits",
    "warning: 4.2, each band and line joins draw k of different cells whose Dists are independent marginals, so it shows one possible world only if the cells are independent",
    "In R, seed = 4 shares the draws between the band and the line. Here both charts read draw k of the same rows, so they agree with no seed. Inside a derive a Dist cell has the same method, so r.level.sample(r.draw) - 1 is per draw."
  ),
  "area-facet": D(
    `const x = dist.normal({ mean: "x", sd: 0.8 });
const y = dist.normal({ mean: "y", sd: 0.8 });
layer([
  chart(pts)
    .flow(derive(repeat(10, "draw")), 
      spread({ by: "g", dir: "y" }),
      group({ by: "draw" }),
      scatter({ by: "id", x: x.sample("draw"), yMin: 0, yMax: y.sample("draw") }),
    )
    .mark(rect({ w: 0, fill: "g" }))
    .layer(ribbon({ fill: "g", opacity: 0.15 })),
  chart(pts)
    .flow(derive(repeat(10, "draw")), spread({ by: "g", dir: "y" }), scatter({ x: x.sample("draw"), y: y.sample("draw") }))
    .mark(circle({ r: 3 })),
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10; both layers read draw k of the same rows",
    "fits",
    "warning: 4.2, each area joins draw k of different cells whose Dists are independent marginals, so it shows one possible world only if the cells are independent",
    "In R, seed = 100 makes the points sit on the drawn area's vertices. Here both charts read draw k of the same rows, so the points sit on the vertices with no seed. Version 1 could not say this, because its sample lived inside one chart's flow and made fresh draws. Rule 4.2 warns because each area joins three cells drawn one by one."
  ),
  "rug": D(
    `layer([
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), scatter({ x: field("wt").sample("draw"), y: field("mpg").sample("draw") }))
    .mark(circle({ r: 2 })),
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ x: field("wt").sample("draw") }))
    .mark(rect({ w: 1, h: 8, opacity: 0.5 })),
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ y: field("mpg").sample("draw") }))
    .mark(rect({ w: 8, h: 1, opacity: 0.5 })),
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10; all layers read draw k of the same rows",
    "fits",
    "ok",
    "The rug ticks mark the same drawn points as the scatter (seed = 4 in R). Version 1 could not say this. Here the three charts read draw k of the same rows, so they agree. A scatter that places only x leaves y to the layer, as the rug needs."
  ),
  "segment-curve": D(
    `const x1 = dist.normal({ mean: "x1", sd: 0.1 });
const y1 = dist.normal({ mean: "y1", sd: 0.1 });
const x2 = dist.normal({ mean: "x2", sd: 0.1 });
const y2 = dist.normal({ mean: "y2", sd: 0.1 });
layer([
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ x: field("wt").sample("draw"), y: field("mpg").sample("draw") }))
    .mark(circle({ r: 2, opacity: 0.5 })),
  chart(link)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
    .mark(segment({ x: x1.sample("draw"), y: y1.sample("draw"), x2: x2.sample("draw"), y2: y2.sample("draw"), stroke: "#00bfc4", opacity: 0.5 })), // gap: segment from one row
  chart(link)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
    .mark(
      segment({
        x: x1.sample("draw"),
        y: y1.sample("draw"),
        x2: x2.sample("draw"),
        y2: y2.sample("draw"),
        curve: Curve.arc(),
        stroke: "#f8766d",
        opacity: 0.5,
      }),
    ), // gap
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "The seed in R only repeats one random stream over different data sets, so the draws need not match anything. GoFish's line joins marks or refs; it has no segment from one row's (x, y, xend, yend). The segment reads four cells of one row at one draw. Rule 4.2 is about rows, so it does not fire (see the summary)."
  ),
  "sf-subdivide": D(
    `chart(threeCounties, { coord: Coord.geo() })
  .flow(derive(repeat(100, "draw")), subdivide({ by: "draw", region: "geometry" })) // gap
  .mark(region({ fill: temp }));`,
    "subdivide by \"draw\" (missing operator), n = 100",
    "gofish-gap",
    "ok",
    "A pixel map in three counties. Missing: cutting a polygon into n cells."
  ),
  "sf-subdivide-border": D(
    `layer([
  chart(threeCounties, { coord: Coord.geo() })
    .flow(derive(repeat(100, "draw")), subdivide({ by: "draw", region: "geometry" })) // gap
    .mark(region({ fill: temp })),
  chart(threeCounties, { coord: Coord.geo() }).mark(
    polygon({
      points: "geometry",
      fill: "none",
      stroke: "black",
      strokeWidth: 1,
    }),
  ),
]);`,
    "subdivide by \"draw\" (missing operator), n = 100",
    "gofish-gap",
    "ok",
    "Same with the plain borders on top."
  ),
  "smooth": D(
    `layer([
  chart(uncertainMpg)
    .flow(derive(repeat(10, "draw")), scatter({ x: field("displ").sample("draw"), y: field("hwy").sample("draw") }))
    .mark(circle({ r: 0.5, opacity: 0.5 })),
  chart(uncertainMpg)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
    .mark(
      smooth({
        x: field("displ").sample("draw"),
        y: field("hwy").sample("draw"),
        method: "loess",
        band: true,
        opacity: 0.1,
      }),
    ), // gap: smoothing stat
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10; both layers read draw k of the same rows",
    "gofish-gap",
    "ok",
    "In R, seed = 22 shares draws between points and smooths. Here both charts read draw k of the same rows. One fit per draw is the fix that rule 4.3 asks for. Missing: a smoothing stat. Each fit uses many cells of one draw; rule 4.2 is about marks that join rows, so it does not fire (see the summary)."
  ),
  "smooth-lm-class": D(
    `layer([
  chart(uncertainMpg)
    .flow(derive(repeat(10, "draw")), scatter({ x: field("displ").sample("draw"), y: field("hwy").sample("draw") }))
    .mark(circle({ r: 0.5, fill: field("class").sample("draw"), opacity: 0.5 })),
  chart(uncertainMpg)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), group({ by: field("class").sample("draw") }))
    .mark(
      smooth({
        x: field("displ").sample("draw"),
        y: field("hwy").sample("draw"),
        method: "lm",
        stroke: field("class").sample("draw"),
        opacity: 0.1,
      }),
    ), // gap: smoothing stat
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10; both layers read draw k of the same rows",
    "gofish-gap",
    "ok",
    "A linear fit per class per draw, over the same draws as the points. Same smoother gap; class is random, so cars move between fits."
  ),
  "spoke": D(
    `const angle = dist.normal({ mean: "angle", sd: "angleSd" });
const speed = dist.normal({ mean: "speed", sd: "speedSd" });
layer([
  // the points read no Dist, so they need no draws
  chart(field)
    .flow(scatter({ x: "x", y: "y" }))
    .mark(circle({ r: 2 })),
  chart(field)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ x: "x", y: "y" }))
    .mark(spoke({ angle: angle.sample("draw"), radius: speed.sample("draw"), opacity: 0.3 })), // gap: segment by angle and length
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Arrows with random angle and length, painted over each other at alpha 0.5. Missing: a spoke or segment mark."
  ),
  "text": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(3, "draw")), group({ by: "draw" }), scatter({ x: field("wt").sample("draw"), y: field("mpg").sample("draw") }))
  .mark(text({ text: "model", opacity: 0.5 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 3",
    "fits",
    "ok",
    "Three placements of each car name, painted over each other at alpha 0.5."
  ),
  "label": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(3, "draw")), group({ by: "draw" }), scatter({ x: field("wt").sample("draw"), y: field("mpg").sample("draw") }))
  .mark(labelBox({ text: "model", opacity: 0.5 })); // gap: text with a background box as one mark`,
    "group({ by: \"draw\" }), the plain overlay, n = 3",
    "gofish-gap",
    "ok",
    "geom_label is text in a box. GoFish's text mark has no box; the label background belongs to .label()."
  ),
  "text-random-label": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(10, "draw")), 
    scatter({ by: "model", x: field("wt").sample("draw").mean(), y: field("mpg").sample("draw").mean() }),
    group({ by: "draw" }),
  )
  .mark(text({ text: field("cyl").sample("draw"), fontSize: 16, opacity: 0.3 }));`,
    "two steps: the mean of each car's draws places its label (rule 4.1 allows it at any n), then group({ by: \"draw\" }) paints the labels over each other, n = 10",
    "fits",
    "ok",
    "The label is a random category at the car's mean position. The position is a summary of each car's own draws (their mean), which version 2 lists as a way to use up draws; on the Dist it is ggdibbler's exact mean."
  ),
  "raster-grid": D(
    `chart(grid)
  .flow(derive(repeat(10, "draw")), 
    table({ by: { x: "x", y: "y" } }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
  )
  .mark(rect({ fill: field("z").sample("draw") }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "A 6 by 6 raster, each cell in 10 strips."
  ),
  "tile-categorical": D(
    `chart(tiles)
  .flow(derive(repeat(10, "draw")), 
    scatter({ by: "id", x: "x", y: "y" }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
  )
  .mark(rect({ h: 40, fill: field("z").sample("draw") }))
  .layer(
    chart(tiles)
      .flow(scatter({ x: "x", y: "y" }))
      .mark(rect({ w: 40, h: 40, fill: "none", stroke: "#7f7f7f" })),
  );`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "identity_dodge with a random category on fill; the plain tile outlines are a second layer with no draws."
  ),
  "rect": D(
    `chart(rects)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    scatter({ xMin: field("xmin").sample("draw"), xMax: field("xmax").sample("draw"), yMin: field("ymin").sample("draw"), yMax: field("ymax").sample("draw") }),
  )
  .mark(rect({ fill: "z", stroke: "#7f7f7f", opacity: 0.2 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Four random edges per rectangle, drawn and painted over each other. The range form of scatter takes the drawn values."
  ),
  "violin": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(10, "draw")), spread({ by: field("cyl").sample("draw"), dir: "x" }), group({ by: "draw" }))
  .mark(violin({ y: field("mpg").sample("draw"), opacity: 0.1 })); // gap: KDE violin`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "dodge_identity: violins by a random cyl, draws overlaid. Missing: a KDE stat (Overlap.sina gives a violin outline for dots, not a violin area)."
  ),
  "violin-untrimmed": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(10, "draw")), spread({ by: field("cyl").sample("draw"), dir: "x" }), group({ by: "draw" }))
  .mark(violin({ y: field("mpg").sample("draw"), trim: false, opacity: 0.1 })); // gap: KDE violin`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Same, untrimmed."
  ),
  "dodge": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "x" }),
    spread({ by: field("drv").sample("draw"), dir: "x", spacing: 1 }),
    spread({ by: "draw", dir: "x", spacing: 1 }),
  )
  .mark(rect({ h: field("drv").count(), fill: field("drv").sample("draw") }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "Plain dodge treats group x draw as one flat key. GoFish nests two spreads with equal spacing, which draws the same bars."
  ),
  "dodge-identity": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "x" }),
    spread({ by: field("drv").sample("draw"), dir: "x" }),
    group({ by: "draw" }),
  )
  .mark(rect({ h: field("drv").count(), fill: field("drv").sample("draw"), opacity: 0.2 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "dodge_identity: groups dodged, draws painted over each other inside each group's bar at alpha 0.2."
  ),
  "dodge-dodge": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "x" }),
    spread({ by: field("drv").sample("draw"), dir: "x" }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
  )
  .mark(rect({ h: field("drv").count(), fill: field("drv").sample("draw") }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "dodge_dodge: groups dodged, then each group's bar cut into draws. Here the draw spread is INSIDE the group step, the opposite of stack_dodge."
  ),
  "identity-dodge": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "x" }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
    group({ by: field("drv").sample("draw") }),
  )
  .mark(rect({ h: field("drv").count(), fill: field("drv").sample("draw"), opacity: 0.7 }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "identity_dodge: each draw's slot holds the three drv bars on top of each other. opacity 0.7 is ggplot's alpha for the overlapping groups, not for draws."
  ),
  "identity-fill": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "x" }),
    group({ by: "draw" }),
    group({ by: field("drv").sample("draw") }),
  )
  .mark(rect({ h: field("drv").count(), fill: field("drv").sample("draw"), opacity: 0.1 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Plain identity = identity_identity: groups and draws all painted over each other at ggplot's alpha 0.1."
  ),
  "identity-identity-fill": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "x" }),
    group({ by: "draw" }),
    group({ by: field("drv").sample("draw") }),
  )
  .mark(rect({ h: field("drv").count(), fill: field("drv").sample("draw"), opacity: 0.1 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "The help page says this is the same as the previous entry; the GoFish spec is the same too."
  ),
  "nest-stack-dodge": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "x" }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
    stack({ by: field("drv").sample("draw"), dir: "y" }),
  )
  .mark(rect({ h: field("drv").count(), fill: field("drv").sample("draw"), opacity: 0.9 }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "position_nest(\"stack_dodge\") is the general form of the named nested positions. In GoFish every nesting is just an order of flow steps, so position_nest has no counterpart beyond the flow itself."
  ),
  "stack-uncertain": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "x" }),
    stack({ by: "draw", dir: "y" }),
    stack({ by: field("drv").sample("draw"), dir: "y" }),
  )
  .mark(rect({ h: field("drv").count(), fill: field("drv").sample("draw") }));`,
    "stack({ by: \"draw\" }), n = 10",
    "fits",
    "error: 4.4, stack({ by: \"draw\" }) adds the counts of ten draws of one cell, which are alternatives, not parts of a sum",
    "Plain stack on uncertain data stacks the ten draws on the count axis (up to 600). The grammar rejects it, which matches the paper's Fig 8b argument. A count is summable over cars, so CanSum on the unit alone would accept this stack. The error needs the draw key to be a key that sums are never taken across (see the summary)."
  ),
  "subdivide-polygon": D(
    `chart(uncertainDatapoly)
  .flow(derive(repeat(50, "draw")), group({ by: "id" }), subdivide({ by: "draw" })) // gap
  .mark(region({ fill: "value" }));`,
    "subdivide by \"draw\" (missing operator), n = 50",
    "gofish-gap",
    "ok",
    "Six polygons cut into 50 cells each. Two gaps: a polygon from vertex rows, and cutting a polygon into cells."
  ),
  "connect": D(
    `const path = (curve, stroke) =>
  chart(uncertainEconomics.slice(0, 10))
    .flow(derive(repeat(10, "draw")), 
      group({ by: "draw" }),
      scatter({ by: "date", x: "date", y: field("unemploy").sample("draw") }),
    )
    .mark(line({ curve, stroke }));
layer([
  path(Curve.custom(zigzag), "#00bfc4"), // gap: a connection shape from a matrix
  path(Curve.custom(smooth), "#f8766d"),
  chart(uncertainEconomics.slice(0, 10))
    .flow(derive(repeat(10, "draw")), scatter({ x: "date", y: field("unemploy").sample("draw") }))
    .mark(circle({ r: 3 })),
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10; all layers read draw k of the same rows",
    "gofish-gap",
    "warning: 4.2, each connection joins draw k of different cells whose Dists are independent marginals, so it shows one possible world only if the cells are independent",
    "In R, seed = 64 shares the draws among the points and both connections. Here the three charts read draw k of the same rows. Missing: a user-given connection shape (stat_connect's matrix). Rule 4.2 warns, as for the line entry."
  ),
  "ecdf": D(
    `chart(sample200)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
  .mark(ecdf({ x: field("x").sample("draw"), curve: Curve.step(), opacity: 0.3 })); // gap: cumulative count`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "One ECDF of all 200 cells per draw, painted over each other. GoFish can sort but has no cumulative count of the draws."
  ),
  "ecdf-groups": D(
    `chart(sample200)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }), group({ by: "g" }))
  .mark(ecdf({ x: field("x").sample("draw"), stroke: "g", opacity: 0.3 })); // gap: cumulative count`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Same per group."
  ),
  "ellipse": D(
    `layer([
  chart(uncertainFaithful)
    .flow(derive(repeat(10, "draw")), scatter({ x: field("waiting").sample("draw"), y: field("eruptions").sample("draw") }))
    .mark(circle({ r: 1 })),
  chart(uncertainFaithful)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }))
    .mark(dataEllipse({ x: field("waiting").sample("draw"), y: field("eruptions").sample("draw") })), // gap: ellipse stat
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "A normal data ellipse per draw. Missing: an ellipse stat (enclose(Shape.oval()) is the smallest ellipse around nodes, not a covariance ellipse)."
  ),
  "ellipse-t-groups": D(
    `layer([
  chart(uncertainFaithful)
    .flow(derive(repeat(10, "draw")), 
      derive((rows) => rows.map((r) => ({ ...r, long: r.eruptions.sample(r.draw) > 3 }))),
      scatter({ x: field("waiting").sample("draw"), y: field("eruptions").sample("draw") }),
    )
    .mark(circle({ r: 1, fill: "long" })),
  chart(uncertainFaithful)
    .flow(derive(repeat(10, "draw")), 
      derive((rows) => rows.map((r) => ({ ...r, long: r.eruptions.sample(r.draw) > 3 }))),
      group({ by: "draw" }),
      group({ by: "long" }),
    )
    .mark(
      dataEllipse({ x: field("waiting").sample("draw"), y: field("eruptions").sample("draw"), type: "t", stroke: "long" }),
    ), // gap
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "The group is a function of a drawn value, so the derive runs after repeat and reads r.eruptions.sample(r.draw). Same ellipse gap."
  ),
  "ellipse-polygon": D(
    `chart(uncertainFaithful)
  .flow(derive(repeat(10, "draw")), 
    derive((rows) => rows.map((r) => ({ ...r, long: r.eruptions.sample(r.draw) > 3 }))),
    group({ by: "draw" }),
    group({ by: "long" }),
  )
  .mark(
    dataEllipse({ x: field("waiting").sample("draw"), y: field("eruptions").sample("draw"), fill: "long", opacity: 0.1 }),
  ); // gap`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "ok",
    "Filled ellipses painted over each other at alpha 0.1. Same gap."
  ),
  "identity-drawid": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(10, "draw")), scatter({ x: field("wt").sample("draw"), y: field("mpg").sample("draw") }))
  .mark(circle({ r: 2, fill: "draw" }));`,
    "the color channel reads the draw key, n = 10",
    "fits",
    "ok",
    "Color by draw ID. Fine at n = 10. Rule 4.1 now says a channel that reads draw needs a finite repeat, which version 1 missed."
  ),
  "manual-hull": D(
    `layer([
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), scatter({ x: field("disp").sample("draw"), y: field("mpg").sample("draw") }))
    .mark(circle({ r: 2, fill: field("cyl").sample("draw") })),
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), group({ by: field("cyl").sample("draw") }), derive(hull))
    .mark(polygon({ x: field("disp").sample("draw"), y: field("mpg").sample("draw"), fill: "none", stroke: field("cyl").sample("draw") })), // gap: polygon from rows
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "warning: 4.2, each hull polygon joins draw k of different cells whose Dists are independent marginals, so it shows one possible world only if the cells are independent",
    "stat_manual is a user function per group per draw, which is derive. In the Rd code the layers draw separately (no seed); here they share draw k, as in entry 27. Missing: a polygon whose vertices are rows in data space. The hull joins cars drawn one by one, so rule 4.2 warns."
  ),
  "manual-segment": D(
    `layer([
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), scatter({ x: field("disp").sample("draw"), y: field("mpg").sample("draw") }))
    .mark(circle({ r: 2, fill: field("cyl").sample("draw") })),
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), group({ by: "draw" }), group({ by: field("cyl").sample("draw") }), derive(toGroupMean))
    .mark(
      segment({ x: field("disp").sample("draw"), y: field("mpg").sample("draw"), x2: "xend", y2: "yend", stroke: field("cyl").sample("draw") }),
    ), // gap: segment
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "gofish-gap",
    "warning: 4.2, each segment joins draw k of different cells whose Dists are independent marginals, so it shows one possible world only if the cells are independent",
    "Each point joined to its group's mean, per draw. derive adds the mean; the missing piece is a segment mark from one row. Each segment joins one car to a mean over the other cars of the same draw, so rule 4.2 warns."
  ),
  "manual-centroid": D(
    `layer([
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), scatter({ x: field("disp").sample("draw"), y: field("mpg").sample("draw") }))
    .mark(circle({ r: 2, fill: field("cyl").sample("draw") })),
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), 
      group({ by: "draw" }),
      scatter({ by: field("cyl").sample("draw"), x: field("disp").sample("draw").mean(), y: field("mpg").sample("draw").mean() }),
    )
    .mark(circle({ r: 10, fill: "none", stroke: field("cyl").sample("draw") })),
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Group centroids per draw: the mean of the points inside each draw, so no derive is needed."
  ),
  "summary-2d": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(10, "draw")), 
    partition({
      by: {
        x: field("carat").sample("draw").bin(Bin.thresholds(30)),
        y: field("depth").sample("draw").bin(Bin.thresholds(30)),
      },
    }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
  )
  .mark(rect({ fill: field("price").sample("draw").mean() }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "Mean price per 2D bin per draw, with the draws as strips in each cell (identity_dodge default)."
  ),
  "summary-hex": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(10, "draw")), 
    derive((rows) => rows.map((r) => ({ ...r, price2: r.price.sample(r.draw) ** 2 }))),
    group({ by: "draw" }),
    partition({
      by: struct({ x: field("carat").sample("draw"), y: field("depth").sample("draw") }).bin(
        Bin.hex({ radius: { x: 0.05, y: 0.4 } }),
      ),
    }),
  )
  .mark(region({ fill: field("price2").sum(), opacity: 0.3 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "The custom summary sum(z^2) is a derived column summed per hex."
  ),
  "summary-median": D(
    `layer([
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), scatter({ x: field("cyl").sample("draw"), y: field("mpg").sample("draw") }))
    .mark(circle({ r: 2 })),
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), 
      group({ by: "draw" }),
      scatter({ by: field("cyl").sample("draw"), x: field("cyl").sample("draw"), y: field("mpg").sample("draw").median() }),
    )
    .mark(circle({ r: 3, fill: "red" })),
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Only the points carry seed = 4, so the median layer's draws are separate in ggdibbler. Here both layers read draw k of the same rows, so they share draws; a seed per layer would separate them. cyl is random, so the groups change between draws."
  ),
  "summary-mean-line": D(
    `layer([
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), scatter({ x: field("cyl").sample("draw"), y: field("mpg").sample("draw") }))
    .mark(circle({ r: 2, fill: field("vs").sample("draw") })),
  chart(uncertainMtcars)
    .flow(derive(repeat(10, "draw")), 
      group({ by: "draw" }),
      group({ by: field("vs").sample("draw") }),
      scatter({ by: field("cyl").sample("draw"), x: field("cyl").sample("draw"), y: field("mpg").sample("draw").mean() }),
    )
    .mark(line({ stroke: field("vs").sample("draw") })),
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 10; both layers read draw k of the same rows",
    "fits",
    "warning: 4.2, each mean line joins draw k of different cells whose Dists are independent marginals, so it shows one possible world only if the cells are independent",
    "The mean lines are the means of the drawn points shown (seed = 4 in R). The lines group the drawn rows by vs, which the points do not, so version 1 could not write it. Here both charts read draw k of the same rows. Each vertex is a mean over the cars of one draw, not a summary per cell, so rule 4.2 warns."
  ),
  "unique-overplot": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }), scatter({ x: field("vs").sample("draw"), y: field("am").sample("draw") }))
  .mark(circle({ r: 2, opacity: 0.01 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Four possible points, painted over each other 320 times at alpha 0.01."
  ),
  "unique": D(
    `chart(uncertainMtcars)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    group({ by: field("vs").sample("draw") }),
    scatter({ by: field("am").sample("draw"), x: field("vs").sample("draw"), y: field("am").sample("draw") }),
  )
  .mark(circle({ r: 2, opacity: 0.01 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "stat_unique per draw is one mark per distinct (vs, am) per draw, which is what grouping by both does. With blend: \"mean\" the opacity of each point would be the probability that some car lands there; at alpha 0.01 over 10 draws it is close to a count."
  ),
  "paper-fig1c-density": D(
    `const height = dist.normal({ mean: "x", sd: "sigma" });
chart(heights)
  .flow(derive(repeat(100, "draw")), group({ by: "draw" }))
  .mark(density({ x: height.sample("draw"), opacity: 0.3 })); // gap: KDE`,
    "group({ by: \"draw\" }), the plain overlay, n = 100",
    "gofish-gap",
    "ok",
    "The paper's motivating example: a density of 15 heights per draw. Missing: a KDE stat."
  ),
  "paper-fig3-convergence": D(
    `const height = dist.normal({ mean: "x", sd: "sigma" });
// one panel per scale k of the sd: 1, 0.3, 0.05, 0
chart(heights)
  .flow(derive(repeat(100, "draw")), group({ by: "draw" }))
  .mark(density({ x: height.sample("draw"), opacity: 0.3 })); // gap: KDE`,
    "group({ by: \"draw\" }), the plain overlay, n = 100",
    "gofish-gap",
    "ok",
    "As the sd goes to 0 every draw is the same table, so the overlay is the plain density plot. This is the convergence the grammar keeps because draws are placed by ordinary steps."
  ),
  "paper-fig6a-quantile-intercept": D(
    `const intercept = dist.normal({ mean: 0, sd: 1 });
chart([{}])
  .flow(derive(repeat(50, { level: "p" })), group({ by: "p" }))
  .mark(abline({ intercept: intercept.quantile("p"), slope: 1, stroke: "p", opacity: 0.6 })); // gap: abline`,
    "group({ by: \"p\" }) over 50 evenly spaced levels, each line at quantile p, colored by p",
    "gofish-gap",
    "ok",
    "A contrast panel, not ggdibbler output. repeat writes the 50 evenly spaced levels p, and quantile(\"p\") reads exactly those quantiles, which version 1 could not pick. One cell, so nothing is joined across cells. Missing: abline."
  ),
  "paper-fig6b-sample-intercept": D(
    `const intercept = dist.normal({ mean: 0, sd: 1 });
chart([{}])
  .flow(derive(repeat(50, "draw")), group({ by: "draw" }))
  .mark(
    abline({
      intercept: intercept.sample("draw"),
      slope: 1,
      // the draw's level: the CDF at the drawn value
      stroke: intercept.cdf(intercept.sample("draw")),
      opacity: 0.6,
    }),
  ); // gap: abline`,
    "group({ by: \"draw\" }), the plain overlay, n = 50, colored by level",
    "gofish-gap",
    "ok",
    "Lines at random draws, colored by each draw's level, the CDF at the drawn value. The paper colors by rank / 51, which is close. Version 1 needed a sort in a value channel, which is not legal. Missing: abline."
  ),
  "paper-fig6c-quantile-joint": D(
    `// Two independent marginal cells. repeat gives row k the level
// p = (k + 0.5) / 50, and both channels read quantile p, so each line
// pairs the k-th quantile of the intercept with the k-th of the slope.
const a = dist.normal({ mean: 0, sd: 1 });
const b = dist.normal({ mean: 0, sd: 1 });
chart([{}])
  .flow(derive(repeat(50, { level: "p" })), group({ by: "p" }))
  .mark(abline({ intercept: a.quantile("p"), slope: b.quantile("p"), stroke: "p", opacity: 0.6 })); // gap: abline`,
    "group({ by: \"p\" }) over 50 evenly spaced levels, both cells read at quantile p",
    "gofish-gap",
    "warning: 4.2, each line reads quantile p of two cells, a lockstep quantile pair, not a draw",
    "The paper's anti-example: paired marginal quantiles make a fan through one point. Version 1 could not write it, which was the right result. Now it is written with quantile(\"p\") on two cells, and rule 4.2 warns: reading quantile p of several cells at once is a lockstep quantile curve, not a draw. The earlier draft wrote it with no warning, because its rule was about rows of different cells and these are two cells of one row. With the paper's joint cell, dist.mvnormal, a quantile has no meaning, because a pair has no single level. Missing: abline."
  ),
  "paper-fig6d-sample-joint": D(
    `const p = dist.mvnormal({
  mean: { a: 0, b: 0 },
  sd: { a: 1, b: 1 },
  cor: -0.8,
});
chart([{}])
  .flow(derive(repeat(50, "draw")), group({ by: "draw" }))
  .mark(abline({ intercept: p.a.sample("draw"), slope: p.b.sample("draw") })); // gap: abline`,
    "group({ by: \"draw\" }), the plain overlay, n = 50",
    "gofish-gap",
    "ok",
    "Joint draws of slope and intercept, one line per draw. The joint is exactly what dist.mvnormal adds over ggdibbler. Missing: abline (and color by rank, as in Fig 6b)."
  ),
  "paper-fig7a-smooth-pooled": D(
    `layer([
  chart(uncertainMpg)
    .flow(derive(repeat(10, "draw")), scatter({ x: field("displ").sample("draw"), y: field("hwy").sample("draw") }))
    .mark(circle({ r: 0.5, opacity: 0.05 })),
  // one smooth over every drawn row: no group by draw
  chart(uncertainMpg).flow(derive(repeat(10, "draw"))).mark(
    smooth({ x: field("displ").sample("draw"), y: field("hwy").sample("draw"), method: "loess", band: true }),
  ), // gap: smoothing stat
]);`,
    "nothing: the smooth pools every drawn row, n = 10",
    "gofish-gap",
    "warning: 4.3, one smoother is fitted to the draws of every car at once, so n draws count as n times as much data and the band shrinks as n grows",
    "The paper's wrong version. Version 1 had no rule for it; rule 4.3 now warns. The fix is entry 67: fit once per draw."
  ),
  "paper-fig8b-stack-stack": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "y" }),
    stack({ by: "draw", dir: "x" }),
    stack({ by: field("drv").sample("draw"), dir: "x" }),
  )
  .mark(rect({ w: field("drv").count(), fill: field("drv").sample("draw") }));`,
    "stack({ by: \"draw\" }), n = 10",
    "fits",
    "error: 4.4, stack({ by: \"draw\" }) adds counts of alternative draws",
    "The paper's own example of why draws must not stack. Same reasoning as entry 85."
  ),
  "paper-fig8c-stack-dodge": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "y" }),
    spread({ by: "draw", dir: "y", spacing: 0 }),
    stack({ by: field("drv").sample("draw"), dir: "x" }),
  )
  .mark(rect({ w: field("drv").count(), fill: field("drv").sample("draw") }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "stack_dodge on the y axis."
  ),
  "paper-fig8d-stack-identity": D(
    `chart(uncertainMpg)
  .flow(derive(repeat(10, "draw")), 
    spread({ by: field("class").sample("draw"), dir: "y" }),
    group({ by: "draw" }),
    stack({ by: field("drv").sample("draw"), dir: "x" }),
  )
  .mark(rect({ w: field("drv").count(), fill: field("drv").sample("draw"), opacity: 0.15 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "stack_identity on the y axis."
  ),
  "paper-fig9a-text-transparency": D(
    `chart(grid)
  .flow(derive(repeat(10, "draw")), table({ by: { x: "col", y: "row" } }), group({ by: "draw" }))
  .mark(text({ text: field("mode").sample("draw"), textAnchor: "middle", opacity: 0.2 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "A random category as text, painted in place at alpha 0.15 per draw: the more certain the word, the more legible."
  ),
  "paper-fig9b-text-jitter": D(
    `chart(grid)
  .flow(derive(repeat(10, "draw")), 
    table({ by: { x: "col", y: "row" } }), // gap: jitter on both axes
    scatter({ overlap: Overlap.jitter() }),
  )
  .mark(text({ text: field("mode").sample("draw") }));`,
    "no step reads the draw key: every drawn row is painted, which is the plain overlay, n = 10 (no bare-Dist form: it needs a finite repeat, rule 4.1)",
    "gofish-gap",
    "ok",
    "Draws jittered around the cell. The draw part fits; 2D jitter is missing."
  ),
  "paper-fig9c-colour-dodge": D(
    `chart(grid)
  .flow(derive(repeat(10, "draw")), 
    table({ by: { x: "col", y: "row" }, spacing: 4 }),
    spread({ by: "draw", dir: "x", spacing: 0 }),
  )
  .mark(rect({ fill: field("value").sample("draw") }));`,
    "spread({ by: \"draw\" }), n = 10",
    "fits",
    "ok",
    "Tile color with the draws as strips."
  ),
  "paper-fig9d-colour-transparency": D(
    `chart(grid)
  .flow(derive(repeat(10, "draw")), 
    table({ by: { x: "col", y: "row" }, spacing: 4 }),
    group({ by: "draw" }),
  )
  .mark(rect({ fill: field("value").sample("draw"), opacity: 0.15 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Colors painted over each other, which the paper notes can leave the palette. blend: \"mean\" would average colors and has the same issue; its limit is the expected color, which a bare Dist in fill writes (section 1, addition 5)."
  ),
  "paper-fig10b-pie": D(
    `chart(uncertainMpg, { coord: Coord.clock() })
  .flow(derive(repeat(10, "draw")), group({ by: "draw" }), stack({ by: field("class").sample("draw"), dir: "theta" }))
  .mark(rect({ w: field("class").count(), fill: field("class").sample("draw"), opacity: 0.15 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "A pie per draw, painted over each other, so the boundaries blur."
  ),
  "paper-fig10c-histogram": D(
    `chart(smallerUncertainDiamonds)
  .flow(derive(repeat(10, "draw")), 
    group({ by: "draw" }),
    partition({ by: field("carat").sample("draw").bin(Bin.thresholds(30)), dir: "x" }),
    stack({ by: field("cut").sample("draw"), dir: "y" }),
  )
  .mark(rect({ h: field("carat").count(), fill: field("cut").sample("draw"), opacity: 0.15 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 10",
    "fits",
    "ok",
    "Stacked histogram per draw, painted over each other."
  ),
  "paper-fig10d-map": D(
    `chart(counties, { coord: Coord.geo() })
  .flow(derive(repeat(25, "draw")), subdivide({ by: "draw", region: "geometry" })) // gap
  .mark(region({ fill: temp }));`,
    "subdivide by \"draw\" (missing operator), n = 25",
    "gofish-gap",
    "ok",
    "A pixel map. Same polygon subdivision gap."
  ),
  "paper-fig10f-network": D(
    `const present = dist.bernoulli({ p: "p" });
layer([
  chart(nodes)
    .flow(scatter({ by: "id", x: "x", y: "y" }))
    .mark(circle({ r: 3 }).name("nodes")),
  chart(edges)
    .flow(derive(repeat(30, "draw")), 
      filter(present.sample("draw").between(1, 1)),
      group({ by: "draw" }),
      resolve(["from", "to"], { from: selectAll("nodes") }),
    )
    .mark(
      line({
        from: "from",
        to: "to",
        stroke: "firebrick",
        strokeWidth: 2,
        opacity: 0.08,
      }),
    ),
]);`,
    "group({ by: \"draw\" }), the plain overlay, n = 30",
    "fits",
    "ok",
    "Each edge is present in a draw with probability p. filter keeps the present edges, and each present edge is painted at alpha 0.08, as ggdibbler's alpha scale does. filter reads the Dist expression on a drawn row, which is the same rule as a channel reading it; today's filter takes a field. Each edge is one cell, and its line joins fixed nodes, so rule 4.2 does not fire."
  ),
  "paper-fig11b-pie": D(
    `chart(smallerUncertainDiamonds, { coord: Coord.clock() })
  .flow(derive(repeat(10, "draw")), 
    spread({ by: "draw", dir: "r", spacing: 0 }),
    stack({ by: field("clarity").sample("draw"), dir: "theta" }),
  )
  .mark(rect({ w: field("clarity").count(), fill: field("clarity").sample("draw") }));`,
    "spread({ by: \"draw\", dir: \"r\" }), n = 10",
    "fits",
    "ok",
    "stack_dodge in polar: the draws are rings, each a full pie, which gives the jagged edge."
  ),
  "paper-fig13-times": D(
    `// one panel per n: 10, 100, 1000
chart(uncertainMtcars)
  .flow(
    derive(repeat(100, "draw")),
    group({ by: "draw" }),
    scatter({ x: field("mpg").sample("draw"), y: field("wt").sample("draw") }),
  )
  .mark(circle({ r: 2, fill: field("cyl").sample("draw"), opacity: 0.3 }));`,
    "group({ by: \"draw\" }), the plain overlay, n = 100",
    "fits",
    "ok",
    "The paper's panels at times = 10, 100 and 1000. As an overlay at fixed alpha the cloud saturates as n grows; with blend: \"mean\" it would converge to each car's density as n grows, which is the limit the paper describes. As a bare Dist in position that limit is a blur, which GoFish lacks."
  ),
};
