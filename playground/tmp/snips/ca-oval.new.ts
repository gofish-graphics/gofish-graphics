chart(gapminderCountries, {
  axes: true,
  w: 520,
  h: 320,
  color: Color.palette(REGION_COLORS),
})
  .flow(scatter({ x: "FertilityRate", y: "LifeExpectancy" }))
  .mark(circle({ r: 3.5, fill: "Region", opacity: 0.8 }).name("countries"))
  .layer(
    chart(selectAll("countries"))
      .flow(
        filter(
          (country: any) => project(country, "Region") === "Sub-Saharan Africa"
        )
      )
      .mark(
        enclose({
          shape: Shape.blob({ convexity: 2, connection: 0.85 }),
          padding: 4.5,
          fill: "#47b8a0",
          stroke: "#47b8a0",
          fillOpacity: 0.3,
        })
      )
  );
