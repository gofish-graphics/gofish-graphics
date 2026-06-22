# ref

References another node so later marks can reuse its position or bounding box — the basis for overlays, connectors, and arrows.

`ref` is the single reference noun, usable in two positions:

- **Inline in a layout** (this page): `arrow(ref("a"), ref("b"))`,
  `ref(token).row[2]` — resolved at layout time against the name tree.
- **As chart data**: `chart(ref("maxBar")).mark(text(...))` — resolved at build
  time against the named-layer registry, where it must match **exactly one**
  node (use [`selectAll`](/js/api/selection/ref) for many). See
  [ref / selectAll](/js/api/selection/ref) for the chart-data role and node-unit
  selection.

See also [How to name and scope](/js/api/howto/naming-and-scoping) for when to use strings vs. tokens vs. paths.

## Signature

```ts
ref(
  nodeOrSelection:
    | string                              // layer-local lookup
    | Token                               // global lookup; chainable as ref(token).foo[i].bar
    | (Token | string | number)[]         // path (array form)
    | GoFishNode                          // direct node
    | { __ref: GoFishNode }
);
```

## Forms

### String — layer-local

`ref("x")` walks up the parent chain to the nearest `Layer` and picks the direct child named `.name("x")`. Strings do **not** cross component boundaries.

```ts
Layer([
  rect({ w: 80, h: 40 }).name("bg"),
  ref("bg"), // resolves to the rect above
]);
```

### Token — globally addressable

A `Token` (from [`createName`](/js/api/howto/naming-and-scoping#createname)) is a unique JS value. `.name(token)` registers the node in a global token context; `ref(token)` retrieves it.

```ts
const targetName = createName("target");

Layer([
  rect({ w: 80, h: 40 }).name(targetName),
  // ...somewhere in a sibling subtree:
  ref(targetName),
]);
```

### Path — step through scopes + positional children

A path starts at a `Token` and descends one step per segment. Tag strings resolve against the current node's scope map (populated by `createName`-tagged children inside a scope root). Numbers pick the positional child at that index.

Two equivalent spellings:

```ts
// Chained (proxy) — preferred for static paths
ref(globalFrameName).variables[2].value;

// Array — useful when segments are dynamic
ref([globalFrameName, "variables", 2, "value"]);
```

The chained form is a `Proxy` that wraps the underlying `GoFishRef`; `instanceof GoFishRef` still holds, so it can go anywhere a ref is expected.

For variadic dynamic segments (e.g. spreading a `[row, col]` tuple into the path), use `.path(...)`:

```ts
const cell = addrPos.get(addr)!; // [row, col]
ref(heapName).path(...cell).elmTuples[0];
// equivalent to:
ref([heapName, ...cell, "elmTuples", 0]);
```

**Reserved names.** Children registered with one of GoFishRef's own property names (`name`, `type`, `parent`, `dims`, `layout`, `place`, `color`, …), the escape-hatch method `path`, or JS-language names (`then`, `toString`, `constructor`, `__proto__`, …) are not reachable via dotted access. Use `ref(token).path("name")` or the array form for those.

### Direct node

Pass a `GoFishNode` (or a `.__ref` wrapper) to reference it without name resolution.

```ts
const bar = rect({ h: "value" });
Layer([bar, ref(bar)]);
```

## Parameters

| Parameter         | Type                                                                                      | Description                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `nodeOrSelection` | `string \| Token \| (Token \| string \| number)[] \| GoFishNode \| { __ref: GoFishNode }` | What to reference. See forms above — string (local), Token (global), path, or the node. |

## `ref.datum` {#datum}

A ref exposes the datum bound to the node it points at via the public `.datum`
getter:

```ts
const bars = selectAll("bars"); // GoFishRef[]
bars[0].datum; // the raw row-bag behind the first bar
```

`ref.datum` is the **raw bag of rows** that flowed into the referenced node — an
**array** of records. A fully-split leaf (one datum per node) is a **1-row
array**; an aggregate — for example a bar produced by `rect({ h: "count" })` over
a partition, whose height auto-sums several rows — holds all the rows of its
partition.

Because it is the raw, un-collapsed bag, you can aggregate over it directly:

```ts
import { sumBy } from "lodash";
sumBy(bars[0].datum, "count"); // total count across the bar's rows
```

Operators read this same bag when you re-encode a selection by a datum path,
e.g. `group({ by: "datum.species" })`, but with **homogeneity collapse** applied:
the path resolves to a scalar only if every row in the bag agrees on the field —
see [path-aware `by`](/js/api/operators/spread#path-aware-by). To get _every_
distinct value at a path instead, use [`pluck`](/js/api/selection/ref#pluck).

## Notes

- Refs participate in layout: the referenced node's placement determines the ref's bounding box, and `Arrow`, `connect`, etc. use that to draw geometry between nodes.
- Cross-subtree refs resolve correctly: the ref traverses to the least common ancestor and accumulates coordinate transforms along the way, so you can ref a node inside one component from inside another.
- Errors name the scope: if a path segment misses, the error lists the tags or indices available at that level.
