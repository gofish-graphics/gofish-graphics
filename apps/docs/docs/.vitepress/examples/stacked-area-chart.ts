gf.layer([
  gf
    .Chart(seafood)
    .flow(
      gf.spread({ by: "lake", dir: "x", spacing: 64 }),
      gf.stack({ by: "species", dir: "y", label: false })
    )
    .mark(gf.blank({ h: "count", fill: "species" }).name("bars")),
  gf
    .Chart(gf.selectAll("bars"))
    .flow(gf.group({ by: "datum.species" }))
    .mark(gf.area({ opacity: 0.8 })),
]).render(root, {
  w: 300,
  h: 400,
  axes: true,
});
