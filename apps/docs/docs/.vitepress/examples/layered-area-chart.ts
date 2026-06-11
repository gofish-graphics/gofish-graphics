gf.layer([
  gf
    .Chart(streamgraphData)
    .flow(gf.spread({ by: "x", dir: "x", spacing: 50 }))
    .mark(gf.blank({ h: "y", fill: "c" }).name("points")),
  gf
    .Chart(gf.selectAll("points"))
    .flow(gf.group({ by: "datum.c" }))
    .mark(gf.area({ opacity: 0.7 })),
]).render(root, {
  w: 500,
  h: 300,
  axes: true,
});
