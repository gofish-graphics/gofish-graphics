import { chart, scatter, stack, ribbon } from "gofish-graphics";

export default function render(container, data) {
  // GoFish has no time scale: place each date at its decimal year, a
  // linear function of the time.
  const YEAR = 365.2425 * 864e5;
  const rows = data.map((d) => ({
    ...d,
    year: 1970 + Date.parse(d.date) / YEAR,
  }));
  return chart(rows, { axes: true })
    .flow(
      scatter({ by: "date", x: "year" }),
      stack({ by: "category", dir: "y" })
    )
    .mark(ribbon({ h: "sales", fill: "category", curve: "straight" }))
    .render(container, { w: 520, h: 330 });
}
