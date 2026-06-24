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
```

## Parameters

| Parameter             | Type                  | Description                                                                                                                                                                  |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`                | `T`                   | The dataset to visualize                                                                                                                                                     |
| `options.w`           | `number`              | Width hint for the chart frame                                                                                                                                               |
| `options.h`           | `number`              | Height hint for the chart frame                                                                                                                                              |
| `options.coord`       | `CoordinateTransform` | Coordinate transform (e.g. `polar()`)                                                                                                                                        |
| `options.color`       | `ColorConfig`         | Color scale applied to all marks in this chart. Use [`palette()`](/js/api/color/palette) for categorical data or [`gradient()`](/js/api/color/gradient) for continuous data. |
| `options.axes`        | `AxesOptions`         | Auto-generate axes, labels, and legends. See [Axes](#axes) below.                                                                                                            |

Returns a `ChartBuilder<T>` with [`.flow()`](/js/api/core/flow), [`.mark()`](/js/api/core/mark), [`.render()`](/js/api/core/render), [`.zOrder()`](#zorder), and [`.name()`](#name) methods.

## Axes

`axes` accepts a boolean, a per-dimension object, or per-dimension title control:

```ts
chart(data, { axes: true }); // both axes, titles inferred
chart(data, { axes: false }); // no axes (the default)
chart(data, { axes: { x: true, y: false } }); // x only
chart(data, { axes: { x: { title: "Year" }, y: true } }); // custom x title, inferred y title
chart(data, { axes: { x: { title: false }, y: true } }); // suppress the inferred x title
```

The full type is:

```ts
type AxesOptions = boolean | { x?: AxisOptions; y?: AxisOptions };
type AxisOptions = boolean | { title?: string | false };
```

Each axis title defaults to the field that dimension encodes (e.g. `count` for
`rect({ h: "count" })`). Pass `{ title: "…" }` to override it, or `{ title: false }`
to show the axis with no title. Manual `axis: true/false` overrides on individual
operators within the chart are still respected when `axes: true`. See
[render › Axes](/js/api/core/render#axes) for live examples.

## Equal scale from a shared measure

By default each axis resolves its data→pixel scale independently — `x` against
the width, `y` against the height — so a circle in data space becomes an ellipse.
That is correct when the axes are different quantities. But when **x and y are
the same unit of measure**, "1 unit on x" and "1 unit on y" are the _same_
quantity, so their scales must be equal — a circle stays circular, a 45° line
looks 45°. The way maps, geometric data, and correlation plots need.

GoFish does this from the **measure**, not a knob: tag both channels with the
same measure via `field(name, measure)` (or `datum(value, measure)`) and the
shared scale follows.

```ts
chart(data)
  .flow(scatter({ x: field("x", "plane"), y: field("y", "plane") }))
  .mark(circle({ r: 4 }))
  .render(container, { w: 640, h: 380 }); // a true circle, not an ellipse
```

This is the same rule the `circle` mark already obeys one level down:
`circle({ r })` lowers to a `w` and `h` driven by one value, which share a
measure and therefore one scale factor — so a circle can never distort into an
ellipse. Equal scale at the chart level is exactly that, lifted to x and y.

The binding (more constrained) axis fills its dimension; the other is centered in
the leftover space. It applies to axes that carry a data-driven scale (a position
scale over a data domain, or a data-driven size); an axis with nothing to scale
(a category axis) leaves it a no-op. Tagging the two axes the same is a unit
claim — `bill_length` and `bill_depth` (both mm, but _different_ measures) stay
independent, while `predicted` vs `actual` (both `"price"`) share a scale.

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
[`.constrain()`](/js/api/constraints/constrain) callback on its enclosing
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
  chart(species, { coord: polar() })
    .flow(stack({ by: "species", dir: "x" }))
    .mark(petal({ w: "count", fill: "species" }))
    .name("flower"),
]).constrain(({ stem, flower }) => [
  Constraint.align({ x: "middle" }, [stem, flower]),
  Constraint.align({ y: ["end", "middle"] }, [stem, flower]),
]);
```
