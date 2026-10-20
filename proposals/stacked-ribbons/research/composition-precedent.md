# Composition precedent for record-shaped and re-joined visualizations

This note surveys how languages and libraries compose work that splits into parts and joins back together. It is research for the stacked ribbons proposal (`../proposal.md`, round 2). The target examples are these:

- Parallel sets
- Parallel coordinates
- A scatterplot matrix (SPLOM)
- A sankey built from nodes, each a pair (in-links, out-links)
- A sankey tree
- FrankenSankey, a stacked area whose last slice opens into a sankey

Most entries are from memory and are marked "(from memory)" at the section head. I checked these points against sources during this session:

- SwiftUI's `ViewBuilder` does not accept a plain `for` loop, and `ForEach` exists because SwiftUI needs an identity per item ([Swift forums](https://forums.swift.org/t/result-builder-to-support-for-loops/49220), [Apple forums](https://developer.apple.com/forums/thread/662963), [Hacking with Swift](https://www.hackingwithswift.com/guide/ios-swiftui/3/2/key-points)).
- Bluefish uses `<For each>`, `name`, and `<Ref select>`, and a child can be shared between several relations through scoped references ([Bluefish paper, UIST 2024](https://arxiv.org/html/2307.00146v4)).
- The Vega-Lite parallel coordinates example builds its axes from a `window` count (a row index), a `fold` (an unpivot), a `joinaggregate`, and a hand normalization, because "Vega-Lite supports only one scale per axes" ([example](https://vega.github.io/vega-lite/examples/parallel_coordinate.html)).

## The four questions

Each entry answers four questions.

- **Q1.** How does it tell sequential (pipeline) composition apart from parallel (tuple) composition?
- **Q2.** How does a user introduce a name for something that is not "the current data", e.g., a loop variable, a key, or a parameter?
- **Q3.** Does each child get the whole input (broadcast), or a part of it (projection)?
- **Q4.** How does it recognize that two pieces in different branches came from the same input element, so that it can join them again?

## Part 1. Programming languages and functional programming

### Haskell arrows (from memory)

An arrow `a b c` is a computation from `b` to `c` whose structure is visible before it runs (Hughes 2000, "Generalising Monads to Arrows"). `arr f` lifts a plain function. `f >>> g` runs `f` and then `g`. `f &&& g` sends one input to both and returns the pair of outputs (fanout). `f *** g` takes a pair and runs `f` on the first part and `g` on the second (split). `first f` runs `f` on the first part and passes the second through. `ArrowChoice` adds `left` and `|||` for branching on a sum type, and `ArrowLoop` adds `loop` for feedback. Paterson's arrow notation (2001) lets the user name intermediate values.

```haskell
-- one column per field, then a function that sees all three columns
parallelSets = (axis cls &&& axis sex &&& axis survived) >>> arr drawRibbons

-- arrow notation names the input and each result
parallelSets = proc rows -> do
  a <- axis cls      -< rows
  b <- axis sex      -< rows
  c <- axis survived -< rows
  returnA -< drawRibbons (a, b, c)
```

- **Q1.** `>>>` is sequence. `&&&` and `***` are parallel. They are separate operators.
- **Q2.** Point-free arrows have no names. Arrow notation adds them with `proc x -> ... -<`. The names are bound by the notation and are not data.
- **Q3.** `&&&` broadcasts the whole input. `***` projects a pair into its parts. The two operators are the two answers to Q3.
- **Q4.** An arrow runs once per input value, so both outputs of `&&&` belong to the same input by construction. If the arrow runs over a whole list, as a layout does, nothing in the arrow says which output element came from which input element. You need a key or you need order to be kept (a zip).

The lesson for GoFish is direct. GoFish's direct style with scope inheritance is `&&&`. Destructuring a node into (in-links, out-links) is `***`. A layout over all rows is the case where arrows give no free identity.

### Applicative, monad, and selective functors (from memory)

An applicative computation has a structure that does not depend on the values it computes (`liftA2 f a b`). A monadic computation can choose its next step from a value it just computed (`a >>= \x -> ...`). `ApplicativeDo` (GHC) rewrites `do` blocks into applicative form when no step uses an earlier result. Selective functors (Mokhov et al. 2019) sit between them, with `select` choosing among branches that are all known in advance.

- **Q1.** Applicative composition is parallel. Monadic bind is sequential and can depend on data.
- **Q2.** `do` notation binds names in both cases.
- **Q3.** Not addressed.
- **Q4.** Not addressed.

For GoFish this splits the examples cleanly. The set of axes in parallel sets is fixed before the data is read, which is applicative structure. A flow tier (`spread({ by })`) makes one child per group found in the data, which is monadic structure. A sankey tree's depth depends on the data, which is also monadic.

### Comprehensions, LINQ, and for-comprehensions (from memory)

A list comprehension `[f x y | x <- xs, y <- ys, p x y]` desugars to nested `concatMap` (bind in the list monad). Scala's `for (x <- xs; y <- ys) yield f(x, y)` desugars to `flatMap` and `map`. C# LINQ query syntax desugars `from x in xs from y in ys select ...` to `SelectMany`, `group x by x.k into g` to `GroupBy`, and `join y in ys on x.k equals y.k into g` to `GroupJoin`, which gives each `x` the list of matching `y`. Python's comprehension has the same nested `for` shape. GHC's `TransformListComp` (Wadler and Peyton Jones 2007, "Comprehensive Comprehensions") adds `then group by e using groupWith`, and after it every earlier variable is bound to a list of its values within the group. `ParallelListComp` adds `[(x, y) | x <- xs | y <- ys]`, which zips two generators instead of nesting them.

```csharp
// sankey nodes with their in-links and out-links (GroupJoin twice)
from n in nodes
join l in links on n.id equals l.target into ins
join m in links on n.id equals m.source into outs
select new { n, ins, outs }
```

- **Q1.** Nested generators are sequential (a cross product). `ParallelListComp` uses `|` for parallel generators (a zip).
- **Q2.** Every generator introduces a name (`x <- xs`, `from x in`). This is the main feature.
- **Q3.** Each generator draws from a source the user names, so a generator can draw from the whole input or from a field of an earlier variable (`y <- children x`).
- **Q4.** `join ... equals` matches by key. `GroupJoin` is the nest join that round 2 needs for sankey nodes.

`then group by` is the closest precedent for GoFish's flow. After grouping, "the current rows" become a list per group, and later steps run inside each group without new names.

### Optics and generic programming over fields (from memory)

A lens focuses on one part of a structure. A traversal focuses on many parts at once, e.g., `each` over a list or `both` over a pair. A traversal over a record's fields of one type lets you map over the fields as if they were a list. GHC Generics and TypeScript mapped types (`{ [K in keyof T]: F<T[K]> }`) let code range over a record's field names at the type level.

- **Q1.** Composing optics (`.`) is sequential focusing.
- **Q2.** A field name is a first-class lens, so the name of a field is a value you can pass around.
- **Q3.** Optics are projection. They always say which part you get.
- **Q4.** An optic remembers where its focus came from, so writing back puts each part into the right slot. This is identity by position in the structure.

For GoFish the useful idea is that "the fields of a record" is itself a traversal. It turns a record into a list whose elements are (field name, field value) pairs while keeping a path back to the row.

### Array programming (from memory)

APL and J apply a function to cells of a chosen rank with the rank operator (`f⍤1` applies `f` to each row), and `¨` (each) applies it to each item. NumPy broadcasting stretches size-one axes to match. xarray names every dimension, so `groupby("lake")`, `.sel(species=...)`, and `apply_ufunc(f, ..., input_core_dims=[["time"]])` all refer to dimensions by name, and `Dataset.to_array(dim="variable")` turns a set of variables into one new dimension. `einsum("ij,jk->ik", a, b)` names dimensions by letter and says which are summed and which are kept. Named tensor libraries do the same with strings. Dex writes `for i:n. f i`, where `n` is an index set (a type), and the result is a table indexed by `n`.

- **Q1.** Elementwise operations over shared dimensions are parallel. Reductions over a dimension are sequential.
- **Q2.** Dimension names are introduced once, as data, and every later operation uses them. In Dex the loop index `i` has a type, its index set.
- **Q3.** Broadcasting gives every element the whole value along the dimensions it does not have.
- **Q4.** Two arrays that share a dimension name are aligned along it by coordinate label (xarray) or by position (NumPy). Alignment is the join.

`to_array(dim="variable")` is the array version of `unpivot`. It turns "a record of fields" into "a dimension whose labels are field names", so the rest of the system treats fields like any other key.

### Relational languages (from memory)

`CROSS JOIN` pairs every row with every row. `LATERAL` lets a subquery in `FROM` refer to columns of rows to its left, so it is a dependent join (a bind). dplyr's `across(c(a, b, c), f)` applies `f` to several columns inside `mutate` or `summarise`, and `cur_column()` gives the name of the column being processed. `rowwise()` makes each row its own group. tidyr's `nest()` and `unnest()` move between a flat table and a table with list columns, and dplyr's `nest_join()` adds a list column of matching rows. polars expression expansion turns `pl.col(["a", "b", "c"])` into three expressions when the query is planned, and `.name.suffix("_n")` names the outputs. Window functions with `over("k")` compute per group but keep every row.

```r
penguins |> mutate(across(c(bill_len, bill_dep, mass), ~ (.x - min(.x)) / (max(.x) - min(.x))))
```

- **Q1.** A pipeline of verbs is sequential. `across` and polars expansion are parallel over columns.
- **Q2.** `cur_column()` gives the loop variable as data, the column name. polars gives it through `.name`.
- **Q3.** `across` passes each function one column (projection). `over` passes the group but keeps rows in place.
- **Q4.** Joins use keys. A row that is split by `across` is never copied, so all its output columns stay on the same row. Identity is the row.

`across` and polars expansion are the precedent for round 2's `cols([...])`. Both are separate from `map` because they run inside a verb, keep each result in the same row, and give the column name to the user as data.

### Dataflow and streams (from memory)

Fork and join, scatter and gather, and broadcast are the three ways to send work to parallel workers. Fork sends the same task to several workers, scatter sends each worker a part, and broadcast sends every worker a full copy. Apache Beam's `CoGroupByKey` takes several keyed collections and returns, for each key, the values from each collection, and Flink's `coGroup` does the same. Reactive libraries have `combineLatest` (join by time) and `zip` (join by position).

- **Q1.** Pipeline stages are sequential, and fork or scatter makes them parallel.
- **Q2.** Keys are fields of the elements.
- **Q3.** Broadcast and fork give the whole input. Scatter gives a part.
- **Q4.** The join after a fork is by key (`CoGroupByKey`) or by position (`zip`). Without one of the two, a dataflow system cannot rejoin.

`CoGroupByKey` is exactly what a parallel sets ribbon does. Each axis is one keyed collection of placed ends, and the ribbon gathers, per row key, one end from each axis.

## Part 2. UI and layout languages

### SwiftUI (verified)

SwiftUI views are built in `@ViewBuilder` bodies. A result builder turns a block of statements into calls such as `buildBlock` (a fixed tuple of children), `buildEither` (an `if` with an `else`), and `buildOptional` (an `if` alone). Swift result builders also support `buildArray` for `for` loops, but `ViewBuilder` does not implement it, so a `for` loop in a view body is a compile error. Users write `ForEach(items, id: \.id) { item in ... }` instead, and SwiftUI uses the id to keep state and to animate items that are added, moved, or removed. `Group` gathers children without layout, and `Grid` with `GridRow` lays out a fixed table.

```swift
HStack {
  ForEach(axes, id: \.self) { axis in
    AxisColumn(rows: rows, field: axis)
  }
}
```

- **Q1.** A builder block is a fixed tuple of children. `ForEach` is the only repetition.
- **Q2.** The closure parameter (`axis in`) names the loop variable.
- **Q3.** Children capture whatever is in scope, so broadcast is the default.
- **Q4.** The `id` is the identity. Two views from the same item across two `ForEach` loops share an id, and `matchedGeometryEffect(id:in:)` uses an explicit id and a namespace to link two views as the same element.

This is the clearest case of a framework keeping its iteration construct apart from a plain loop on purpose. The reason is identity. `matchedGeometryEffect` is also a precedent for joining two pieces in different branches by a shared id.

### Jetpack Compose, React, Solid, Svelte, Vue, and Elm (from memory)

Compose functions use plain Kotlin `for` and `if`, and `key(id) { ... }` sets identity when a loop's order can change. `LazyColumn { items(list, key = { it.id }) { ... } }` asks for a key. React uses `xs.map(x => <Row key={x.id} />)` and warns when `key` is missing. Solid has `<For each={xs}>{(x, i) => ...}</For>`, which keys each rendered item by the object itself and gives the index as a signal, and `<Index each={xs}>{(x, i) => ...}</Index>`, which keys by position and gives the item as a signal. Svelte writes `{#each items as item (item.id)}`, and Vue writes `v-for="item in items" :key="item.id"`. Elm views are plain functions, and `Html.Keyed` adds keys when needed.

- **Q1.** Children in markup are a tuple, and a loop adds a list in one slot.
- **Q2.** The loop variable is a host language name.
- **Q3.** Broadcast through lexical scope.
- **Q4.** By key. Solid makes the choice explicit, with identity by reference in `For` and identity by position in `Index`.

Solid's pair is the cleanest statement of the Q4 choice. Joining by key works when order changes. Joining by position works when the items are plain values with no identity.

### Typst, Racket pict, Penrose, Bluefish, and Atom

Typst content allows `for` and `if` inside markup, and a `for` loop's results are joined into content. `grid(columns: 3, ..cells)` spreads an array into separate children (from memory). Racket's pict library composes with `hc-append` and `vc-append`, and users repeat with `(apply hc-append (map f xs))` (from memory). Penrose Style programs use selectors such as `forall Set x where IsSubset(x, y)`, which match objects in the Substance program, and the match binds the names (from memory).

Bluefish (verified) is a relational scene graph built on SolidJS. Children are repeated with Solid's `<For each>`, and a child gets a `name`. Another relation refers to it with `<Ref select="mercury" />`. A child can belong to several relations, e.g., a `StackH` and an `Align`, and names are scoped with `createName` so one relation's names do not shadow another's. Atom (Park et al. 2017, from memory) composes unit visualizations by repeated containment, where each level splits its parent's units by a field and lays them out.

```jsx
<StackH>
  <For each={planets}>{(p) => <Circle name={p.name} r={p.r} />}</For>
</StackH>
<Align alignment="centerX">
  <Text name="label">Mercury</Text>
  <Ref select="mercury" />
</Align>
```

- **Q1.** Bluefish children are a tuple, and `For` adds lists. Atom is sequential nesting only.
- **Q2.** Bluefish uses names on elements. Penrose binds names by matching patterns.
- **Q3.** Bluefish broadcasts through scope. Atom always partitions, so each child gets a part.
- **Q4.** Bluefish joins by name through `Ref`. The same element is in two places in the tree, so there is nothing to rejoin.

Bluefish's answer to Q4 differs from the others. It does not copy the element and then match copies. It lets one element have several parents. GoFish's `ref` and `selectAll` follow this model.

## Part 3. Visualization grammars

### Vega-Lite facet and repeat (verified for the example, from memory for syntax)

`facet` splits the data by a field and draws one view per value, so it is a partition of rows. `repeat` copies a view once per item in a list of field names, and the view refers to the current item with a placeholder, e.g., `{"field": {"repeat": "column"}}`. `repeat` can fill `row`, `column`, or `layer`. A SPLOM is `repeat: { row: [...], column: [...] }`. Parallel coordinates do not use `repeat`. The example adds a row index with `window`, unpivots with `fold`, normalizes by hand, and draws `line` with `detail` set to the index, because Vega-Lite has one scale per channel.

- **Q1.** `facet`, `repeat`, `concat`, and `layer` are all parallel. Sequential work is in transforms.
- **Q2.** The placeholder `{"repeat": "column"}` is the only name, and it is a string macro.
- **Q3.** Every repeated view gets all rows.
- **Q4.** In the parallel coordinates example the user makes the identity as a column (`index`) and passes it to `detail`.

`repeat` is a macro because JSON has no functions, so it cannot write `fields.map(f => view(f))`. The placeholder is a function parameter written as data. That is why it reads as confusing. The parallel coordinates example also shows that unpivot plus a row id plus a grouping key is the standard workaround, and that it loses one scale per axis.

### ggplot2 and GGally (from memory)

`facet_wrap(~ k)` and `facet_grid(r ~ c)` partition rows. GGally's `ggpairs(df, columns = 1:4)` builds a SPLOM from a list of columns, with a separate function per cell type (upper, lower, diagonal), and `ggparcoord` unpivots and scales columns for parallel coordinates. Both GGally functions are fixed templates, not composable parts.

### Observable Plot (from memory)

Plot has `fx` and `fy` facet channels that partition rows. It has no repeat. For a SPLOM, the docs build a cross product of field names with plain JavaScript and facet over it (from memory). The design leans on the host language for anything outside the grammar.

### D3 and Protovis (from memory)

D3's nested selections pass each parent's datum to its children with `selection.data(d => d.children)`, so a child's data is a function of its parent's datum. `selection.data(data, key)` joins new data to existing elements by key, which gives enter, update, and exit sets. Protovis panels did the same, with `.data(d => ...)` on a child mark reading the parent's datum, and properties inherited from the parent mark.

- **Q3.** Projection through a function of the parent datum.
- **Q4.** The key function. D3 is the main visualization precedent for identity as a user function.

### Charticulator (from memory)

Charticulator has glyphs (one per row), plot segments that lay glyphs out, and link marks that connect glyphs. Links connect glyphs that share a key or come from a table of links between row ids. Identity is the row id in both cases.

## Part 4. Where iteration is kept apart from map, and why

Several systems have a construct that looks like `map` but is not. Each has a stated reason.

- **SwiftUI `ForEach`.** Plain `for` is not allowed in view bodies because the framework needs an id per item to keep state and animate.
- **React, Svelte, Vue, Compose, Elm.** These systems allow the host loop, but they ask for a key, which is the same reason as SwiftUI handled with a warning instead of a type.
- **Solid `For` and `Index`.** Solid has two constructs because there are two ways to decide identity, by reference and by position. A plain `map` would rebuild every item on each change.
- **D3 data join.** `.data(xs, key)` is a join, not a map, because the result splits into enter, update, and exit by key.
- **dplyr `across` and polars expansion.** They run inside a verb, keep results in the same row, and give the column name as data (`cur_column()`, `.name`). polars expands when the query is planned, so the output columns and their types are known before any data is read.
- **Dex `for`.** The loop ranges over an index set, which is a type, and the result is a table indexed by that type. A list `map` loses the index set.
- **APL rank.** Rank applies a function to cells of a given shape, and the result keeps the shape of the frame, so the dimensions stay meaningful.
- **xarray `apply_ufunc`.** The user names the core dimensions, and xarray broadcasts and aligns the rest by label.
- **Vega-Lite `repeat`.** It is separate from map only because JSON has no map. This is the case GoFish should not copy.

Three reasons repeat across this list:

1. **Identity.** The construct carries a key per item, so later steps can match, animate, or join items.
2. **The index set is data.** The loop variable is kept as a value, e.g., a column name or a dimension label, and later steps can show it (an axis title) or group by it.
3. **Static shape.** The set of branches is known before data is read, so the system can plan, type, or serialize it.

For GoFish all three apply. A ribbon needs identity. An axis needs the field name as its title and as the key for its own scale. Python sends specs to JS as data, so a host lambda in Python runs before serialization and leaves no trace of the loop in the spec.

## Part 5. Where branches are joined again by input identity

- **Arrows.** `f &&& g` gives a pair from one input, so identity is free inside one run. Over a list it is not.
- **Beam and Flink `CoGroupByKey`.** Several keyed collections are gathered per key. This is the parallel sets ribbon.
- **SQL and LINQ joins.** `join ... equals` matches by key, and `GroupJoin` or `nest_join` builds the per-node lists for a sankey.
- **D3 key functions.** The user writes the identity as a function of the datum.
- **Vega-Lite `detail`.** The user makes a row id with `window` and groups lines by it.
- **SwiftUI `matchedGeometryEffect`.** Two views in different branches are linked by an explicit id and a namespace.
- **Solid `For`.** Identity is the object reference, so no key is written.
- **Bluefish `Ref`.** One element has several parents, so it is never copied and there is nothing to match.
- **dplyr `across`.** The row is never split, so all results stay on it.
- **xarray alignment.** Arrays that share a dimension are aligned by coordinate label.

Three strategies come out of this list:

- **Key.** The user names a key, e.g., D3, SQL, Beam, Vega-Lite `detail`.
- **Reference.** The system keeps the original object, so identity is the object itself, e.g., Solid `For`, round 2's "rows are never copied".
- **Sharing.** The element is placed once and has several parents, e.g., Bluefish, GoFish `ref`.

Reference works in JS and fails across the Python wire, where object identity is lost. That is why round 2 lists a row id on the wire as a need. A system that wants one rule in both languages needs a key that it creates itself, e.g., the row's index in the input, which is what Vega-Lite's `window` count does by hand.

## Part 6. Synthesis

Five models of composition come out of the survey. For each model I sketch the target examples in a GoFish-like syntax and score it on the four criteria:

- (C1) effortless composition
- (C2) fit with control flow ideas
- (C3) fit with the pipeline and direct style split
- (C4) orthogonality to plain `.map()`

All sketches use invented syntax. None of it runs today.

### Model 1. Arrow combinators with joining by provenance

Direct style is `&&&`. Each child gets the whole scope. Destructuring a pair is `***`. A relational mark after a fanout joins its ends by the input row they came from (provenance), which the system tracks because rows are never copied. The flow stays `>>>`.

```js
// parallel sets: fanout over a fixed tuple of axes
spread({ dir: "x" }, [
  axisOf("class"), axisOf("sex"), axisOf("survived"),   // each: chart().flow(spread({ by: f }), stack(...)).mark(rect)
]).layer(ribbon())                                       // joins ends from the same row
// parallel coordinates: same, with line() and a point mark per axis
// SPLOM: two nested fanouts
spread({ dir: "y" }, fields.map((fy) => spread({ dir: "x" }, fields.map((fx) => scatterOf(fx, fy)))))
// sankey: each node is a pair, *** sends in-links left and out-links right
chart(nodes).flow(spread({ by: "depth", dir: "x" }), spread({ by: "id", dir: "y" }))
  .mark(spread({ dir: "x" }, [chart(field("in")).mark(endStack), chart(field("out")).mark(endStack)]))
  .layer(ribbon())   // an in-end and an out-end of the same link row join
// sankey tree: a recursive function returning the pair (box, children)
const node = () => stack({ dir: "x" }, [rect(...), chart(field("children")).mark(node)]);
```

- **C1.** Strong for fixed tuples and pairs. The SPLOM falls back on host `map`.
- **C2.** Sequence and fanout are named concepts, and choice and loops have arrow forms.
- **C3.** Exact. Pipeline is `>>>`, and direct style is `&&&` and `***`.
- **C4.** Weak. A tuple of children built by `map` is the only way to range over fields, so the "over fields" part is map in disguise. The arrow model has no way to name the field set.

### Model 2. Comprehension with named generators

A generator introduces a name, e.g., `for (f of fields)`. The flow is a comprehension whose generator is anonymous, with "the current rows" rebound by grouping, as in `TransformListComp`. A named generator is for things that are not rows, such as fields.

```js
// parallel sets
chart(titanic)
  .flow(
    over(["class", "sex", "survived"], { as: "axis" }), // generator over fields; rows broadcast
    spread({ dir: "x" }),
    spread({ by: field.of("axis").sort(), dir: "y" }), // the field named by the loop variable
    stack({ dir: "y" })
  )
  .mark(rect({ h: "count" }))
  .layer(ribbon({ by: rowId }));
// SPLOM: two generators nest (cross product)
chart(penguins)
  .flow(
    over(fields, { as: "fy" }),
    spread({ dir: "y" }),
    over(fields, { as: "fx" }),
    spread({ dir: "x" })
  )
  .mark(circle({ x: field.of("fx"), y: field.of("fy") }));
// sankey: generator over a row's list field (LINQ GroupJoin then a dependent generator)
chart(nodes).flow(
  spread({ by: "depth" }),
  spread({ by: "id" }),
  over(["in", "out"], { as: "side" }),
  spread({ dir: "x" }),
  unnest(field.of("side")),
  stack({ dir: "y" })
);
// sankey tree: a recursive generator over `children`
```

- **C1.** Good. Every example is one flow. Nesting is free.
- **C2.** Strong. It is the `for` in a comprehension.
- **C3.** It puts the record case into the pipeline as a tier, so the split between pipeline and direct style becomes a question of whether the generator ranges over groups or over fields.
- **C4.** Good. The loop variable is data (`axis`), it is a key for scales and titles, and rows are not copied. The cost is a second kind of name (`as: "axis"`) that the flow has avoided so far.

### Model 3. Builder bodies with host control flow and a keyed ForEach

Direct style children are a builder body. Users write host `for` and `if`, and a keyed `forEach(items, { key }, body)` is the one place where identity is declared. Relational marks join by that key. This is SwiftUI, Compose, Solid, and Bluefish.

```js
// parallel sets
spread(
  { dir: "x" },
  forEach(["class", "sex", "survived"], { key: (f) => f }, (f) =>
    chart()
      .flow(spread({ by: f, dir: "y" }), stack({ by: rowId, dir: "y" }))
      .mark(rect({ h: "count" }))
  )
).layer(ribbon({ by: rowId }));
// SPLOM: nested forEach over fields
// sankey: forEach over nodes keyed by id; each node body is a tuple [inStack, outStack]
// sankey tree: recursive component function; forEach over children keyed by path
```

- **C1.** Good and familiar to UI programmers. Every structure is reachable because the host language is there.
- **C2.** Strong, since it is host control flow.
- **C3.** It covers direct style well. It leaves the pipeline as a separate world, so a flow inside a builder and a builder inside a flow are two grammars.
- **C4.** Partial. `forEach` differs from `map` only by the key, which is the SwiftUI and React reason. The field name is a closure variable, so the system cannot see that `f` is an axis title or a scale key. In Python the loop runs before serialization and leaves only copies.

### Model 4. Named dimensions (array ranks)

The field set is a dimension. A record of fields is converted into a dimension whose labels are field names (xarray `to_array`, polars and dplyr expansion, unpivot), and from then on every operator treats it as a key. Broadcasting supplies the rows to each label. Alignment by label rejoins.

```js
// parallel sets: "variable" is a dimension made from the field set
chart(titanic)
  .flow(
    spread({ by: fields(["class", "sex", "survived"]), dir: "x" }), // a tier over a field set
    spread({ by: value, dir: "y" }), // `value` = the current row's value in the current field
    stack({ dir: "y" })
  )
  .mark(rect({ h: "count" }))
  .layer(ribbon()); // rows align across the field dimension
// SPLOM: two field dimensions, one per direction
chart(penguins)
  .flow(
    spread({ by: fields(F), dir: "y", as: "fy" }),
    spread({ by: fields(F), dir: "x", as: "fx" })
  )
  .mark(circle({ x: value("fx"), y: value("fy") }));
// sankey: the record (in, out) is a two-label dimension "side"; links are unnested along it
// sankey tree: depth is a dimension; children are nested data, not a dimension
```

- **C1.** Very good for parallel sets, parallel coordinates, and SPLOM, since each is one more tier. Trees do not fit, because a tree has no fixed dimensions.
- **C2.** Medium. Ranging over a dimension is a loop, but the user does not write a loop.
- **C3.** It moves records into the pipeline as a tier. Direct style stays for heterogeneous children, e.g., a box plus a list.
- **C4.** Strong. The field set is data, each label is a key with its own scale, and rows are not copied. This is the polars reason (expansion is planned, so it is typed and serializable).

This model is round 1's `unpivot` without the copy. A tier over `fields([...])` produces the same groups `unpivot` does, but each group holds the original rows, viewed through one field.

### Model 5. Relational joins

Everything is tables and keys. Ends are rows (round 1). Ribbons gather ends by key with `CoGroupByKey`. Nested data is built with a nest join (LINQ `GroupJoin`, dplyr `nest_join`).

```js
// parallel sets: round 1 Approach B
chart(titanic)
  .flow(
    derive(
      unpivot({ on: AXES, variable: "axis", value: "category", id: "path" })
    ),
    spread({ by: "axis" }),
    spread({ by: "category" }),
    stack({ by: "rank" })
  )
  .mark(rect({ h: "count" }))
  .layer(ribbon({ by: "path" }));
// sankey: unpivot links into ends; ribbon({ by: "link" })
// SPLOM: cross join of field pairs, then facet
// sankey tree: needs a tree-ends helper (one end row per depth)
```

- **C1.** Medium. Each example works, but the user reshapes data first and invents keys.
- **C2.** Weak. Joins are not control flow.
- **C3.** Pipeline only. Direct style plays no part.
- **C4.** Strong, but because it does not iterate at all. Fields are always converted into rows first.

### Comparison

| Model                        | Parallel sets | Parallel coords          | SPLOM             | Sankey (in, out)          | Sankey tree         | C1     | C2     | C3            | C4      |
| ---------------------------- | ------------- | ------------------------ | ----------------- | ------------------------- | ------------------- | ------ | ------ | ------------- | ------- |
| 1. Arrows and provenance     | fanout tuple  | fanout, needs own scales | host map          | `***` on a pair           | recursion           | good   | good   | exact         | weak    |
| 2. Named generators          | one flow      | one flow                 | nested generators | generator over `in`/`out` | recursive generator | good   | strong | merges        | good    |
| 3. Builder and keyed ForEach | forEach       | forEach                  | nested forEach    | keyed tuple               | recursive component | good   | strong | split         | partial |
| 4. Named dimensions          | one tier      | one tier                 | two tiers         | two-label dimension       | does not fit        | strong | medium | merges        | strong  |
| 5. Relational joins          | unpivot       | unpivot                  | cross join        | unpivot links             | helper              | medium | weak   | pipeline only | strong  |

### What the survey suggests

The examples have two kinds of structure, and no single model covers both well.

1. **A fixed set of fields, the same thing done per field.** Parallel sets, parallel coordinates, and SPLOM have this structure. Models 2 and 4 handle it best, and they agree on the core. The field set is a tier whose key is the field name, each group holds the original rows (broadcast), and each group sees them through one field (projection). This is `across`, polars expansion, and xarray `to_array` without the copy. It is different from `map` for all three reasons in Part 4. It keeps identity because rows are not copied. It keeps the field name as data, so each axis can have its own title and its own scale, which also answers round 2's decision 12. It is static, so it serializes from Python. Round 2's `cols([...])` is this idea placed in direct style. As a flow tier it needs no new composition rule.

2. **A fixed tuple of different parts.** A sankey node is (in, out), a tree node is (box, children), and FrankenSankey is (stacked area, sankey). Model 1's `***` and Model 3's builder tuple handle it best, and this is GoFish's direct style as it is today. Lists inside a part are reached by projecting a field of the parent row (`chart(field("in"))`), which is D3's `data(d => d.children)` and LINQ's `GroupJoin` result.

For joining branches again, the survey gives three strategies, and GoFish can use one rule for all examples. Every relational mark joins by row identity. Rows reached through a field tier or a field projection are the original rows, so identity is the row. In JS, identity can be the object reference, which is Solid's `For` rule. On the wire, the system needs a row index that it creates when data enters `chart()`, which is what Vega-Lite users write by hand with `window`. A user key (`ribbon({ by })`) stays as the override for the case where two different rows should join, e.g., after a user's own unpivot.

Plain `.map()` keeps its role as the way to build a tuple whose size the user decides in host code. A tier over a field set covers the case where the system needs to know about the loop.

Two points in this synthesis are my reading and are open to discussion:

- Model 2's named loop variable (`as: "axis"`) may not be needed. If a field tier exposes "the current field" implicitly, the way `cur_column()` does, the flow stays free of names. A SPLOM is the one example that needs two names at once, because it reads the field from the row tier and the field from the column tier.
- Trees fit only through recursion over a projected field. Here the survey matches round 2's reading that a sankey tree is the nested data rule applied recursively.

## Sources

- [Swift forums, result builder `for` loops](https://forums.swift.org/t/result-builder-to-support-for-loops/49220)
- [Apple Developer Forums, "Is ForEach loop the only loop that's allowed inside a view?"](https://developer.apple.com/forums/thread/662963)
- [Hacking with Swift, key points on ForEach identity](https://www.hackingwithswift.com/guide/ios-swiftui/3/2/key-points)
- [Pollock et al., Bluefish: Composing Diagrams with Declarative Relations (UIST 2024)](https://arxiv.org/html/2307.00146v4)
- [Vega-Lite parallel coordinates example](https://vega.github.io/vega-lite/examples/parallel_coordinate.html)
- All other entries are from memory: Hughes 2000 (arrows), Paterson 2001 (arrow notation), Mokhov et al. 2019 (selective functors), Wadler and Peyton Jones 2007 (comprehensive comprehensions), the LINQ, dplyr, tidyr, polars, xarray, Dex, Beam, Solid, React, Compose, Typst, Penrose, Atom, D3, Protovis, ggplot2, GGally, Observable Plot, and Charticulator documentation.
