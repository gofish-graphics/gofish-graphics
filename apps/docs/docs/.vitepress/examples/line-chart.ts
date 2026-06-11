const catchLocationsArray = Object.entries(lakeLocations).map(
  ([lake, { x, y }]) => ({ lake, x, y })
);

gf.layer([
  gf
    .Chart(catchLocationsArray)
    .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
    .mark(gf.blank().name("points")),
  gf.Chart(gf.selectAll("points")).mark(gf.line()),
]).render(root, {
  w: 500,
  h: 300,
  axes: true,
});
