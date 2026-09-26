---
order: 100
---

# ref

References another node so later marks can reuse its position or bounding box — the basis for overlays, connectors, and arrows.

`ref` is the single reference noun, usable in two positions:

- **Inline in a layout** (this page): `arrow([ref("a"), ref("b")])` inside a
  [`.relate()`](/python/api/constraints/relate) clause, `ref(token).row[2]`
  anywhere — resolved at layout time against the name tree.
- **As chart data**: `chart(ref("maxBar")).mark(text(text="peak"))` — resolved at
  build time against the named-layer registry, where it must match **exactly one**
  node (use [`selectAll`](/python/api/selection/ref) for many). See
  [ref / selectAll](/python/api/selection/ref) for the chart-data role and node-unit
  selection.

See also [hygienic scoping](/python/api/selection/ref#hygienic-scoping) for when a name is visible and when to reach for a `createName` token.

## Signature

```python
ref(target: str | Token) -> Ref
```

`Token` is the hygienic name returned by `createName(tag)`. A `Ref` is chainable:
`ref(token).foo[i].bar` accumulates a selection path (see [Path](#path) below).

## Forms

### String — nearest match

A string `ref("x")` is legal only inside a [`.relate()`](/python/api/constraints/relate) clause. Anywhere else it raises when the chart renders, and the message says to move it into `.relate()`. Inside a clause it finds the node named `.name("x")` (or carrying a token tagged `"x"`) that is nearest to the layer that relates it: the closest match inside that layer wins, counted in steps down from the layer, so a direct child beats a node with the same name nested deeper. The search never crosses a `@mark` boundary, in either direction, and the match must lie inside the related layer. Two matches at the same smallest distance is an error, and so is no match at all. A data key is not a name, so `ref("a")` does not find a mark just because its row is keyed `"a"`.

```python
from gofish import arrow, layer, rect, ref, text

layer([
    rect(w=80, h=40).name("bg"),
    text(text="label").name("label"),
]).relate(lambda: [
    arrow([ref("label"), ref("bg")]),  # resolve to the text and the rect
])
```

A `.relate()` parameter is the same thing spelled as a variable: `lambda bg, label: [arrow([label, bg])]` builds those two refs. See [How to name and scope](/python/api/howto/naming-and-scoping).

### Token — globally addressable

A `Token` (from `createName`) is a unique value. `.name(token)` registers the node in a global token context; `ref(token)` retrieves it.

```python
from gofish import layer, rect, ref, createName

target_name = createName("target")

layer([
    rect(w=80, h=40).name(target_name),
    # ...somewhere in a sibling subtree:
    ref(target_name),
])
```

### Path — step through scopes + positional children {#path}

A path starts at a `Token` and descends one step per segment. Tag strings resolve against the current node's scope map (populated by `createName`-tagged children inside a scope root). Numbers pick the positional child at that index.

```python
# Chained (proxy) — preferred for static paths
ref(global_frame_name).variables[2].value
```

The chained form is a proxy that wraps the underlying `Ref`; it stays a ref, so it can go anywhere a ref is expected.

For variadic dynamic segments (e.g. spreading a `[row, col]` tuple into the path), use `.path(*segs)`:

```python
cell = addr_pos[addr]  # [row, col]
ref(heap_name).path(*cell).elmTuples[0]
```

::: info Array form is JavaScript only
JS also accepts a literal path array — `ref([token, "variables", 2, "value"])`.
The Python `ref(...)` takes only a string or a `Token`, so build dynamic paths
with the chained form or the variadic `.path(*segs)` escape hatch shown above.
:::

**Reserved names.** Children registered with one of the `Ref`'s own attribute names (`name`, `label`, `render`, `relate`, `to_dict`, `to_ir`, `multiplicity`, …) or any name starting with `_` are not reachable via dotted access — normal Python attribute lookup wins. Use `ref(token).path("name")` for those.

## Parameters

| Parameter | Type           | Description                                                                                                                                   |
| --------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`  | `str \| Token` | What to reference — a string (nearest match, bounded by `@mark`) or a `Token` (global). Extend with `.attr` / `[i]` / `.path(...)` for paths. |

## `ref.datum` {#datum}

A ref exposes the datum bound to the node it points at via its `.datum` path:

```python
bars = selectAll("bars")  # list of refs
bars[0].datum             # the raw row-bag behind the first bar
```

`ref.datum` is the **raw bag of rows** that flowed into the referenced node — a
**list** of records. A fully-split leaf (one datum per node) is a **1-row
list**; an aggregate — for example a bar produced by `rect(h="count")` over a
partition, whose height auto-sums several rows — holds all the rows of its
partition.

Because it is the raw, un-collapsed bag, you can aggregate over it directly:

```python
sum(row["count"] for row in bars[0].datum)  # total count across the bar's rows
```

Operators read this same bag when you re-encode a selection by a field, e.g.
`group(by="species")`, but with **homogeneity collapse** applied: the field
resolves to a scalar only if every row in the bag agrees on it — see
[path-aware `by`](/python/api/operators/spread#path-aware-by). Enumerating
_every_ distinct value at a path instead is the JS-only `pluck`; see the
[note on `pluck`](/python/api/selection/ref#path-aware-by-after-a-selection) on
the selection page.

## Notes

- Refs participate in layout: the referenced node's placement determines the ref's bounding box, and `arrow`, `line`, `ribbon`, etc. use that to draw geometry between nodes.
- Cross-subtree refs resolve correctly: the ref traverses to the least common ancestor and accumulates coordinate transforms along the way, so you can ref a node inside one component from inside another.
- Errors name the scope: if a path segment misses, the error lists the tags or indices available at that level.
