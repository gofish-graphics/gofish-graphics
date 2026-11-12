# Type equality and data-structure equality

Research note for "GoFish Goes to School", section 10, "Equality and normalization (deferred)".

The question is when two inputs with different shapes should get the same type, and how a checker decides it. Examples of such pairs are a long and a wide table, a sparse and a dense grid, and a nested tree and a parent-pointer table. This note collects the cases GoFish meets today, surveys the tools that type theory offers, lists the things that must not be made equal, and ends with a small recommendation.

The short answer is this.

- GoFish should not make the checker compare types up to isomorphism, and it should not search for a reshape (an e-graph). The checker compares table types up to the order of fields and the order of key columns, and nothing more.
- GoFish already has the one isomorphism it needs most. A `by` in the flow turns a flat table keyed by `a × b` into groups keyed by `a` and then `b`. That is currying, and the flow applies it as an operator, so the type system gets it without an equation.
- Every other reshape is an explicit, named conversion that the user writes. Each conversion states what it needs from the value type as a trait. A reshape that touches no values needs nothing. Filling empty cells needs a zero. Collapsing several rows into one needs a way to add or average.
- The one new fact the checker must learn is which columns are the key, and that the key is unique. Hannah Aizenman's sheaf axioms, read in type theory, come down to that check.

## 1. Terms

These are the terms of art this note uses, defined once.

- **Key and value.** A table is a function from keys to records. The key columns name a row, e.g., `(warehouse, month)`. The value columns are what the row says about that key, e.g., `stock`. The draft writes the type as `Π(k : K). Record(k)`.
- **Dependent function type, `Π(k : K). B(k)`.** A function whose result type may depend on the argument. When `B` does not depend on `k`, it is the plain function type `K → B`.
- **Dependent pair type, `Σ(k : K). B(k)`.** A pair whose second part's type depends on the first part. A ragged nested list, where each group has its own set of members, is a `Σ`.
- **Isomorphism.** Two types `A` and `B` are isomorphic, written `A ≅ B`, when there are functions `f : A → B` and `g : B → A` that undo each other. Isomorphic types hold the same information in different shapes.
- **Normal form.** A chosen representative for each class of equal things. Two things are equal exactly when their normal forms are identical, so a checker decides equality by computing normal forms and comparing them.
- **Parametric function.** A function that works for every type of value and never looks inside a value, e.g., reversing a list. Such a function can only move, copy or drop values.
- **Trait.** As in the GoFish docs, a named property of a type that operators can require, e.g., `HasZero` or `CanAdd`.
- **Long and wide.** A long table has one value column and a column that says which variable each row holds, e.g., `{age, sex, people}`. A wide table has one column per variable, e.g., `{age, Women, Men}`.
- **Sparse and dense.** A dense table has a row for every key in the key space. A sparse table has rows only for some keys, usually the nonzero ones.

## 2. The cases GoFish meets

### 2.1 How data enters GoFish today

`chart(data, { schema })` takes an array of row objects. In Python, `chart(df, schema=...)` takes any data frame that narwhals knows (pandas, polars, pyarrow, DuckDB) and sends it to JavaScript as an Arrow table (`packages/gofish-python/gofish/arrow_utils.py`). The schema types columns one by one with `Unit`, `Domain` and `Trait` (`apps/docs/docs/internals/core/underlying-space.md`, section "Column types: the chart schema").

Several facts about the current data path bear on equality.

- **Data flows as lists.** `api-design.md` says every step takes a list and gives back a list, and a split never looks inside an item. So the runtime type of the data is a list of records, `List(Row)`, and not a set of rows or a function from keys.
- **Row order is visible.** A split over a column with no declared levels orders its groups by first appearance (`datumProjection.ts`). So two tables that differ only in row order can draw differently. This is a deliberate and simple rule, but it means row order is part of the value today.
- **Position is a key helper.** `by: chunk(n)` groups by position in the list (`WaffleChart.stories.tsx`). Position in the list is an implicit key column of type "0 to n − 1".
- **Duplicate keys are aggregated by channel kind.** When a group has several rows, sizes sum, positions average, and colors take the first row (`api-design.md`, "Channels are chosen by how they aggregate"). This is an implicit aggregation, and it is where duplicate keys meet additivity.
- **`derive` is the escape hatch.** `derive(fn, { schema })` runs any function on the rows and declares the column types of its result (`chart.ts`). The types never look inside `fn`.
- **Nested values are not typed.** A list or struct column crosses from Python unchanged, and "no schema names a value inside a list or a struct" (`underlying-space.md`). So a curried, nested table has no types inside it today.
- **Other data operators.** `repeat(d, field)` copies a row `d[field]` times. `normalize(data, field)` divides by the column total and checks that the unit can add up. `join(right, { on })` is a one-to-many equi-join. `resolve` and `selectAll` treat drawn marks as rows, keyed by the field the producer split on.

### 2.2 Real pairs from the stories

Each case below is a story in `packages/gofish-graphics/stories/` (or a dataset in `src/data/`) where the same picture could come from two shapes. In most of them, the story author reshapes in plain JavaScript before `chart(...)`, so the reshape is invisible to any checker.

1. **Wide columns of one unit, melted by hand.** The population pyramid (`forwardsyntax/Bar/Diverging.stories.tsx`) starts from rows `[age, women, men]` and builds long rows `{ age, sex, people }` with `flatMap`. The chart then declares `sex: Unit({ domain: Domain.discrete(["Women", "Men"]), traits: [Trait.diverging()] })`. The levels it declares are exactly the old column names, in the order they were written.
2. **Wide columns of one unit, kept wide.** The box plot (`forwardsyntax/BoxPlot.stories.tsx`, data `genderPayGap.ts`) keeps `Min`, `25-Percentile`, `Median`, `75-Percentile` and `Max` as columns, gives all of them one unit `Pay` in USD, and addresses them by name in marks (`y: "Min", y2: "Max"`). Melting them would be possible, since they share a unit, but the chart uses the record form, and the five values do not add up.
3. **Wide columns of different units.** `drivingShifts.ts` has `miles` (miles per person) and `gas` (USD per gallon) per year. The faceted scatter stories plot one or the other. These two columns must not become one value column on one axis.
4. **A dense matrix as a flat array.** The heatmap (`forwardsyntax/Heatmap.stories.tsx`) stores 45 values in one flat array in row-major order and builds `{ day, hour, value }` rows with `rawValues[di * hours.length + hi]`. This is the Dex flattening `Fin 5 × Fin 9 ≅ Fin 45`, written by hand.
5. **Sparse and dense versions of one survey.** The Likert data in the same diverging file is built two ways. The first version drops the zero counts (`count === 0 ? [] : [...]`). The `LikertEven` version keeps them. The engine already treats a missing level as a zero part, because "a row with no responses for some level keeps the same midpoint" (`underlying-space.md`). That is right for a count and would be wrong for a rate.
6. **A sparse map made dense with a default.** The ridgeline (`forwardsyntax/RidgelineChart.stories.tsx`) builds a dense grid from a `Map` of counts with `counts.get(...) ?? 0`. The default 0 is right because the field is a count.
7. **Pre-aggregated rows and raw rows.** The waffle chart turns pre-aggregated rows `{ lake, species, count }` into raw unit rows with `derive((d) => d.flatMap((d) => repeat(d, "count")))`. The treemap (`lowlevel/Treemap.stories.tsx`) goes the other way. It takes raw movie rows and lets `treemap({ by: "Major Genre", size: "Worldwide Gross" })` sum them per genre.
8. **Long data already in tidy form.** `nightingale.ts` (`Month`, `Type`, `Death`), `olympic-medals.ts` (`Medal_Type`, `Count`) and `streamgraphData.ts` (`x`, `c`, `y`) are long tables. A user could just as well hold them wide, with one column per type, medal or series.
9. **A nested tree and a flat table.** GoTree takes nested `{ children }` objects through `d3.hierarchy` (`packages/gofish-gotree/src/data.ts`). The treemap story takes a flat table and builds the levels with `by`. A parent-pointer table (`id`, `parent`) would be a third form, and `d3.stratify` is the usual conversion.
10. **A graph as two tables with positional keys.** `energy.ts` has `nodes: { name }[]` and `links: { source: number, target: number, value }[]`, where `source` and `target` are positions in the `nodes` list. This is a foreign key into an implicit index column.
11. **Struct of arrays and array of structs.** A polars or Arrow table is stored as columns, a struct of arrays. GoFish rows are objects, an array of structs. The Python bridge converts one to the other. Nobody wants these to type differently, and today they do not.
12. **A time series as pairs.** A series stored as `[[t, v], ...]` pairs is a list of tuples with positional fields. A table with `t` and `v` columns names those fields. The only difference is the field labels.

## 3. The type-theory toolkit

### 3.1 Type isomorphisms that describe these cases

Each reshape above is an instance of a small set of isomorphisms. The interesting part of each one is its side condition.

**Currying (long ≅ nested).**

```
Π(p : A × B). C(p)   ≅   Π(a : A). Π(b : B). C(a, b)
```

A table keyed by `(lake, species)` holds the same information as a table of lakes whose entries are tables of species. When the inner key set depends on the outer key, e.g., each lake has its own species, the key is a dependent pair and the law still holds.

```
Π(p : Σ(a : A). B(a)). C(p)   ≅   Π(a : A). Π(b : B(a)). C(a, b)
```

The right-hand side is a ragged nested list. In GoFish, `spread({ by: "lake" })` followed by `stack({ by: "species" })` applies exactly this isomorphism to a flat list, as an operator. This is why GoFish does not need currying as a type equation.

**Records are functions out of labels (wide ≅ long).** A record with fields `a` and `b` is a function out of the finite label type `{a, b}`.

```
{ a : V_a, b : V_b }   ≅   Π(l : {a, b}). V(l)     where V(a) = V_a, V(b) = V_b
```

This isomorphism always holds. Combined with currying, it turns a wide table into a long table with a `variable` key column.

```
Π(k : K). Π(l : L). V(l)   ≅   Π((k, l) : K × L). V(l)
```

The catch is the type of the long table's value column. It is `V(l)`, a type that depends on the value in another column. GoFish columns have one type each, so the long form only fits a GoFish column when `V(l)` is the same for every label, i.e., when the melted columns share one unit and one set of traits. That is the side condition. Population pyramid (one unit, people) meets it. Driving shifts (miles and USD per gallon) does not.

Jeremy Gibbons calls a container that is a function out of a fixed label set "Naperian" ([APLicative Programming with Naperian Functors, ESOP 2017](https://www.cs.ox.ac.uk/people/jeremy.gibbons/publications/aplicative.pdf)). The label type is its "logarithm", and transposing such containers is the general form of pivoting.

**Sums in the key split a table into pieces.**

```
Π(k : A + B). C(k)   ≅   Π(a : A). C(a)  ×  Π(b : B). C(b)
```

A table over the union of two disjoint key sets is the pair of the two tables. This is the type-theoretic content of "a dataset is determined by its pieces". Aizenman et al. state the same law as `Hom(K₁ ⊔ K₂, F) ≃ Hom(K₁, F) × Hom(K₂, F)` (see section 3.8).

**Partial and total functions (sparse ≅ dense, with a condition).** A sparse table is a partial function `K ⇀ V`, which is the same as `K → Option V`. A dense table is a total function `K → V`. The two are not isomorphic in general. They are isomorphic when `V` has a chosen value `0` that means "no entry", and you agree that an absent key and a key with `0` mean the same thing. So the conversion needs a trait on `V`.

- For an Extensive field, the draft already gives the right zero. A measure has `m(∅) = 0`, so a key with no rows has value 0. Counts in the Likert and ridgeline stories are this case.
- For an Intensive field, there is no right zero. The mean of no values is undefined, and a price of 0 is a claim, not a blank. Filling must be an error unless the user gives a value.
- For a Cumulative field (a stock), the right fill is the last known value, not 0. That needs an order on the key, which is a different trait.

So "sparse vs dense" is not one isomorphism. It is a family of conversions indexed by the additivity of the field over the key. This matches the draft's section 5 exactly.

**Bags and functions (duplicate keys).** A table with several rows per key is a bag of `(K, V)` pairs, or equivalently `K → List V`. Turning it into `K → V` needs a way to combine a list of values into one. That is a monoid (an associative operation with an identity, e.g., `+` and `0`), or a weighted mean for an Intensive field. GoFish's channel aggregation (sizes sum, positions average) is this step, so channel aggregation is where the checker should ask for `CanAdd` or a weight.

**Many keys to fewer keys (raw ≅ pre-aggregated, only up to an aggregate).** Raw rows keyed by movie and pre-aggregated rows keyed by genre are related by a function `genre : Movie → Genre`. Summing along it is a monoid homomorphism. Two charts agree when one draws `sum` of the raw rows and the other draws the pre-aggregated rows. They are not isomorphic types, because the raw rows hold more information. The right statement is that the chart is invariant under the aggregation the field allows. Bartonicek, Urbanek and Murrell work this out for interactive graphics with monoids and groups ([No More, No Less than Sum of Its Parts, JCGS 2025](https://doi.org/10.1080/10618600.2024.2429708)).

**Relabeling the key (a bijection on keys).** Renaming key values by a bijection `σ : K' ≅ K`, e.g., longitude in 0 to 360 against −180 to 180, or `(date, station)` against `(date, lat, lon)`, gives an isomorphic table by composition `τ ∘ σ`. It holds for any value type. It does not keep the key's traits unless `σ` keeps them, e.g., the shift of longitudes keeps the cycle but not the order.

**Position and an explicit index column.** A list is `Π(i : Fin n). R`, where `Fin n` is the type of the numbers 0 to n − 1. Adding an explicit index column (polars `with_row_index`) gives a table keyed by `Fin n`. The heatmap's flat array uses the bijection `Fin 5 × Fin 9 ≅ Fin 45`.

**Field order and struct of arrays.** Records are equal up to the order of their fields, because a record is a function out of its label set. A struct of arrays and an array of structs are related by the isomorphism `(K → A) × (K → B) ≅ K → A × B`, which is the "product in the codomain" law. Both of these hold for any value type, which is why the bridge can convert freely.

### 3.2 Di Cosmo's theory, and what types up to isomorphism cost

Roberto Di Cosmo's book [Isomorphisms of Types (Birkhäuser, 1995)](https://www.dicosmo.org/Book/) studies which types are isomorphic in typed lambda calculi. For products, the unit type and function types, the isomorphisms are exactly the consequences of these equations, and they are decidable (Soloviev 1983; Bruce, Di Cosmo and Longo 1992).

```
A × B          = B × A
A × (B × C)    = (A × B) × C
(A × B) → C    = A → (B → C)
A → (B × C)    = (A → B) × (A → C)
A × 1          = A
A → 1          = 1
1 → A          = A
```

These are the high school laws of exponents, written for types. Two things follow for GoFish.

- **Once sums and the empty type enter, the theory is much harder.** Fiore, Di Cosmo and Balat showed that the equations are then not finitely axiomatizable ([Remarks on isomorphisms in typed lambda calculi with empty and sum types, APAL 2006](https://doi.org/10.1016/j.apal.2005.09.001)), and Ilik studied decidability separately ([Axioms and decidability for type isomorphism in the presence of sums, CSL-LICS 2014](https://arxiv.org/abs/1401.2567)). Tables need sums, because a key domain is a finite sum of levels and a sparse table is `Option`.
- **Checking modulo isomorphism costs more than checking.** Type inference up to the first two equations alone is unification modulo associativity and commutativity, which is NP-hard in general. Rittri used isomorphism to search libraries by type ([Using types as search keys in function libraries, JFP 1991](https://doi.org/10.1017/S095679680000006X)), which is a good use because a human reviews the hits. In a checker, the cost is worse error messages, since the checker has to explain which of many equal forms it compared.

The cheap part of the theory is the first two laws applied to records and keys, i.e., field order and key-column order. A checker gets those by sorting labels, which is a normal form. The rest of the theory is better used as a list of conversions the user can write.

### 3.3 Dex

Dex ([Paszke et al., Getting to the Point, 2021](https://arxiv.org/abs/2104.05372)) types an array as a function from an index set, written `n=>a`. An index set is a finite type with a size and a bijection to `0 .. size − 1` (the `IndexSet` interface). Pairs of index sets are index sets, so a matrix is either `n=>m=>Float` or `(n & m)=>Float`.

The design choice that matters for GoFish is that Dex does not make these two types equal. The paper writes the conversion as code.

```
y  : (n & m)=>Float = for (i, j). x.i.j
x' : n=>m=>Float    = for i j. y.(i, j)
```

The authors say this captures the common use of `reshape` "while both preserving static information about array sizes, and not requiring the type system to solve systems of Diophantine equations to check which reshapes are valid". So Dex, the system the draft names as the model for a canonical key-indexed form, keeps type equality strict and makes each isomorphism a cheap explicit term. That is the precedent for this note's recommendation.

Two more Dex ideas carry over.

- An index set has a fixed enumeration order. In GoFish terms, a key with `HasLevels` has one, and a key without levels gets its order from first appearance.
- Index-polymorphic library functions such as `g : (a=>Float) -> (a=>Float)` work on a matrix after flattening. GoFish operators are already polymorphic in the key in this way, because they reach the key only by column name.

### 3.4 Containers and polynomial functors

A container ([Abbott, Altenkirch and Ghani, Containers, TCS 2005](https://doi.org/10.1016/j.tcs.2005.06.002)) describes a data structure by its shapes `S` and, for each shape, its positions `P(s)`. A value is a shape plus a function from positions to values.

```
⟦S ◁ P⟧(X) = Σ(s : S). (P(s) → X)
```

A list is the container whose shapes are lengths `n` and whose positions are `Fin n`. A sparse table is the container whose shape is the set of keys present. A ragged nested list has a list of lengths as its shape.

The theorem that helps GoFish is this. Every parametric map between two container types, i.e., every reshape that works for all value types, is given by a map on shapes and a map back on positions. So a reshape that never looks at values moves, copies or drops values, and it can do nothing else. That gives a clean test for which conversions need a trait.

- A conversion that is parametric in the value type needs nothing from it. Currying, field reordering, unpivoting columns of one type, relabeling keys and adding an index column are all parametric.
- A conversion that must create a value it was not given needs a trait that supplies one. Densifying needs a zero.
- A conversion that must combine values needs a trait that combines them. Aggregating needs `CanAdd`, or a weight.

The memory note "data flows as lists, splits never inspect item shape" is the same rule seen from the operator side. A split is parametric in the item type, so it cannot depend on item shape.

### 3.5 Normal forms and e-graphs

There are two standard ways for a checker to decide that two things are equal.

**Normal forms.** You pick a canonical representative and compute it. Normalization by evaluation is one technique for doing this for lambda terms. It is predictable, because the user can compute the normal form by hand, and the error message can show it. It only works when there is a confluent and terminating set of rewrites, i.e., when every way of rewriting reaches the same answer and stops.

**E-graphs and equality saturation.** An e-graph stores many equal terms at once and applies rewrite rules until nothing new appears or a budget runs out ([egg, Willsey et al., POPL 2021](https://arxiv.org/abs/2004.03082)). Then an extraction step picks the best term by a cost function. This is the right tool when the rules do not have a canonical direction, the space of equal terms is large, and there is a cost to optimize, e.g., in compilers and in layout search.

For GoFish's question, normal forms are enough and e-graphs are the wrong tool, for these reasons.

- The equations the checker should apply (field order, key-column order) have a normal form by sorting.
- The rest are conversions with side conditions on traits. An e-graph would apply a conversion such as "unpivot" only where its side condition holds, so it would still need the trait checks, and on top of that it would pick a shape the user did not write.
- A GoFish spec already says which shape it expects. `rect({ y: "Median" })` expects a wide record with a `Median` field, and `stack({ by: "stat" })` expects a long table with a `stat` key. When the data has the other shape, the result is a missing column, which is a simple error. A table lookup from "missing column `stat`, but the data has columns `Min`, ..., `Max` of one unit" to "did you mean `unpivot([...])`?" gives a good message without any search.
- An automatic reshape is an internal conditional with no spelling in user code. The memory note on defaults says every default should desugar to code the user could write. A reshape the user writes meets that rule, and a reshape the checker finds by search does not.

### 3.6 Univalence and parametricity

Univalence, from homotopy type theory, says that equivalent types are equal, so anything you can say about one you can carry over ("transport") to the other ([HoTT book, 2013](https://homotopytypetheory.org/book/)). As an explanation, this is the right idea: a chart should not be able to tell isomorphic inputs apart. As machinery, it is far more than GoFish needs.

The cheap version is Reynolds parametricity ([Reynolds, Types, Abstraction and Parametric Polymorphism, 1983](https://people.mpi-sws.org/~dreyer/tor/papers/reynolds.pdf); [Wadler, Theorems for free!, 1989](https://doi.org/10.1145/99370.99404)). If an operator only reaches the key through the operations its traits allow, then it gives related outputs on related inputs. For GoFish, this gives a checkable statement.

- An operator that only compares keys for equality gives the same picture under any relabeling of the keys.
- An operator that also uses the key order gives the same picture under any relabeling that keeps the order.
- An operator that uses row position (`chunk`, first-appearance order) can tell row orders apart. This is allowed, because GoFish data is a list, but it means that a table and the same table shuffled are not equal inputs, unless the key has declared levels.

Kindlmann and Scheidegger call the visualization version of this "representation invariance": the picture should not change when only the data representation changes ([An Algebraic Process for Visualization Design, TVCG 2014](https://doi.org/10.1109/TVCG.2014.2346325)). Aizenman et al. cite the same principle.

### 3.7 Relational and data frame precedent

- **Normal forms and functional dependencies.** Codd's relational model ([Codd 1970](https://doi.org/10.1145/362384.362685)) says a relation has a key, and every other column is a function of the key. That statement is a functional dependency. "This table is `Π(k : K). R`" is exactly "`K` determines every other column", so the checker's key check is a functional dependency check.
- **Tidy data.** Wickham's tidy data ([JSS 2014](https://doi.org/10.18637/jss.v059.i10)) says each variable is a column, each observation is a row, and each type of observational unit is a table. Its main cases of untidy data include "column headers are values, not variable names" (wide) and "multiple variables stored in one column" (over-long). Tidy data is a convention for picking the normal form, and it agrees with this note on one point that is easy to miss. Revenue in USD and units in items are two variables, so the tidy form keeps them as two columns. Tidy is not "always long".
- **Pivots are the witnesses.** tidyr's [`pivot_longer`](https://tidyr.tidyverse.org/reference/pivot_longer.html) and [`pivot_wider`](https://tidyr.tidyverse.org/reference/pivot_wider.html), polars' [`unpivot`](https://docs.pola.rs/api/python/stable/reference/dataframe/api/polars.DataFrame.unpivot.html) and [`pivot`](https://docs.pola.rs/api/python/stable/reference/dataframe/api/polars.DataFrame.pivot.html), and SQL `UNPIVOT` and `PIVOT` ([DuckDB](https://duckdb.org/docs/sql/statements/unpivot.html)) are the two directions of the wide and long isomorphism. Their options show the side conditions. polars `pivot` takes an `aggregate_function` because duplicate keys need one. tidyr `pivot_wider` takes `values_fill` because missing cells need a value, and [`complete`](https://tidyr.tidyverse.org/reference/complete.html) densifies with a `fill`. polars `unpivot` upcasts the melted columns to one dtype, which is where the units are silently lost.
- **Nested types.** Arrow and polars have `list` and `struct` column types ([Arrow columnar format](https://arrow.apache.org/docs/format/Columnar.html)). A `list<struct>` column is a nested table, the curried form. `explode` and `implode` in polars are the currying isomorphism.
- **xarray.** An xarray `Dataset` is a record of named arrays that share dimensions, and a `DataArray` is one array. [`Dataset.to_dataarray`](https://docs.xarray.dev/en/stable/generated/xarray.Dataset.to_dataarray.html) stacks the variables along a new dimension, which is the wide to long conversion. xarray keeps per-variable attributes such as units on the `Dataset`. The stacked array has one set of attributes, so the same unit condition appears there.
- **Spivak's data migration.** Spivak models a schema as a category and a database as a functor, and gives three migration operations along a schema map, called Δ, Σ and Π ([Functorial Data Migration, 2012](https://arxiv.org/abs/1009.1166)). In plain terms, Δ reindexes rows along a key map, Σ pushes rows forward and collects them by their new key (union, the step before an aggregate), and Π pushes forward by matching (a join). The draft already cites this work. For this note, Δ is relabeling and Σ followed by a monoid is pre-aggregation.

### 3.8 The sheaf criterion from Hannah Aizenman's work

I found and read two versions of the work.

- [Mind Your νs and Qs: A Categorical Framework for Specifying Visualization Components](https://gugog-vis.github.io/2026/papers/pdf/aizenman-et-al.pdf), Aizenman, Vejdemo-Johansson, Caswell and Grossberg, GUGOG 2026. The PDF is on the workshop's [accepted papers page](https://gugog-vis.github.io/2026/papers.html).
- The longer [Categorical Framework for Visualization Software Architecture](https://ieeevis.org/year/2026/program/content/1057cc86-867a-44fb-a9e8-628ca96d9ace/), same authors, TopoInVis 2026 at IEEE VIS. It has the details the short paper leaves out, including the table of sheaf axioms quoted below.

I did not find a paper titled "Topological Equivariant Artist Model". The name appears only as a project on [her research page](https://hackmd.io/@story645/ascv), and the SciPy 2020 and 2021 talks on Matplotlib's data model are its earlier public form.

**What the papers say.** A dataset is a section `τ : K → F` of a fiber bundle, with type `dataset : connectivity → fields`. The base space `K` is the index set with a topology (which indices are neighbors), and the fiber `F` is the record type, following Spivak. The data container is a sheaf, a rule that gives, for each neighborhood `U` of `K`, the set of sections over `U`, with restriction to smaller neighborhoods. The longer paper states the axioms in terms of indexing.

| Axiom    | Stated on datasets                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------- |
| presheaf | if `index1 ⊂ index2` and `dataset[index2]` exists, then `dataset[index2][index1] = dataset[index1]` |
| locality | if `dataset1[i] = dataset2[i]` for every `i` in the index, then `dataset1 = dataset2`               |
| gluing   | if the pieces agree where they overlap, `dataset1[:i] ⊕ dataset2[j:]` is a dataset over the union   |

The papers use the axioms to say that data "in memory, distributed, streaming, or on-demand" is one dataset, so a visualization method written against the sheaf works on all of them. They also give the two composition laws `Hom(K₁ ⊔ K₂, F) ≃ Hom(K₁, F) × Hom(K₂, F)` (adding records is a coproduct of index spaces) and `Hom(K, F₁ × F₂) ≃ Hom(K, F₁) × Hom(K, F₂)` (adding fields is a product of fibers, a join). They note that relabeling the index, e.g., "(date, lat, lon) and (date, station)", gives the same data. They state that an artist must be equivariant, i.e., changing the index or the values and then drawing gives the same result as drawing and then changing the picture.

**The criterion in plain words.** A container counts as a dataset over `K` when two things hold. First, a dataset is determined by its values on the pieces of `K`, so two containers that agree on every index are the same dataset. Second, pieces that agree where they overlap can be put together into one dataset over the union, and the result does not depend on how you split it. Two containers are equivalent when they give the same values at every index.

**The type-theoretic reading.** For a discrete key, a table of type `Π(k : K). R(k)` satisfies both axioms automatically. Locality is function extensionality (two functions that agree everywhere are equal). Gluing over a disjoint split is the sum law in section 3.1. Gluing over an overlapping split asks the two pieces to agree on the overlap, which is a check, not a law.

So the sheaf criterion turns into a concrete check only where the container is not already a function.

- **A list of rows with duplicate keys is not a function.** Two rows for one key that disagree make gluing fail, because there is no single value at that key. The check is that the key columns determine the other columns, i.e., the functional dependency from section 3.7.
- **A sparse table is a section over a smaller set.** The papers say most datasets are a collection of local sections. A sparse table is a section over the keys present, not a global section with zeros. Extending it to all of `K` is a separate step, and section 3.1 says when it is valid (an Extensive field, extended by 0).
- **Long and wide are not about the sheaf condition.** Long against wide moves the label from the fiber (column names) into the base (a key column). The papers do not discuss this move directly. In their terms, it is the bundle over `K × L` with fiber `V` against the bundle over `K` with fiber `V^L`, and these are isomorphic exactly when the fiber over each label is the same `V`. That is the same side condition as in section 3.1. This reading is mine, not the authors'.

There is one more connection, and it is also my own reading. The draft's Extensive law `m(A ⊔ B) = m(A) + m(B)` is a gluing law for values, with `+` in place of "put the pieces together". A Cumulative field fails it because its pieces (prefixes) overlap, which is the draft's summarizability condition 1. So "can these pieces be glued" (Aizenman et al.) and "can these values be summed" (the draft) are the same question asked of the key and of the value.

Josh prefers type theory to category theory unless there is a good reason. The sheaf framing does not force category theory here. For GoFish's discrete and ordered keys, everything it says is the function type `Π(k : K). R(k)` plus a uniqueness check. Category theory would earn its place for continuous keys sampled at different points, e.g., two time series on different grids, where "agree on the overlap" needs interpolation. Nothing in GoFish needs that yet.

## 4. Things that must not be equal

- **Wide columns with different units.** `{ revenue: USD, units: items }` is a record, i.e., a dependent function out of labels whose result type depends on the label. Melting it into one `value` column puts USD and items in one column, and every later check on that column becomes meaningless. Driving shifts (`miles`, `gas`) is the real example. The record form must stay.
- **Wide columns with one unit but no additivity across them.** The box plot's five quantiles share USD. Melting them is a valid isomorphism, but the new `stat` key gets no additivity. Stacking over `stat` must be an error. This case exposes a gap in the current GoFish design, where `Trait.summable()` sits on the unit, so "one unit cannot both add up and not". If USD is summable, a stack over `stat` would type-check. The draft's per-key additivity (`Extensive<k>`) is what catches it.
- **Row order when the key has no order.** If the key has no declared levels, GoFish orders groups by first appearance. So shuffling the rows can change the picture. This is fine because GoFish data is a list, but the type of the input must then be "list of rows", and it is only equal to the shuffled list when the key declares its levels or the chart sorts.
- **A bag and a function.** Several rows per key are a bag. They become a function only through an aggregate, and which aggregate is allowed depends on the field's additivity over the collapsed key. GoFish's channel aggregation (sizes sum) does this silently today.
- **Pre-aggregated and raw rows.** These are equal only up to the aggregate the field allows. Raw prices and per-store mean prices are not interchangeable, because the right roll-up is a weighted mean, and the pre-aggregated table has lost the weights unless it keeps them.
- **Sparse and dense, for a field with no zero.** A missing temperature is not 0 degrees. A missing price is not 0 dollars. A missing stock level is the previous level, not 0.
- **A key relabeling that breaks traits.** Relabeling months by a bijection keeps equality but may break the cycle or the order. The labels "0 to 360" and "−180 to 180" for longitude are both cyclic and give the same cycle, but they order the values differently.

## 5. Recommendation for GoFish

The recommendation has four parts, and each is as small as the examples allow.

### 5.1 One canonical form, which is the type and not a copy of the data

The canonical form is a key-indexed table, i.e., a list of rows plus a schema that says which columns are the key and gives each value column its unit and traits. The rows stay a plain list, as they are today, so nothing about "data flows as lists" changes. What is new is that the schema names the key.

```js
// Hypothetical spelling: `key` is new. The value entries use today's Unit, Domain and Trait.
chart(population, {
  schema: {
    key: ["age", "sex"],
    sex: Unit({
      domain: Domain.discrete(["Women", "Men"]),
      traits: [Trait.diverging()],
    }),
    people: People, // a named unit
  },
});
```

```python
# Hypothetical spelling, mirroring the JS one.
chart(population, schema={
    "key": ["age", "sex"],
    "sex": Unit(domain=Domain.discrete(["Women", "Men"]), traits=[Trait.diverging()]),
    "people": People,
})
```

The checker then checks one fact, that the key columns determine the other columns. This is the sheaf locality and gluing check from section 3.8, the functional dependency from section 3.7, and the "is a function" condition of `Π(k : K). R(k)`. It runs where an operator relies on it. Two places in today's GoFish rely on it.

- A channel that aggregates several rows into one mark relies on it to decide whether there is anything to aggregate. With duplicates, it needs the field's additivity over the collapsed key.
- A line or ribbon that connects neighbors along a key relies on it, because two rows at one key give a vertical jump with no meaning.

A table with no declared key is keyed by position, which is how GoFish treats it today. So the new check is opt in, and every current story still runs.

### 5.2 What the checker compares

The checker compares two table types up to these equations only.

- The order of fields in a record. A record is a function out of its labels, so labels are compared as a set.
- The order of key columns. `(warehouse, month)` and `(month, warehouse)` are the same key. Iteration order is not part of the key type, because the operators choose it with `by`.

The checker does not compare types up to currying, unpivoting, densifying or aggregation. It does not search. Both equations have a normal form by sorting labels, so the check is linear after sorting, and an error message can print both types in sorted order.

Currying does not need an equation because the flow applies it. `spread({ by: "lake" })` then `stack({ by: "species" })` turns `Π((lake, species)). R` into `Π(lake). Π(species). R`. The key context the draft describes ("each `by` refines the key") is the record of this.

### 5.3 A short list of named conversions

Every other reshape is a conversion the user writes. Each one is parametric in the value type, or states the trait it needs. The names follow polars first, as `api-design.md` asks.

| Conversion                         | Shape change                                | What it needs                                                                           | What it produces                                                                                                                                            |
| ---------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unpivot(columns, { key, value })` | wide to long                                | the columns share one unit and one set of traits                                        | a key column with `Domain.discrete(columns)` in the written order; the value column with the shared unit and no additivity over the new key unless declared |
| `pivot({ on, values })`            | long to wide                                | the key is unique on `(index, on)`, or an aggregate the field allows                    | one column per level, each with the value's unit                                                                                                            |
| densify, filling empty cells       | sparse to dense                             | the field is Extensive over the filled key, so 0 is right; otherwise an explicit `fill` | a dense table; the fill is visible in the spec                                                                                                              |
| a row index                        | list position to key column                 | nothing                                                                                 | an explicit key of type "0 to n − 1"                                                                                                                        |
| aggregation                        | many rows to one per key                    | `CanAdd` for an Extensive field, a weight for an Intensive one                          | the pre-aggregated table                                                                                                                                    |
| `repeat`                           | one row with a count to that many unit rows | the count is a whole number of items                                                    | raw rows                                                                                                                                                    |

The table includes conversions GoFish already has in some form (`repeat`, channel aggregation, `normalize`). Of the new ones, only `unpivot` has stories that would use it today (the population pyramid, and any user who melts a data frame). The rest should wait for an example, per "add a type only where a real example forces it".

`unpivot` gets one elaboration for free. The new key column's levels are the melted column names in the order the user wrote them. That is the exact domain the population pyramid writes by hand today.

```js
// Hypothetical: unpivot is not in GoFish today.
chart(bands /* rows: { age, Women, Men } */, {
  schema: { Women: People, Men: People },
})
  .flow(
    unpivot(["Women", "Men"], { key: "sex", value: "people" }),
    // elaborates to: sex : Domain.discrete(["Women", "Men"]), people : People
    spread({ by: field("age").reverse(), dir: "y", spacing: 1 }),
    stack({ by: "sex", dir: "x" })
  )
  .mark(rect({ w: "people", fill: "sex" }));
```

In Python, the user is usually already in polars, so the natural spelling is polars' own `unpivot` before `chart`. The cost is that the result's schema must then be declared again, because polars carries no units. GoFish can make that cheap with one rule. When the user declares the schema on the long result, the declaration is checked against nothing, so it is a weak claim. That is acceptable for a first version and should be stated as a shortcut.

```python
# Today's tools: reshape in polars, then declare the schema of the result.
long = bands.unpivot(on=["Women", "Men"], index="age",
                     variable_name="sex", value_name="people")
chart(long, schema={
    "sex": Unit(domain=Domain.discrete(["Women", "Men"]), traits=[Trait.diverging()]),
    "people": People,
})
```

### 5.4 What is left to the user

Everything else stays in `derive(fn, { schema })` or in the user's data frame library.

- Flat array to grid (the heatmap). This is one `flatMap`, and Dex makes the same choice of an explicit term.
- Parent-pointer table to nested tree (GoTree). This is not a type isomorphism. A parent-pointer table is a tree only if it has one root and no cycles, so the conversion can fail. `d3.stratify` already does it and reports those failures.
- Positional foreign keys (the Sankey `energy` data). Multi-table input is listed as future work in the draft, and this belongs there.
- Lists of pairs to named columns (`[t, v]`). This is a field renaming.

### 5.5 Three hard examples and what the checker says

**Example 1. Stacking melted quantiles.** A user melts the box plot's columns to get a long table, then stacks.

```js
// Hypothetical unpivot. Today's schema for the five columns.
chart(genderPayGap, {
  schema: {
    Min: pay,
    "25-Percentile": pay,
    Median: pay,
    "75-Percentile": pay,
    Max: pay,
  },
})
  .flow(
    unpivot(["Min", "25-Percentile", "Median", "75-Percentile", "Max"], {
      key: "stat",
      value: "pay",
    }),
    spread({ by: "Pay Grade", dir: "x" }),
    stack({ by: "stat", dir: "y" })
  )
  .mark(rect({ h: "pay" }));
```

The unpivot succeeds, because the five columns share the unit `pay`. The stack fails. The error reads "pay is not Extensive over stat; stat was created by unpivot from five columns, and summing them would add Min to Max". With today's unit-level `Trait.summable()`, this chart would pass if USD were declared summable, which is the gap section 4 describes.

**Example 2. Melting columns with different units.**

```js
// Hypothetical unpivot.
chart(drivingShifts, { schema: { miles: Miles, gas: UsdPerGallon } }).flow(
  unpivot(["miles", "gas"], { key: "measure", value: "amount" })
);
```

The unpivot fails. The error reads "unpivot needs one unit; miles is Miles and gas is USD/gallon. Keep them as two columns, or convert them to one unit with derive". The user who wanted two panels can draw them as two layers, each naming its column. Section 6 explains why this is a shortcut and what the right fix would be.

**Example 3. Densifying a rate.** A Likert survey reports the share of respondents per level, not counts, and some levels are missing.

```js
// Hypothetical densify spelling.
chart(shares, {
  schema: {
    key: ["question", "response"],
    share: Share /* Intensive, weight: n */,
  },
})
  .flow(
    densify("response"),
    spread({ by: "question", dir: "y" }),
    stack({ by: "response", dir: "x" })
  )
  .mark(rect({ w: "share" }));
```

The densify fails. The error reads "share is Intensive over response, so an empty cell has no value; pass densify("response", { fill: 0 }) to say that a missing level means a share of 0". With counts instead of shares, the same densify succeeds and fills 0, and it matches what the stack already does for the sparse Likert story. So the Likert midpoint rule ("a row with no responses for some level keeps the same midpoint") gets a type-level reason, which is that a count is Extensive over the response.

A fourth example concerns duplicate keys. The treemap draws raw movies with `size: "Worldwide Gross"`, so several rows land on one genre and the size channel sums them. With a declared key of `title` and the split `by: "Major Genre"`, the checker asks that gross be Extensive over titles within a genre. It is, so the chart passes. If the column were a rating, the same chart would fail with "rating is not Extensive over title; the size channel would add ratings".

### 5.6 Comparison with the alternatives

|                                       | Explicit conversions (recommended)                    | E-graph saturation                                                     | Do nothing                               |
| ------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| What the checker compares             | types up to field and key order                       | types up to all rewrite rules                                          | column names, as today                   |
| Where the side conditions are checked | at the conversion and at the operator that needs them | inside the rewrite rules                                               | nowhere; polars drops units on unpivot   |
| Predictability                        | the user writes every reshape                         | the extraction step picks a shape                                      | the user writes every reshape            |
| Error messages                        | name the missing column and suggest the conversion    | must explain which equal form was compared                             | name the missing column                  |
| Cost to build                         | one key declaration, a uniqueness check, `unpivot`    | a rewrite engine, a cost model, rules with trait guards                | none                                     |
| Fit with GoFish rules                 | every reshape has a spelling in user code             | an automatic reshape has none, which goes against "defaults are sugar" | fits, but loses the types at the reshape |

Doing nothing is a reasonable first step for Python users, who reshape in polars anyway. The one thing GoFish loses is the check that melted columns share a unit and that the new key gets the right additivity. That check is the part of this note that catches real errors, so `unpivot` in the flow, or a check on the schema of a melted table, is the smallest thing worth adding.

## 6. Open questions and what not to build yet

**Shortcut, declared.** The recommendation makes `unpivot` reject columns with different units. The principled version would let the long value column have a type that depends on the key, `Π(l : L). V(l)`, which is what a record is. Then `unpivot` would always succeed, and the check would move to the operator that merges across `l`. `spread({ by: "measure" })` keeps the groups in separate spaces, so each group has one unit and the two panels would type-check. `stack({ by: "measure" })` or a shared axis merges spaces, so it would need one unit, and GoFish's existing unit join (`joinUnits` and `unify`, which already reject two time zones on one axis) would report the mismatch. This matches the existing GoFish rule that stack glues spaces into one and spread keeps them separate. It needs a column type that varies by another column's value, which opens new design questions (how to spell it in a schema, how it crosses the Python bridge). It should wait for a real example of faceting by measure with units on each facet.

Other open questions:

- Where additivity lives. The draft puts it on the pair (field, key). GoFish today puts `CanSum` on the unit. Example 1 shows a case the unit-level trait cannot catch. Moving additivity to (field, key) is a decision for the draft, and this note only supplies an example for it.
- Whether a missing key declaration should mean "keyed by position" forever, or whether the schema should infer the key from the `by` fields the flow uses. Inference from the flow would be a hidden rule that users must model, so the explicit key is the safer default.
- Whether unordered keys should be compared up to row order. Today they cannot be, because first-appearance order is visible. One option is to treat a key with no levels as ordered by first appearance and say so in the type.
- How nested columns from polars (`list<struct>`) get types. Today no schema names a value inside a list or a struct. Typing them is the curried form of a table, and it can wait until a story uses nested input.
- Continuous keys sampled at different points, e.g., two time series on different grids. This is where the sheaf framing's "agree on overlaps" stops being a simple equality, and it may need interpolation as a declared conversion.

What not to build yet:

- Type equality up to isomorphism, in any form beyond field and key order.
- An e-graph or any search over reshapes.
- `pivot`, `densify` and a grid adapter, until a story needs them.
- Dependent column types, as described in the shortcut above.
- Tree and graph adapters (parent pointers, positional foreign keys), which belong with the draft's multi-table future work.

## Sources

- Aizenman, Vejdemo-Johansson, Caswell, Grossberg. [Mind Your νs and Qs: A Categorical Framework for Specifying Visualization Components](https://gugog-vis.github.io/2026/papers/pdf/aizenman-et-al.pdf). GUGOG 2026.
- Aizenman, Vejdemo-Johansson, Caswell, Grossberg. [Categorical Framework for Visualization Software Architecture](https://ieeevis.org/year/2026/program/content/1057cc86-867a-44fb-a9e8-628ca96d9ace/). TopoInVis 2026.
- Abbott, Altenkirch, Ghani. [Containers: Constructing strictly positive types](https://doi.org/10.1016/j.tcs.2005.06.002). TCS 2005.
- Bartonicek, Urbanek, Murrell. [No More, No Less than Sum of Its Parts](https://doi.org/10.1080/10618600.2024.2429708). JCGS 2025.
- Codd. [A Relational Model of Data for Large Shared Data Banks](https://doi.org/10.1145/362384.362685). CACM 1970.
- Di Cosmo. [Isomorphisms of Types](https://www.dicosmo.org/Book/). Birkhäuser 1995.
- Fiore, Di Cosmo, Balat. [Remarks on isomorphisms in typed lambda calculi with empty and sum types](https://doi.org/10.1016/j.apal.2005.09.001). APAL 2006.
- Gibbons. [APLicative Programming with Naperian Functors](https://www.cs.ox.ac.uk/people/jeremy.gibbons/publications/aplicative.pdf). ESOP 2017.
- Ilik. [Axioms and decidability for type isomorphism in the presence of sums](https://arxiv.org/abs/1401.2567). CSL-LICS 2014.
- Kindlmann, Scheidegger. [An Algebraic Process for Visualization Design](https://doi.org/10.1109/TVCG.2014.2346325). TVCG 2014.
- Paszke et al. [Getting to the Point: Index Sets and Parallelism-Preserving Autodiff for Pointful Array Programming](https://arxiv.org/abs/2104.05372). 2021.
- Reynolds. [Types, Abstraction and Parametric Polymorphism](https://people.mpi-sws.org/~dreyer/tor/papers/reynolds.pdf). IFIP 1983.
- Rittri. [Using types as search keys in function libraries](https://doi.org/10.1017/S095679680000006X). JFP 1991.
- Spivak. [Functorial Data Migration](https://arxiv.org/abs/1009.1166). Information and Computation 2012.
- The Univalent Foundations Program. [Homotopy Type Theory](https://homotopytypetheory.org/book/). 2013.
- Wadler. [Theorems for free!](https://doi.org/10.1145/99370.99404). FPCA 1989.
- Wickham. [Tidy Data](https://doi.org/10.18637/jss.v059.i10). JSS 2014.
- Willsey et al. [egg: Fast and Extensible Equality Saturation](https://arxiv.org/abs/2004.03082). POPL 2021.
- polars [`unpivot`](https://docs.pola.rs/api/python/stable/reference/dataframe/api/polars.DataFrame.unpivot.html) and [`pivot`](https://docs.pola.rs/api/python/stable/reference/dataframe/api/polars.DataFrame.pivot.html); tidyr [`pivot_longer`](https://tidyr.tidyverse.org/reference/pivot_longer.html), [`pivot_wider`](https://tidyr.tidyverse.org/reference/pivot_wider.html) and [`complete`](https://tidyr.tidyverse.org/reference/complete.html); xarray [`Dataset.to_dataarray`](https://docs.xarray.dev/en/stable/generated/xarray.Dataset.to_dataarray.html); DuckDB [`UNPIVOT`](https://duckdb.org/docs/sql/statements/unpivot.html); [Arrow columnar format](https://arrow.apache.org/docs/format/Columnar.html).
