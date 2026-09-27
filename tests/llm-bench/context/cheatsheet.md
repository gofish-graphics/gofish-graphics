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

Options (=default). [box] = x y w h cx cy x2 y2. [style] = fill stroke strokeWidth opacity.

## Operators (in `.flow()`)

- `spread`: by, dir: "x"|"y", spacing=8, alignment="baseline", anchor="edge", reverse, axes, w, h, size
- `stack`: by, dir: "x"|"y", spacing, alignment="baseline", anchor="edge", reverse, axes, w, h, size
- `scatter`: by, x, y, xMin, xMax, yMin, yMax, alignment="baseline", axes, w, h
- `group`: by
- `table`: by: { x, y }, spacing, numCols
- `treemap`: x, y, w, h, by, paddingInner, paddingOuter, tile="squarify", sort="desc", size
- `derive(fn)`, `fn(rows)` returns rows
- `resolve`: cols, from
- `join`: on, right
- `filter(pred)`, `pred(row)` returns a boolean

## Marks (in `.mark()`)

- `rect`: [box], [style], rx, ry, aspectRatio
- `circle`: r, [style]
- `ellipse`: [box], [style], aspectRatio
- `text`: [box], text, fill="black", stroke, strokeWidth, fontSize=12, fontWeight, rotate, textAnchor="start"
- `line`: [style], strokeDasharray, curve, dir: "x"|"y", along
- `ribbon`: [style], dir: "x"|"y", curve, along
- `polygon`: points, [style]
- `image`: [box], href, opacity
- `petal`: [box], fill, stroke, strokeWidth
- `blank`: w, h, fill

## Combinators (with children: `layer([a, b])`, `stack({ dir }, [a, b])`)

- `layer`: [box], coord, axes
- `enclose`: padding, rx, ry, [style], strokeDasharray
- `arrow`: bow, padStart, padEnd, flip, stroke, strokeWidth, start
- `position`: x, y
- `intersect` `exclude` `subtract` `paint` `mask`: no options

## Coordinates (`chart(data, { coord })`)

- `clock` `polar`: innerRadius, centralAngle, startAngle, direction, center
