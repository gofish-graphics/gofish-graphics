const catchLocationsArray = Object.entries(lakeLocations).map(
  ([lake, { x, y }]) => ({ lake, x, y })
);

gf.Chart(catchLocationsArray, { axes: true })
  .flow(gf.scatter({ by: "lake", x: "x", y: "y" }))
  .mark(gf.circle())
  .connect(gf.line({ stroke: "steelblue", strokeWidth: 2 }))
  .render(root, {
    w: 400,
    h: 300,
  });
