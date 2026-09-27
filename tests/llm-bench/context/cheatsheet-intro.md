# GoFish cheatsheet

GoFish (`gofish-graphics`) is new; trust this page, not memory.

```js
import { chart, spread, rect } from "gofish-graphics";
export default function render(container, data) {
  return chart(data, { axes: true })
    .flow(spread({ by: "category", dir: "x" }))
    .mark(rect({ h: "value" }))
    .render(container, { w: 500, h: 300 });
}
```

- `chart(data, { axes, color, coord, legend })`.
- `.flow(op, ...)`: each operator splits rows into groups `by` a field and lays them out; the next runs inside each group. `spread` leaves gaps, `stack` none (sizes add up), `scatter` places at data values, `group` only splits.
- `.mark(m)`: the shape per final group. Unset sizes fill the slot.
- `.layer(chart().flow(...).mark(...))`: a layer over the marks drawn so far.
- `.render(container, { w, h, axes })`: `w`, `h` = plot area; axes and legend go outside. Returns a Promise.
- An option naming a field is data-driven (`fill: "kind"` adds a legend). Sizes (`w`, `h`, `r`, `size`) sum a group's rows, positions average; `field("v").mean()`, `.count()` override.
- `by: field("k").sort("v", "desc")`, `.sort(["a", "b"])`, `.bin()`. Default order: first appearance (top first for `dir: "y"`). `stack({ size: field("v").normalize() })` fills 100% (mosaic).
- `axes: true | { x: { title, labelAngle }, y: false }`. `color: palette("tableau10" | [colors] | { value: color })` or `gradient("blues" | [stops])`.
- `mark.label(field, { position: "center" | "outset" | "inset-top" | ..., fontSize })`; on an operator, one label per group.
- `coord: clock()`: `x`/`w` are angle, `y`/`h` radius. Pie: `stack({ by, dir: "x" })`, `rect({ w: "v", fill: "k" })`, no axes.
- `derive(bin("v"))` makes rows `{ start, end, count }` for `scatter({ xMin: "start", xMax: "end" })`.
