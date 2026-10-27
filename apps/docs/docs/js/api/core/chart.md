# chart

Creates a `ChartBuilder`. This is the entry point for every GoFish chart.

::: gofish

```js
gf.chart(seafood, { axes: true })
  .flow(gf.spread({ by: "lake", dir: "x" }))
  .mark(gf.rect({ h: "count" }))
  .render(root, { w: 400, h: 250 });
```

:::

## Signature

```ts
chart(data, options?)
chart(options?) // empty scope — data inherited from context
```

Calling `chart()` (or `chart(options)`) with **no data** creates an _empty
scope_ that inherits its data from the enclosing context: the incoming partition
when used directly as a [`.mark(...)`](/js/api/core/mark), or the previous tier's
marks inside [`.layer(...)`](/js/api/core/layer). Chart data is always an array
or a [`selectAll`](/js/api/selection/ref) reference, so a lone options object is
never mistaken for data.

## Parameters

`data` (`T`) is the dataset to visualize.

`options` holds the chart-level options. See [Axes](#axes) for the full `axes`
shape, [Legend](#legend) for `legend`, [`Color.palette()`](/js/api/color/palette) and
[`Color.gradient()`](/js/api/color/gradient) for `color`, and
[`Schema`](/js/api/core/schema) for `schema`.

::: gofish-ref ChartOptions
:::

Returns a `ChartBuilder<T>` with [`.flow()`](/js/api/core/flow), [`.mark()`](/js/api/core/mark), [`.render()`](/js/api/core/render), [`.zOrder()`](#zorder), and [`.name()`](#name) methods.

## Axes

`axes` accepts a boolean, a per-dimension object, or per-dimension title control:

```ts
chart(data, { axes: true }); // both axes, titles inferred (the default)
chart(data, { axes: false }); // no axes
chart(data, { axes: { x: true, y: false } }); // x only
chart(data, { axes: { x: { title: "Year" }, y: true } }); // custom x title, inferred y title
chart(data, { axes: { x: { title: false }, y: true } }); // suppress the inferred x title
chart(data, { axes: { x: { levels: [Calendar.week, Calendar.month] } } }); // the rows of a time axis
chart(data, { axes: { x: { levels: [false, true] } } }); // hide the innermost level
chart(data, { axes: { x: { label: { angle: 45 } } } }); // x labels rotated 45 degrees
chart(data, { axes: { x: { label: { align: [true, "center"] } } } }); // center the second level
chart(data, { axes: { x: { divider: [false, true] } } }); // dividers at the second level's boundaries
```

The full type is:

```ts
type AxesOptions = boolean | { x?: AxisOptions; y?: AxisOptions };
type AxisOptions =
  | boolean
  | {
      title?: string | false;
      side?: "start" | "end";
      label?: AxisLabelOptions;
      levels?: (boolean | CalendarPartition)[];
      divider?: boolean | boolean[];
    };
type AxisLabelOptions = {
  angle?: number | number[] | "auto";
  align?: "start" | "center" | ("start" | "center" | true)[];
};
```

`label` sets how the axis's labels are drawn: `angle` rotates them and
`align` places them along the axis. An axis object or a `label` object with any
other key is an error that lists the keys it takes.

`levels` sets the axis's levels, its bands of labels, by depth, nearest the
plot first. Every axis on the dimension has levels, counted from the inside
out:

| Axis    | Inferred levels                                                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| numeric | one: its ticks                                                                                                                                      |
| time    | two rows: the level and step its domain picks for about 10 ticks, then that level's parent (see [`Calendar`](/js/api/core/calendar))                |
| ordinal | one per split; a key binned by a chain, `field("date").bin(Calendar.year).bin(Calendar.month)`, has one per bin, nearest first (months, then years) |

Each entry sets the level at its depth:

- `true` keeps the level as inferred.
- `false` hides it: its labels (and a time row's ticks) are not drawn and
  take no space.
- A Calendar value names its cells. On a time axis it is a row's partition.
  On an ordinal axis over cells of time, it groups the slots by its cells:
  `Calendar.year` over month slots labels each run of months in one year.
  `Calendar.month.format(fn)` relabels a level of months.

Depths the list does not reach stay as inferred, so `[false]` hides only the
innermost level. On the outermost axis of the dimension, a Calendar value
past the inferred levels adds a level: `levels: [true, Calendar.year]` over
the slots of `field("date").bin([Calendar.year, Calendar.month])` adds a year
level. An entry that cannot apply is an error that lists the dimension's
levels: a Calendar value over slots that are not times, or finer than the
slots (`Calendar.week` over months), `false` on a numeric axis, and an entry
past the last level. A Calendar value coarser than slots that do not nest in
it groups each slot by the cell that holds the slot's start: over week
slots, `Calendar.month` puts each week in the month it starts in.
`label.angle`, `label.align` and `divider` lists use the same depths, and
an entry of one that cannot apply at its depth, or one past the last level,
is the same error.

On an ordinal axis, the label rows of the dimension stack from the plot
edge, whichever split draws them, so nested splits and one chained key look
the same. A row sits 2 pixels past a row it divides (by default, a row it
partitions) and 8 pixels past any other row. A divider is a line centered in the gap between two
neighboring slots. It runs through the row of every level that has a
boundary in that gap, starting at the plot edge. A level whose group
continues across the gap stops the divider.

`divider` sets which levels draw dividers at their boundaries. By default a
level draws them when it partitions the value of the level inside it, that
is, both bin the same column:

| Levels                                                                                                         | Dividers               |
| -------------------------------------------------------------------------------------------------------------- | ---------------------- |
| a chained key, `field("date").bin(Calendar.year).bin(Calendar.month)`                                          | between the years      |
| nested splits that bin one column, `field("date").bin(Calendar.year)` then `field("date").bin(Calendar.month)` | between the years      |
| a coarser Calendar entry of `levels`, `levels: [true, Calendar.month]` over week slots                         | between the months     |
| numeric bins inside bins of one column, `Bin.step(10)` then `Bin.step(2)`                                      | between the outer bins |
| categories inside categories (a lake over its species), or months over weather categories                      | none                   |
| the innermost level of the dimension                                                                           | none                   |

So in a chart of months over weather categories, with a chained year above
the months, the one divider is between the years, and it runs from the plot
edge through the weather, month and year rows. `true` turns a level's
dividers on and `false` turns them off. A single value applies to every
ordinal level and skips a continuous axis's level, whose ticks name points,
with no regions between them. A list is per level, by the same depths as
`levels`, and a depth past its end stays as inferred: `divider: [false, true]`
divides only at the second level's boundaries. In a list, `true` at a
continuous level's depth is an error.

`label.align` sets where each level's labels sit along the axis: `"center"` centers
a label under what it names, and `"start"` puts it at the start of its run,
3 pixels past the divider before it (the first run starts at the axis
start). By default:

| Level                                                                                                      | Labels                   |
| ---------------------------------------------------------------------------------------------------------- | ------------------------ |
| the innermost level of the dimension (one label per slot)                                                  | centered                 |
| an outer level over unordered categories                                                                   | centered                 |
| an outer level over ordered groups: cells of time, numeric bins, or a column the `schema` declares ordered | at the start of each run |
| a continuous axis's ticks                                                                                  | centered on the tick     |

A single value applies to every level where it can: a single `"start"`
skips a continuous axis's levels, since their labels name points. A list is
per level, by the same depths as `levels`, and `true` keeps a level's
inferred alignment: `label: { align: [true, "center"] }` centers the second
level. In a list, `"start"` at a continuous level's depth is an error.

Each axis title defaults to the field that dimension encodes (e.g. `count` for
`rect({ h: "count" })`). Pass `{ title: "…" }` to override it, or `{ title: false }`
to show the axis with no title. Manual `axis: true/false` overrides on individual
operators within the chart are still respected when `axes: true`. See
[render › Axes](/js/api/core/render#axes) for live examples.

Each chart's `axes` applies at that chart. A chart nested in another reads its
own `axes` and draws only the axes of the domains it owns, so a shared axis is
drawn once. An axis a chart turns off is hidden: no chart inside it draws that
axis instead.

```ts
// The outer chart draws the lake axis. Each nested chart draws its own
// species axis, except where it says axes: false.
chart(seafood, { axes: true })
  .flow(spread({ by: "lake", dir: "x" }))
  .mark((d) =>
    chart(d, { axes: false })
      .flow(spread({ by: "species", dir: "y" }))
      .mark(rect({ w: 20, h: 8 }))
  );
```

## Legend

When a chart's marks color by a field, GoFish resolves a color scale and draws
it beside the plot: a swatch column for a categorical scale, a colorbar for a
gradient. `legend: false` suppresses that chrome. The marks keep their colors —
only the legend goes away.

```ts
chart(data, { legend: false });
```

Use it when the legend would cost more than it explains: a map colored by 72
species, where the swatch column would take more room than the map itself, or a
chart whose colors are already labeled in place.

## Equal scale from a shared unit

By default each axis resolves its data→pixel scale independently — `x` against
the width, `y` against the height — so a circle in data space becomes an ellipse.
That is correct when the axes are different quantities. But when **x and y are
in the same unit**, "1 unit on x" and "1 unit on y" are the _same_
quantity, so their scales must be equal — a circle stays circular, a 45° line
looks 45°. The way maps, geometric data, and correlation plots need.

GoFish does this from the **unit**, not a knob: declare both columns in the
same unit with [`Unit`](/js/api/core/schema) or a unit's name and the shared scale
follows.

```ts
chart(data, { schema: { x: "plane", y: "plane" } })
  .flow(scatter({ x: "x", y: "y" }))
  .mark(circle({ r: 4 }))
  .render(container, { w: 640, h: 380 }); // a true circle, not an ellipse
```

This is the same rule the `circle` mark already obeys one level down:
`circle({ r })` lowers to a `w` and `h` driven by one value, which share a
unit and therefore one scale factor — so a circle can never distort into an
ellipse. Equal scale at the chart level is exactly that, lifted to x and y.

The binding (more constrained) axis fills its dimension; the other is centered in
the leftover space. It applies to axes that carry a data-driven scale (a position
scale over a data domain, or a data-driven size); an axis with nothing to scale
(a category axis) leaves it a no-op. Two columns with no declared unit stay
independent (`bill_length` and `bill_depth`), while `predicted` and `actual`,
both declared in the unit `"price"`, share a scale.

## Example

```ts
chart(data, { axes: true })
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }))
  .render(container, { w: 500, h: 300 });
```

## .zOrder()

Controls the rendering order of this chart when it is a child of a [`layer`](/js/api/operators/layer). Lower values are drawn first (underneath); higher values are drawn on top.

```ts
chartBuilder.zOrder(value: number): ChartBuilder
```

Children with the same z-order keep their original array order. The default z-order is `0`.

```ts
layer([
  chart(data)
    .flow(scatter({ by: "x", y: "y" }))
    .mark(line())
    .zOrder(0),
  chart(data)
    .flow(scatter({ by: "x", y: "y" }))
    .mark(circle({ r: 5 }))
    .zOrder(1),
]);
// circles are always drawn on top of the line, regardless of array position
```

## .name()

Names a whole chart's resolved node — the builder-level counterpart to a mark's
[`.name()`](/js/api/core/mark). A named nested chart can be a target of a
[`.relate()`](/js/api/constraints/relate) callback on its enclosing
[`layer`](/js/api/operators/layer), and is resolvable through
[`ref` / `selectAll`](/js/api/selection/ref).

```ts
chartBuilder.name(layerName: string): ChartBuilder
```

This is what lets you assemble a compound glyph from sub-charts and snap the
pieces together. For example, a flower built from a green stem and a polar petal
head, where the head is its own `chart(...)` named `"flower"` so the layer can
align its center onto the stem's top:

```ts
layer([
  rect({ w: 4, h: "total", fill: "green" }).name("stem"),
  chart(species, { coord: Coord.polar() })
    .flow(stack({ by: "species", dir: "x" }))
    .mark(petal({ w: "count", fill: "species" }))
    .name("flower"),
]).relate(({ stem, flower }) => [
  Constraint.align({ x: "middle" }, [stem, flower]),
  Constraint.align({ y: ["end", "middle"] }, [stem, flower]),
]);
```
