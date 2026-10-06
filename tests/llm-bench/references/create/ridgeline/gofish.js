import {
  chart,
  spread,
  scatter,
  ribbon,
  text,
  layer,
  field,
} from "gofish-graphics";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default function render(container, data) {
  const W = 440;
  const pitch = 30;
  // The rows take 11 pitches and the tallest ridge rises above the top
  // baseline, so H sets the height scale: the tallest peak is about
  // H - 11 * pitch (here 2 pitches).
  const H = 13 * pitch - 6;
  // WORKAROUND: `.label("month")` on the spread flips the row order and
  // moves the axis, so the month names are a text layer, one per baseline
  // (text y is measured down from the top baseline here).
  const labels = MONTHS.map((m, k) =>
    text({ x: -34, y: k * pitch - 5, text: m, fontSize: 11 })
  );
  return chart(data, { axes: { x: true, y: false } })
    .flow(
      spread({
        by: field("month").sort(MONTHS),
        dir: "y",
        anchor: "baseline",
        spacing: pitch,
        h: H,
        axes: { x: true, y: false },
      }),
      scatter({ x: "temp_c", w: W, axes: { x: true, y: false } })
    )
    .mark(
      ribbon({
        h: "days",
        fill: "steelblue",
        stroke: "white",
        strokeWidth: 1,
        curve: "linear",
      })
    )
    .layer(layer(labels))
    .render(container, { w: W, h: H });
}
