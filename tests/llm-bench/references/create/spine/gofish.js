import { chart, spread, stack, rect, Schema } from "gofish-graphics";

export default function render(container, data) {
  // Women then Men, centered on the boundary between them: Women extend
  // left of the center line and Men right.
  return chart(data, {
    axes: true,
    schema: { gender: Schema.ordered(["Women", "Men"]).diverging() },
  })
    .flow(
      spread({ by: "nationality", dir: "y" }),
      stack({ by: "gender", dir: "x" })
    )
    .mark(rect({ w: "percent", fill: "gender" }))
    .render(container, { w: 440, h: 360 });
}
