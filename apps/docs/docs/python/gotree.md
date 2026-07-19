# GoTree

`gofish.gotree` is a declarative grammar for tree visualizations — node-link
diagrams, dendrograms, nested-box trees, icicle plots, sunbursts, and treemap
slices — built on top of GoFish. It is a pure snake_case mirror of the
JavaScript `gofish-gotree` package's API, kept as a separate submodule (not
re-exported from the top-level `gofish` namespace, the same way `derive` and
`field` live outside it):

```python
from gofish.gotree import tree, spread, distribute, nest, combine, alternate
```

or, if you prefer to keep the namespace explicit:

```python
from gofish import gotree

gotree.tree(...)
```

A single function, `tree(data, **spec)`, builds a tree visualization. The
**combiners** — `spread`, `distribute`, `nest`, `combine`, `alternate` — control
how a tree's layout is assembled; varying them turns the same data into a
node-link diagram, a dendrogram, or a nested-box tree. The grammar follows the
structure of [GoTree (Li et al., CHI 2020)](https://dl.acm.org/doi/10.1145/3313831.3376297)
but renames concepts to match GoFish conventions. See the
[JavaScript version](/js/gotree) for the underlying design in full detail —
this page covers the Python spelling and its few deliberate omissions.

## Quick example — node-link tree with orthogonal links

::: gofish example:gotree-orthogonal-tree hidden
:::

```python
from gofish import circle
from gofish.gotree import combine, tree

sample_tree = {
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
                    "children": [
                        {"name": "B2a", "value": 2},
                        {"name": "B2b", "value": 1},
                    ],
                },
            ],
        },
        {"name": "C", "children": [{"name": "C1", "value": 3}, {"name": "C2", "value": 2}]},
    ],
}

# Node color depends on hierarchy depth, not on a data field, so `node=` is a
# callable rather than a plain mark — see "node" below.
depth_blues = ["#08306b", "#2171b5", "#6baed6", "#c6dbef", "#deebf7"]


def by_depth(depth):
    return depth_blues[min(depth, len(depth_blues) - 1)]


def node(d):
    return circle(r=7, fill=by_depth(d["depth"]), stroke="#08306b", strokeWidth=1)


tree(
    sample_tree,
    node=node,
    link={"curve": "orthogonal", "stroke": "#90a4ae", "stroke_width": 1.5},
    # every relationship distributes on both axes, so parent and siblings both
    # cascade diagonally — the classic orthogonal "staircase" grid
    parent_child=combine(
        x={"kind": "distribute", "spacing": 18},
        y={"kind": "distribute", "spacing": 18},
    ),
    sibling=combine(
        x={"kind": "distribute", "spacing": 18},
        y={"kind": "distribute", "spacing": 18},
    ),
).render(w=640, h=420)
```

## `tree(data, ...)`

```python
tree(
    data,
    node=None,
    link=None,
    parent_child=None,
    sibling=None,
    coord=None,
) -> Tree
```

Returns a `Tree`, which has `.render(w=800, h=600)` and `.save(path, w=800,
h=600)` — the same rendering surface as a `Mark`, but standalone: a GoTree
tree is always a top-level visualization, not a layer you compose into a
chart.

| Argument       | Type                                                                            | Description                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `data`         | `dict`                                                                          | A nested tree: `{"name": ..., "value": ..., "children": [...], ...extra}`. `children` is optional (a leaf omits it).                  |
| `node`         | `Mark` \| `(row) -> Mark`                                                       | Drawn once per tree node. Defaults to `rect(w=12, h=12, fill="#4682b4")`. See [`node`](#node-the-per-node-mark) below.                |
| `link`         | `"none"` \| `dict` \| `(source, target) -> dict`                                | Edge styling. See [`link`](#link-the-edge-encoding) below.                                                                            |
| `parent_child` | combiner (`spread()` / `distribute()` / `nest()` / `combine()` / `alternate()`) | How a parent and its children-group are assembled. Defaults to `distribute(dir="y", spacing=32, alignment="middle")`.                 |
| `sibling`      | combiner                                                                        | How one node's children are assembled into a group. Defaults to `distribute(dir="x", spacing=16, alignment="start")`.                 |
| `coord`        | a `gofish` coord transform                                                      | `polar()`, `clock()`, `wavy()` — renders the whole tree under that transform, e.g. for a radial layout. Defaults to linear Cartesian. |

### `node` — the per-node mark

`node` is either a plain GoFish mark (used as a template for every node) or a
callable `(row) -> Mark` for styling that depends on the node's position in
the hierarchy rather than a data field on it — for example, color keyed off
depth.

Each `row` is the node's flattened data fields (`name`, and any other keys you
put in `data`) plus three synthesized fields: `depth` (root is `0`), `height`
(distance to the furthest leaf below), and `width` (the leaf count below).
`value` is included only when the hierarchy defines it (i.e., when some node
in the data carries a `"value"` key).

```python
def node(d):
    return circle(r=4 + d["height"] * 2, fill=by_depth(d["depth"]))
```

### `link` — the edge encoding

- `"none"` — omit all edges (nested-box, icicle, and treemap variants have no
  edges).
- A dict of link options — applied uniformly to every edge:

  ```python
  link={"curve": "straight", "stroke": "#90a4ae", "stroke_width": 1.5}
  ```

  `curve` accepts `"straight"` (default), `"bezier"`, `"orthogonal"`
  (right-angle elbows), and `"arc"`. `stroke_width` is the one gotree option
  that isn't already a single word in JS (`strokeWidth`); every other key
  (`curve`, `stroke`, `opacity`) is spelled the same in both languages.

- A callable `(source, target) -> dict` for per-edge styling, where `source`
  and `target` are the two nodes' rows (same shape as `node`'s `row`):

  ```python
  def link(source, target):
      return {"stroke_width": 1 + source["value"] / 4}


  tree(data, link=link)
  ```

### `parent_child` and `sibling` — the layout combiners

Every combiner builder returns a plain options dict that `tree()` consumes;
you never call a combiner yourself. The five builders:

#### `spread(*, dir, spacing=None, alignment=None, anchor=None)`

Distributes children along `dir` (`"x"` or `"y"`). `anchor` is `"edge"`
(default — sums bounding-box extents) or a fixed-pitch point (`"start"` /
`"middle"` / `"end"` / `"baseline"`); use `"middle"` under `coord=polar()`.

```python
parent_child=spread(dir="y", spacing=48, alignment="middle"),
sibling=spread(dir="x", spacing=24, alignment="start"),
```

#### `distribute(*, dir, spacing=None, anchor=None, order=None, alignment=None)`

Like `spread`, but built on GoFish's lower-level `distribute` constraint
(pairing an `align` on the orthogonal axis via `alignment`).

#### `nest(*, x=None, y=None)`

Wraps `[outer, inner]` so a parent box grows to contain its children, padded
by `x` / `y` on each constrained axis. At least one of `x` / `y` is required.

```python
parent_child=nest(x=10, y=10),  # box-in-box (nested-box tree)
```

#### `combine(*, x=None, y=None)`

The general per-axis primitive: one choice — `"align"`, `"distribute"`, or
`"nest"` — per axis, independently. `spread`/`distribute`/`nest` above are
shorthands for common shapes; `combine` is GoTree's own `Layout(x, y)` model.
Each axis takes a bare string or the object form with knobs:

```python
parent_child=combine(
    x="nest",                                    # outer wraps inner on x
    y={"kind": "distribute", "spacing": 40},      # parent/group stacked on y
),
sibling=combine(x="distribute", y="align"),
```

`"nest"` is only valid for `parent_child` (a 2-child relationship) — a sibling
group of arbitrary size may only `"align"` or `"distribute"`.

#### `alternate(combiners)`

A depth-indexed combiner: cycles through `combiners` by `depth % len(combiners)`.
Used where a layout's template changes by level — an H-tree that swaps its
spread axis every level, or a slice-and-dice treemap that alternates dicing
and slicing:

::: gofish example:gotree-treemap hidden
:::

```python
from gofish import rect
from gofish.gotree import alternate, combine, tree

# every parent box wraps its subtree on both axes; only the sibling
# subdivision alternates slice <-> dice level by level
dice = combine(x={"kind": "distribute", "spacing": 9}, y={"kind": "align", "alignment": "middle"})
slice_ = combine(x={"kind": "align", "alignment": "middle"}, y={"kind": "distribute", "spacing": 9})


def node(d):
    if d["height"] == 0:
        return rect(w=92, h=14 * d["value"], fill=by_depth(d["depth"]))
    return rect(fill=by_depth(d["depth"]), stroke="#08306b", strokeWidth=1)


tree(
    sample_tree,
    node=node,
    link="none",
    parent_child=combine(x="nest", y="nest"),
    sibling=alternate([dice, slice_]),
).render(w=640, h=420)
```

::: tip Not exposed: `per_depth`
The JS API also has `perDepth(fn)`, the general form of `alternate` that takes
a raw `depth -> Combiner` function. It is deliberately not exposed in Python:
a raw function can't cross the wire as JSON, and `alternate` already covers
every real gallery use (H-tree axis swap, slice-and-dice treemap levels). If
you find a layout that genuinely needs per-depth branching `alternate` can't
express, open an issue rather than reaching for a workaround.
:::

### `coord` — coordinate transform

Pass any `gofish` coord transform (e.g. `polar()`) to render the whole tree
radially:

```python
from gofish import polar

tree(data, coord=polar(), ...)
```

Under `coord=polar()`, nodes render as points — only their center sweeps
through the transform, not their bounding box — so set `anchor="middle"` on
`sibling` (and typically `parent_child` too). See the
[JavaScript GoTree guide](/js/gotree#coord-—-coordinate-transform) for the full
polar authoring rules, including the 2π content budget; they apply identically
in Python since both languages serialize to the same IR.

## See also

- [JavaScript GoTree guide](/js/gotree) — the same grammar, in more depth,
  including the GoTree paper translation table and the polar 2π budget.
- [Examples](/python/examples/) — filter by "GoTree" for every ported gallery
  example.
