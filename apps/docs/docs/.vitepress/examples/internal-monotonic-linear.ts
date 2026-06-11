// Internal-wiki diagram: a linear monotonic function, y = 2x + 1, drawn as a
// GoFish chart (the wiki dogfoods the library).
const points = _.range(0, 11).map((x) => ({ x, y: 2 * x + 1 }));

gf.layer([
  gf
    .Chart(points)
    .flow(gf.scatter({ x: "x", y: "y" }))
    .mark(gf.circle({ r: 3.5, fill: "#3451b2" }).name("pts")),
  gf
    .Chart(gf.selectAll("pts"))
    .mark(gf.line({ stroke: "#3451b2", strokeWidth: 2 })),
]).render(root, {
  w: 460,
  h: 280,
  axes: true,
});
