// Internal-wiki diagram: the claim max(σ + 30, 2σ), the envelope of a fixed
// 30 px label beside a bar that grows at σ and a bar that grows at 2σ. It
// bends at σ = 30. Drawn as a GoFish chart (the wiki dogfoods the library).
const points = _.range(0, 61, 5).map((sigma) => ({
  sigma,
  width: Math.max(sigma + 30, 2 * sigma),
}));

gf.layer([
  gf
    .Chart(points)
    .flow(gf.scatter({ x: "sigma", y: "width" }))
    .mark(gf.circle({ r: 3.5, fill: "#3451b2" }).name("pts")),
  gf
    .Chart(gf.selectAll("pts"))
    .mark(gf.line({ stroke: "#3451b2", strokeWidth: 2 })),
]).render(root, {
  w: 460,
  h: 280,
  axes: true,
});
