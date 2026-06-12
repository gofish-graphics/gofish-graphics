const catchLocationsArray = Object.entries(lakeLocations).map(
  ([lake, { x, y }]) => ({ lake, x, y })
);

gf.Chart(catchLocationsArray, { axes: true })
  .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
  .mark(gf.blank())
  .connect(gf.line())
  .render(root, {
    w: 500,
    h: 300,
  });
