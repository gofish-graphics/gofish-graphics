# GoTree

`gofish.gotree` is a grammar for tree visualizations, built on GoFish. It is the
Python version of the JavaScript `gofish-gotree` package, with the same
functions and options in snake_case. It is a submodule, so import it by name:

```python
from gofish.gotree import tree, spread, distribute, nest, combine, alternate, per_depth
```

One function, `tree(data, ...)`, makes a tree visualization. The combiners you
pass it decide the layout, so the same data can become a node-link diagram, a
dendrogram, nested boxes, an icicle plot, a sunburst or a treemap. The grammar
follows [GoTree (Li et al., CHI 2020)](https://dl.acm.org/doi/10.1145/3313831.3376297).
The [JavaScript page](/js/gotree) explains the grammar in more depth.

`tree()` returns an ordinary GoFish layer mark. It renders with
`.render(w=..., h=...)`, and it can be a child of other marks.

## Example: node-link tree

::: gofish example:gotree-node-link-tree hidden
:::

```python
from gofish import Curve, circle
from gofish.gotree import combine, tree

def leaves(n, p):
    return [{"name": f"{p}{i}"} for i in range(n)]


data = {
    "name": "root",
    "children": [
        {"name": "a", "children": leaves(3, "a")},
        {"name": "b", "children": leaves(2, "b")},
        {"name": "c"},
        {"name": "d", "children": leaves(2, "d")},
        {"name": "e", "children": leaves(2, "e")},
        {"name": "f"},
        {"name": "g"},
        {"name": "h", "children": leaves(4, "h")},
        {"name": "i", "children": leaves(4, "i")},
        {"name": "j"},
        {"name": "k", "children": leaves(4, "k")},
        {"name": "l"},
        {"name": "m", "children": leaves(4, "m")},
        {"name": "n", "children": leaves(3, "n")},
    ],
}

blues = ["#08306b", "#2171b5", "#6baed6"]

tree(
    data,
    node=lambda d: circle(r=9, fill=blues[d["depth"]], stroke="#08306b", stroke_width=1),
    link={"curve": Curve.linear(), "stroke": "#555", "stroke_width": 1.5},
    parent_child=combine(
        x={"kind": "align", "alignment": "middle"},
        y={"kind": "distribute", "spacing": 90},
    ),
    sibling=combine(
        x={"kind": "distribute", "spacing": 10},
        y={"kind": "align", "alignment": "start"},
    ),
).render(w=900, h=560)
```

## Example: treemap

The same grammar with different combiners. Each parent box wraps its children,
and the children alternate between side by side and stacked at each level.

::: gofish example:gotree-treemap hidden
:::

```python
from gofish import rect
from gofish.gotree import alternate, combine, tree

data = {
    "name": "root",
    "children": [
        {
            "name": "A",
            "children": [
                {"name": "A1", "value": 4},
                {"name": "A2", "value": 2},
                {"name": "A3", "value": 3},
            ],
        },
        {
            "name": "B",
            "children": [
                {"name": "B1", "value": 5},
                {
                    "name": "B2",
                    "children": [{"name": "B2a", "value": 2}, {"name": "B2b", "value": 1}],
                },
            ],
        },
        {"name": "C", "children": [{"name": "C1", "value": 3}, {"name": "C2", "value": 2}]},
    ],
}

blues = ["#08306b", "#2171b5", "#6baed6", "#c6dbef"]

dice = combine(x={"kind": "distribute", "spacing": 9}, y="align")
slice_ = combine(x="align", y={"kind": "distribute", "spacing": 9})


def node(d):
    if d["height"] == 0:
        return rect(w=92, h=14 * d["data"]["value"], fill=blues[d["depth"]])
    return rect(fill=blues[d["depth"]], stroke="#08306b", stroke_width=1)


tree(
    data,
    node=node,
    link="none",
    parent_child=combine(x={"kind": "nest", "pad": 9}, y={"kind": "nest", "pad": 9}),
    sibling=alternate([dice, slice_]),
).render(w=640, h=420)
```

## `tree(data, ...)`

```python
tree(data, node=None, link=None, parent_child=None, sibling=None, coord=None)
```

| Argument       | Value                                                           | Default                                       |
| -------------- | --------------------------------------------------------------- | --------------------------------------------- |
| `data`         | A nested dict: `{"name": ..., "children": [...]}`               | (required)                                    |
| `node`         | `(d) -> Mark`                                                   | a 12 px blue square                           |
| `link`         | `"none"`, a dict of link options, or `(source, target) -> dict` | straight gray lines, 1 px wide                |
| `parent_child` | a combiner                                                      | the parent 32 px above its children, centered |
| `sibling`      | a combiner                                                      | side by side, 16 px apart, top-aligned        |
| `coord`        | a `Coord` member, such as `Coord.polar()`                       | Cartesian                                     |

A node whose `children` is missing or empty is a leaf.

### `node`

`node` is called once for each node of the tree and returns its mark. It gets a
dict with these keys:

| Key      | Value                                            |
| -------- | ------------------------------------------------ |
| `data`   | the node's dict from `data`                      |
| `depth`  | its distance from the root (the root is 0)       |
| `height` | its distance from its deepest leaf (a leaf is 0) |
| `width`  | its number of leaves                             |
| `value`  | `None`                                           |

```python
def node(d):
    return circle(r=4 + d["height"] * 2, fill=blues[d["depth"]])
```

A node mark that leaves a size unset on an axis that its parent nests gets
that size from the nest. That is how the parent boxes of a treemap grow to wrap
their children.

### `link`

- `"none"` draws no edges.
- A dict sets every edge: `curve` (a `Curve` member), `stroke`, `stroke_width`
  and `opacity`.
- A function `(source, target) -> dict` sets each edge from its two nodes,
  which are dicts like the one `node` gets. It returns `None` to skip an edge.

`curve` takes `Curve.linear` (the default), `Curve.bezier`,
`Curve.orthogonal` or `Curve.arc`. An orthogonal or bezier link bends along the
axis that the `parent_child` combiner distributes on. When that combiner
distributes on both axes or on neither, an orthogonal link picks its bend from
the positions of its two nodes.

## Combiners

`tree()` calls `sibling(children)` to group the children of a node, and
`parent_child([parent, group])` to put the node with that group. A combiner is
a function from a list of marks to one mark.

### `spread(dir=, spacing=, alignment=, anchor=)`

Lays the children out along `dir` with the GoFish `spread` combinator. As a
`parent_child` combiner it puts the parent first: on the left for `dir="x"`, at
the top for `dir="y"`.

### `distribute(dir=, spacing=, anchor=, order=, alignment=)`

Places the children along `dir` with `Constraint.distribute`, and leaves the
other axis alone. `alignment` adds a `Constraint.align` on the other axis.
`order="reverse"` puts the first child at the far end.

### `nest(x=, y=)`

Takes `[outer, inner]` and puts the inner mark inside the outer one, with `x`
and `y` padding, through `Constraint.nest`. An axis that is not given is left
unconstrained.

### `combine(x=, y=)`

The general combiner. It picks one constraint for each axis, which is GoTree's
`Layout(x, y)`. Each axis is `"align"`, `"distribute"` or `"nest"`, or a dict
with that `kind` and its options:

| Kind         | Options                      | Defaults                   |
| ------------ | ---------------------------- | -------------------------- |
| `align`      | `alignment`                  | `"middle"`                 |
| `distribute` | `spacing`, `order`, `anchor` | `0`, `"forward"`, `"edge"` |
| `nest`       | `pad`                        | `0`                        |

`nest` needs exactly two children, so it is for `parent_child` only.

```python
parent_child = combine(x="nest", y={"kind": "distribute", "spacing": 40})
sibling = combine(x="distribute", y="align")
```

### `alternate([...])` and `per_depth(fn)`

Some layouts change at each level of the tree. `alternate([a, b])` uses `a` at
even depths and `b` at odd depths. `per_depth(fn)` uses the combiner that
`fn(depth)` returns. A node's `parent_child` and its children's `sibling` are
picked at the same depth.

```python
H = combine(x={"kind": "distribute", "spacing": 64}, y="align")
V = combine(x="align", y={"kind": "distribute", "spacing": 64})
sibling = alternate([H, V])  # an H-tree
```

### Your own combiners

Any function from a list of marks to a mark is a combiner:

```python
from gofish import layer

sibling = lambda children: layer(children)
```

## `coord`

`coord=Coord.polar()` draws the whole tree in polar coordinates, with x as the
angle and y as the radius. Nodes drawn as circles are points there, so give
their combiners `"anchor": "middle"` and an angular `spacing` in radians.
Wedges that should sweep around the circle are rects with `em_x=True` and
`em_y=True`. The [JavaScript page](/js/gotree#coord-coordinate-transform) has
the details.

## Differences from JavaScript

- The spec's fields are keyword arguments of `tree()`, after `data`:
  `tree(data, node=..., parent_child=...)` for JS `tree({ node, parentChild }, data)`.
- Option names are snake_case: `parent_child`, `per_depth`, `stroke_width`.
- A combiner's growth axis is its `growth_dir` attribute.
