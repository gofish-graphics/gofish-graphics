# mark

Sets the visual mark used to render each data group.

## Signature

```ts
.mark(mark)
```

## Parameters

| Parameter | Type                     | Description                                                                            |
| --------- | ------------------------ | -------------------------------------------------------------------------------------- |
| `mark`    | `Mark` \| `ChartBuilder` | A mark (e.g. `rect()`, `line()`, `ribbon()`), or a nested `chart(...)` drawn per group |

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

The same binding applies to an empty-scope `chart()` used as a child of the
[`layer([...])`](/js/api/operators/layer) combinator, so a per-group overlay
(e.g. bars plus an area that selects them) can be a mark without a callback:

```ts
chart(barley)
  .flow(spread({ by: "variety", dir: "x" }))
  .mark(
    layer([
      chart() // inherits this variety's rows
        .flow(spread({ by: "year", dir: "x" }), stack({ by: "site", dir: "y" }))
        .mark(rect({ h: "yield", fill: "site" }).name("bars")),
      chart(selectAll("bars")) // scoped to this variety's layer
        .flow(group({ by: "site" }))
        .mark(area({ opacity: 0.7 })),
    ])
  );
```

Marks can also call `.name("layerName")` to register their output nodes for later use with [`ref` / `selectAll`](/js/api/selection/ref):

```ts
.mark(rect({ h: "value" }).name("bars"))
```

## Mark modifiers {#modifiers}

Marks support a few chainable modifiers:

```ts
rect({ h: "count" }).name("bars").label("count").translate({ y: 8 });
```

### `.zOrder(value)` — paint order {#zorder}

`.zOrder(value)` sets the mark's paint-order hint: higher values paint **later**
(on top). `value` is either a constant or a **callback** resolved per-instance
against the datum the mark is bound to, so paint order can be data-driven without
splitting the mark into separately-named layers:

```ts
// Constant: raise this whole mark above its siblings.
rect({ h: "count" }).zOrder(1);

// Data-driven: raise the emphasized category over the rest. `d` is the bag the
// mark is bound to, so read the field with `project` (see ref / selection).
const isEmphasized = (site: unknown) =>
  site === "Morris" || site === "Grand Rapids";

area({ opacity: 0.7 }).zOrder((d) =>
  isEmphasized(project(d, "site")) ? 1 : 0
);
```

Within a layer, children are painted in `(zOrder, document order)` order, so a
higher `zOrder` lifts a mark in front of its lower siblings. The constant form
round-trips through the [IR](/internals/python/bridge); a callback can't be
serialized, so it is applied at render time and omitted from the emitted IR (the
same as a function [`.label`](#modifiers) accessor).

### `.translate({ x?, y? })` — pixel offset

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
