import { chart, spread, scatter, circle } from "gofish-graphics";

export default function render(container, data) {
  // GoFish has no time scale: place each date at its decimal year, a
  // linear function of the time.
  const YEAR = 365.2425 * 864e5;
  const maxSales = Math.max(...data.map((d) => d.sales));
  const rows = data.map((d) => ({
    ...d,
    year: 1970 + Date.parse(d.date) / YEAR,
    // area proportional to sales, the largest 18 px in radius
    radius: 18 * Math.sqrt(d.sales / maxSales),
  }));
  // WORKAROUND: a data-driven `r` is a size in data units that GoFish
  // scales with the axes, so each circle is built with a literal pixel `r`
  // and then applied to its row (for the data-driven `fill`).
  return chart(rows, { axes: true })
    .flow(
      spread({ by: "category", dir: "y", spacing: 60 }),
      scatter({ by: "date", x: "year", alignment: "middle" })
    )
    .mark((d) => circle({ r: d[0].radius, fill: "category", opacity: 0.8 })(d))
    .render(container, { w: 440, h: 240 });
}
