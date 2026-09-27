import { chart, spread, rect } from "gofish-graphics";

export default function render(container, data) {
  // Bins [170, 180), [180, 190), ..., [230, 240).
  const bins = [];
  for (let start = 170; start < 240; start += 10) {
    const count = data.filter(
      (d) => d.flipper_length_mm >= start && d.flipper_length_mm < start + 10
    ).length;
    bins.push({ bin: `${start}–${start + 10}`, count });
  }
  return chart(bins, {
    axes: { x: { title: "Flipper length (mm)" }, y: { title: "Count" } },
  })
    .flow(spread({ by: "bin", dir: "x", spacing: 1 }))
    .mark(rect({ h: "count", fill: "steelblue" }))
    .render(container, { w: 540, h: 305 });
}
