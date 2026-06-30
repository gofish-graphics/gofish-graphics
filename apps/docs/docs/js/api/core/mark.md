# mark

Sets the visual mark used to render each data group.

## Signature

```ts
.mark(mark)
```

## Parameters

| Parameter | Type                     | Description                                                                          |
| --------- | ------------------------ | ------------------------------------------------------------------------------------ |
| `mark`    | `Mark` \| `ChartBuilder` | A mark (e.g. `rect()`, `line()`, `area()`), or a nested `chart(...)` drawn per group |

## Example

```ts
chart(data)
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }));
```

## Nested chart as a mark

A mark can be a whole nested `chart(...)` — one sub-chart drawn per group (a pie
glyph per scatter point, a small multiple per facet). Leave the nested chart's
**data off** and it inherits the incoming partition (the group's rows), so you
don't thread the data through a callback:

```ts
chart(catchLocationsArray)
  .flow(scatter({ by: "lake", x: "x", y: "y" }))
  .mark(
    chart({ coord: clock() }) // no data → inherits this lake's partition
      .flow(stack({ by: "species", dir: "x", h: 20 }))
      .mark(rect({ w: "count", fill: "species" }))
  );
```

`chart()` / `chart(options)` with no data is an **empty scope**: as a `.mark(...)`
it binds the incoming group, and inside [`.layer(...)`](/js/api/core/layer) it
binds the previous tier's marks. (The older `.mark((data) => chart(data, ...))`
callback still works and is equivalent.)

Marks can also call `.name("layerName")` to register their output nodes for later use with [`ref` / `selectAll`](/js/api/selection/ref):

```ts
.mark(rect({ h: "value" }).name("bars"))
```

## Mark modifiers

Marks support a few chainable modifiers:

```ts
rect({ h: "count" }).name("bars").label("count").translate({ y: 8 });
```

`.translate({ x?, y? })` applies a structural pixel translation around the
produced mark. It is different from passing `x` or `y` to the mark itself:
mark options are data/geometry channels, while `.translate()` is an outer
offset. This is useful when a mark or operator already uses `x`/`y` for its own
placement semantics and you still need a fixed visual shift.

Operators returned by `.flow(...)` factories also support `.translate()`:

```ts
chart(data)
  .flow(scatter({ by: "lake", x: "lake" }).translate({ y: 50 }))
  .mark(rect({ w: 0.1, h: "count" }));
```
