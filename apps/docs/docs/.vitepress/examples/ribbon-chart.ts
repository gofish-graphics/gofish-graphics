gf.layer([
  gf
    .Chart(seafood)
    .flow(
      gf.spread({ by: "lake", dir: "x", spacing: 64 }),
      gf.derive((d) => _.orderBy(d, "count")),
      gf.stack({ by: "species", dir: "y", label: false })
    )
    .mark(gf.rect({ h: "count", fill: "species" }).name("bars")),
  gf
    .Chart(gf.selectAll("bars"))
    .flow(gf.group({ by: "datum.species" }))
    .mark(gf.area({ opacity: 0.8 })),
]).render(root, {
  w: 400,
  h: 400,
  axes: true,
});
