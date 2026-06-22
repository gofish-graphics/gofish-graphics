# mark

Sets the visual mark used to render each data group.

## Signature

```ts
.mark(mark)
```

## Parameters

| Parameter | Type   | Description                                                       |
| --------- | ------ | ----------------------------------------------------------------- |
| `mark`    | `Mark` | The mark to use for rendering (e.g. `rect()`, `line()`, `area()`) |

## Example

```ts
chart(data)
  .flow(spread({ by: "category", dir: "x" }))
  .mark(rect({ h: "value" }));
```

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
