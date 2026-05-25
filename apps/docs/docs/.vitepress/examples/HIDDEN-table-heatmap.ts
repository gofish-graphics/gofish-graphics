const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const hours = ["9am", "10am", "11am", "12pm", "1pm"];
const data = days.flatMap((day, di) =>
  hours.map((hour, hi) => ({
    day,
    hour,
    value: ((di * 7 + hi * 13 + 11) * 17) % 100,
  }))
);

gf.Chart(data, { color: gf.gradient(["#ffffcc", "#fd8d3c", "#bd0026"]) })
  .flow(gf.table({ by: { x: "hour", y: "day" }, spacing: 4 }))
  .mark(gf.rect({ fill: "value" }))
  .render(root, { w: 500, h: 300, axes: true });
