import {
  chart,
  spread,
  scatter,
  rect,
  derive,
  field,
  palette,
} from "gofish-graphics";

// Each bar spans the running totals before and after its row (lo to hi);
// End is a
// last bar from zero to the final total.
function runningTotals(rows) {
  let total = 0;
  const bars = rows.map((d, i) => {
    const before = i === 0 ? 0 : total;
    total += d.amount;
    const kind = i === 0 ? "Total" : d.amount >= 0 ? "Increase" : "Decrease";
    const [lo, hi] = [Math.min(before, total), Math.max(before, total)];
    return { label: d.label, lo, hi, kind };
  });
  return [...bars, { label: "End", lo: 0, hi: total, kind: "Total" }];
}

export default function render(container, data) {
  return chart(data, {
    axes: true,
    color: palette({
      Increase: "#59a14f",
      Decrease: "#e15759",
      Total: "#4e79a7",
    }),
  })
    .flow(
      derive(runningTotals),
      spread({ by: "label", dir: "x" }),
      scatter({
        yMin: field("lo", "amount"),
        yMax: field("hi", "amount"),
      })
    )
    .mark(rect({ fill: "kind" }))
    .render(container, { w: 440, h: 300 });
}
