gf.layer([
  gf
    .Chart(drivingShifts)
    .flow(gf.scatter({ by: "year", x: "miles", y: "gas" }))
    .mark(
      gf
        .circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 })
        .name("points")
    ),
  gf
    .Chart(gf.selectAll("points"))
    .mark(gf.line({ stroke: "black", strokeWidth: 2 })),
  gf
    .Chart(drivingShifts)
    .flow(gf.scatter({ by: "year", x: "miles", y: "gas" }))
    .mark(gf.circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 })),
]).render(root, {
  w: 500,
  h: 300,
  axes: true,
});
