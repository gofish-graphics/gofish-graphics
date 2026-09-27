import { chart, spread, rect, line, text, layer, datum } from "gofish-graphics";

export default function render(container, data) {
  const W = 540;
  const mean = data.reduce((s, d) => s + d.rain_mm, 0) / data.length;
  return chart(data, { axes: true })
    .flow(spread({ by: "month", dir: "x" }))
    .mark(rect({ h: "rain_mm", fill: "steelblue" }))
    .layer(
      // two invisible endpoints at the mean, at the plot's left and right
      // edges, joined by a dashed line; the label sits just above its end
      layer([
        rect({ x: 0, y: datum(mean), w: 0, h: 0 }).name("start"),
        rect({ x: W, y: datum(mean), w: 0, h: 0 }).name("end"),
        text({
          x: W - 80,
          y: datum(mean + 3),
          text: `Mean = ${mean.toFixed(1)}`,
        }),
      ]).relate(({ start, end }) => [
        line({ stroke: "#333", strokeDasharray: "6 4", curve: "straight" }, [
          start,
          end,
        ]),
      ])
    )
    .render(container, { w: W, h: 305 });
}
