gf.Chart(drivingShifts, { axes: true })
  .flow(gf.scatter({ by: "year", x: "miles", y: "gas" }))
  .mark(gf.circle({ r: 4, fill: "white", stroke: "black", strokeWidth: 2 }))
  .connect(gf.line({ stroke: "black", strokeWidth: 2 }))
  .render(root, {
    w: 500,
    h: 300,
  });
