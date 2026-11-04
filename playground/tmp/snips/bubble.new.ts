chart(countryPopulations)
  .flow(
    pack({ by: "continent", spacing: 4 }),
    enclose({
      shape: Shape.fillet({ radius: 12 }),
      padding: 4,
      fill: "none",
      stroke: "#333",
      strokeWidth: 1.5,
    }),
    pack({ by: "region", spacing: 4 }),
    enclose({
      shape: Shape.fillet({ radius: 0 }),
      padding: 4,
      fill: "none",
      stroke: "#999",
    }),
    pack()
  )
  .mark(country)
  .render(container, { w: 720, h: 600 });
