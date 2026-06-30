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
