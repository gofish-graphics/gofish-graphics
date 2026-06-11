gf.layer([
  gf
    .Chart(seafood)
    .flow(
      gf.spread({ by: "lake", dir: "x", spacing: 80 }),
      gf.spread({ by: "species", dir: "y", spacing: -16 })
    )
    .mark(gf.blank({ h: "count", fill: "species" }).name("points")),
  gf
    .Chart(gf.selectAll("points"))
    .flow(gf.group({ by: "datum.species" }))
    .mark(gf.area({ opacity: 0.8, mixBlendMode: "normal" })),
]).render(root, { w: 500, h: 300, axes: true });
