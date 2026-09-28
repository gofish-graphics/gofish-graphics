import { chart, spread, scatter, rect, derive, field } from "gofish-graphics";

export default function render(container, data) {
  // WORKAROUND (#773): a signed `w` does not grow a bar from zero, so each
  // bar is placed by its interval: Women from -percent to 0, Men from 0 to
  // percent.
  return chart(data, { axes: true })
    .flow(
      derive((rows) =>
        rows.map((d) => ({
          ...d,
          from: d.gender === "Women" ? -d.percent : 0,
          to: d.gender === "Women" ? 0 : d.percent,
        }))
      ),
      spread({ by: "nationality", dir: "y" }),
      scatter({
        by: "gender",
        xMin: field("from", "percent"),
        xMax: field("to", "percent"),
      })
    )
    .mark(rect({ fill: "gender" }))
    .render(container, { w: 440, h: 360 });
}
