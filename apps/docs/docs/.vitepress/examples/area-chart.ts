// Aggregate total count per lake
const lakeTotals = Object.entries(_.groupBy(seafood, "lake")).map(
  ([lake, items]) => ({
    lake: lake,
    count: items.reduce((sum, item) => sum + item.count, 0),
  })
);

gf.layer([
  gf
    .Chart(lakeTotals)
    .flow(gf.spread({ by: "lake", dir: "x", spacing: 64 }))
    .mark(gf.blank({ h: "count" }).name("points")),
  gf.Chart(gf.selectAll("points")).mark(gf.area({ opacity: 0.8 })),
]).render(root, {
  w: 500,
  h: 300,
  axes: true,
});
