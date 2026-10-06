import {
  chart,
  scatter,
  group,
  ribbon,
  line,
  blank,
  palette,
} from "gofish-graphics";

export default function render(container, data) {
  // GoFish has no time scale: place each date at its decimal year, a
  // linear function of the time.
  const YEAR = 365.2425 * 864e5;
  const rows = data.map((d) => ({
    year: 1970 + Date.parse(d.date) / YEAR,
    balance: d.balance,
  }));
  // Add a zero point at each crossing, so each side's area ends there.
  const pts = [];
  rows.forEach((d, i) => {
    const prev = rows[i - 1];
    if (prev && prev.balance * d.balance < 0) {
      const f = prev.balance / (prev.balance - d.balance);
      pts.push({ year: prev.year + f * (d.year - prev.year), balance: 0 });
    }
    pts.push(d);
  });
  // Each side's area is the balance clamped to that side of zero.
  const area = pts.flatMap((d) => [
    { year: d.year, side: "Surplus", balance: Math.max(d.balance, 0) },
    { year: d.year, side: "Deficit", balance: Math.min(d.balance, 0) },
  ]);

  return (
    chart(area, {
      axes: true,
      color: palette({ Surplus: "#2a9d8f", Deficit: "#e76f51" }),
    })
      .flow(group({ by: "side" }), scatter({ by: "year", x: "year" }))
      .mark(ribbon({ h: "balance", fill: "side", curve: "linear" }))
      // The line: invisible anchors at the monthly values, then a line
      // through them. (`.layer(chart(rows)...mark(line(...)))` would nest a
      // fused line tier, which draws a wrong line.)
      .layer(
        chart(rows)
          .flow(scatter({ by: "year", x: "year", y: "balance" }))
          .mark(blank())
      )
      .layer(line({ stroke: "#222", strokeWidth: 1.5, curve: "linear" }))
      .render(container, { w: 560, h: 340 })
  );
}
