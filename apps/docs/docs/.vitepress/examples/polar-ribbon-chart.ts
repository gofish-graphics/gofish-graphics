gf.layer({ coord: gf.clock() }, [
  gf
    .Chart(seafood)
    .flow(
      gf.spread({
        by: "lake",
        dir: "x",
        spacing: (2 * Math.PI) / 6,
        mode: "center",
        y: 50,
        label: false,
      }),
      gf.derive((d) => _.orderBy(d, "count")),
      gf.stack({ by: "species", dir: "y", label: false })
    )
    .mark(gf.rect({ h: "count", fill: "species" }).name("bars")),
  gf
    .Chart(gf.selectAll("bars"))
    .flow(gf.group({ by: "datum.species" }))
    .mark(gf.area({ opacity: 0.8 })),
]).render(root, {
  w: 500,
  h: 300,
  transform: { x: 200, y: 200 },
  axes: true,
});
