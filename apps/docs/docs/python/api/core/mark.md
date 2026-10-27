# mark

Sets the visual **mark** drawn for each data item — the shape that turns rows
into pixels.

::: gofish example:bar-chart hidden
:::

```python
from gofish import chart, spread, rect

chart(seafood, axes=True).flow(spread(by="lake", dir="x")).mark(
    rect(h="count")
).render(w=500, h=300)
```

## Signature

```python
ChartBuilder.mark(mark) -> ChartBuilder
```

## Parameters

| Parameter | Type                                                   | Description                                                                                                                                                          |
| --------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mark`    | `Mark` \| `ChartBuilder` \| `LayerBuilder` \| callable | A mark factory result (`layer([chart(...), ...])` among them), a nested `chart(...)` or `chart(...).layer(...)` chain drawn per group, or a `(data) -> ChartBuilder` |

Returns a new `ChartBuilder` with the mark set.

## Mark types

| Mark                                 | Draws                           |
| ------------------------------------ | ------------------------------- |
| [rect](/python/api/marks/rect)       | A rectangle per item            |
| [circle](/python/api/marks/circle)   | A circle per item               |
| [ellipse](/python/api/marks/ellipse) | An ellipse per item             |
| [line](/python/api/marks/line)       | A line through the items        |
| [ribbon](/python/api/marks/ribbon)   | A filled area through the items |
| [blank](/python/api/marks/blank)     | An invisible positioning guide  |

## Encoding channels

Mark options accept either a **constant** or a **field name** (a string matching
a column in your data):

```python
rect(h="count", fill="species")  # height and color from data fields
rect(h="count", fill="#4e79a7")  # height from data, constant color
```

## Naming marks

Call `.name("layerName")` on a mark so another chart can reference it with
[`ref` / `select_all`](/python/api/core/chart#cross-chart-references):

```python
chart(data).flow(scatter(by="lake", x="x", y="y")).mark(blank().name("points"))
```

## Nested chart as a mark

`mark()` also accepts a whole nested `chart(...)` — one sub-chart drawn per group
(a pie glyph per scatter point, a small multiple per facet). Leave the nested
chart's **data off** and it inherits the incoming partition (the group's rows),
so you don't thread the data through a callback:

```python
chart(catch_locations).flow(scatter(by="lake", x="x", y="y")).mark(
    chart(coord=Coord.clock())  # no data -> inherits this lake's partition
    .flow(stack(by="species", dir="x", h=20))
    .mark(rect(w="count", fill="species"))
)
```

A no-data `chart()` / `chart(**options)` is an **empty scope**: as a `mark(...)`
it binds the incoming group, and inside [`.layer(...)`](/python/api/core/layer)
it binds the previous tier's marks.

The same binding applies to a nested chart used as a child of a combinator such
as [`layer([...])`](/python/api/operators/layer), so a per-group glyph can mix
marks and a chart. Here each lake draws a stem and a polar flower on top of it:

::: gofish example:flower-chart hidden
:::

```python
flower = (
    chart(coord=Coord.polar(), axes=False)  # no data -> inherits this lake's rows
    .flow(stack(by="species", dir="x", h=40))
    .mark(petal(w="count", fill="species"))
)

chart(stem_data, axes=False).flow(scatter(by="lake", x="x")).mark(
    layer([
        rect(w=4, h="count", fill="rgb(0, 142, 91)").name("stem"),
        flower.name("flower"),
    ]).relate(lambda stem, flower: [
        Constraint.align([stem, flower], x="middle", y=["end", "middle"]),
    ])
)
```

A layer made only of charts is a mark too, so a per-group overlay (e.g. bars
plus an area that selects them) needs no callback:

```python
chart(barley).flow(spread(by="variety", dir="x")).mark(
    layer([
        chart()  # inherits this variety's rows
        .flow(spread(by="year", dir="x"), stack(by="site", dir="y"))
        .mark(rect(h="yield", fill="site").name("bars")),
        chart(select_all("bars"))  # scoped to this variety's layer
        .flow(group(by="site"))
        .mark(ribbon(opacity=0.7)),
    ])
)
```

A `.layer(...)` chain sits where a chart does (#1181). Leave its first tier's
data off and that tier binds the incoming group; each later tier sees the
previous tier's marks, as it does at the root. Here each store draws its own
small line chart, dots with a line over them:

```python
chart(sales).flow(spread(by="store", dir="x", spacing=32)).mark(
    chart(axes=False)  # inherits this store's rows
    .flow(scatter(by="quarter", x="quarter", y="sales"))
    .mark(circle(r=4, fill="#08519c"))
    .layer(line(stroke="#6baed6", stroke_width=2))  # connects this store's dots
)
```

A chain may also be a child of a combinator, such as `layer([...])`.

A nested chart crosses to JS as its own chart IR, a chain as its own
`layer-chain` IR, and a layer of charts as the `layer` combinator with chart
children. A nested chart's own rows travel beside the IR as an Arrow table,
like the root's, so their column types (a date, a timestamp) survive, and it
draws with no call back into Python, in the notebook too.

The older callback form `mark(lambda data: chart(data, ...).flow(...).mark(...))`
still works and is equivalent — the function receives each group's data slice and
returns a nested chart. A callback is Python code, so JS calls back into Python
once per group to run it.

## Mark-fn over refs — value labels

When a callback's `data` is a bag of **refs** (rather than plain rows) — e.g.
inside an empty-scope [`.layer(...)`](/python/api/core/layer) tier that groups
the previous tier's own marks — each item exposes the underlying node's bound
data via `.datum`, and the callback may return a raw combinator `Mark`
(`spread([...])`, `stack([...])`, …) that embeds one of those refs directly,
rather than only a nested `chart(...)`. This is how a bar chart gets a total
label above each bar, drawn as a sibling of the bar itself rather than a
separate chart:

::: gofish example:bar-chart-with-value-labels hidden
:::

```python
from gofish import chart, spread, rect, text, group

def label_mark(d):
    total = sum(row["count"] for row in d[0].datum)
    return spread([d[0], text(text=str(total))], dir="y", alignment="middle", spacing=10)

chart(seafood, axes=True).flow(spread(by="lake", dir="x")).mark(
    rect(h="count")
).layer(
    chart().flow(group(by="lake")).mark(label_mark)
).render(w=400, h=400)
```

`d[0]` is the ref for that lake's bar; `d[0].datum` is that lake's bag of
species rows (an aggregate), so `sum(row["count"] for row in d[0].datum)` is
the lake's total catch. Embedding `d[0]` in the returned `spread([...])`
places the label as a sibling of the bar it labels, using the bar's own
placed position and size — no separate positioning logic needed.

A ref may also sit in a field of a row. [`resolve`](/python/api/operators/resolve)
fills each row's named field with the node it names, so a callback over those
rows reads the ref from the field and places it the same way:

```python
from gofish import chart, circle, layer, resolve, scatter, select_all, spread, text

chart(nodes, axes=False).flow(scatter(by="id", x="grp", y="grp")).mark(
    circle(r=16, fill="#59a14f").name("nodes")
).layer(
    chart(labels)
    .flow(resolve(["ref"], from_=select_all("nodes")))
    .mark(
        lambda rows: layer(
            [spread([r["ref"], text(text=r["label"])], dir="x", spacing=6) for r in rows]
        )
    )
)
```

A ref crosses to Python as its index and its `datum`, wherever it sits in the
callback's input, and JS places the live node it stands for.

## Applying a mark to rows

A mark is callable. `mark(d, key=None)` applies it to the input `d`, as a JS
mark is applied (`circle({ ... })(d)`), and returns a mark that draws the node
the mark builds from `d`. A callback can apply the mark it builds to its own
rows, so a field name in a channel reads those rows and binds its scale. Here
each circle's radius comes from its row's count, and its color from the
species color scale:

```python
import math

from gofish import chart, circle, pack

chart(seafood).flow(pack(by="lake"), pack()).mark(
    lambda d: circle(r=3 * math.sqrt(d[0]["count"]), fill="species")(d)
)
```

Without `(d)`, the mark a callback returns is drawn with no rows, as in JS, so
`fill="species"` is the literal color name.

`d` is data: rows, a row, or any value JSON holds. It raises `TypeError` when
`d` holds a mark or a ref, since those are nodes, not data. A ref, `cut(...)`
and `offset(...)` are nodes rather than marks, so calling one raises too.

The input crosses to JS as the mark's `__datum` field (and `key` as
`__key`), and JS applies the rebuilt mark to it.

## Labeling a mark

Call `.label(accessor, position=..., avoiding=..., halo=..., background=..., font_size=..., color=..., offset=..., rotate=..., font_family=..., font_weight=..., font_style=...)`
on a mark to attach a deferred text label, mirroring JS's `.label(accessor, options?)`:

```python
rect(h="count").label("count", position="center", font_size=10)
```

`position` is a position string or a value of the [`Place`](/python/api/place)
family, which reads the mark's outline and keeps the labels of one call off
the marks, off each other, and off the nodes in `avoiding`
(`avoiding=select_all("trend")`). `halo={"color": ..., "width": ...}` draws an
outline behind the glyphs, and `background={"fill": ..., "padding": ...}` a box
behind the text; an empty dict draws the default. See
[How to place labels](/python/api/howto/label-placement).

`accessor` is either a plain field name (a string) or a `field(...)`
aggregate. Python has no function-accessor form (JS accepts a callback
there); use one of these two instead.

Calling `.label()` more than once appends rather than overwrites — each call
adds its own label, and all of them round-trip through the IR as an array:

```python
rect(h="count").label(
    field("count").sum(), position="center", color="white", font_weight="bold"
).label("lake", position="outset-top", font_size=9)
```

### `.label()` on operators {#operator-label}

Every dual-mode operator (`spread`, `stack`, `group`, `scatter`, `table`,
`treemap`) also accepts `.label(accessor, ...)`, with the same kwargs as
`Mark.label`. Chaining it on the operator instead of the mark labels the
**group**, not each individual mark instance — every node a split leaf (one
group's rows) produces gets stamped with that leaf's own subdata, and
`accessor` resolves one of two ways:

- **A bare field name** (`"class"` below) must be constant across every row
  in the group — true by construction for a `by` field, since every row in
  the group shares that value. If it isn't actually constant, this is a
  spec error and `.label()` raises loudly rather than silently reading one
  row's value:

  ```
  [gofish] .label("count"): field is not constant within the group; use an
  aggregate like field("count").mean()
  ```

- **A `field(...)` aggregate** (`field("count").sum()` / `.mean()` /
  `.count()` / `.distinct()`) folds the group's rows to one value — use this
  for a group total or mean:

  ```python
  chart(data).flow(
      stack(by="class", dir="y").label(field("count").sum(), position="center")
  ).mark(rect(h="count"))
  ```

```python
chart(data).flow(
    stack(by="class", dir="y").label("class", position="center")
).mark(rect(h="count"))
```

`.label()` and `.translate()` chain in either order:

```python
stack(by="class", dir="y").translate(y=8).label("class")
stack(by="class", dir="y").label("class").translate(y=8)
```

## Paint order {#z-order}

`.z_order(value)` sets the mark's paint-order hint, mirroring JS's
[`.zOrder(value)`](/js/api/core/mark#zorder): higher values paint later (on
top). `value` is a number, or a function called once per mark instance with
the input the mark is bound to, which returns the number. A function makes the
paint order data-driven without splitting the mark into separately named
layers:

```python
from gofish import pluck

# Constant: raise this whole mark above its siblings.
rect(h="count").z_order(1)

# Data-driven: raise the emphasized sites over the rest. `d` is the list of
# refs the area is bound to, and `pluck` reads the site off it.
emphasized = ["Morris", "Grand Rapids"]
ribbon(opacity=0.7).z_order(lambda d: 1 if pluck(d, "site")[0] in emphasized else 0)
```

Within a layer, children paint in `(z_order, document order)` order. A number
crosses to JS in the IR's `zOrder` field. A function crosses as a bridge
handle, and JS calls it through the bridge once with the inputs of every
mark instance an operator applies the mark to, so it runs in Python like a
channel accessor. [`pluck`](/python/api/selection/ref#pluck) returns the
one value, since the areas are grouped by site; `project(d, "site")` reads
it as that value, as in JS.
